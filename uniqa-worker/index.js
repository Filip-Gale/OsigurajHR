/**
 * Cloudflare Worker — Uniqa (Peak3) proxy
 *
 * Routes:
 *   GET  /                  → health check
 *   GET  /codebook?key=...  → codebook lookup
 *   POST /ao/quote          → quotation (returns partnerNo + premium)
 *   POST /ao/create-policy  → underwriting-issuance (returns issuanceNo)
 *   POST /ao/issue-policy   → issue-issuance (returns policyNo)
 *   POST /ao/documents      → download e-document (POLICY / GREEN_CARD / INVOICE)
 */

// TODO: zamijeni s javnim endpointom kad Filip potvrdi (trenutni novi URL je interni Azure)
const BASE_URL = 'https://apim-stg-public-reg.uniqa-see.com/graphene.api';

const UNIQA_HEADERS = {
  'x-za-tenant': 'uniqahrv',
  'Context-Country-Code': 'HRV',
  'Ocp-Apim-Subscription-Key': '00c33fb1e01442a4b250766803dcfc5b',
  'Content-Type': 'application/json',
};

const ALLOWED_ORIGINS = [
  'https://www.osiguraj.hr',
  'https://osiguraj.hr',
  'http://localhost:4000',
  'http://127.0.0.1:4000',
];

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

function randomPartnerNo() {
  return String(Math.floor(Math.random() * 9000000000) + 1000000000);
}

/** Pretvori "1990-05-15" u [1990, 5, 15] */
function parseBirthday(birthday) {
  if (Array.isArray(birthday)) return birthday;
  if (typeof birthday === 'string' && birthday.includes('-')) {
    const [y, m, d] = birthday.split('-');
    return [parseInt(y), parseInt(m), parseInt(d)];
  }
  return birthday;
}

// ─── Handlers ───────────────────────────────────────────────────────────────

async function handleCodebook(key) {
  const r = await fetch(`${BASE_URL}/v1/codebook/${key}`, { headers: UNIQA_HEADERS });
  return json(await r.json());
}

async function handleQuote(body, headers) {
  const partnerNo = randomPartnerNo();

  const payload = {
    partnerCode: 'UniqaAgencyChannel',
    partnerNo,
    planId: '1217324174557184',
    policyFactors: {
      E_IsDiplomat: 'No',
      deductibleToReducePremium: '0',
      policyEffectiveStartDate: body.startDate,
      policyExpiryDate: body.endDate,
    },
    policyHolderFactors: {
      certiNo: body.oib,
      customerType: body.customerType || 'PERSON',
      ...(body.birthday && { birthday: body.birthday }),
    },
    insuredFactors: {
      certiNo: body.oib,
      customerType: body.customerType || 'PERSON',
      ...(body.birthday && { birthday: body.birthday }),
    },
    objectFactors: {
      vatStatusForVehicle: body.vatStatus || '0',
      plateRegistrationZone: body.plateZone,
      vehicleLeasing: body.leasing || '2',
      plateNo: body.plateNo,
      vinNo: 'AAAAA',
      yearOfManufactoring: Number(body.year),
      enginePower: Number(body.enginePower),
      numberOfSeat: String(body.seats || '5'),
      vehicleBrand: body.brand,
      vehicleType: body.model,
      autoModel: body.autoModel,
      engineType: body.engineType,
      vehicleUsage: 'StandardUsage',
      vehicleGroup: 'Passenger',
      isNotRegistered: 'NO',
      vehicleInAdvertisingAndBranding: 'NO',
      autoBodyType: body.bodyType || 'ZATVORENI',
      extensions: { skipDuplicateCheck: 'YES' },
    },
    commonInfo: { isQuickQuotation: false },
    products: [{ productId: 1215969347272704 }],
  };

  const r = await fetch(`${BASE_URL}/v2/standard/policy/quotation`, {
    method: 'POST',
    headers: UNIQA_HEADERS,
    body: JSON.stringify(payload),
  });
  const data = await r.json();
  const premium = data.value?.planSaPremium?.periodFinalPremium;

  return json({ partnerNo, premium, raw: data }, r.status, headers);
}

