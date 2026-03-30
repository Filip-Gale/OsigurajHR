/**
 * Cloudflare Worker — AS Direct (Generali) proxy
 *
 * Worker Secrets:
 *   ASDIRECT_USERNAME  = "maksimiro"
 *   ASDIRECT_PASSWORD  = "c6VWecZZmAiV"
 *   ASDIRECT_POSREDNIK = "413106"
 *
 * Routes:
 *   POST /                        → GetQuote
 *   POST /gen-policy              → GenPolicy
 *   POST /set-payment-status      → SetPaymentStatus
 *   GET  /get-mjesta              → GetMjesta (IN2 city codes)
 *   GET  /get-dokumenti?faza=...  → GetDokumenti
 */

const BASE_URL = 'https://asdirectprod.generali.hr:8080/TestAutoOsiguranje';

const URLS = {
  getQuote:          BASE_URL + '/api/as/v1/GetQuote',
  huomtr:            BASE_URL + '/api/huomtr/v1/GetPodaci',
  genPolicy:         BASE_URL + '/api/as/v1/GenPolicy',
  setPaymentStatus:  BASE_URL + '/api/as/v1/SetPaymentStatus',
  getMjesta:         BASE_URL + '/api/v1/GetMjesta',
  getDokumenti:      BASE_URL + '/api/dokumentacija/v1/GetDokumenti',
};

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
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

