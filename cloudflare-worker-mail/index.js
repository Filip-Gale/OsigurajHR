/**
 * Cloudflare Worker — Osiguraj.hr mail handler
 * Prima FormData s forme, šalje email na auto@osiguraj.hr via Resend API
 *
 * Secret: RESEND_API_KEY
 */

const ALLOWED_ORIGINS = [
  'https://www.osiguraj.hr',
  'https://osiguraj.hr',
  'http://localhost:4000',
  'http://127.0.0.1:4000',
];

const TO_EMAIL    = 'auto@osiguraj.hr';
const FROM_EMAIL  = 'forma@osiguraj.hr';
const FROM_NAME   = 'Osiguraj.hr Forma';

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const headers = corsHeaders(origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }
    if (request.method !== 'POST') {
      return json({ success: false, error: 'Method not allowed' }, 405, headers);
    }

    let formData;
    try {
      formData = await request.formData();
    } catch {
      return json({ success: false, error: 'Invalid form data' }, 400, headers);
    }

    const subject = formData.get('subject') || 'Nova poruka — Osiguraj.hr';
    const message = formData.get('message') || '';
    const file    = formData.get('attachment');

    if (!message) {
      return json({ success: false, error: 'Nedostaje poruka' }, 400, headers);
    }

    // Build Resend payload
    const payload = {
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to:   [TO_EMAIL],
      subject,
      text: message,
    };

    // Add attachment if present
    if (file && file.size > 0) {
      const buffer = await file.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
      payload.attachments = [{
        filename: file.name || 'prilog',
        content:  base64,
      }];
    }

    // Send via Resend
    let resendRes;
    try {
      resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify(payload),
      });
    } catch {
      return json({ success: false, error: 'Greška pri slanju emaila' }, 502, headers);
    }

    const resendData = await resendRes.json();

    if (!resendRes.ok) {
      return json({ success: false, error: resendData?.message || 'Resend greška' }, 502, headers);
    }

    return json({ success: true }, 200, headers);
  },
};
