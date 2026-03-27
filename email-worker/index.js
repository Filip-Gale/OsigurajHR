export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    if (request.method !== 'POST') return new Response('OK');

    const { email, reg, osig, cijena } = await request.json();

    const scheduledAt = new Date(Date.now() + 2 * 60 * 1000).toISOString();

    const body = `Pozdrav,

zaprimila sam vaš zahtjev za vozilo ${reg} i bacam se na izradu ponude s predračunom. Javim se čim budem imala sve spremno.

Ukoliko nije problem, ostavite broj mobitela — da mogu nazvati ako trebam provjeriti neki podatak.

Nakon što pošaljete potvrdu uplate, odmah vam šaljemo policu na mail te je odmah i aktivna i vidljiva na svim stanicama za tehnički pregled u Hrvatskoj.

Ako imate bilo kakvih pitanja, slobodno javite — tu sam 🙂

Lp`;

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Lucija | Osiguraj.hr <auto@osiguraj.hr>',
        to: email,
        subject: `Vaša ponuda je u izradi — ${reg}`,
        text: body,
        scheduled_at: scheduledAt,
      }),
    });

    return new Response('OK', {
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  },
};
