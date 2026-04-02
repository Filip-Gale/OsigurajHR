/**
 * Cloudflare Worker — Wiener (Vienna Insurance Group) proxy
 *
 * Routes:
 *   GET  /                      → health check
 *   POST /ao/calculate          → CalculatePackagesAOv2 (registracija+OIB+dob → paketi s cijenama)
 *   GET  /ao/vehicle            → VehicleInfo (registracija ili VIN → podaci o vozilu)
 *   GET  /ao/partner-search     → partners/search/legal (pretraga SAMO pravnih partnera po OIBu)
 *   POST /ao/partner            → UpdateOrCreate/natural (fizička osoba)
 *   POST /ao/partner-legal      → UpdateOrCreate/legal (pravna osoba)
 *   GET  /ao/predocs            → PrePolicyDocuments (predugovorna dokumentacija)
 *   POST /ao/reserve            → ReservePolicy (calculationOid + partnerId → contractOid + policyNumber)
 *   POST /ao/activate           → ActivatePolicyWithPayment (Monri podaci → PDF police)
 *   POST /ao/activate-nopay     → ActivatePolicy bez naplate (za obećanje naplate)
 *   POST /ao/cancel-reserved    → CancelReservedPolicy
 *   POST /ao/cancel-active      → CancelActivePolicy (storno aktivirane + uplata, max 14 dana)
 *   POST /ao/client-document    → ClientDocument (Wiener šalje policu klijentu — točka 10a)
 *   POST /ao/delivered          → PolicyDelivered (mi šaljemo klijentu, obavijest Wieneru — točka 10)
 *
 * Auth flow (Wiener koristi DVOJNI token — svaki request šalje oba):
 *   1. 3Scale token: POST OIDC token endpoint → "Authorization: Bearer {token}"
 *   2. WING token:   POST /WingAuthRequest    → "X-Wovig-Authorization: Bearer {token}"
 *   Oba token istječu za 3600s. Cacheiraju se u memoriji workera.
 */

const OIDC_TOKEN_URL = 'https://secure-sso-rh-sso.services.wiener.hr/auth/realms/vanjski/protocol/openid-connect/token';

const ALLOWED_ORIGINS = [
  'https://www.osiguraj.hr',
  'https://osiguraj.hr',
  'http://localhost:4000',
  'http://127.0.0.1:4000',
];

// ─── In-memory token cache ─────────────────────────────────────────────────
// (vrijedi unutar jedne worker instance, dovoljno za prod throughput)
let _3scaleToken = null;
let _3scaleExpiry = 0;
let _wingToken = null;
let _wingExpiry = 0;

// ─── Helpers ──────────────────────────────────────────────────────────────

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}

function baseUrl(env) {
  return `https://${env.WIENER_ENV}.services.wiener.hr/v1`;
}

/**
 * Splitira hrvatsku registracijsku oznaku na region + broj.
 * "ZG1234AB" → { region: "ZG", number: "1234AB" }
 * "ZG-123-AB", "ZG 123 AB" → isti rezultat
 * Vraća null ako format nije prepoznat.
 */
function parsePlate(plate) {
  if (!plate) return null;
  const clean = plate.toUpperCase().replace(/[\s\-]/g, '');
  // Format: 2 slova + 3-4 broja + 1-2 slova (npr. ZG1234AB, ST123BC)
  const m = clean.match(/^([A-Z]{2})(\d{3,4}[A-Z]{1,2})$/);
  if (!m) return null;
  return { region: m[1], number: m[2] };
}

// ─── Auth ─────────────────────────────────────────────────────────────────

async function get3ScaleToken(env) {
  const now = Date.now();
  if (_3scaleToken && now < _3scaleExpiry - 60_000) return _3scaleToken;

  const body = new URLSearchParams({
    grant_type: 'password',
    client_id: env.WIENER_3SCALE_CLIENT_ID,
    client_secret: env.WIENER_3SCALE_CLIENT_SECRET,
    username: env.WIENER_3SCALE_USERNAME,
    password: env.WIENER_3SCALE_PASSWORD,
  });

  const r = await fetch(OIDC_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!r.ok) {
    const err = await r.text();
    throw new Error(`3Scale auth failed: ${r.status} ${err}`);
  }

  const data = await r.json();
  _3scaleToken = data.access_token;
  _3scaleExpiry = now + (data.expires_in || 3600) * 1000;
  return _3scaleToken;
}

