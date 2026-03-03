/**
 * Cloudflare Worker — AS Direct (Generali) proxy
 *
 * Worker Secrets:
 *   ASDIRECT_USERNAME  = "maksimiro"
 *   ASDIRECT_PASSWORD  = "c6VWecZZmAiV"
 *   ASDIRECT_POSREDNIK = "413106"
 *
 * Request body:
 *   { registracija, snagaMotora, godinaRodjenja, tipStranke, godinaProizvodnje?, demo? }
 *
 * Pošalji demo:true za testni prikaz UI-ja bez Generali API-ja.
 */

const ASDIRECT_URL =
  'https://asdirectprod.generali.hr:8080/TestAutoOsiguranje/api/as/v1/GetQuote';

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

function extractAoCijena(data) {
  if (data?.premijaAOBezPoreza != null && data.premijaAOBezPoreza > 0) {
    const porez = data.porez ?? 0;
    return Math.round(data.premijaAOBezPoreza * (1 + porez / 100) * 100) / 100;
  }
  return null;
}

/**
 * Gruba procjena AO premije za HR tržište (kad Generali API nije dostupan).
 * Bazira se na kW kao glavnom faktoru, uz korekciju za dob vozača.
 * NIJE prava Generali cijena — koristi se samo kao fallback prikaz.
 */
function estimateAoCijena(snagaMotora, godinaRodjenja) {
  const kw = Number(snagaMotora) || 80;
  const dob = new Date().getFullYear() - Number(godinaRodjenja || 1980);

  // Osnova po kW razredima (EUR, bez poreza)
  let base;
  if (kw <= 55)       base = 280;
  else if (kw <= 75)  base = 340;
  else if (kw <= 100) base = 420;
  else if (kw <= 130) base = 520;
  else if (kw <= 160) base = 660;
  else                base = 800;

  // Dob koeficijent (mladi i stariji vozači plaćaju više)
  let dobFactor = 1.0;
  if (dob < 25)       dobFactor = 1.30;
  else if (dob < 30)  dobFactor = 1.10;
  else if (dob > 65)  dobFactor = 1.15;

  const bezPoreza = base * dobFactor;
  const sPorezom  = Math.round(bezPoreza * 1.15 * 100) / 100; // 15% porez
  return sPorezom;
}

/** Demo response — realistični podaci za testiranje UI-ja */
function makeDemoResponse(snagaMotora, godinaRodjenja) {
  const cijena = estimateAoCijena(snagaMotora, godinaRodjenja);
  return {
    ao_cijena_s_porezom: cijena,
    demo: true,
    paketi: [
      { code: 'AO_PLUS',   premijaBezPoreza: cijena * 0.03, premium: 'perc', porez: 0 },
      { code: 'ASIST_HR',  premijaBezPoreza: 16,  premium: 'fix', porez: 0 },
      { code: 'ASIST_SVE', premijaBezPoreza: 32,  premium: 'fix', porez: 0 },
      { code: 'NEZGODA',   premijaBezPoreza: 8,   premium: 'fix', porez: 0 },
      { code: 'DIVLJAC',   premijaBezPoreza: 46,  premium: 'fix', porez: 10 },
      { code: 'STAKLA',    premijaBezPoreza: 50,  premium: 'fix', porez: 10 },
    ],
    ps_ao: 10,
  };
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

    const { registracija, snagaMotora, godinaRodjenja, tipStranke, godinaProizvodnje, demo } = body;

    if (!registracija || !snagaMotora || !godinaRodjenja || !tipStranke) {
      return json(
        { error: 'Nedostaju obavezni parametri (registracija, snagaMotora, godinaRodjenja, tipStranke)' },
        400,
        headers
      );
    }

    // Demo mode — testni odgovor bez poziva Generaliju
    if (demo === true) {
      return json(makeDemoResponse(snagaMotora, godinaRodjenja), 200, headers);
    }

    const zona = registracija.replace(/[^A-Za-z]/g, '').substring(0, 2).toUpperCase();
    const credentials = btoa(`${env.ASDIRECT_USERNAME}:${env.ASDIRECT_PASSWORD}`);

    // godinaProizvodnje je tehnički opcionalna po docs, ali API baca NullPointerException
    // bez nje jer ne može dohvatiti TehnickaKarakteristikaAO. Koristimo fallback: 5 god. staro vozilo.
    const godinaVozila = godinaProizvodnje
      ? Number(godinaProizvodnje)
      : new Date().getFullYear() - 5;

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
      premijskiStupanjAo: 10,
      premijskiStupanjAk: 2,
      brojPoliceZaObnovu: null,
      posrednik: env.ASDIRECT_POSREDNIK || '411111',
      pausalnoOsiguranjeDodatneOpreme: false,
    };

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
      return json({ error: 'Greška pri komunikaciji s Generali API-jem' }, 502, headers);
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
      return json({ error: 'Nevaljani JSON od osiguravatelja', details: rawText }, 502, headers);
    }

    const cijena = extractAoCijena(data);

    // Ako Generali nije vratio cijenu (config bug), vrati grešku s detaljima
    if (!cijena) {
      return json(
        { error: 'Osiguravatelj nije vratio cijenu', details: data },
        502,
        headers
      );
    }

    return json({
      ao_cijena_s_porezom: cijena,
      paketi: data?.paketi ?? [],
      ps_ao: data?.ps_AO ?? 10,
    }, 200, headers);
  },
};

function json(body, status, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}
