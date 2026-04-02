/**
 * Wiener AO API proxy — Oracle Cloud, port 3001
 * Handles dual auth (3Scale OIDC + WING) internally.
 * CF Worker calls this; this calls api-rc.services.wiener.hr
 *
 * Deploy:
 *   pm2 start index.js --name wiener-proxy
 *   pm2 save
 *
 * Nije potrebno ništa mijenjati u CF Workeru osim baseUrl-a.
 */

const http = require('http');
const https = require('https');
const url = require('url');

// ─── Credentials ──────────────────────────────────────────────────────────
const OIDC_TOKEN_URL = 'https://secure-sso-rh-sso.services.wiener.hr/auth/realms/vanjski/protocol/openid-connect/token';
const BASE_URL = 'https://api-rc.services.wiener.hr/v1';

const SCALE_CLIENT_ID     = '34207096';
const SCALE_CLIENT_SECRET = 'f837e8741e0ba06f89fdc0f553a6a5b7';
const SCALE_USERNAME      = 'maksimiro_ta';
const SCALE_PASSWORD      = 'ZqQ.9rPrFy!pOHDM(8ChQ1S)';

const WING_CLIENT_ID     = 'MaksiMiro';
const WING_CLIENT_SECRET = 'zbf2w9DoeD0A0#R0';
const WING_USERNAME      = 'maksimiro';
const WING_PASSWORD      = 'cdjlIx8Dfvm!ycQp';

// ⚠️  Popuniti kada dobijemo od Wienera:
const AGENT_ID          = parseInt(process.env.WIENER_AGENT_ID || '0', 10);
const AGENT_CODE        = parseInt(process.env.WIENER_AGENT_CODE || '0', 10);
const CASHIER_ROLE_ID   = parseInt(process.env.WIENER_CASHIER_ROLE_ID || '0', 10);

// ─── Token cache ──────────────────────────────────────────────────────────
let _3scaleToken = null;
let _3scaleExpiry = 0;
let _wingToken = null;
let _wingExpiry = 0;

process.on('uncaughtException', (e) => console.error('[uncaughtException]', new Date().toISOString(), e.message));
process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', new Date().toISOString(), e && e.message || e));

// ─── Auth ─────────────────────────────────────────────────────────────────

async function get3ScaleToken() {
  const now = Date.now();
  if (_3scaleToken && now < _3scaleExpiry - 60_000) return _3scaleToken;

  const body = new URLSearchParams({
    grant_type: 'password',
    client_id: SCALE_CLIENT_ID,
    client_secret: SCALE_CLIENT_SECRET,
    username: SCALE_USERNAME,
    password: SCALE_PASSWORD,
  });

  const r = await fetch(OIDC_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!r.ok) throw new Error(`3Scale auth failed: ${r.status} ${await r.text()}`);

  const data = await r.json();
  _3scaleToken = data.access_token;
  _3scaleExpiry = now + (data.expires_in || 3600) * 1000;
  console.log('[auth] 3Scale token refreshed');
  return _3scaleToken;
}

async function getWingToken(scaleToken) {
  const now = Date.now();
  if (_wingToken && now < _wingExpiry - 60_000) return _wingToken;

  const body = new URLSearchParams({
    grant_type: 'password',
    scope: 'wing.api idp.users.api',
    client_id: WING_CLIENT_ID,
    client_secret: WING_CLIENT_SECRET,
    username: WING_USERNAME,
    password: WING_PASSWORD,
  });

  const r = await fetch(`${BASE_URL}/WingAuth`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Bearer ${scaleToken}`,
    },
    body: body.toString(),
  });

  if (!r.ok) throw new Error(`WING auth failed: ${r.status} ${await r.text()}`);

  const data = await r.json();
  _wingToken = data.access_token;
  _wingExpiry = now + (data.expires_in || 3600) * 1000;
  console.log('[auth] WING token refreshed');
  return _wingToken;
}

async function getAuthHeaders() {
  const scaleToken = await get3ScaleToken();
  const wingToken = await getWingToken(scaleToken);
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${scaleToken}`,
    'X-Wovig-Authorization': `Bearer ${wingToken}`,
  };
}

