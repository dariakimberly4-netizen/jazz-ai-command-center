/*
 * JAZZ AI — Private backend
 * Google Apps Script (V8)
 *
 * Current protected services:
 * - WhatsApp fallback for the 9:00 AM Jazz report
 * - Facebook Page OAuth and Page access-token storage
 *
 * SECURITY:
 * Keep all Meta tokens, app secrets, phone IDs, recipient numbers, and the
 * Jazz private key in Apps Script > Project Settings > Script properties.
 * Never put them in GitHub Pages or public JavaScript.
 */

const JAZZ_TIME_ZONE = 'Asia/Manila';
const FALLBACK_START_MINUTE = 15;
const FALLBACK_END_MINUTE = 29;
const FACEBOOK_DEFAULT_RETURN_URL = 'https://dariakimberly4-netizen.github.io/jazz-ai-command-center/';
const FACEBOOK_DEFAULT_SCOPES = 'pages_show_list,pages_read_engagement,pages_manage_posts';

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

function doGet(e) {
  try {
    const action = e && e.parameter ? String(e.parameter.action || '') : '';

    if (e && e.parameter && (e.parameter.code || e.parameter.error)) {
      return facebookOAuthCallback_(e);
    }

    if (action === 'facebookStart') {
      requirePresenceKey_(e, {});
      return facebookStart_();
    }

    if (action === 'facebookSelect') {
      return facebookSelect_(e);
    }

    if (action === 'facebookDisconnect') {
      requirePresenceKey_(e, {});
      clearFacebookConnection_();
      return facebookReturnHtml_('disconnected', '');
    }

    return json_({
      ok: true,
      service: 'Jazz Private Backend',
      timezone: JAZZ_TIME_ZONE,
      facebookConfigured: Boolean(props_().getProperty('FB_PAGE_ACCESS_TOKEN'))
    });
  } catch (err) {
    console.error(err);
    return HtmlService.createHtmlOutput(
      '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<body style="font-family:system-ui;background:#08091a;color:#fff;padding:28px">' +
      '<h2>Jazz connection needs attention</h2><p>' + htmlEscape_(String(err && err.message ? err.message : err)) + '</p>' +
      '<p>You can close this page and return to Jazz.</p></body>'
    );
  }
}

