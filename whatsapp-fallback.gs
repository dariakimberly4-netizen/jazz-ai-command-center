/*
 * JAZZ AI — WhatsApp fallback backend for Google Apps Script
 *
 * Purpose
 * 1) Jazz browser sends a private heartbeat while Kimmy is visibly online.
 * 2) A time trigger checks after 9:15 AM Asia/Manila.
 * 3) If no Jazz heartbeat has been seen that morning, send the approved
 *    WhatsApp template through Meta WhatsApp Cloud API.
 *
 * IMPORTANT: Never place Meta tokens in index.html or any public GitHub file.
 * Put all secrets in Apps Script > Project Settings > Script properties.
 */

const JAZZ_TZ = 'Asia/Manila';
const FALLBACK_START_MINUTE = 15;
const FALLBACK_END_MINUTE = 29;

function props_() {
  return PropertiesService.getScriptProperties();
}

function requiredProp_(name) {
  const value = props_().getProperty(name);
  if (!value) throw new Error('Missing Script Property: ' + name);
  return value;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function phDate_(d) {
  return Utilities.formatDate(d || new Date(), JAZZ_TZ, 'yyyy-MM-dd');
}

function phTime_(d) {
  return Utilities.formatDate(d || new Date(), JAZZ_TZ, 'HH:mm:ss');
}

function doGet() {
  return json_({ ok: true, service: 'Jazz WhatsApp Fallback', timezone: JAZZ_TZ });
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const expectedKey = requiredProp_('JAZZ_DEVICE_KEY');
    if (!body.key || body.key !== expectedKey) {
      return json_({ ok: false, error: 'unauthorized' });
    }

    const action = String(body.action || '');
    const now = new Date();
    const p = props_();

    if (action === 'heartbeat' || action === 'online-report') {
      p.setProperty('LAST_SEEN_AT', now.toISOString());
      p.setProperty('LAST_SEEN_DATE', phDate_(now));
      p.setProperty('LAST_SEEN_TIME', phTime_(now));
      if (body.report) p.setProperty('LAST_BROWSER_REPORT', String(body.report).slice(0, 1800));
      return json_({ ok: true, action: action });
    }

    if (action === 'ack') {
      p.setProperty('LAST_SEEN_AT', now.toISOString());
      p.setProperty('LAST_SEEN_DATE', phDate_(now));
      p.setProperty('LAST_SEEN_TIME', phTime_(now));
      p.setProperty('LAST_ACK_DATE', phDate_(now));
      return json_({ ok: true, action: 'ack' });
    }

    if (action === 'test') {
      const result = sendJazzWhatsAppTemplate_('TEST');
      return json_({ ok: true, action: 'test', result: result });
    }

    return json_({ ok: false, error: 'unknown_action' });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

/* Run this ONCE from Apps Script after adding your Script Properties. */
function setupJazzFallbackTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'checkJazzWhatsAppFallback') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger('checkJazzWhatsAppFallback')
    .timeBased()
    .everyMinutes(5)
    .create();

  console.log('Jazz fallback trigger installed. It checks every 5 minutes and only acts in the 9:15–9:29 AM Manila window.');
}

function checkJazzWhatsAppFallback() {
  const now = new Date();
  const hour = Number(Utilities.formatDate(now, JAZZ_TZ, 'H'));
  const minute = Number(Utilities.formatDate(now, JAZZ_TZ, 'm'));
  if (hour !== 9 || minute < FALLBACK_START_MINUTE || minute > FALLBACK_END_MINUTE) return;

  const p = props_();
  const today = phDate_(now);
  if (p.getProperty('WA_SENT_DATE') === today) return;

  const lastSeenIso = p.getProperty('LAST_SEEN_AT');
  if (lastSeenIso) {
    const lastSeen = new Date(lastSeenIso);
    const seenDate = phDate_(lastSeen);
    const seenHour = Number(Utilities.formatDate(lastSeen, JAZZ_TZ, 'H'));
    if (seenDate === today && seenHour >= 9) {
      console.log('Jazz saw Kimmy online this morning. WhatsApp fallback skipped.');
      return;
    }
  }

  sendJazzWhatsAppTemplate_('DAILY_FALLBACK');
  p.setProperty('WA_SENT_DATE', today);
  p.setProperty('WA_SENT_AT', now.toISOString());
}

function sendJazzWhatsAppTemplate_(reason) {
  const token = requiredProp_('WA_TOKEN');
  const phoneNumberId = requiredProp_('WA_PHONE_NUMBER_ID');
  const recipient = requiredProp_('WA_RECIPIENT').replace(/\D/g, '');
  const templateName = requiredProp_('WA_TEMPLATE_NAME');
  const templateLang = props_().getProperty('WA_TEMPLATE_LANG') || 'en_US';
  const graphVersion = requiredProp_('WA_GRAPH_VERSION');

  const todayPretty = Utilities.formatDate(new Date(), JAZZ_TZ, 'MMMM d, yyyy');
  const summary = buildJazzFallbackSummary_();

  const payload = {
    messaging_product: 'whatsapp',
    to: recipient,
    type: 'template',
    template: {
      name: templateName,
      language: { code: templateLang },
      components: [{
        type: 'body',
        parameters: [
          { type: 'text', text: todayPretty },
          { type: 'text', text: summary }
        ]
      }]
    }
  };

  const url = 'https://graph.facebook.com/' + encodeURIComponent(graphVersion) + '/' +
    encodeURIComponent(phoneNumberId) + '/messages';

  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const code = response.getResponseCode();
  const text = response.getContentText();
  console.log('WhatsApp ' + reason + ' response ' + code + ': ' + text);
  if (code < 200 || code >= 300) {
    throw new Error('WhatsApp API returned HTTP ' + code + ': ' + text);
  }
  return text;
}

function buildJazzFallbackSummary_() {
  const p = props_();
  const leadsUrl = p.getProperty('LEADS_JSON_URL');

  if (leadsUrl) {
    try {
      const response = UrlFetchApp.fetch(leadsUrl, { muteHttpExceptions: true });
      if (response.getResponseCode() >= 200 && response.getResponseCode() < 300) {
        const leads = JSON.parse(response.getContentText());
        if (Array.isArray(leads)) {
          const total = leads.length;
          const hot = leads.filter(function(l) { return String(l.Priority || '') === 'Hot'; }).length;
          const follow = leads.filter(function(l) {
            return /follow/i.test(String(l['Outreach Status'] || '') + ' ' + String(l['Next Action'] || ''));
          }).length;
          return 'Lead & CRM: ' + total + ' total, ' + hot + ' Hot, ' + follow +
            ' needing follow-up. Review urgent follow-ups and approvals first.';
        }
      }
    } catch (err) {
      console.error('Could not build CRM summary: ' + err);
    }
  }

  return 'Your Jazz daily report is ready. Review urgent items, today’s priorities, follow-ups, approvals, and next actions in Jazz Command Center.';
}

/* Optional diagnostic. Run manually in Apps Script. */
function testJazzWhatsAppNow() {
  return sendJazzWhatsAppTemplate_('MANUAL_TEST');
}