// ─── Plate parser ─────────────────────────────────────────────────────────

function parsePlate(plate) {
  if (!plate) return null;
  const clean = plate.toUpperCase().replace(/[\s\-]/g, '');
  const m = clean.match(/^([A-Z]{2})(\d{3,4}[A-Z]{1,2})$/);
  if (!m) return null;
  return { region: m[1], number: m[2] };
}

// ─── Route handlers ────────────────────────────────────────────────────────

async function handleCalculate(body) {
  const parsed = parsePlate(body.plate);
  if (!parsed) return { status: 400, body: { ok: false, error: 'Neispravna registracija' } };

  const authHeaders = await getAuthHeaders();
  const isLegal = (body.partnerType || 'N') === 'L';

  const policyHolder = isLegal
    ? { PartnerType: 'L', Pin: body.oib, IsLeasing: body.isLeasing === true }
    : { PartnerType: 'N', Pin: body.oib, DateOfBirth: body.dateOfBirth };

  const payload = {
    Agent: { AgentId: AGENT_ID, AgentCode: AGENT_CODE },
    Relations: { PolicyHolder: policyHolder },
    Contract: body.inceptionDate ? { InceptionDate: body.inceptionDate } : undefined,
    InsuredObject: {
      LicencePlateRegionCode: parsed.region,
      LicencePlateNumber: parsed.number,
    },
    Corrections: [],
  };

  const r = await fetch(`${BASE_URL}/CalculatePackagesAOv2`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify(payload),
  });

  const data = await r.json();
  if (!r.ok) return { status: r.status, body: { ok: false, error: data } };
  return { status: 200, body: { ok: true, packages: data.Data?.Packages, vehicleInfo: data.Data?.VehicleInfo, contractInfo: data.Data?.ContractInfo } };
}

async function handleVehicle(plate, vin) {
  let insuredObject;
  if (plate) {
    const parsed = parsePlate(plate);
    if (!parsed) return { status: 400, body: { ok: false, error: 'Neispravna registracija' } };
    insuredObject = { LicencePlateRegionCode: parsed.region, LicencePlateNumber: parsed.number };
  } else if (vin) {
    insuredObject = { Vin: vin };
  } else {
    return { status: 400, body: { ok: false, error: 'Potrebno: plate ili vin' } };
  }

  const authHeaders = await getAuthHeaders();
  const r = await fetch(`${BASE_URL}/VehicleInfo`, {
    method: 'GET',
    headers: authHeaders,
    body: JSON.stringify(insuredObject),
  });

  const data = await r.json();
  if (!r.ok) return { status: r.status, body: { ok: false, error: data } };
  return { status: 200, body: { ok: true, vehicleInfo: data.Data?.VehicleInfo } };
}

async function handlePartner(body) {
  const authHeaders = await getAuthHeaders();
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
    Contact: { Email: body.email, Phone: body.phone },
  };

  const r = await fetch(`${BASE_URL}/partners/UpdateOrCreate/natural`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify(payload),
  });

  const data = await r.json();
  if (!r.ok) return { status: r.status, body: { ok: false, error: data } };
  return { status: 200, body: { ok: true, partnerId: data.Data?.PartnerId } };
}

async function handlePartnerSearch(oib, isLeasing) {
  if (!oib) return { status: 400, body: { ok: false, error: 'Potrebno: oib' } };

  const authHeaders = await getAuthHeaders();
  const payload = { Pin: oib };
  if (isLeasing !== undefined) payload.IsLeasing = isLeasing === 'true';

  const r = await fetch(`${BASE_URL}/partners/search/legal`, {
    method: 'GET',
    headers: authHeaders,
    body: JSON.stringify(payload),
  });

  const data = await r.json();
  if (!r.ok) return { status: r.status, body: { ok: false, error: data } };
  return { status: 200, body: { ok: true, partners: data.Data?.Partners } };
}