async function getWingToken(env, scaleToken) {
  const now = Date.now();
  if (_wingToken && now < _wingExpiry - 60_000) return _wingToken;

  const body = new URLSearchParams({
    grant_type: 'password',
    scope: 'wing.api idp.users.api',
    client_id: env.WIENER_WING_CLIENT_ID,
    client_secret: env.WIENER_WING_CLIENT_SECRET,
    username: env.WIENER_WING_USERNAME,
    password: env.WIENER_WING_PASSWORD,
  });

  const r = await fetch(`${baseUrl(env)}/WingAuth`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Bearer ${scaleToken}`,
    },
    body: body.toString(),
  });

  if (!r.ok) {
    const err = await r.text();
    throw new Error(`WING auth failed: ${r.status} ${err}`);
  }

  const data = await r.json();
  _wingToken = data.access_token;
  _wingExpiry = now + (data.expires_in || 3600) * 1000;
  return _wingToken;
}

async function getAuthHeaders(env) {
  const scaleToken = await get3ScaleToken(env);
  const wingToken = await getWingToken(env, scaleToken);
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${scaleToken}`,
    'X-Wovig-Authorization': `Bearer ${wingToken}`,
  };
}

// ─── Handlers ─────────────────────────────────────────────────────────────

/**
 * CalculatePackagesAOv2
 * Ulaz: { plate, oib, dateOfBirth, inceptionDate?, partnerType?, isLeasing? }
 * Izlaz: { packages: [...], vehicleInfo: {...} }
 */
async function handleCalculate(body, cors, env) {
  const parsed = parsePlate(body.plate);
  if (!parsed) {
    return json({ ok: false, error: 'Neispravna registracija' }, 400, cors);
  }

  const authHeaders = await getAuthHeaders(env);
  const agentId = parseInt(env.WIENER_AGENT_ID, 10);
  const agentCode = parseInt(env.WIENER_AGENT_CODE, 10);

  const isLegal = (body.partnerType || 'N') === 'L';

  const policyHolder = isLegal
    ? { PartnerType: 'L', Pin: body.oib, IsLeasing: body.isLeasing === true }
    : { PartnerType: 'N', Pin: body.oib, DateOfBirth: body.dateOfBirth };

  const payload = {
    Agent: { AgentId: agentId, AgentCode: agentCode },
    Relations: { PolicyHolder: policyHolder },
    Contract: body.inceptionDate ? { InceptionDate: body.inceptionDate } : undefined,
    InsuredObject: {
      LicencePlateRegionCode: parsed.region,
      LicencePlateNumber: parsed.number,
    },
    Corrections: [],
  };

  const r = await fetch(`${baseUrl(env)}/CalculatePackagesAOv2`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify(payload),
  });

  const data = await r.json();
  if (!r.ok) return json({ ok: false, error: data }, r.status, cors);

  return json({ ok: true, packages: data.Data?.Packages, vehicleInfo: data.Data?.VehicleInfo, contractInfo: data.Data?.ContractInfo }, 200, cors);
}

/**
 * VehicleInfo
 * Dokument kaže GET sa JSON body — šaljemo kao GET sa tijelom (server-side fetch to podržava).
 * Ulaz (query): plate= ili vin=
 * Izlaz: { vehicleInfo: {...} }
 */
async function handleVehicle(url, cors, env) {
  const plate = url.searchParams.get('plate');
  const vin = url.searchParams.get('vin');

  let insuredObject;
  if (plate) {
    const parsed = parsePlate(plate);
    if (!parsed) return json({ ok: false, error: 'Neispravna registracija' }, 400, cors);
    insuredObject = { LicencePlateRegionCode: parsed.region, LicencePlateNumber: parsed.number };
  } else if (vin) {
    insuredObject = { Vin: vin };
  } else {
    return json({ ok: false, error: 'Potrebno: plate ili vin' }, 400, cors);
  }

  const authHeaders = await getAuthHeaders(env);
  const r = await fetch(`${baseUrl(env)}/VehicleInfo`, {
    method: 'GET',
    headers: authHeaders,
    body: JSON.stringify(insuredObject),
  });

  const data = await r.json();
  if (!r.ok) return json({ ok: false, error: data }, r.status, cors);

  return json({ ok: true, vehicleInfo: data.Data?.VehicleInfo }, 200, cors);
}

/**
 * UpdateOrCreate partner — fizička osoba
 * Ulaz: { oib, firstName, lastName, gender, dateOfBirth, postalCode, postalName, streetName, streetNumber, email, phone }
 * Izlaz: { partnerId }
 * Napomena: search je isključivo za pravne — fizičke se SAMO kreiraju/ažuriraju, ne pretraživaju.
 */
