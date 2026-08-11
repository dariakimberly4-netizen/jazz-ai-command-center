const MANILA_TIMEZONE = 'Asia/Manila';
const ONLINE_WINDOW_MS = 20 * 60 * 1000;
const MONTH_TTL = 60 * 60 * 24 * 30;

function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,X-Jazz-Key',
    'Content-Type': 'application/json; charset=utf-8'
  };
}

function json(env, data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders(env) });
}

function manilaDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: MANILA_TIMEZONE,
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function isReady(env) {
  return Boolean(
    env.FALLBACK_KV &&
    env.JAZZ_DEVICE_KEY &&
    env.WA_ACCESS_TOKEN &&
    env.WA_PHONE_NUMBER_ID &&
    env.WA_TO &&
    env.WA_GRAPH_VERSION &&
    env.WA_TEMPLATE_NAME
  );
}

function isAuthorized(request, env) {
  const expected = String(env.JAZZ_DEVICE_KEY || '');
  const received = String(request.headers.get('X-Jazz-Key') || '');
  return Boolean(expected && received && received === expected);
}

function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function reportFromSnapshot(snapshot = {}) {
  const leads = snapshot.leads || {};
  const systems = snapshot.systems || {};
  const total = safeNumber(leads.total);
  const hot = safeNumber(leads.hot);
  const followUp = safeNumber(leads.followUp);
  const activeSystems = safeNumber(systems.active);
  const approvals = safeNumber(snapshot.approvals);
  return `Jazz daily report: ${total} leads, ${hot} hot, ${followUp} needing follow-up, ${activeSystems} active systems, ${approvals} approvals waiting. Open Jazz for full details: ${snapshot.jazzUrl || ''}`.trim();
}

async function sendWhatsAppFallback(env, reportText) {
  const endpoint = `https://graph.facebook.com/${env.WA_GRAPH_VERSION}/${env.WA_PHONE_NUMBER_ID}/messages`;
  const body = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: env.WA_TO,
    type: 'template',
    template: {
      name: env.WA_TEMPLATE_NAME,
      language: { code: env.WA_TEMPLATE_LANG || 'en_US' },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: 'Kimmy' },
            { type: 'text', text: reportText }
          ]
        }
      ]
    }
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.WA_ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`WhatsApp API error ${response.status}: ${JSON.stringify(result)}`);
  }
  return result;
}

async function handleScheduled(env, scheduledTime) {
  if (!isReady(env)) {
    console.log('Jazz WhatsApp fallback is not fully configured yet.');
    return;
  }

  const now = new Date(scheduledTime || Date.now());
  const dateKey = manilaDateKey(now);

  const alreadySent = await env.FALLBACK_KV.get(`sent:${dateKey}`);
  if (alreadySent) {
    console.log(`WhatsApp fallback already sent for ${dateKey}.`);
    return;
  }

  const ack = await env.FALLBACK_KV.get(`ack:${dateKey}`);
  if (ack) {
    console.log(`Jazz daily report acknowledged for ${dateKey}; WhatsApp not sent.`);
    return;
  }

  const lastSeenRaw = await env.FALLBACK_KV.get('last_seen');
  const lastSeen = lastSeenRaw ? Date.parse(lastSeenRaw) : NaN;
  const recentlyOnline = Number.isFinite(lastSeen) && now.getTime() - lastSeen <= ONLINE_WINDOW_MS;

  if (recentlyOnline) {
    console.log(`Jazz saw Kimmy online recently; WhatsApp not sent for ${dateKey}.`);
    return;
  }

  let snapshot = {};
  try {
    snapshot = JSON.parse((await env.FALLBACK_KV.get('latest_snapshot')) || '{}');
  } catch {}

  const fallbackReport = snapshot && Object.keys(snapshot).length
    ? reportFromSnapshot(snapshot)
    : `Jazz daily report is ready. Open Jazz for your priorities and follow-ups: ${env.JAZZ_URL || ''}`;

  const result = await sendWhatsAppFallback(env, fallbackReport);
  await env.FALLBACK_KV.put(
    `sent:${dateKey}`,
    JSON.stringify({ at: now.toISOString(), result }),
    { expirationTtl: MONTH_TTL }
  );
  console.log(`WhatsApp fallback sent for ${dateKey}.`);
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(env) });
    }

    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/status') {
      return json(env, {
        ok: true,
        ready: isReady(env),
        schedule: '09:00 Asia/Manila report; 09:15 Asia/Manila WhatsApp fallback',
        onlineWindowMinutes: ONLINE_WINDOW_MS / 60000
      });
    }

    if (request.method === 'POST' && (url.pathname === '/heartbeat' || url.pathname === '/ack')) {
      if (!isAuthorized(request, env)) return json(env, { ok: false, error: 'Unauthorized' }, 401);
      if (!env.FALLBACK_KV) return json(env, { ok: false, error: 'FALLBACK_KV is not configured.' }, 503);

      let payload = {};
      try { payload = await request.json(); } catch {}

      const now = new Date();
      const nowIso = now.toISOString();
      await env.FALLBACK_KV.put('last_seen', nowIso);

      if (payload.snapshot && typeof payload.snapshot === 'object') {
        const snapshot = {
          ...payload.snapshot,
          jazzUrl: env.JAZZ_URL || payload.snapshot.jazzUrl || '',
          savedAt: nowIso
        };
        await env.FALLBACK_KV.put('latest_snapshot', JSON.stringify(snapshot));
      }

      if (url.pathname === '/ack') {
        const dateKey = manilaDateKey(now);
        await env.FALLBACK_KV.put(`ack:${dateKey}`, nowIso, { expirationTtl: MONTH_TTL });
        return json(env, { ok: true, acknowledgedDate: dateKey });
      }

      return json(env, { ok: true, lastSeen: nowIso });
    }

    return json(env, { ok: true, service: 'Jazz WhatsApp Fallback' });
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(handleScheduled(env, controller.scheduledTime));
  }
};