async function handleCreatePolicy(body, headers) {
  const birthday = parseBirthday(body.birthday);

  const payload = {
    partnerCode: 'UniqaAgencyChannel',
    partnerNo: body.partnerNo,
    agentCode: '1839159',
    branchCode: '99',
    planId: '1217324174557184',
    goodsId: '1217295619735552',
    premium: body.premium,
    effectiveDate: body.startDate,
    expiryDate: body.endDate,
    extensions: {
      E_IsDiplomat: 'No',
      bonusMalusScenario: 'B4',
      skipDuplicateCheck: 'YES',
    },
    issuanceHolder: {
      userType: body.customerType === 'COMPANY' ? 'COMPANY' : 'PERSONAL',
      certiType: 'IDCARD',
      certiNo: body.oib,
      birthday,
      fullName: `${body.firstName} ${body.lastName}`,
      lastName: body.lastName,
      firstName: body.firstName,
      mobilePhone: [{ phoneNo: String(body.phone).replace(/^0+/, ''), phoneType: 'PHONE', countryCode: '+385' }],
      address: [
        { addressType: 'PERMANENT', zipCode: body.zipCode, address11: body.street, address12: body.streetNo, address13: body.city, address15: 'Croatia' },
        { addressType: 'CONTACT',   zipCode: body.zipCode, address11: body.street, address12: body.streetNo, address13: body.city, address15: 'Croatia' },
      ],
      email: [{ email: body.email }],
    },
    paymentPlan: {
      samePaymentMethodForAllInstallments: 'YES',
      payMethod: 'CREDIT_CARD',
      periodPayMethodList: [{ periodNo: 0, payMethod: 'CREDIT_CARD' }],
    },
    issueWithoutPayment: 'YES',
    issuanceProductList: [{
      productId: '1215969347272704',
      premiumFrequencyType: 'SINGLE',
      issuanceInsuredObject: [{
        insuredType: 'INSURED_AUTO',
        issuanceInsuredAuto: {
          vatStatusForVehicle: body.vatStatus || '0',
          plateRegistrationZone: body.plateZone,
          vehicleLeasing: body.leasing === '1' ? 'YES' : 'NO',
          plateNo: body.plateNo,
          vinNo: body.vinNo,
          yearOfManufacturing: Number(body.year),
          enginePower: Number(body.enginePower),
          numberOfSeat: String(body.seats || '5'),
          vehicleBrand: body.brand,
          vehicleType: body.model,
          autoModel: body.autoModel,
          engineType: body.engineType,
          vehicleUsage: 'StandardUsage',
          vehicleGroup: 'Passenger',
          isNotRegistered: 'NO',
          isNewVehicle: 'NO',
          vehicleInAdvertisingAndBranding: 'NO',
          autoBodyType: body.bodyType || 'ZATVORENI',
          extensions: { skipDuplicateCheck: 'YES' },
        },
      }],
    }],
  };

  const r = await fetch(`${BASE_URL}/v2/standard/policy/underwriting-issuance`, {
    method: 'POST',
    headers: UNIQA_HEADERS,
    body: JSON.stringify(payload),
  });
  const data = await r.json();

  return json({
    issuanceNo: data.value?.issuanceNo,
    issuanceStatus: data.value?.issuanceStatus,
    raw: data,
  }, r.status, headers);
}

async function handleIssuePolicy(body, headers) {
  const payload = {
    partnerCode: 'UniqaAgencyChannel',
    partnerNo: body.partnerNo,
    issuanceNo: body.issuanceNo,
  };

  const r = await fetch(`${BASE_URL}/v2/standard/policy/issue-issuance`, {
    method: 'POST',
    headers: UNIQA_HEADERS,
    body: JSON.stringify(payload),
  });
  const data = await r.json();

  return json({
    policyNo: data.value?.policyNo,
    uploadLink: data.value?.extendInfo?.uploadLink,
    raw: data,
  }, r.status, headers);
}

async function handleDocuments(body, headers) {
  const payload = {
    partnerCode: 'UniqaAgencyChannel',
    partnerNo: body.partnerNo,
    businessNo: body.policyNo,
    documentType: body.documentType || 'POLICY',
  };

  const r = await fetch(`${BASE_URL}/v1/download/e-document`, {
    method: 'POST',
    headers: UNIQA_HEADERS,
    body: JSON.stringify(payload),
  });
  return json(await r.json(), r.status, headers);
}