async function handlePartner(body, cors, env) {
  const authHeaders = await getAuthHeaders(env);

  const payload = {
    Pin: body.oib,
    FirstName: body.firstName,
    LastName: body.lastName,
    Gender: body.gender || 'M',
    DateOfBirth: body.dateOfBirth,
    Address: {
      PostalCode: body.postalCode,
      PostalName: body.postalName || body.city,
      StreetName: body.streetName || body.street,
      StreetNumber: body.streetNumber || body.streetNo,
    },
    Contact: {
      Email: body.email,
      Phone: body.phone,
    },
  };

  const r = await fetch(`${baseUrl(env)}/partners/UpdateOrCreate/natural`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify(payload),
  });

  const data = await r.json();
  if (!r.ok) return json({ ok: false, error: data }, r.status, cors);

  return json({ ok: true, partnerId: data.Data?.PartnerId }, 200, cors);
}

/**
 * partners/search/legal — pretraga SAMO pravnih partnera po OIBu
 * Fizički partneri NE MOGU i NE SMIJU se pretraživati.
 * Ulaz (query): oib=, isLeasing= (opcionalno)
 * Izlaz: { partners: [{PartnerId, Pin, CompanyName, IsLeasing, IsHeadquarters, Address}] }
 */
async function handlePartnerSearch(url, cors, env) {
  const oib = url.searchParams.get('oib');
  const isLeasing = url.searchParams.get('isLeasing');

  if (!oib) return json({ ok: false, error: 'Potrebno: oib' }, 400, cors);

  const authHeaders = await getAuthHeaders(env);
  const payload = { Pin: oib };
  if (isLeasing !== null) payload.IsLeasing = isLeasing === 'true';

  const r = await fetch(`${baseUrl(env)}/partners/search/legal`, {
    method: 'GET',
    headers: authHeaders,
    body: JSON.stringify(payload),
  });

  const data = await r.json();
  if (!r.ok) return json({ ok: false, error: data }, r.status, cors);

  return json({ ok: true, partners: data.Data?.Partners }, 200, cors);
}

/**
 * UpdateOrCreate partner — pravna osoba
 * Ulaz: { oib, companyName, legalPersonType?, postalCode, postalName, streetName, streetNumber, email, phone }
 * legalPersonType: "HeadQuarters" (sjedište) ili "BranchOffice" (podružnica)
 * Procesna pravila:
 *   - OIB + stalna adresa podudaraju → ažuriranje
 *   - OIB podudara, nova adresa → kreira podružnicu
 *   - Novi OIB + nova adresa → kreira sjedište
 * Izlaz: { partnerId }
 */
async function handlePartnerLegal(body, cors, env) {
  const authHeaders = await getAuthHeaders(env);

  const payload = {
    Pin: body.oib,
    CompanyName: body.companyName,
    LegalPersonType: body.legalPersonType || 'HeadQuarters',
    Address: {
      PostalCode: body.postalCode,
      PostalName: body.postalName || body.city,
      StreetName: body.streetName || body.street,
      StreetNumber: body.streetNumber || body.streetNo,
    },
    Contact: {
      Email: body.email,
      Phone: body.phone,
    },
  };

  const r = await fetch(`${baseUrl(env)}/partners/UpdateOrCreate/legal`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify(payload),
  });

  const data = await r.json();
  if (!r.ok) return json({ ok: false, error: data }, r.status, cors);

  return json({ ok: true, partnerId: data.Data?.PartnerId }, 200, cors);
}

/**
 * PrePolicyDocuments
 * Ulaz (query): product= (npr. "MTPL")
 * Izlaz: { documents: [{documentTitle, documentCode, filename, fileContents, documentId, fileSizeInBytes}] }
 */
async function handlePreDocs(url, cors, env) {
  const product = url.searchParams.get('product') || 'MTPL';
  const authHeaders = await getAuthHeaders(env);

  const r = await fetch(`${baseUrl(env)}/PrePolicyDocuments`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ ProductCode: product }),
  });

  const data = await r.json();
  if (!r.ok) return json({ ok: false, error: data }, r.status, cors);

  return json({ ok: true, documents: data }, 200, cors);
}

/**
 * ReservePolicy
 * Ulaz: { calculationOid, partnerId, insuredPartnerId?, carUserPartnerId? }
 * Izlaz: { contractOid, policyNumber }
 * Napomena: policyNumber == poziv na plaćanje — MORA se koristiti kao referentni broj u Monriju
 * CarUser: šalje se samo ako je korisnik vozila različit od osiguranika
 */
