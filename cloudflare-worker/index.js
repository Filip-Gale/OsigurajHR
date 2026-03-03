/**
 * Cloudflare Worker — AS Direct (Generali) proxy
 *
 * Worker Secrets:
 *   ASDIRECT_USERNAME  = "maksimiro"
 *   ASDIRECT_PASSWORD  = "c6VWecZZmAiV"
 *   ASDIRECT_POSREDNIK = "413106"
 *
 * Request body:
 *   { registracija, snagaMotora, godinaRodjenja, tipStranke, godinaProizvodnje?, oib? }
 *
 * Logika:
 *   1. Ako je dostavljan OIB → HUOMTR GetPodaci → pravi premijski stupanj
 *   2. Inače → PS 10 (novi vozač)
 *   3. Uvijek aplicira AS_DIRE_1(10%) + AS_DOBR_1(10%) = ukupno −19%
 */

const BASE_URL_TEST = 'https://asdirectprod.generali.hr:8080/TestAutoOsiguranje';
const GETQUOTE_URL  = BASE_URL_TEST + '/api/as/v1/GetQuote';
const HUOMTR_URL    = BASE_URL_TEST + '/api/huomtr/v1/GetPodaci';

// Ukupni multiplikator popusta: AS_DIRE_1(−10%) × AS_DOBR_1(−10%) = 0.81
const DISCOUNT = 0.81;

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
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

function getTomorrow() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

/** Dohvati premijski stupanj iz HUOMTR servisa. Fallback: PS 10. */
async function fetchPremijskiStupanj(oib, godinaRodjenja, credentials) {
  if (!oib) return 10;
  try {
    const res = await fetch(HUOMTR_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${credentials}`,
      },
      body: JSON.stringify({
        oib: String(oib),
        godinaRodjenja: Number(godinaRodjenja),
      }),
    });
    if (!res.ok) return 10;
    const data = await res.json();
    return data?.premijskiStupanj ?? 10;
  } catch {
    return 10;
  }
}

/** Primijeni popust i porez na premiju bez poreza. */
function izracunajCijenu(premijaBezPoreza, porezPct, applyDiscount = true) {
  const base = applyDiscount ? premijaBezPoreza * DISCOUNT : premijaBezPoreza;
  return Math.round(base * (1 + porezPct / 100) * 100) / 100;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const headers = corsHeaders(origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }
    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405, headers);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Neispravan JSON' }, 400, headers);
    }

    const { registracija, snagaMotora, godinaRodjenja, tipStranke, godinaProizvodnje, oib } = body;

    if (!registracija || !snagaMotora || !godinaRodjenja || !tipStranke) {
      return json(
        { error: 'Nedostaju obavezni parametri' },
        400, headers
      );
    }

    // Registarska zona (prve 2 slova)
    const zona = registracija.replace(/[^A-Za-z]/g, '').substring(0, 2).toUpperCase();

    const credentials = btoa(`${env.ASDIRECT_USERNAME}:${env.ASDIRECT_PASSWORD}`);

    // Godina vozila — obavezna za API (TehnickaKarakteristikaAO), fallback: 5 god. staro
    const godinaVozila = godinaProizvodnje
      ? Number(godinaProizvodnje)
      : new Date().getFullYear() - 5;

    // Dohvati pravi premijski stupanj iz HUOMTR-a (ako ima OIB)
    const ps = await fetchPremijskiStupanj(oib, godinaRodjenja, credentials);

    const payload = {
      vozilo: {
        registracija: zona,
        snagaMotora: Number(snagaMotora),
        godinaProizvodnje: String(godinaVozila),
        novonabavnaVrijednostVozila: null,
      },
      osiguranik: {
        godinaRodjenja: Number(godinaRodjenja),
        tipStranke: String(tipStranke),
      },
      datumPocetkaOsiguranja: getTomorrow(),
      premijskiStupanjAo: ps,
      premijskiStupanjAk: 2,
      brojPoliceZaObnovu: null,
      posrednik: env.ASDIRECT_POSREDNIK || '413106',
      pausalnoOsiguranjeDodatneOpreme: false,
    };

    let asdirectRes;
    try {
      asdirectRes = await fetch(GETQUOTE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${credentials}`,
        },
        body: JSON.stringify(payload),
      });
    } catch {
      return json({ error: 'Greška pri komunikaciji s Generali API-jem' }, 502, headers);
    }

    const rawText = await asdirectRes.text();

    if (!asdirectRes.ok) {
      return json({ error: 'Generali nije vratio valjanu ponudu', details: rawText }, 502, headers);
    }

    let data;
    try {
      data = JSON.parse(rawText);
    } catch {
      return json({ error: 'Nevaljani JSON od Generalija', details: rawText }, 502, headers);
    }

    const premijaBezPoreza = data?.premijaAOBezPoreza;
    const porez = data?.porez ?? 0;

    if (!premijaBezPoreza || premijaBezPoreza <= 0) {
      return json({ error: 'Generali nije vratio cijenu' }, 502, headers);
    }

    // Primijeni popuste na AO i na sve pakete
    const aoSPorezom = izracunajCijenu(premijaBezPoreza, porez);

    const paketi = (data.paketi ?? []).map(p => ({
      ...p,
      premijaBezPoreza: Math.round(p.premijaBezPoreza * DISCOUNT * 100) / 100,
    }));

    return json({
      ao_cijena_s_porezom: aoSPorezom,
      paketi,
      ps_ao: ps,
      ps_lookup: oib ? 'huomtr' : 'default',
      popust_primijenjen: true,
    }, 200, headers);
  },
};

function json(body, status, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}