function json(body, status, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
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
    const res = await fetch(URLS.huomtr, {
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

// ─── Handlers ───────────────────────────────────────────────────────────────

async function handleGetQuote(body, credentials, env, headers) {
  const { registracija, snagaMotora, godinaRodjenja, tipStranke, godinaProizvodnje, oib } = body;

  const isPravna = tipStranke === 'P' || tipStranke === 'O';
  if (!registracija || !snagaMotora || (!isPravna && !godinaRodjenja) || !tipStranke) {
    return json({ error: 'Nedostaju obavezni parametri' }, 400, headers);
  }

  const zona = registracija.replace(/[^A-Za-z]/g, '').substring(0, 2).toUpperCase();
  const godinaVozila = godinaProizvodnje
    ? Number(godinaProizvodnje)
    : new Date().getFullYear() - 5;

  const ps = await fetchPremijskiStupanj(oib, godinaRodjenja, credentials);

  const payload = {
    vozilo: {
      registracija: zona,
      snagaMotora: Number(snagaMotora),
      godinaProizvodnje: String(godinaVozila),
      novonabavnaVrijednostVozila: null,
    },
    osiguranik: {
      godinaRodjenja: godinaRodjenja ? Number(godinaRodjenja) : null,
      tipStranke: String(tipStranke),
    },
    datumPocetkaOsiguranja: getTomorrow(),
    premijskiStupanjAo: ps,
    premijskiStupanjAk: 2,
    brojPoliceZaObnovu: null,
    posrednik: env.ASDIRECT_POSREDNIK || '413106',
    pausalnoOsiguranjeDodatneOpreme: false,
  };

  let res;
  try {
    res = await fetch(URLS.getQuote, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${credentials}` },
      body: JSON.stringify(payload),
    });
  } catch {
    return json({ error: 'Greška pri komunikaciji s Generali API-jem' }, 502, headers);
  }

  const rawText = await res.text();
  if (!res.ok) {
    return json({ error: 'Generali nije vratio valjanu ponudu', details: rawText }, 502, headers);
  }

  let data;
  try { data = JSON.parse(rawText); } catch {
    return json({ error: 'Nevaljani JSON od Generalija', details: rawText }, 502, headers);
  }

  const premijaBezPoreza = data?.premijaAOBezPoreza;
  const porez = data?.porez ?? 0;

  if (!premijaBezPoreza || premijaBezPoreza <= 0) {
    return json({ error: 'Generali nije vratio cijenu' }, 502, headers);
  }

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
}

/** Konvertira mobitel u format 3859xxxxxxx */
function normalizeMobitel(mob) {
  if (!mob) return mob;
  const s = String(mob).replace(/\s/g, '');
  if (s.startsWith('3859')) return s;
  if (s.startsWith('+3859')) return s.slice(1);
  if (s.startsWith('09')) return '385' + s.slice(1);
  return s;
}

/** Konvertira boolean u "D"/"N" string za Generali API */
function boolToChar(val, defaultVal = 'N') {
  if (val === true || val === 'D' || val === 'Y') return 'D';
  if (val === false || val === 'N') return 'N';
  return defaultVal;
}

function buildStranka(s) {
  return {
    ime:                   s.ime,
    prezime:               s.prezime,
    naziv:                 s.naziv ?? null,
    oib:                   String(s.oib),
    datumRodjenja:         s.datumRodjenja,
    ulica:                 s.ulica,
    kucniBroj:             s.kucniBroj,
    mjesto:                s.mjesto,
    ulicaNaplate:          s.ulicaNaplate          ?? s.ulica,
    kucniBrojNaplate:      s.kucniBrojNaplate      ?? s.kucniBroj,
    mjestoNaplate:         s.mjestoNaplate         ?? s.mjesto,
    spol:                  s.spol ?? null,
    mobitel:               normalizeMobitel(s.mobitel),
    email:                 s.email,
    tipStranke:            s.tipStranke,
    marketinskaSuglasnost: boolToChar(s.marketinskaSuglasnost, 'N'),
    provjeraStranke:       s.provjeraStranke ?? false,
  };
}

async function handleGenPolicy(body, credentials, env, headers) {
  const {
    vozilo, ugovaratelj, osiguranik, paketi,
    datumPocetkaOsiguranja, premijskiStupanjAo, premijskiStupanjAk,
    popusti,
  } = body;

  if (!vozilo || !ugovaratelj || !paketi) {
    return json({ error: 'Nedostaju obavezni parametri (vozilo, ugovaratelj, paketi)' }, 400, headers);
  }

  const payload = {
    vozilo: {
      sasija:            vozilo.sasija,
      proizvodac:        vozilo.proizvodac,
      model:             vozilo.model,
      registracija:      vozilo.registracija,
      snagaMotora:       Number(vozilo.snagaMotora),
      godinaProizvodnje: String(vozilo.godinaProizvodnje),
      novonabavnaVrijednostVozila: vozilo.novonabavnaVrijednostVozila ?? null,
    },
    ugovaratelj: buildStranka(ugovaratelj),
    osiguranik:  buildStranka(osiguranik ?? ugovaratelj),
    paketi,
    // Koristi popuste iz requesta ili defaultne AS_DIRE_1 + AS_DOBR_1
    popusti: popusti ?? [
      { code: 'AS_DIRE_1', stopa: 10 },
      { code: 'AS_DOBR_1', stopa: 10 },
    ],
    datumPocetkaOsiguranja: datumPocetkaOsiguranja ?? getTomorrow(),
    satOsiguranja:          '00:00',
    premijskiStupanjAo:     premijskiStupanjAo ?? 10,
    premijskiStupanjAk:     premijskiStupanjAk ?? 2,
    leasing:                body.leasing ?? 'N',
    brojStarePolice:        body.brojStarePolice ?? null,
    brojPoliceZaObnovu:     body.brojPoliceZaObnovu ?? null,
    posrednik:              env.ASDIRECT_POSREDNIK || '413106',
    pausalnoOsiguranjeDodatneOpreme: body.pausalnoOsiguranjeDodatneOpreme ?? false,
  };

  let res;
  try {
    res = await fetch(URLS.genPolicy, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${credentials}` },
      body: JSON.stringify(payload),
    });
  } catch {
    return json({ error: 'Greška pri komunikaciji s Generali API-jem' }, 502, headers);
  }

  const rawText = await res.text();
  if (!res.ok) {
    return json({ error: 'GenPolicy greška', status: res.status, details: rawText }, 502, headers);
  }

  let data;
  try { data = JSON.parse(rawText); } catch {
    return json({ error: 'Nevaljani JSON od Generalija', details: rawText }, 502, headers);
  }

  return json({
    brojPolice:   data.brojPolice,
    cijenaPorez:  data.cijenaPorez,
    PS_AO:        data.premijskiStupanjAo ?? data.PS_AO,
    PS_AK:        data.premijskiStupanjAk ?? data.PS_AK,
    raw:          data,
  }, 200, headers);
}

async function sendPolicyEmail(env, { email, ime, brojPolice, policaB64, zkB64 }) {
  if (!env.RESEND_API_KEY || !email) return;
  const attachments = [];
  if (policaB64) attachments.push({ filename: 'polica.pdf', content: policaB64 });
  if (zkB64) attachments.push({ filename: 'zelena-karta.pdf', content: zkB64 });
  const html = `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;">
    <h2 style="color:#573cf9;margin-bottom:8px;">Polica uspješno ugovorena ✅</h2>
    <p style="color:#444;">Poštovani/a ${ime || ''},</p>
    <p style="color:#444;">Vaša polica obveznog auto osiguranja (Generali) uspješno je ugovorena.</p>
    <p style="color:#444;"><strong>Broj police:</strong> ${brojPolice}</p>
    ${attachments.length ? '<p style="color:#444;">U prilogu se nalaze dokumenti police.</p>' : ''}
    <p style="color:#aaa;font-size:0.82em;margin-top:24px;">Posrednik: Maksi Miro d.o.o. · osiguraj.hr</p>
  </div>`;
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.RESEND_API_KEY}` },
      body: JSON.stringify({
        from: 'Osiguraj.hr <auto@osiguraj.hr>',
        to: [email],
        subject: `Vaša polica auto osiguranja — ${brojPolice}`,
        html,
        attachments,
      }),
    });
  } catch {
    // non-fatal
  }
}

async function handleSetPaymentStatus(body, credentials, env, headers) {
  const { brojPolice, brojSasije, paid, storno } = body;

  if (!brojPolice || !brojSasije) {
    return json({ error: 'Nedostaju obavezni parametri (brojPolice, brojSasije)' }, 400, headers);
  }

  const payload = {
    brojPolice,
    brojSasije,
    paid:   paid   ?? true,
    storno: storno ?? false,
  };

  let res;
  try {
    res = await fetch(URLS.setPaymentStatus, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${credentials}` },
      body: JSON.stringify(payload),
    });
  } catch {
    return json({ error: 'Greška pri komunikaciji s Generali API-jem' }, 502, headers);
  }

  const rawText = await res.text();
  if (!res.ok) {
    return json({ error: 'SetPaymentStatus greška', status: res.status, details: rawText }, 502, headers);
  }

  let data;
  try { data = JSON.parse(rawText); } catch {
    return json({ error: 'Nevaljani JSON od Generalija', details: rawText }, 502, headers);
  }

  // Pošalji email klijentu s policom
  await sendPolicyEmail(env, {
    email:     body.email,
    ime:       body.ime,
    brojPolice: data.brojPolice || brojPolice,
    policaB64: data.polica,
    zkB64:     data.ZK,
  });

  return json({
    brojPolice: data.brojPolice,
    polica:     data.polica,   // base64 PDF
    brojZK:     data.brojZK,
    ZK:         data.ZK,       // base64 PDF
    raw:        data,
  }, 200, headers);
}

