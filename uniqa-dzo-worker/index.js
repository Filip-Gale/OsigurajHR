/**
 * Cloudflare Worker — Uniqa DZO SOAP proxy
 *
 * Service: https://postest.uniqa.hr/in_osigtest2/cubisdzoservice.asmx
 * Auth:    WEBUSER / Uniqa1!
 *
 * Routes:
 *   GET  /                      health check
 *   POST /dzo/ponude             { datumRodenja:"DD.MM.YYYY" } → packages + prices
 *   GET  /dzo/mjesta?q=...       search cities
 *   POST /dzo/validiraj-mbo      { mbo } → validate HZZO number
 *   POST /dzo/spremi-policu      create policy (partner creation included)
 */

const SOAP_URL = 'https://postest.uniqa.hr/in_osigtest2/cubisdzoservice.asmx';
const SOAP_NS  = 'https://services.incubis.hr/';
const USERNAME = 'WEBUSER';
const PASSWORD = 'Uniqa1!';

const ALLOWED = [
  'https://www.osiguraj.hr',
  'https://osiguraj.hr',
  'http://localhost:4000',
  'http://127.0.0.1:4000',
];

// ─── helpers ────────────────────────────────────────────────────────────────

function cors(origin) {
  const o = ALLOWED.includes(origin) ? origin : ALLOWED[0];
  return {
    'Access-Control-Allow-Origin': o,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

function jsonOk(body, origin) {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json', ...cors(origin) },
  });
}

