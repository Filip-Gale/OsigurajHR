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
      vinNo: body.vinNo,
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
    },
    issuanceHolder: {
      userType: body.customerType === 'COMPANY' ? 'COMPANY' : 'PERSONAL',
      certiType: 'IDCARD',
      certiNo: body.oib,
      birthday,
      fullName: `${body.firstName} ${body.lastName}`,
      lastName: body.lastName,
      firstName: body.firstName,
      mobilePhone: [{ phoneNo: body.phone, phoneType: 'PHONE', countryCode: '+385' }],
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

// ─── Main entry point ────────────────────────────────────────────────────────

export default {
  async fetch(request) {
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

      return json({ error: 'Not found' }, 404, headers);

    } catch (e) {
      return json({ error: e.message }, 500, headers);
    }
  },
};
