const MANILA_TZ = 'Asia/Manila';

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...extraHeaders,
    },
  });
}

function localDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: MANILA_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = type => parts.find(p => p.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function allowedOrigin(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = env.ALLOWED_ORIGIN || 'https://dariakimberly4-netizen.github.io';
  return !origin || origin === allowed;
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = env.ALLOWED_ORIGIN || 'https://dariakimberly4-netizen.github.io';
  return {
    'Access-Control-Allow-Origin': origin === allowed ? origin : allowed,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,X-Jazz-Backend-Key',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

async function buildStarterReport(env) {
  const jazzUrl = (env.JAZZ_URL || 'https://dariakimberly4-netizen.github.io/jazz-ai-command-center/').replace(/\/?$/, '/');
  let crm = 'CRM data is temporarily unavailable.';

  try {
    const response = await fetch(`${jazzUrl}leads.json`, { cf: { cacheTtl: 300 } });
    if (response.ok) {
      const leads = await response.json();
      const total = Array.isArray(leads) ? leads.length : 0;
      const hot = leads.filter(x => String(x.Priority || '') === 'Hot').length;
      const follow = leads.filter(x => /follow/i.test(`${x['Outreach Status'] || ''} ${x['Next Action'] || ''}`)).length;
      crm = `CRM: ${total} leads, ${hot} hot leads, ${follow} follow-ups flagged.`;
    }
  } catch (_) {}

  return `Good morning, Kimmy. Jazz Daily Report. ${crm} Open Jazz for today's priorities, approvals, and any connected-service updates.`;
}

async function sendWhatsAppTemplate(env, summary) {
  const required = [
    'META_GRAPH_VERSION',
    'WHATSAPP_PHONE_NUMBER_ID',
    'WHATSAPP_ACCESS_TOKEN',
    'WHATSAPP_TO',
    'WHATSAPP_TEMPLATE_NAME',
  ];
  const missing = required.filter(k => !env[k]);
  if (missing.length) throw new Error(`Missing WhatsApp configuration: ${missing.join(', ')}`);

  const endpoint = `https://graph.facebook.com/${env.META_GRAPH_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const body = {
    messaging_product: 'whatsapp',
    to: env.WHATSAPP_TO,
    type: 'template',
    template: {
      name: env.WHATSAPP_TEMPLATE_NAME,
      language: { code: env.WHATSAPP_TEMPLATE_LANGUAGE || 'en_US' },
      components: [
        {
          type: 'body',
          parameters: [{ type: 'text', text: String(summary).slice(0, 900) }],
        },
      ],
    },
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`WhatsApp send failed (${response.status}): ${JSON.stringify(result)}`);
  return result;
}

async function prepareDailyReport(env) {
  const key = localDateKey();
  const existing = await env.JAZZ_STATE.get(`report:${key}`);
  if (existing) return existing;
  const report = await buildStarterReport(env);
  await env.JAZZ_STATE.put(`report:${key}`, report, { expirationTtl: 60 * 60 * 24 * 8 });
  return report;
}

async function runFallbackCheck(env) {
  const key = localDateKey();
  const alreadySent = await env.JAZZ_STATE.get(`fallback_sent:${key}`);
  if (alreadySent) return { sent: false, reason: 'already-sent' };

  const ack = await env.JAZZ_STATE.get(`ack:${key}`);
  if (ack) return { sent: false, reason: 'report-acknowledged' };

  const lastSeenRaw = await env.JAZZ_STATE.get('last_seen');
  const lastSeen = lastSeenRaw ? Number(lastSeenRaw) : 0;
  const onlineWindowMs = 3 * 60 * 1000;
  if (lastSeen && Date.now() - lastSeen <= onlineWindowMs) {
    return { sent: false, reason: 'jazz-online' };
  }

  const report = (await env.JAZZ_STATE.get(`report:${key}`)) || (await prepareDailyReport(env));
  const result = await sendWhatsAppTemplate(env, report);
  await env.JAZZ_STATE.put(`fallback_sent:${key}`, new Date().toISOString(), { expirationTtl: 60 * 60 * 24 * 8 });
  return { sent: true, result };
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (!allowedOrigin(request, env)) return json({ ok: false, error: 'Origin not allowed' }, 403, cors);

    const url = new URL(request.url);

    if (url.pathname === '/status' && request.method === 'GET') {
      const configured = Boolean(
        env.JAZZ_STATE &&
        env.META_GRAPH_VERSION &&
        env.WHATSAPP_PHONE_NUMBER_ID &&
        env.WHATSAPP_ACCESS_TOKEN &&
        env.WHATSAPP_TO &&
        env.WHATSAPP_TEMPLATE_NAME
      );
      return json({ ok: true, configured, timezone: MANILA_TZ, fallbackTime: '09:15' }, 200, cors);
    }

    if (url.pathname === '/heartbeat' && request.method === 'POST') {
      await env.JAZZ_STATE.put('last_seen', String(Date.now()), { expirationTtl: 60 * 60 * 24 * 2 });
      return json({ ok: true }, 200, cors);
    }

    if (url.pathname === '/ack' && request.method === 'POST') {
      const key = localDateKey();
      await env.JAZZ_STATE.put(`ack:${key}`, new Date().toISOString(), { expirationTtl: 60 * 60 * 24 * 8 });
      return json({ ok: true, date: key }, 200, cors);
    }

    if (url.pathname === '/today' && request.method === 'GET') {
      const key = localDateKey();
      const report = (await env.JAZZ_STATE.get(`report:${key}`)) || null;
      return json({ ok: true, date: key, report }, 200, cors);
    }

    if (url.pathname === '/report' && request.method === 'POST') {
      if (!env.JAZZ_BACKEND_KEY || request.headers.get('X-Jazz-Backend-Key') !== env.JAZZ_BACKEND_KEY) {
        return json({ ok: false, error: 'Unauthorized' }, 401, cors);
      }
      const body = await request.json().catch(() => ({}));
      const report = String(body.report || '').trim();
      if (!report) return json({ ok: false, error: 'Report text is required' }, 400, cors);
      const key = localDateKey();
      await env.JAZZ_STATE.put(`report:${key}`, report.slice(0, 4000), { expirationTtl: 60 * 60 * 24 * 8 });
      return json({ ok: true, date: key }, 200, cors);
    }

    return json({ ok: false, error: 'Not found' }, 404, cors);
  },

  async scheduled(event, env, ctx) {
    if (event.cron === '0 1 * * *') {
      ctx.waitUntil(prepareDailyReport(env));
      return;
    }
    if (event.cron === '15 1 * * *') {
      ctx.waitUntil(runFallbackCheck(env));
    }
  },
};