function doPost(e) {
  try {
    const payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    requirePresenceKey_(e, payload);

    const action = String(payload.action || '');
    const now = new Date();
    const p = props_();

    if (action === 'heartbeat' || action === 'online-report' || action === 'ack' || action === 'startup-report') {
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

    if (action === 'facebookTest') {
      return json_({ ok: true, action: 'facebookTest', result: testFacebookConnection() });
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

/* ========================= FACEBOOK PAGE ========================= */

function facebookRedirectUri_() {
  const configured = props_().getProperty('FACEBOOK_REDIRECT_URI');
  if (configured) return configured;
  const deployed = ScriptApp.getService().getUrl();
  if (!deployed) throw new Error('Deploy this Apps Script as a Web App first.');
  return deployed;
}

function facebookReturnUrl_() {
  return props_().getProperty('FACEBOOK_RETURN_URL') || FACEBOOK_DEFAULT_RETURN_URL;
}

function facebookStart_() {
  const appId = requiredProperty_('FACEBOOK_APP_ID');
  requiredProperty_('FACEBOOK_APP_SECRET');
  const graphVersion = requiredProperty_('META_GRAPH_VERSION');
  const redirectUri = facebookRedirectUri_();
  const scopes = props_().getProperty('FACEBOOK_SCOPES') || FACEBOOK_DEFAULT_SCOPES;
  const state = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');

  props_().setProperties({
    FB_OAUTH_STATE: state,
    FB_OAUTH_STATE_EPOCH: String(Date.now())
  });

  const authUrl = 'https://www.facebook.com/' + encodeURIComponent(graphVersion) + '/dialog/oauth?' +
    'client_id=' + encodeURIComponent(appId) +
    '&redirect_uri=' + encodeURIComponent(redirectUri) +
    '&state=' + encodeURIComponent(state) +
    '&response_type=code' +
    '&scope=' + encodeURIComponent(scopes) +
    '&auth_type=rerequest';

  return redirectHtml_(authUrl, 'Opening Facebook authorization…');
}

function facebookOAuthCallback_(e) {
  const p = props_();
  const returnedState = String((e && e.parameter && e.parameter.state) || '');
  const expectedState = String(p.getProperty('FB_OAUTH_STATE') || '');
  const stateEpoch = Number(p.getProperty('FB_OAUTH_STATE_EPOCH') || 0);

  if (!returnedState || returnedState !== expectedState || !stateEpoch || Date.now() - stateEpoch > 10 * 60 * 1000) {
    clearFacebookOAuthState_();
    throw new Error('Facebook authorization expired. Start the connection again from Jazz.');
  }

  if (e.parameter.error) {
    clearFacebookOAuthState_();
    return facebookReturnHtml_('error', '');
  }

  const code = String(e.parameter.code || '');
  if (!code) throw new Error('Facebook did not return an authorization code.');

  const appId = requiredProperty_('FACEBOOK_APP_ID');
  const appSecret = requiredProperty_('FACEBOOK_APP_SECRET');
  const graphVersion = requiredProperty_('META_GRAPH_VERSION');
  const redirectUri = facebookRedirectUri_();

  const tokenResponse = UrlFetchApp.fetch(
    'https://graph.facebook.com/' + encodeURIComponent(graphVersion) + '/oauth/access_token',
    {
      method: 'post',
      payload: {
        client_id: appId,
        redirect_uri: redirectUri,
        client_secret: appSecret,
        code: code
      },
      muteHttpExceptions: true
    }
  );
  const tokenData = parseGraphResponse_(tokenResponse, 'Facebook token exchange');
  let userToken = String(tokenData.access_token || '');
  if (!userToken) throw new Error('Facebook did not return a user access token.');

  try {
    const longResponse = UrlFetchApp.fetch(
      'https://graph.facebook.com/' + encodeURIComponent(graphVersion) + '/oauth/access_token',
      {
        method: 'post',
        payload: {
          grant_type: 'fb_exchange_token',
          client_id: appId,
          client_secret: appSecret,
          fb_exchange_token: userToken
        },
        muteHttpExceptions: true
      }
    );
    const longData = parseGraphResponse_(longResponse, 'Facebook long-lived token exchange');
    if (longData.access_token) userToken = String(longData.access_token);
  } catch (err) {
    console.warn('Long-lived Facebook token exchange was unavailable: ' + err);
  }

  const accountsUrl = 'https://graph.facebook.com/' + encodeURIComponent(graphVersion) +
    '/me/accounts?fields=id,name,access_token,tasks';
  const accountsResponse = UrlFetchApp.fetch(accountsUrl, {
    method: 'get',
    headers: { Authorization: 'Bearer ' + userToken },
    muteHttpExceptions: true
  });
  const accounts = parseGraphResponse_(accountsResponse, 'Facebook Pages lookup');
  const pages = Array.isArray(accounts.data) ? accounts.data.filter(function(page) {
    return page && page.id && page.name && page.access_token;
  }) : [];

  clearFacebookOAuthState_();
  if (!pages.length) {
    throw new Error('No manageable Facebook Pages were returned. Check Page access and the requested permissions.');
  }

  const preferredName = String(p.getProperty('FACEBOOK_PAGE_NAME') || '').trim().toLowerCase();
  let selected = null;
  if (preferredName) {
    selected = pages.find(function(page) {
      const name = String(page.name || '').trim().toLowerCase();
      return name === preferredName || name.indexOf(preferredName) !== -1 || preferredName.indexOf(name) !== -1;
    }) || null;
  }

  if (!selected && pages.length === 1) selected = pages[0];

  if (selected) {
    saveFacebookPage_(selected, userToken);
    return facebookReturnHtml_('connected', selected.name);
  }

  const nonce = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  CacheService.getScriptCache().put(
    'FB_SELECT_' + nonce,
    JSON.stringify({ userToken: userToken, pages: pages }),
    600
  );
  return facebookPageChoiceHtml_(pages, nonce);
}

function facebookSelect_(e) {
  const nonce = String((e && e.parameter && e.parameter.nonce) || '');
  const pageId = String((e && e.parameter && e.parameter.page_id) || '');
  if (!nonce || !pageId) throw new Error('Facebook Page selection is incomplete.');

  const cache = CacheService.getScriptCache();
  const raw = cache.get('FB_SELECT_' + nonce);
  if (!raw) throw new Error('Facebook Page selection expired. Start the connection again from Jazz.');

  const data = JSON.parse(raw);
  const pages = Array.isArray(data.pages) ? data.pages : [];
  const page = pages.find(function(item) { return String(item.id) === pageId; });
  if (!page) throw new Error('That Facebook Page was not part of this authorization session.');

  saveFacebookPage_(page, String(data.userToken || ''));
  cache.remove('FB_SELECT_' + nonce);
  return facebookReturnHtml_('connected', page.name);
}

function saveFacebookPage_(page, userToken) {
  props_().setProperties({
    FB_PAGE_ID: String(page.id),
    FB_PAGE_NAME: String(page.name),
    FB_PAGE_ACCESS_TOKEN: String(page.access_token),
    FB_USER_ACCESS_TOKEN: String(userToken || ''),
    FB_CONNECTED_AT: new Date().toISOString(),
    FB_PAGE_TASKS: JSON.stringify(page.tasks || [])
  });
}

function clearFacebookOAuthState_() {
  props_().deleteProperty('FB_OAUTH_STATE');
  props_().deleteProperty('FB_OAUTH_STATE_EPOCH');
}

function clearFacebookConnection_() {
  const p = props_();
  [
    'FB_PAGE_ID', 'FB_PAGE_NAME', 'FB_PAGE_ACCESS_TOKEN', 'FB_USER_ACCESS_TOKEN',
    'FB_CONNECTED_AT', 'FB_PAGE_TASKS', 'FB_OAUTH_STATE', 'FB_OAUTH_STATE_EPOCH'
  ].forEach(function(name) { p.deleteProperty(name); });
}

function facebookPageChoiceHtml_(pages, nonce) {
  const redirectUri = facebookRedirectUri_();
  const buttons = pages.map(function(page) {
    const href = redirectUri + '?action=facebookSelect&nonce=' + encodeURIComponent(nonce) +
      '&page_id=' + encodeURIComponent(String(page.id));
    return '<a href="' + htmlEscape_(href) + '" style="display:block;text-decoration:none;color:#0b0b18;background:#d9bd7c;padding:17px;border-radius:16px;margin:12px 0;font-weight:800">' +
      htmlEscape_(String(page.name)) + '</a>';
  }).join('');

  return HtmlService.createHtmlOutput(
    '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<body style="font-family:system-ui;background:#08091a;color:#fff;padding:24px;max-width:620px;margin:auto">' +
    '<div style="color:#d9bd7c;font-weight:900;letter-spacing:.08em">JAZZ AI</div>' +
    '<h2>Choose the Facebook Page for Jazz</h2><p style="color:#c8c7d7">Tap one Page. Jazz will store its access token only in your private backend.</p>' +
    buttons + '</body>'
  );
}

function facebookReturnHtml_(state, pageName) {
  const url = facebookReturnUrl_();
  const separator = url.indexOf('?') === -1 ? '?' : '&';
  const target = url + separator + 'facebook=' + encodeURIComponent(state) +
    (pageName ? '&fb_page=' + encodeURIComponent(pageName) : '');
  return redirectHtml_(target, state === 'connected' ? 'Facebook connected. Returning to Jazz…' : 'Returning to Jazz…');
}

function redirectHtml_(target, message) {
  const safeTarget = JSON.stringify(String(target));
  return HtmlService.createHtmlOutput(
    '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<body style="font-family:system-ui;background:#08091a;color:#fff;padding:30px;text-align:center">' +
    '<h2>' + htmlEscape_(message) + '</h2><p style="color:#c8c7d7">If nothing happens, tap Continue.</p>' +
    '<button id="go" style="min-height:60px;padding:0 28px;border:0;border-radius:18px;background:#d9bd7c;font-weight:900">CONTINUE</button>' +
    '<script>var u=' + safeTarget + ';document.getElementById("go").onclick=function(){location.replace(u)};setTimeout(function(){location.replace(u)},300);<\/script></body>'
  );
}

function parseGraphResponse_(response, label) {
  const code = response.getResponseCode();
  const text = response.getContentText();
  let data = {};
  try { data = JSON.parse(text || '{}'); } catch (_) {}
  if (code < 200 || code >= 300 || data.error) {
    const detail = data && data.error && data.error.message ? data.error.message : text;
    throw new Error(label + ' failed (' + code + '). ' + String(detail || 'Unknown Meta error'));
  }
  return data;
}

function htmlEscape_(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* Run manually inside Apps Script to verify the connected Facebook Page. */
function testFacebookConnection() {
  const graphVersion = requiredProperty_('META_GRAPH_VERSION');
  const pageId = requiredProperty_('FB_PAGE_ID');
  const pageToken = requiredProperty_('FB_PAGE_ACCESS_TOKEN');
  const response = UrlFetchApp.fetch(
    'https://graph.facebook.com/' + encodeURIComponent(graphVersion) + '/' + encodeURIComponent(pageId) + '?fields=id,name',
    {
      method: 'get',
      headers: { Authorization: 'Bearer ' + pageToken },
      muteHttpExceptions: true
    }
  );
  const data = parseGraphResponse_(response, 'Facebook Page test');
  console.log('Jazz Facebook connected: ' + JSON.stringify(data));
  return data;
}

/* Optional protected helper for future Jazz-approved text posting. */
function publishFacebookText(message) {
  const text = String(message || '').trim();
  if (!text) throw new Error('Message is empty.');
  const graphVersion = requiredProperty_('META_GRAPH_VERSION');
  const pageId = requiredProperty_('FB_PAGE_ID');
  const pageToken = requiredProperty_('FB_PAGE_ACCESS_TOKEN');
  const response = UrlFetchApp.fetch(
    'https://graph.facebook.com/' + encodeURIComponent(graphVersion) + '/' + encodeURIComponent(pageId) + '/feed',
    {
      method: 'post',
      headers: { Authorization: 'Bearer ' + pageToken },
      payload: { message: text },
      muteHttpExceptions: true
    }
  );
  return parseGraphResponse_(response, 'Facebook Page post');
}

/* ========================= WHATSAPP FALLBACK ========================= */

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
