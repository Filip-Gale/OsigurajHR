/**
 * Cloudflare Worker — AS Direct (Generali) proxy
 *
 * Route: POST osiguraj.hr/api/quote
 *
 * Drži kredencijale kao Worker Secrets:
 *   ASDIRECT_USERNAME  = "maksimiro"
 *   ASDIRECT_PASSWORD  = "c6VWecZZmAiV"
 *   ASDIRECT_POSREDNIK = "[kod od Generalija]"  (test fallback: "411111")
 *
 * Request body (od fronta):
 *   { registracija, snagaMotora, godinaRodjenja, tipStranke }
 *
 * Response nazad frontu:
 *   { ao_cijena_s_porezom, paketi, ps_ao }
 */

const ASDIRECT_URL =
  'https://asdirectprod.generali.hr:8080/TestAutoOsiguranje/api/as/v1/GetQuote';

const ALLOWED_ORIGINS = [
  'https://www.osiguraj.hr',
  'https://osiguraj.hr',
  'http://localhost:4000', // lokalni razvoj
  'http://127.0.0.1:4000',
];

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin)
    ? origin
    : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

function getTomorrow() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  // Format: YYYY-MM-DD
  return d.toISOString().split('T')[0];
}

/**
 * Izračunava AO cijenu s porezom iz AS Direct odgovora.
 * Format odgovora per dokumentacija: premijaAOBezPoreza + porez (%)
 * Primjer: premijaAOBezPoreza=539.67, porez=15 → 539.67 * 1.15 = 620.62
 */
function extractAoCijena(data) {
  if (data?.premijaAOBezPoreza != null) {
    const porez = data.porez ?? 0;
    return Math.round(data.premijaAOBezPoreza * (1 + porez / 100) * 100) / 100;
  }
  return null;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const headers = corsHeaders(origin);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }

    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405, headers);
    }

    // Parsiraj tijelo zahtjeva
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Neispravan JSON' }, 400, headers);
    }

    const { registracija, snagaMotora, godinaRodjenja, tipStranke } = body;

    if (!registracija || !snagaMotora || !godinaRodjenja || !tipStranke) {
      return json(
        { error: 'Nedostaju obavezni parametri (registracija, snagaMotora, godinaRodjenja, tipStranke)' },
        400,
        headers
      );
    }

    // Izvuci registarsku zonu (prve 2 slova, npr. "ZG" iz "ZG1234AA")
    const zona = registracija
      .replace(/[^A-Za-z]/g, '')
      .substring(0, 2)
      .toUpperCase();

    // Basic Auth header
    const credentials = btoa(
      `${env.ASDIRECT_USERNAME}:${env.ASDIRECT_PASSWORD}`
    );

    const payload = {
      vozilo: {
        registracija: zona,
        snagaMotora: Number(snagaMotora),
        godinaProizvodnje: null,
      },
      osiguranik: {
        godinaRodjenja: Number(godinaRodjenja),
        tipStranke: String(tipStranke),
      },
      datumPocetkaOsiguranja: getTomorrow(),
      premijskiStupanjAo: 10,
      posrednik: env.ASDIRECT_POSREDNIK || '411111',
      pausalnoOsiguranjeDodatneOpreme: false,
    };

    // Pozovi AS Direct API
    let asdirectRes;
    try {
      asdirectRes = await fetch(ASDIRECT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${credentials}`,
        },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      return json(
        { error: 'Greška pri komunikaciji s Generali AS Direct API-jem' },
        502,
        headers
      );
    }

    const rawText = await asdirectRes.text();

    if (!asdirectRes.ok) {
      return json(
        { error: 'Osiguravatelj nije vratio valjanu ponudu', details: rawText },
        502,
        headers
      );
    }

    let data;
    try {
      data = JSON.parse(rawText);
    } catch {
      return json(
        { error: 'Osiguravatelj vratio nevaljani JSON', details: rawText },
        502,
        headers
      );
    }

    const result = {
      ao_cijena_s_porezom: extractAoCijena(data),
      paketi: data?.paketi ?? [],
      ps_ao: data?.ps_AO ?? 10,
      // Ostavi i sirovi odgovor za debug (ukloniti u produkciji)
      _raw: data,
    };

    return json(result, 200, headers);
  },
};

function json(body, status, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
  });
}