async function handlePartnerLegal(body) {
  const authHeaders = await getAuthHeaders();
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
    Contact: { Email: body.email, Phone: body.phone },
  };

  const r = await fetch(`${BASE_URL}/partners/UpdateOrCreate/legal`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify(payload),
  });

  const data = await r.json();
  if (!r.ok) return { status: r.status, body: { ok: false, error: data } };
  return { status: 200, body: { ok: true, partnerId: data.Data?.PartnerId } };
}

async function handlePreDocs(product) {
  const authHeaders = await getAuthHeaders();
  const r = await fetch(`${BASE_URL}/PrePolicyDocuments`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ ProductCode: product || 'MTPL' }),
  });

  const data = await r.json();
  if (!r.ok) return { status: r.status, body: { ok: false, error: data } };
  return { status: 200, body: { ok: true, documents: data } };
}

async function handleReserve(body) {
  const authHeaders = await getAuthHeaders();
  const relations = { PolicyHolder: { PartnerId: body.partnerId } };
  if (body.insuredPartnerId) relations.InsuredPerson = { PartnerId: body.insuredPartnerId };
  if (body.carUserPartnerId) relations.CarUser = { PartnerId: body.carUserPartnerId };

  const r = await fetch(`${BASE_URL}/ReservePolicy`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ CalculationOid: body.calculationOid, Relations: relations }),
  });

  const data = await r.json();
  if (!r.ok) return { status: r.status, body: { ok: false, error: data } };
  return { status: 200, body: { ok: true, contractOid: data.data?.contractOid, policyNumber: data.data?.policyNumber } };
}

async function handleActivate(body) {
  const authHeaders = await getAuthHeaders();
  const payload = {
    ContractOid: body.contractOid,
    PolicyNumber: body.policyNumber,
    Payment: {
      Receipt: {
        CashierInvolvedPersonRoleId: CASHIER_ROLE_ID,
        PayerCommonName: body.payerName,
        PayerAddress: body.payerAddress,
        PayerSettlement: body.payerSettlement,
        ReceiptDate: body.receiptDate,
        ReceiptNumber: body.receiptNumber,
      },
      PaymentOrders: [{
        ReferenceNumber: body.referenceNumber || body.policyNumber,
        InstallmentNumber: 1,
        Currency: 'EUR',
        PaymentReferenceTypeId: 1,
        Amount: body.amount,
      }],
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

  const r = await fetch(`${BASE_URL}/ActivatePolicyWithPayment`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify(payload),
  });

  const data = await r.json();
  if (!r.ok) return { status: r.status, body: { ok: false, error: data } };
  return { status: 200, body: { ok: true, printouts: data.data?.printouts, remarks: data.data?.AdditionalRemarks } };
}

async function handleActivateNoPay(body) {
  const authHeaders = await getAuthHeaders();
  const r = await fetch(`${BASE_URL}/ActivatePolicy`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ ContractOid: body.contractOid, PolicyNumber: body.policyNumber }),
  });

  const data = await r.json();
  if (!r.ok) return { status: r.status, body: { ok: false, error: data } };
  return { status: 200, body: { ok: true, printouts: data.data?.printouts, remarks: data.data?.AdditionalRemarks } };
}

async function handleCancelReserved(body) {
  const authHeaders = await getAuthHeaders();
  const r = await fetch(`${BASE_URL}/CancelReservedPolicy`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ ContractOid: body.contractOid }),
  });

  if (!r.ok) { const d = await r.json(); return { status: r.status, body: { ok: false, error: d } }; }
  return { status: 200, body: { ok: true } };
}