async function handleExtractPolicy(body, headers, env) {
  const { image, mimeType } = body;
  if (!image || !mimeType) {
    return json({ ok: false, error: 'Missing image or mimeType' }, 400, headers);
  }

  const prompt = `Ovo je fotografija ili PDF police auto osiguranja, prometne dozvole ili zelene karte na hrvatskom jeziku.
Pronađi i vrati ISKLJUČIVO sljedeći JSON objekt (bez komentara, bez markdown blokova, samo čisti JSON):
{
  "registracija": "registracijska oznaka vozila bez razmaka i crtica, npr. ZG1234AB",
  "kw": (samo broj — snaga motora u kW, integer),
  "dob": "datum rođenja vlasnika/ugovaratelja u formatu DD.MM.GGGG",
  "oib": "OIB — točno 11 znamenki bez razmaka i crtica",
  "marka": "marka vozila velika slova, npr. RENAULT",
  "model": "SAMO osnovno ime modela velika slova, npr. TWINGO ili CLIO (bez motorizacije!)",
  "spec_motora": "motorizacija i varijanta, npr. 1.2 TREND 16V ili 1.5 DCI (bez marke i modela)",
  "godina": (godina proizvodnje vozila, integer),
  "gorivo": "Otto" ili "Diesel" (benzin/plin/hibrid = Otto, dizel = Diesel),
  "vin": "broj šasije/VIN — 17 alfanumeričkih znakova bez razmaka",
  "ime": "ime ugovaratelja/vlasnika",
  "prezime": "prezime ugovaratelja/vlasnika",
  "ulica": "naziv ulice bez kućnog broja",
  "kucni_broj": "kućni broj (samo broj i slovo ako postoji)",
  "postanski_broj": "poštanski broj (5 znamenki)",
  "grad": "naziv grada"
}
Za polja koja nisu vidljiva postavi null. Vrati SAMO JSON, ništa drugo.`;

  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: image } }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 8192, thinkingConfig: { thinkingBudget: 0 } },
      }),
    }
  );

  const gemini = await r.json();
  if (!r.ok) {
    return json({ ok: false, error: gemini.error?.message || 'Gemini error' }, 500, headers);
  }

  // gemini-2.5-flash returns thinking tokens — find the part that contains JSON
  const parts = gemini.candidates?.[0]?.content?.parts || [];
  const text = (parts.map(p => p.text || '').find(t => t.includes('{')) || '').trim();
  try {
    const match = text.match(/\{[\s\S]*\}/);
    const clean = match ? match[0] : text;
    const parsed = JSON.parse(clean);
    if (parsed.oib)    parsed.oib    = String(parsed.oib).replace(/[\s\-]/g, '');
    if (parsed.kw)     parsed.kw     = parseInt(parsed.kw, 10) || null;
    if (parsed.godina) parsed.godina = parseInt(parsed.godina, 10) || null;
    if (parsed.marka)  parsed.marka  = String(parsed.marka).toUpperCase().trim();
    if (parsed.model)  parsed.model  = String(parsed.model).toUpperCase().trim();
    if (parsed.vin)     parsed.vin     = String(parsed.vin).replace(/[\s\-]/g, '').toUpperCase();
    if (parsed.gorivo && !['Otto','Diesel'].includes(parsed.gorivo)) parsed.gorivo = null;
    if (parsed.ime)           parsed.ime           = String(parsed.ime).trim();
    if (parsed.prezime)       parsed.prezime       = String(parsed.prezime).trim();
    if (parsed.spec_motora)   parsed.spec_motora   = String(parsed.spec_motora).trim();
    if (parsed.ulica)         parsed.ulica         = String(parsed.ulica).trim();
    if (parsed.kucni_broj)    parsed.kucni_broj    = String(parsed.kucni_broj).trim();
    if (parsed.postanski_broj) parsed.postanski_broj = String(parsed.postanski_broj).replace(/\D/g,'');
    if (parsed.grad)          parsed.grad          = String(parsed.grad).trim();
    return json({ ok: true, ...parsed }, 200, headers);
  } catch {
    return json({ ok: false, error: 'Nisam uspio pročitati dokument. Pokušaj s boljom fotografijom.', raw: text, parts: parts.map(p => p.text?.slice(0,200)) }, 500, headers);
  }
}

// ─── Main entry point ────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const headers = corsHeaders(origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // Health check
      if (path === '/' && request.method === 'GET') {
        return json({ status: 'ok' }, 200, headers);
      }

      // Codebook
      if (path === '/codebook' && request.method === 'GET') {
        const key = url.searchParams.get('key') || 'list';
        return handleCodebook(key);
      }

      // POST routes
      if (request.method !== 'POST') {
        return json({ error: 'Method not allowed' }, 405, headers);
      }

      const body = await request.json();

      if (path === '/ao/quote')         return handleQuote(body, headers);
      if (path === '/ao/create-policy') return handleCreatePolicy(body, headers);
      if (path === '/ao/issue-policy')  return handleIssuePolicy(body, headers);
      if (path === '/ao/documents')     return handleDocuments(body, headers);
      if (path === '/extract-policy')   return handleExtractPolicy(body, headers, env);

      return json({ error: 'Not found' }, 404, headers);

    } catch (e) {
      return json({ error: e.message }, 500, headers);
    }
  },
};