async function handleReserve(body, cors, env) {
  const authHeaders = await getAuthHeaders(env);

  const relations = {
    PolicyHolder: { PartnerId: body.partnerId },
  };
  if (body.insuredPartnerId) {
    relations.InsuredPerson = { PartnerId: body.insuredPartnerId };
  }
  if (body.carUserPartnerId) {
    relations.CarUser = { PartnerId: body.carUserPartnerId };
  }

  const payload = {
    CalculationOid: body.calculationOid,
    Relations: relations,
  };

  const r = await fetch(`${baseUrl(env)}/ReservePolicy`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify(payload),
  });

  const data = await r.json();
  if (!r.ok) return json({ ok: false, error: data }, r.status, cors);

  return json({
    ok: true,
    contractOid: data.data?.contractOid,
    policyNumber: data.data?.policyNumber,
  }, 200, cors);
}

/**
 * ActivatePolicyWithPayment
 * Poziva se NAKON uspješne Monri naplate.
 * Ulaz:
 *   { contractOid, policyNumber?,
 *     payerName, payerAddress, payerSettlement,
 *     receiptDate, receiptNumber, referenceNumber,
 *     amount,
 *     terminalId, amountSent, amountAuthorized,
 *     authCode,        ← PosAuthentificationNumber (Monri approval code)
 *     cardOwner, cardNumber, cardType,
 *     transactionDateTime }
 * Izlaz: { printouts: [{ documentTypeId, documentTypeName, content (base64), remark }] }
 */
async function handleActivate(body, cors, env) {
  const authHeaders = await getAuthHeaders(env);

  const payload = {
    ContractOid: body.contractOid,
    PolicyNumber: body.policyNumber,
    Payment: {
      Receipt: {
        CashierInvolvedPersonRoleId: parseInt(env.WIENER_CASHIER_ROLE_ID, 10),
        PayerCommonName: body.payerName,
        PayerAddress: body.payerAddress,
        PayerSettlement: body.payerSettlement,
        ReceiptDate: body.receiptDate,
        ReceiptNumber: body.receiptNumber,
      },
      PaymentOrders: [
        {
          ReferenceNumber: body.referenceNumber || body.policyNumber,
          InstallmentNumber: 1,
          Currency: 'EUR',
          PaymentReferenceTypeId: 1,
          Amount: body.amount,
        },
      ],
      PaymentDetails: {
        TerminalId: body.terminalId,
        Currency: 'EUR',
        AmountSent: body.amountSent || body.amount,
        AmountAuthorized: body.amountAuthorized || body.amount,
        NumberOfInstallments: 1,
        PosAuthentificationNumber: body.authCode,
        CardOwner: body.cardOwner,
        CardNumber: body.cardNumber,
        CardType: body.cardType,
        PosTransactionDateTime: body.transactionDateTime,
      },
    },
  };

  const r = await fetch(`${baseUrl(env)}/ActivatePolicyWithPayment`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify(payload),
  });

  const data = await r.json();
  if (!r.ok) return json({ ok: false, error: data }, r.status, cors);

  return json({ ok: true, printouts: data.data?.printouts, remarks: data.data?.AdditionalRemarks }, 200, cors);
}

/**
 * ActivatePolicy bez naplate (sa obećanjem naplate)
 * Ulaz: { contractOid, policyNumber? }
 * Izlaz: { printouts: [...] }
 */
async function handleActivateNoPay(body, cors, env) {
  const authHeaders = await getAuthHeaders(env);

  const r = await fetch(`${baseUrl(env)}/ActivatePolicy`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ ContractOid: body.contractOid, PolicyNumber: body.policyNumber }),
  });

  const data = await r.json();
  if (!r.ok) return json({ ok: false, error: data }, r.status, cors);

  return json({ ok: true, printouts: data.data?.printouts, remarks: data.data?.AdditionalRemarks }, 200, cors);
}

/**
 * CancelReservedPolicy — storno rezervirane (još nenaplaćene) police
 * Ulaz: { contractOid }
 */
async function handleCancelReserved(body, cors, env) {
  const authHeaders = await getAuthHeaders(env);

  const r = await fetch(`${baseUrl(env)}/CancelReservedPolicy`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ ContractOid: body.contractOid }),
  });

  if (!r.ok) {
    const data = await r.json();
    return json({ ok: false, error: data }, r.status, cors);
  }
  return json({ ok: true }, 200, cors);
}