async function handleGetMjesta(credentials, headers) {
  let res;
  try {
    res = await fetch(URLS.getMjesta, {
      method: 'GET',
      headers: { Authorization: `Basic ${credentials}` },
    });
  } catch {
    return json({ error: 'Greška pri komunikaciji s Generali API-jem' }, 502, headers);
  }

  const rawText = await res.text();
  if (!res.ok) {
    return json({ error: 'GetMjesta greška', status: res.status, details: rawText }, 502, headers);
  }

  let data;
  try { data = JSON.parse(rawText); } catch {
    return json({ error: 'Nevaljani JSON od Generalija', details: rawText }, 502, headers);
  }

  return json(data, 200, headers);
}

async function handleGetDokumenti(faza, credentials, headers) {
  const payload = { faza: faza || 'predugovorna' };

  let res;
  try {
    // Generali zahtijeva GET s JSON bodyjem — koristimo Request objekt da zaobiđemo CF ograničenje
    const req = new Request(URLS.getDokumenti, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${credentials}` },
      body: JSON.stringify(payload),
    });
    res = await fetch(req);
  } catch {
    return json({ error: 'Greška pri komunikaciji s Generali API-jem' }, 502, headers);
  }

  const rawText = await res.text();
  if (!res.ok) {
    return json({ error: 'GetDokumenti greška', status: res.status, details: rawText }, 502, headers);
  }

  let data;
  try { data = JSON.parse(rawText); } catch {
    return json({ error: 'Nevaljani JSON od Generalija', details: rawText }, 502, headers);
  }

  return json(data, 200, headers);
}

// ─── Main entry point ───────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const headers = corsHeaders(origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }

    const url = new URL(request.url);
    const path = url.pathname;
    const credentials = btoa(`${env.ASDIRECT_USERNAME}:${env.ASDIRECT_PASSWORD}`);

    // GET /get-mjesta
    if (path === '/get-mjesta' && request.method === 'GET') {
      return handleGetMjesta(credentials, headers);
    }

    // GET /get-dokumenti?faza=predugovorna
    if (path === '/get-dokumenti' && request.method === 'GET') {
      const faza = url.searchParams.get('faza') || 'predugovorna';
      return handleGetDokumenti(faza, credentials, headers);
    }

    // All remaining routes expect POST
    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405, headers);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Neispravan JSON' }, 400, headers);
    }

    if (path === '/' || path === '') {
      return handleGetQuote(body, credentials, env, headers);
    }

    if (path === '/gen-policy') {
      return handleGenPolicy(body, credentials, env, headers);
    }

    if (path === '/set-payment-status') {
      return handleSetPaymentStatus(body, credentials, env, headers);
    }

    return json({ error: 'Not found' }, 404, headers);
  },
};