async function handleCancelActive(body) {
  const authHeaders = await getAuthHeaders();
  const r = await fetch(`${BASE_URL}/CancelActivePolicy`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ ContractOid: body.contractOid }),
  });

  if (!r.ok) { const d = await r.json(); return { status: r.status, body: { ok: false, error: d } }; }
  return { status: 200, body: { ok: true } };
}

async function handleClientDocument(body) {
  const authHeaders = await getAuthHeaders();
  const payload = {
    ContractOid: body.contractOid,
    FromEmail: body.fromEmail,
    RecipientEmail: body.recipientEmail,
    CallbackNotificationType: body.callbackType || 'M',
    CallbackNotification: body.callbackNotification,
  };
  if (body.sentPdf) payload.SentPdf = body.sentPdf;

  const r = await fetch(`${BASE_URL}/ClientDocument`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify(payload),
  });

  if (!r.ok) { const d = await r.json(); return { status: r.status, body: { ok: false, error: d } }; }
  return { status: 200, body: { ok: true } };
}

async function handleDelivered(body) {
  const authHeaders = await getAuthHeaders();
  const r = await fetch(`${BASE_URL}/PolicyDelivered`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      ContractOid: body.contractOid,
      PolicyNumber: body.policyNumber,
      RecipientEmail: body.recipientEmail,
      SentDate: body.sentDate || new Date().toISOString(),
    }),
  });

  if (!r.ok) { const d = await r.json(); return { status: r.status, body: { ok: false, error: d } }; }
  return { status: 200, body: { ok: true } };
}

// ─── HTTP server ───────────────────────────────────────────────────────────

http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const path = parsed.pathname;
  const method = req.method;

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const send = (status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };

  const readBody = () => new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => data += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); }
      catch { resolve({}); }
    });
  });

  try {
    console.log(`[${new Date().toISOString()}] ${method} ${path}`);

    if (path === '/' && method === 'GET') {
      return send(200, { status: 'ok', env: 'api-rc' });
    }

    // GET routes
    if (method === 'GET') {
      if (path === '/ao/vehicle') {
        const result = await handleVehicle(parsed.query.plate, parsed.query.vin);
        return send(result.status, result.body);
      }
      if (path === '/ao/predocs') {
        const result = await handlePreDocs(parsed.query.product);
        return send(result.status, result.body);
      }
      if (path === '/ao/partner-search') {
        const result = await handlePartnerSearch(parsed.query.oib, parsed.query.isLeasing);
        return send(result.status, result.body);
      }
      return send(404, { error: 'Not found' });
    }

    // POST routes
    if (method !== 'POST') return send(405, { error: 'Method not allowed' });

    const body = await readBody();

    if (path === '/ao/calculate')       { const r = await handleCalculate(body);       return send(r.status, r.body); }
    if (path === '/ao/partner')         { const r = await handlePartner(body);         return send(r.status, r.body); }
    if (path === '/ao/partner-legal')   { const r = await handlePartnerLegal(body);    return send(r.status, r.body); }
    if (path === '/ao/reserve')         { const r = await handleReserve(body);         return send(r.status, r.body); }
    if (path === '/ao/activate')        { const r = await handleActivate(body);        return send(r.status, r.body); }
    if (path === '/ao/activate-nopay')  { const r = await handleActivateNoPay(body);  return send(r.status, r.body); }
    if (path === '/ao/cancel-reserved') { const r = await handleCancelReserved(body);  return send(r.status, r.body); }
    if (path === '/ao/cancel-active')   { const r = await handleCancelActive(body);    return send(r.status, r.body); }
    if (path === '/ao/client-document') { const r = await handleClientDocument(body);  return send(r.status, r.body); }
    if (path === '/ao/delivered')       { const r = await handleDelivered(body);       return send(r.status, r.body); }

    return send(404, { error: 'Not found' });

  } catch (e) {
    console.error('[error]', e.message);
    send(500, { ok: false, error: e.message });
  }

}).listen(3001, () => console.log('[wiener-proxy] listening on port 3001'));