/**
 * CancelActivePolicy — storno aktivirane police + storno uplate
 * Moguće unutar 14 dana, polica ne smije biti iskorištena (registrirana na CVH).
 * Zahtjev smije napraviti SAMO ugovaratelj.
 * Ulaz: { contractOid }
 */
async function handleCancelActive(body, cors, env) {
  const authHeaders = await getAuthHeaders(env);

  const r = await fetch(`${baseUrl(env)}/CancelActivePolicy`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ ContractOid: body.contractOid }),
  });

  if (!r.ok) {
    const data = await r.json();
    return json({ ok: false, error: data }, r.status, cors);
  }
  return json({ ok: true }, 200, cors);
}

/**
 * ClientDocument — Wiener šalje policu klijentu (točka 10a)
 * Alternativa PolicyDelivered-u: koristiti kad Wiener preuzima odgovornost slanja.
 * Ulaz: { contractOid, recipientEmail, fromEmail?, callbackType?, callbackNotification?, sentPdf? }
 *   callbackType: "M" (mail) ili "A" (API endpoint)
 *   callbackNotification: email adresa ili API endpoint za potvrdu slanja
 *   sentPdf: base64 — slati SAMO ako smo PDF modificirali (npr. dodali digitalni potpis)
 *   fromEmail: domena mora biti WIENER.HR
 * Poslovno pravilo: polica se ne smije mijenjati, smiju se dodavati digitalni potpisi.
 */
async function handleClientDocument(body, cors, env) {
  const authHeaders = await getAuthHeaders(env);

  const payload = {
    ContractOid: body.contractOid,
    FromEmail: body.fromEmail,
    RecipientEmail: body.recipientEmail,
    CallbackNotificationType: body.callbackType || 'M',
    CallbackNotification: body.callbackNotification,
  };
  if (body.sentPdf) payload.SentPdf = body.sentPdf;

  const r = await fetch(`${baseUrl(env)}/ClientDocument`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify(payload),
  });

  if (!r.ok) {
    const data = await r.json();
    return json({ ok: false, error: data }, r.status, cors);
  }
  return json({ ok: true }, 200, cors);
}

/**
 * PolicyDelivered — obavijest Wieneru da smo poslali policu klijentu
 * Wiener mora znati da je polica doručena (regulatorna obveza).
 * Ulaz: { contractOid, policyNumber?, recipientEmail?, sentDate? }
 */
async function handleDelivered(body, cors, env) {
  const authHeaders = await getAuthHeaders(env);

  const payload = {
    ContractOid: body.contractOid,
    PolicyNumber: body.policyNumber,
    RecipientEmail: body.recipientEmail,
    SentDate: body.sentDate || new Date().toISOString(),
  };

  const r = await fetch(`${baseUrl(env)}/PolicyDelivered`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify(payload),
  });

  if (!r.ok) {
    const data = await r.json();
    return json({ ok: false, error: data }, r.status, cors);
  }
  return json({ ok: true }, 200, cors);
}

// ─── Main entry point ─────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // Health check
      if (path === '/' && request.method === 'GET') {
        return json({ status: 'ok', env: env.WIENER_ENV }, 200, cors);
      }

      // GET routes
      if (request.method === 'GET') {
        if (path === '/ao/vehicle')        return handleVehicle(url, cors, env);
        if (path === '/ao/predocs')        return handlePreDocs(url, cors, env);
        if (path === '/ao/partner-search') return handlePartnerSearch(url, cors, env);
        return json({ error: 'Not found' }, 404, cors);
      }

      // POST routes
      if (request.method !== 'POST') {
        return json({ error: 'Method not allowed' }, 405, cors);
      }

      const body = await request.json();

      if (path === '/ao/calculate')        return handleCalculate(body, cors, env);
      if (path === '/ao/partner')          return handlePartner(body, cors, env);
      if (path === '/ao/partner-legal')    return handlePartnerLegal(body, cors, env);
      if (path === '/ao/reserve')          return handleReserve(body, cors, env);
      if (path === '/ao/activate')         return handleActivate(body, cors, env);
      if (path === '/ao/activate-nopay')   return handleActivateNoPay(body, cors, env);
      if (path === '/ao/cancel-reserved')  return handleCancelReserved(body, cors, env);
      if (path === '/ao/cancel-active')    return handleCancelActive(body, cors, env);
      if (path === '/ao/client-document')  return handleClientDocument(body, cors, env);
      if (path === '/ao/delivered')        return handleDelivered(body, cors, env);

      return json({ error: 'Not found' }, 404, cors);

    } catch (e) {
      return json({ ok: false, error: e.message }, 500, cors);
    }
  },
};
