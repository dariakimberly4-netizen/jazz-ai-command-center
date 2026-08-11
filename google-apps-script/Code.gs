/*
 * JAZZ AI — WhatsApp fallback backend
 * Google Apps Script (V8)
 *
 * Purpose:
 * - Jazz pings this backend while the Command Center is open/visible.
 * - Around 9:15 AM Asia/Manila, the daily trigger checks whether Jazz was
 *   seen since 9:00 AM.
 * - If not, it sends an approved WhatsApp template using Meta's Cloud API.
 *
 * IMPORTANT:
 * Keep all Meta tokens and phone IDs in Apps Script > Project Settings >
 * Script Properties. Never put them in GitHub or in the browser code.
 */

const JAZZ_TIME_ZONE = 'Asia/Manila';
const REPORT_HOUR = 9;
const FALLBACK_GRACE_MINUTES = 15;

function doPost(e) {
  try {
    requirePresenceKey_(e);
    const payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (payload.action !== 'heartbeat') {
      return json_({ ok: false, error: 'Unsupported action' });
    }

    const now = Date.now();
    PropertiesService.getScriptProperties().setProperties({
      LAST_SEEN_EPOCH: String(now),
      LAST_SEEN_ISO: new Date(now).toISOString()
    });

    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function doGet(e) {
  try {
    requirePresenceKey_(e);
    const p = PropertiesService.getScriptProperties();
    return json_({
      ok: true,
      configured: Boolean(
        p.getProperty('WA_ACCESS_TOKEN') &&
        p.getProperty('WA_PHONE_NUMBER_ID') &&
        p.getProperty('WA_RECIPIENT') &&
        p.getProperty('WA_TEMPLATE_NAME')
      ),
      lastSeenIso: p.getProperty('LAST_SEEN_ISO') || null
    });
  } catch (err) {
    return json_({ ok: false, error: 'Unauthorized' });
  }
}

function sendDailyFallbackIfOffline() {
  const p = PropertiesService.getScriptProperties();
  const now = new Date();
  const todayNine = new Date(now);
  todayNine.setHours(REPORT_HOUR, 0, 0, 0);

  const lastSeenEpoch = Number(p.getProperty('LAST_SEEN_EPOCH') || 0);
  const wasOnlineForReport = lastSeenEpoch >= todayNine.getTime();

  if (wasOnlineForReport) {
    console.log('Jazz was online after 9:00 AM. WhatsApp fallback skipped.');
    return;
  }

  sendWhatsAppTemplate_();
}

function sendWhatsAppTemplate_() {
  const p = PropertiesService.getScriptProperties();
  const accessToken = requiredProperty_(p, 'WA_ACCESS_TOKEN');
  const phoneNumberId = requiredProperty_(p, 'WA_PHONE_NUMBER_ID');
  const recipient = requiredProperty_(p, 'WA_RECIPIENT');
  const templateName = requiredProperty_(p, 'WA_TEMPLATE_NAME');
  const language = p.getProperty('WA_TEMPLATE_LANGUAGE') || 'en_US';
  const reportUrl = p.getProperty('JAZZ_REPORT_URL') ||
    'https://dariakimberly4-netizen.github.io/jazz-ai-command-center/';
  const graphVersion = p.getProperty('META_GRAPH_VERSION') || 'v24.0';

  // Recommended approved template body:
  // "Good morning, Kimmy. Jazz here. Your 9:00 AM daily report is ready.
  // Open Jazz: {{1}}"
  const body = {
    messaging_product: 'whatsapp',
    to: recipient,
    type: 'template',
    template: {
      name: templateName,
      language: { code: language },
      components: [
        {
          type: 'body',
          parameters: [{ type: 'text', text: reportUrl }]
        }
      ]
    }
  };

  const response = UrlFetchApp.fetch(
    `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`,
    {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: `Bearer ${accessToken}` },
      payload: JSON.stringify(body),
      muteHttpExceptions: true
    }
  );

  const code = response.getResponseCode();
  const text = response.getContentText();
  console.log(`WhatsApp response ${code}: ${text}`);

  if (code < 200 || code >= 300) {
    throw new Error(`WhatsApp send failed (${code}). ${text}`);
  }

  p.setProperty('LAST_FALLBACK_SENT_ISO', new Date().toISOString());
}

function testWhatsAppFallback() {
  sendWhatsAppTemplate_();
}

function installDailyFallbackTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'sendDailyFallbackIfOffline')
    .forEach(t => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger('sendDailyFallbackIfOffline')
    .timeBased()
    .atHour(REPORT_HOUR)
    .nearMinute(FALLBACK_GRACE_MINUTES)
    .everyDays(1)
    .inTimezone(JAZZ_TIME_ZONE)
    .create();
}

function requiredProperty_(properties, key) {
  const value = properties.getProperty(key);
  if (!value) throw new Error(`Missing Script Property: ${key}`);
  return value;
}

function requirePresenceKey_(e) {
  const expected = PropertiesService.getScriptProperties().getProperty('JAZZ_PRESENCE_KEY');
  const received = e && e.parameter ? String(e.parameter.key || '') : '';
  if (!expected || received !== expected) throw new Error('Unauthorized');
}

function json_(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
