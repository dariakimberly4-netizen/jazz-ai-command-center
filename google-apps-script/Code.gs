/*
 * JAZZ AI — WhatsApp fallback backend
 * Google Apps Script (V8)
 *
 * Flow:
 * - Jazz sends a private heartbeat while the Command Center is visibly open.
 * - Jazz shows/speaks the 9:00 AM report locally when Kimmy is online.
 * - From 9:15–9:29 AM Asia/Manila, this backend checks for a 9 AM heartbeat.
 * - If Jazz has not seen Kimmy online, it sends one approved WhatsApp
 *   template containing a concise Jazz report summary.
 *
 * SECURITY:
 * Keep all Meta tokens, phone IDs, recipient number, and the Jazz private key
 * in Apps Script > Project Settings > Script properties. Never put them in
 * GitHub Pages or public JavaScript.
 */

const JAZZ_TIME_ZONE = 'Asia/Manila';
const FALLBACK_START_MINUTE = 15;
const FALLBACK_END_MINUTE = 29;

function props_() {
  return PropertiesService.getScriptProperties();
}

function json_(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

function requiredProperty_(name) {
  const value = props_().getProperty(name);
  if (!value) throw new Error('Missing Script Property: ' + name);
  return value;
}

function manilaDate_(date) {
  return Utilities.formatDate(date || new Date(), JAZZ_TIME_ZONE, 'yyyy-MM-dd');
}

function manilaHour_(date) {
  return Number(Utilities.formatDate(date || new Date(), JAZZ_TIME_ZONE, 'H'));
}

function manilaMinute_(date) {
  return Number(Utilities.formatDate(date || new Date(), JAZZ_TIME_ZONE, 'm'));
}

function doGet() {
  return json_({ ok: true, service: 'Jazz WhatsApp Fallback', timezone: JAZZ_TIME_ZONE });
}

function doPost(e) {
  try {
    const payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    requirePresenceKey_(e, payload);

    const action = String(payload.action || '');
    const now = new Date();
    const p = props_();

    if (action === 'heartbeat' || action === 'online-report' || action === 'ack') {
      p.setProperties({
        LAST_SEEN_EPOCH: String(now.getTime()),
        LAST_SEEN_ISO: now.toISOString(),
        LAST_SEEN_DATE: manilaDate_(now),
        LAST_SEEN_HOUR: String(manilaHour_(now))
      });

      if (payload.report) {
        p.setProperty('LAST_BROWSER_REPORT', String(payload.report).slice(0, 1800));
      }
      if (action === 'ack') {
        p.setProperty('LAST_ACK_DATE', manilaDate_(now));
      }

      return json_({ ok: true, action: action });
    }

    if (action === 'test') {
      return json_({ ok: true, action: 'test', result: sendWhatsAppTemplate_('TEST') });
    }

    return json_({ ok: false, error: 'Unsupported action' });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function requirePresenceKey_(e, payload) {
  const expected = requiredProperty_('JAZZ_PRESENCE_KEY');
  const queryKey = e && e.parameter ? String(e.parameter.key || '') : '';
  const bodyKey = payload ? String(payload.key || '') : '';
  if (queryKey !== expected && bodyKey !== expected) {
    throw new Error('Unauthorized');
  }
}

/* Run once after adding Script Properties and deploying the web app. */
function installDailyFallbackTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(function(t) { return t.getHandlerFunction() === 'checkDailyFallback'; })
    .forEach(function(t) { ScriptApp.deleteTrigger(t); });

  ScriptApp.newTrigger('checkDailyFallback')
    .timeBased()
    .everyMinutes(5)
    .create();

  console.log('Jazz fallback trigger installed. It only acts during 9:15–9:29 AM Asia/Manila.');
}

function checkDailyFallback() {
  const now = new Date();
  const hour = manilaHour_(now);
  const minute = manilaMinute_(now);
  if (hour !== 9 || minute < FALLBACK_START_MINUTE || minute > FALLBACK_END_MINUTE) return;

  const p = props_();
  const today = manilaDate_(now);

  if (p.getProperty('LAST_FALLBACK_SENT_DATE') === today) return;

  const seenToday = p.getProperty('LAST_SEEN_DATE') === today;
  const seenHour = Number(p.getProperty('LAST_SEEN_HOUR') || -1);
  if (seenToday && seenHour >= 9) {
    console.log('Jazz saw Kimmy online after 9:00 AM. WhatsApp fallback skipped.');
    return;
  }

  sendWhatsAppTemplate_('DAILY_FALLBACK');
  p.setProperty('LAST_FALLBACK_SENT_DATE', today);
  p.setProperty('LAST_FALLBACK_SENT_ISO', now.toISOString());
}

function sendWhatsAppTemplate_(reason) {
  const accessToken = requiredProperty_('WA_ACCESS_TOKEN');
  const phoneNumberId = requiredProperty_('WA_PHONE_NUMBER_ID');
  const recipient = requiredProperty_('WA_RECIPIENT').replace(/\D/g, '');
  const templateName = requiredProperty_('WA_TEMPLATE_NAME');
  const graphVersion = requiredProperty_('META_GRAPH_VERSION');
  const language = props_().getProperty('WA_TEMPLATE_LANGUAGE') || 'en_US';

  const todayPretty = Utilities.formatDate(new Date(), JAZZ_TIME_ZONE, 'MMMM d, yyyy');
  const summary = buildFallbackSummary_();

  /*
   * Recommended approved template body with TWO variables:
   * Good morning, Kimmy. Jazz Daily Report for {{1}}: {{2}}
   * Open Jazz: https://dariakimberly4-netizen.github.io/jazz-ai-command-center/
   */
  const body = {
    messaging_product: 'whatsapp',
    to: recipient,
    type: 'template',
    template: {
      name: templateName,
      language: { code: language },
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
    headers: { Authorization: 'Bearer ' + accessToken },
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });

  const code = response.getResponseCode();
  const text = response.getContentText();
  console.log('WhatsApp ' + reason + ' response ' + code + ': ' + text);
  if (code < 200 || code >= 300) {
    throw new Error('WhatsApp send failed (' + code + '). ' + text);
  }
  return text;
}

function buildFallbackSummary_() {
  const p = props_();
  const leadsUrl = p.getProperty('LEADS_JSON_URL');

  if (leadsUrl) {
    try {
      const response = UrlFetchApp.fetch(leadsUrl, { muteHttpExceptions: true });
      if (response.getResponseCode() >= 200 && response.getResponseCode() < 300) {
        const leads = JSON.parse(response.getContentText());
        if (Array.isArray(leads)) {
          const total = leads.length;
          const hot = leads.filter(function(l) {
            return String(l.Priority || '').toLowerCase() === 'hot';
          }).length;
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

/* Optional manual test after the WhatsApp template is approved. */
function testWhatsAppFallback() {
  return sendWhatsAppTemplate_('MANUAL_TEST');
}
