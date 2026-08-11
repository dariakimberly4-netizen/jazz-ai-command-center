const json = (data, status = 200, env = {}) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': env.ALLOWED_ORIGIN || 'https://dariakimberly4-netizen.github.io',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type,x-jazz-key',
    'cache-control': 'no-store'
  }
});

function isAuthorized(request, env) {
  const supplied = request.headers.get('x-jazz-key') || '';
  return Boolean(env.JAZZ_SHARED_KEY) && supplied === env.JAZZ_SHARED_KEY;
}

function cleanPhone(value = '') {
  return String(value).replace(/[^0-9]/g, '');
}

async function sendWhatsApp(env) {
  const required = [
    'META_GRAPH_VERSION',
    'META_TOKEN',
    'WA_PHONE_NUMBER_ID',
    'WA_TO_NUMBER',
    'WA_TEMPLATE_NAME',
    'JAZZ_URL'
  ];
  const missing = required.filter((key) => !env[key]);
  if (missing.length) throw new Error(`Missing Worker settings: ${missing.join(', ')}`);

  const endpoint = `https://graph.facebook.com/${env.META_GRAPH_VERSION}/${env.WA_PHONE_NUMBER_ID}/messages`;
  const body = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: cleanPhone(env.WA_TO_NUMBER),
    type: 'template',
    template: {
      name: env.WA_TEMPLATE_NAME,
      language: { code: env.WA_TEMPLATE_LANG || 'en_US' },
      components: [
        {
          type: 'body',
          parameters: [{ type: 'text', text: env.JAZZ_URL }]
        }
      ]
    }
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.META_TOKEN}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result?.error?.message || `WhatsApp API returned ${response.status}`);
  }
  return result;
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return json({ ok: true }, 204, env);

    const url = new URL(request.url);
    if (url.pathname === '/') {
      return json({
        ok: true,
        service: 'Jazz WhatsApp Fallback',
        schedule: '09:00 Asia/Manila',
        note: 'Secrets stay in Cloudflare Worker settings, never in GitHub Pages.'
      }, 200, env);
    }

    if (!isAuthorized(request, env)) return json({ ok: false, error: 'Unauthorized' }, 401, env);

    if (url.pathname === '/heartbeat' && request.method === 'POST') {
      const now = Date.now();
      await env.STATE.put('last_seen', String(now));
      return json({ ok: true, last_seen: new Date(now).toISOString() }, 200, env);
    }

    if (url.pathname === '/status' && request.method === 'GET') {
      const [lastSeen, lastFallback] = await Promise.all([
        env.STATE.get('last_seen'),
        env.STATE.get('last_fallback')
      ]);
      return json({
        ok: true,
        last_seen: lastSeen ? new Date(Number(lastSeen)).toISOString() : null,
        last_fallback: lastFallback ? JSON.parse(lastFallback) : null,
        fallback_time: '09:00 Asia/Manila',
        online_window_seconds: Number(env.ONLINE_WINDOW_SECONDS || '120')
      }, 200, env);
    }

    if (url.pathname === '/test' && request.method === 'POST') {
      try {
        const result = await sendWhatsApp(env);
        const event = { at: new Date().toISOString(), type: 'test', status: 'sent', message_id: result?.messages?.[0]?.id || null };
        await env.STATE.put('last_fallback', JSON.stringify(event));
        return json({ ok: true, ...event }, 200, env);
      } catch (error) {
        return json({ ok: false, error: error.message }, 502, env);
      }
    }

    return json({ ok: false, error: 'Not found' }, 404, env);
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil((async () => {
      const scheduledAt = Number(controller.scheduledTime || Date.now());
      const lastSeen = Number(await env.STATE.get('last_seen') || '0');
      const onlineWindowMs = Number(env.ONLINE_WINDOW_SECONDS || '120') * 1000;
      const isOnline = lastSeen > 0 && Math.abs(scheduledAt - lastSeen) <= onlineWindowMs;

      if (isOnline) {
        await env.STATE.put('last_fallback', JSON.stringify({
          at: new Date(scheduledAt).toISOString(),
          type: 'daily',
          status: 'skipped_online'
        }));
        return;
      }

      try {
        const result = await sendWhatsApp(env);
        await env.STATE.put('last_fallback', JSON.stringify({
          at: new Date(scheduledAt).toISOString(),
          type: 'daily',
          status: 'sent',
          message_id: result?.messages?.[0]?.id || null
        }));
      } catch (error) {
        await env.STATE.put('last_fallback', JSON.stringify({
          at: new Date(scheduledAt).toISOString(),
          type: 'daily',
          status: 'error',
          error: error.message
        }));
        throw error;
      }
    })());
  }
};