function jsonErr(msg, status = 500, origin = '') {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors(origin) },
  });
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function decode(s) {
  if (!s) return '';
  return s
    .replace(/&lt;/g,   '<')
    .replace(/&gt;/g,   '>')
    .replace(/&amp;/g,  '&')
    .replace(/&quot;/g, '"')
    .replace(/&#xD;/g,  '')
    .replace(/&#xA;/g,  '\n');
}

// Build SOAP 1.1 envelope
function envelope(method, params) {
  const xml = Object.entries(params)
    .map(([n, v]) => `<ser:Param><ser:Name>${esc(n)}</ser:Name><ser:Value>${esc(String(v))}</ser:Value></ser:Param>`)
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ser="https://services.incubis.hr/">
  <soapenv:Header/>
  <soapenv:Body>
    <ser:${method}>
      <ser:param_array>${xml}</ser:param_array>
    </ser:${method}>
  </soapenv:Body>
</soapenv:Envelope>`;
}

// Execute one SOAP call
async function soap(method, params) {
  const res = await fetch(SOAP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml;charset=utf-8',
      'SOAPAction': `"${SOAP_NS}${method}"`,
    },
    body: envelope(method, params),
  });
  const text = await res.text();

  const typeMatch    = text.match(/<_ResponseType[^>]*>([\s\S]*?)<\/_ResponseType>/);
  const msgMatch     = text.match(/<_Message[^>]*>([\s\S]*?)<\/_Message>/);
  const payloadMatch = text.match(/<_Payload[^>]*>([\s\S]*?)<\/_Payload>/);

  const ok      = typeMatch ? decode(typeMatch[1].trim()) === 'OK' : false;
  const message = msgMatch  ? decode(msgMatch[1].trim()) : '';
  const raw     = payloadMatch ? decode(payloadMatch[1].trim()) : '';

  // Try to parse payload
  let payload = raw;
  if (raw) {
    try { payload = JSON.parse(raw); }
    catch {
      if (raw.includes('<')) payload = parseDataset(raw);
    }
  }
  return { ok, message, payload, raw };
}

// Parse .NET DataSet XML → array of plain objects
function parseDataset(xml) {
  const rows = [];
  // Remove schema block
  const cleaned = xml.replace(/<xs:schema[\s\S]*?<\/xs:schema>/g, '');
  // Find first row element name (child of root)
  const m = cleaned.match(/<\w[^>]*>\s*<(\w+)[\s>]/);
  const tag = m ? m[1] : null;
  if (!tag) return rows;

  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'g');
  let hit;
  while ((hit = re.exec(cleaned)) !== null) {
    const obj = {};
    const fre = /<([A-Za-z_]\w*)>([^<]*)<\/\1>/g;
    let f;
    while ((f = fre.exec(hit[1])) !== null) obj[f[1]] = f[2];
    if (Object.keys(obj).length) rows.push(obj);
  }
  return rows;
}

// Authenticate and return GUID session token
async function authGuid() {
  const r = await soap('AuthUser', { Username: USERNAME, Password: PASSWORD });
  if (!r.ok) throw new Error('Auth failed: ' + r.message);
  return r.raw; // GUID string
}

// ─── Package definitions (VratiCjenike/VratiRizike return empty in UAT) ─────
// Age-based package selection (tested and confirmed working 2026-03-31)
function packagesForAge(ageYears) {
  if (ageYears < 7) {
    return [
      { cjenik: 'DZO24', rizik: 'KID24', naziv: 'Dobrovoljno - Djeca' },
    ];
  }
  if (ageYears < 18) {
    return [
      { cjenik: 'DZO24', rizik: 'TEEN24', naziv: 'Dobrovoljno - Mladi' },
    ];
  }
  return [
    { cjenik: 'DOP24', rizik: 'DI7A1', naziv: 'Dopunsko A' },
    { cjenik: 'DOP24', rizik: 'DI7B1', naziv: 'Dopunsko B' },
    { cjenik: 'DZO24', rizik: 'KOM24', naziv: 'Dobrovoljno Komfor' },
    { cjenik: 'DZO24', rizik: 'OPT24', naziv: 'Dobrovoljno Optimum' },
    { cjenik: 'DZO24', rizik: 'EKS24', naziv: 'Dobrovoljno Ekskluziv' },
  ];
}

function ageFromDRHR(drhr) {
  // drhr = "DD.MM.YYYY"
  const parts = drhr.split('.');
  if (parts.length < 3) return 30;
  const born = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
  const now  = new Date();
  let age = now.getFullYear() - born.getFullYear();
  const m = now.getMonth() - born.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < born.getDate())) age--;
  return age;
}

// ─── business logic ──────────────────────────────────────────────────────────

async function ponude(datumRodenja) {
  const guid = await authGuid();

  const age  = ageFromDRHR(datumRodenja);
  const pkgs = packagesForAge(age);

  // Calculate all premiums in parallel
  const results = await Promise.all(pkgs.map(async pkg => {
    const pRes = await soap('DZO_IzracunajPremiju', {
      Id: guid,
      DatumRodenja: datumRodenja,
      Cjenik: pkg.cjenik,
      Rizici: pkg.rizik,
      Popust: 'PDIN1',
    });

    const premija = parseFloat(pRes.raw);
    return {
      cjenik:     pkg.cjenik,
      cjenikNaziv: pkg.cjenik === 'DOP24' ? 'Dopunsko zdravstveno' : 'Dobrovoljno zdravstveno',
      rizik:      pkg.rizik,
      rizikNaziv: pkg.naziv,
      premija:    isNaN(premija) ? null : premija,
    };
  }));

  return { ponude: results.filter(r => r.premija !== null) };
}

async function mjesta(q) {
  const guid = await authGuid();
  const res = await soap('GetMjesta', { Id: guid });
  const list = Array.isArray(res.payload) ? res.payload : [];

  // GetMjesta returns: PTT_BR (postal code = Cubis Mjesto ID), NAZIV (city name), OPCINA
  const mapped = list
    .map(m => ({
      ptt:   (m.PTT_BR  || '').trim(),
      naziv: (m.NAZIV   || '').trim(),
    }))
    .filter(m => m.ptt && m.naziv && /^\d{5}$/.test(m.ptt)); // only Croatian 5-digit postal codes

  if (q) {
    const lq = q.toLowerCase();
    return mapped.filter(m => m.naziv.toLowerCase().includes(lq) || m.ptt.startsWith(q)).slice(0, 20);
  }
  return mapped.slice(0, 500);
}

async function validacijaMBO(mbo) {
  const guid = await authGuid();
  const r = await soap('DZO_Validiraj_MBO', { Id: guid, HZZOBroj: mbo });
  return { ok: r.ok, message: r.message };
}

// Find existing partner by OIB, returns jmbg (Cubis 13-digit partner ID) or null
async function findPartner(guid, oib) {
  const r = await soap('Partner_Pretraga', { Id: guid, OIB: oib });
  if (!r.ok) return null;
  const list = Array.isArray(r.payload) ? r.payload : [];
  if (!list.length) return null;
  // The jmbg field holds the Cubis partner identifier used in SpremiPolicu
  const p = list[0];
  return (p.jmbg || p.JMBG || '').trim() || null;
}

// Format Croatian phone → +385 0XX XXXXXXX (format confirmed working with UNIQA)
function formatPhone(mob) {
  if (!mob) return '';
  const digits = mob.replace(/\D/g, '');
  if (digits.startsWith('385')) return '+385 0' + digits.slice(3);
  if (digits.startsWith('0'))   return '+385 ' + digits;
  return '+385 0' + digits;
}

// Create new partner
async function createPartner(guid, p) {
  // Format date with trailing period as per docx C# example: "01.01.1978."
  const dr = p.datumRodenja || '';
  const datumFormatted = dr && !dr.endsWith('.') ? dr + '.' : dr;

  const naziv = `${p.ime || ''} ${p.prezime || ''}`.trim();
  const params = {
    Id: guid,
    Ime: p.ime || '',
    Prezime: p.prezime || '',
    OIB: p.oib,
    Naziv: naziv,
    Sektor: '1',
    Ulica: p.ulica || '',
    Mjesto: p.mjestoid || '',
    Drzava: '385',
    DatumRodjenja: datumFormatted,
    Spol: p.spol || '',
    Email: p.email || '',
    Mobitel: formatPhone(p.mobitel),
    Telefon: formatPhone(p.mobitel),
    DostavaNaziv: naziv,
    DostavaUlica: p.ulica || '',
    DostavaMjesto: p.mjestoid || '',
  };
  const r = await soap('Partneri_UnosNovog', params);
  if (!r.ok) throw new Error('Partner nije pronađen u Uniqa sustavu i nije ga moguće automatski kreirati. Kontaktirajte podršku. (' + r.message + ')');
  return r.raw; // partner jmbg
}

async function spremiPolicu(body) {
  const guid = await authGuid();

  // Find or create Ugovaratelj (policyholder)
  let sifra = await findPartner(guid, body.oib);
  if (!sifra) sifra = await createPartner(guid, body);
  if (!sifra) throw new Error('Could not resolve partner');

  // Find or create Osiguranik if different person
  let sifraOsiguranik = sifra;
  if (body.osoba && body.osoba.oib && body.osoba.oib !== body.oib) {
    const osobaData = {
      ime: body.osoba.ime, prezime: body.osoba.prezime,
      oib: body.osoba.oib, spol: body.osoba.spol,
      datumRodenja: body.datumRodenja,
      ulica: body.ulica, mjestoid: body.mjestoid,
      email: body.email, mobitel: body.mobitel,
    };
    sifraOsiguranik = await findPartner(guid, body.osoba.oib);
    if (!sifraOsiguranik) sifraOsiguranik = await createPartner(guid, osobaData);
    if (!sifraOsiguranik) throw new Error('Could not resolve insured partner');
  }

  const params = {
    Id: guid,
    PocetakOsiguranja: body.pocetakOsiguranja,
    IstekOsiguranja: '1',
    Ugovaratelj: sifra,
    Osiguranik: sifraOsiguranik,
    SredstvoPlacanja: 'KAR',
    BrojRata: body.brojRata || '1',
    HZZOBroj: body.mbo,
    Cjenik: body.cjenik,
    Rizici: body.rizici,
    Popust: 'PDIN1',
  };

  const policaRes = await soap('DZO_SpremiPolicu', params);
  if (!policaRes.ok) throw new Error('Policy failed: ' + policaRes.message);

  // Extract policy number
  let brojPolice = null;
  let ukupnaPremija = null;

  const pl = policaRes.payload;
  if (pl && typeof pl === 'object') {
    brojPolice    = pl.BrojPolice;
    ukupnaPremija = pl.UkupnaPremija;
  } else {
    const raw = policaRes.raw || '';
    const bm  = raw.match(/"BrojPolice"\s*:\s*"([^"]+)"/);
    const pm  = raw.match(/"UkupnaPremija"\s*:\s*([\d.]+)/);
    if (bm) brojPolice    = bm[1];
    if (pm) ukupnaPremija = parseFloat(pm[1]);
  }

  if (!brojPolice) {
    return { ok: false, message: 'Policy created but BrojPolice not found', raw: policaRes.raw };
  }

  // Download PDFs
  const [polica, iskaznica] = await Promise.all([
    soap('DZO_IspisPolice',    { Id: guid, Broj: brojPolice }),
    soap('DZO_IspisIskaznice', { Id: guid, Broj: brojPolice }),
  ]);

  return {
    ok: true,
    brojPolice,
    ukupnaPremija,
    policaPdf:    polica.raw,
    iskaznicaPdf: iskaznica.raw,
  };
}

// ─── main handler ────────────────────────────────────────────────────────────

export default {
  async fetch(req) {
    const url    = new URL(req.url);
    const origin = req.headers.get('Origin') || '';

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors(origin) });
    }

    try {
      // Health check
      if (url.pathname === '/') {
        return jsonOk({ status: 'ok', service: 'uniqa-dzo-proxy' }, origin);
      }

      // City search
      if (url.pathname === '/dzo/mjesta') {
        const q = url.searchParams.get('q') || '';
        const data = await mjesta(q);
        return jsonOk(data, origin);
      }

      const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};

      if (url.pathname === '/dzo/ponude') {
        if (!body.datumRodenja) return jsonErr('datumRodenja required', 400, origin);
        const data = await ponude(body.datumRodenja);
        return jsonOk(data, origin);
      }

      if (url.pathname === '/dzo/validiraj-mbo') {
        if (!body.mbo) return jsonErr('mbo required', 400, origin);
        const data = await validacijaMBO(body.mbo);
        return jsonOk(data, origin);
      }

      if (url.pathname === '/dzo/spremi-policu') {
        const data = await spremiPolicu(body);
        return jsonOk(data, origin);
      }

      if (url.pathname === '/dzo/test-osiguranici') {
        const guid = await authGuid();
        const r = await soap('DZO_VratiTestOsiguranike', { Id: guid });
        return jsonOk({ ok: r.ok, message: r.message, payload: r.payload, raw: r.raw }, origin);
      }

      if (url.pathname === '/dzo/partner-info') {
        const oib = url.searchParams.get('oib') || '12345678903';
        const guid = await authGuid();
        const r = await soap('Partner_Pretraga', { Id: guid, OIB: oib });
        return jsonOk({ ok: r.ok, message: r.message, payload: r.payload, raw: r.raw.slice(0, 2000) }, origin);
      }

      return jsonErr('Not found', 404, origin);

    } catch (e) {
      return jsonErr(e.message, 500, origin);
    }
  },
};
