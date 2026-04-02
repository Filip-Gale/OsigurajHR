/**
 * Cloudflare Worker — Wiener proxy (pass-through na Oracle Cloud)
 *
 * CF Worker samo hendla CORS i prosljeđuje sve na Oracle Cloud proxy
 * koji se bavi autentikacijom i pozivima prema api-rc.services.wiener.hr.
 *
 * Oracle proxy: http://158.180.27.110:3001
 */

const ORACLE_PROXY = 'http://proxy.osiguraj.hr:3001';

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

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);

    try {
      // Forward to Oracle proxy — same path + query string
      const proxyUrl = `${ORACLE_PROXY}${url.pathname}${url.search}`;

      const init = {
        method: request.method,
        headers: { 'Content-Type': 'application/json' },
      };

      if (request.method === 'POST') {
        init.body = await request.text();
      }

      const r = await fetch(proxyUrl, init);
      const data = await r.text();

      return new Response(data, {
        status: r.status,
        headers: {
          'Content-Type': 'application/json',
          ...cors,
        },
      });
    } catch (e) {
      return json({ ok: false, error: e.message }, 500, cors);
    }
  },
};
