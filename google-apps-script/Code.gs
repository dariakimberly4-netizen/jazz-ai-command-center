/*
 * JAZZ AI — Private backend
 * Google Apps Script (V8)
 *
 * Current protected services:
 * - Real System Builder: Gemini -> GitHub repository -> GitHub Pages
 * - WhatsApp fallback for the 9:00 AM Jazz report
 * - Facebook Page OAuth and Page access-token storage
 *
 * SECURITY:
 * Keep GitHub tokens, Gemini keys, Meta tokens, app secrets, phone IDs,
 * recipient numbers, and the Jazz private key in Apps Script
 * Project Settings > Script properties. Never put them in GitHub Pages
 * or public JavaScript.
 */

const JAZZ_TIME_ZONE = 'Asia/Manila';
const FALLBACK_START_MINUTE = 15;
const FALLBACK_END_MINUTE = 29;
const FACEBOOK_DEFAULT_RETURN_URL = 'https://dariakimberly4-netizen.github.io/jazz-ai-command-center/';
const FACEBOOK_DEFAULT_SCOPES = 'pages_show_list,pages_read_engagement,pages_manage_posts';
const GITHUB_API_VERSION = '2026-03-10';
const DEFAULT_GEMINI_MODEL = 'gemini-3.6-flash';

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

    if (action === 'buildStatus') {
      requirePresenceKey_(e, {});
      return realSystemBuildStatusJsonp_(e);
    }

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
      facebookConfigured: Boolean(props_().getProperty('FB_PAGE_ACCESS_TOKEN')),
      realBuilderConfigured: Boolean(
        props_().getProperty('GITHUB_TOKEN') &&
        props_().getProperty('GITHUB_OWNER') &&
        props_().getProperty('GEMINI_API_KEY')
      )
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
    if (e && e.parameter && String(e.parameter.jazz_action || '') === 'buildSystem') {
      const formPayload = { key: String(e.parameter.key || '') };
      requirePresenceKey_(e, formPayload);
      let system = {};
      try {
        system = JSON.parse(String(e.parameter.system_json || '{}'));
      } catch (_) {
        throw new Error('The approved system specification could not be read.');
      }
      const systemId = realBuildId_(system.id);
      try {
        buildRealSystem_(system);
        return HtmlService.createHtmlOutput(
          '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">' +
          '<body style="font-family:system-ui;background:#08091a;color:#fff;padding:24px">' +
          '<h2>Jazz real build started</h2><p>You can return to Jazz. Live Work is checking the real deployment.</p></body>'
        );
      } catch (buildErr) {
        setRealBuildStatus_(systemId, 'ERROR', String(buildErr && buildErr.message ? buildErr.message : buildErr), {});
        console.error(buildErr);
        return HtmlService.createHtmlOutput(
          '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">' +
          '<body style="font-family:system-ui;background:#08091a;color:#fff;padding:24px">' +
          '<h2>Jazz build needs attention</h2><p>' + htmlEscape_(String(buildErr && buildErr.message ? buildErr.message : buildErr)) + '</p></body>'
        );
      }
    }

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

/* ========================= REAL SYSTEM BUILDER ========================= */

function realBuildId_(value) {
  const clean = String(value || Date.now()).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80);
  return clean || String(Date.now());
}

function realBuildStatusKey_(id) {
  return 'REAL_BUILD_' + realBuildId_(id);
}

function setRealBuildStatus_(id, stage, detail, extra) {
  const current = getRealBuildStatus_(id);
  const next = Object.assign({}, current, extra || {}, {
    ok: true,
    id: realBuildId_(id),
    stage: String(stage || 'QUEUED'),
    detail: String(detail || ''),
    updatedAt: new Date().toISOString()
  });
  props_().setProperty(realBuildStatusKey_(id), JSON.stringify(next));
  return next;
}

function getRealBuildStatus_(id) {
  const clean = realBuildId_(id);
  const raw = props_().getProperty(realBuildStatusKey_(clean));
  if (!raw) return { ok: true, id: clean, stage: 'QUEUED', detail: 'Waiting for the real builder to start.' };
  try { return JSON.parse(raw); }
  catch (_) { return { ok: false, id: clean, stage: 'ERROR', detail: 'Saved build status is unreadable.' }; }
}

function realSystemBuildStatusJsonp_(e) {
  const id = realBuildId_(e && e.parameter ? e.parameter.system_id : '');
  let status = getRealBuildStatus_(id);

  if (status.stage === 'DEPLOYING' && status.url) {
    try {
      const page = UrlFetchApp.fetch(String(status.url), {
        method: 'get',
        followRedirects: true,
        muteHttpExceptions: true
      });
      const code = page.getResponseCode();
      if (code >= 200 && code < 400) {
        status = setRealBuildStatus_(id, 'LIVE', 'Real GitHub Pages system verified reachable.', {
          url: String(status.url),
          repo: String(status.repo || ''),
          httpStatus: code
        });
      }
    } catch (err) {
      console.warn('Deployment verification still waiting: ' + err);
    }
  }

  const rawCallback = String((e && e.parameter && e.parameter.callback) || '');
  const callback = /^[A-Za-z_$][A-Za-z0-9_$.]*$/.test(rawCallback) ? rawCallback : '';
  if (!callback) return json_(status);

  return ContentService
    .createTextOutput(callback + '(' + JSON.stringify(status) + ');')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function buildRealSystem_(system) {
  const id = realBuildId_(system && system.id);
  const githubToken = requiredProperty_('GITHUB_TOKEN');
  const githubOwner = requiredProperty_('GITHUB_OWNER');
  requiredProperty_('GEMINI_API_KEY');

  setRealBuildStatus_(id, 'GENERATING', 'Generating the actual deployable application files with Gemini.', {});
  const generated = generateRealSystemFiles_(system || {});
  validateGeneratedSystem_(generated);

  const repoName = realSystemRepoName_(system || {}, id);
  setRealBuildStatus_(id, 'CREATING_REPOSITORY', 'Creating GitHub repository ' + repoName + '.', { repo: githubOwner + '/' + repoName });

  const repo = githubRequest_('post', '/user/repos', {
    name: repoName,
    description: 'Real system built by Jazz AI Command Center',
    private: false,
    auto_init: true,
    has_issues: true
  }, githubToken, [201]);

  const owner = String(repo.owner && repo.owner.login ? repo.owner.login : githubOwner);
  const fullRepo = owner + '/' + repoName;
  Utilities.sleep(1200);

  setRealBuildStatus_(id, 'UPLOADING_FILES', 'Writing the real application files to ' + fullRepo + '.', { repo: fullRepo });
  githubPutFile_(owner, repoName, 'index.html', generated.index_html, 'Build real system application', githubToken);

  const specText = '# Jazz AI Real System\n\n' +
    'Built: ' + new Date().toISOString() + '\n\n' +
    '## Approved specification\n\n```json\n' + JSON.stringify(system || {}, null, 2) + '\n```\n\n' +
    '## Builder notes\n\n' + String(generated.system_notes || 'Generated as a self-contained GitHub Pages system.');
  githubPutFile_(owner, repoName, 'SYSTEM_SPEC.md', specText, 'Save approved system specification', githubToken);

  setRealBuildStatus_(id, 'ENABLING_PAGES', 'Enabling GitHub Pages for the real system.', { repo: fullRepo });
  Utilities.sleep(1500);

  let pages = null;
  try {
    pages = githubRequest_('post', '/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repoName) + '/pages', {
      source: { branch: 'main', path: '/' }
    }, githubToken, [201]);
  } catch (firstPagesErr) {
    Utilities.sleep(2500);
    pages = githubRequest_('post', '/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repoName) + '/pages', {
      source: { branch: 'main', path: '/' }
    }, githubToken, [201, 409]);
  }

  try {
    githubRequest_('post', '/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repoName) + '/pages/builds', {}, githubToken, [201, 409]);
  } catch (err) {
    console.warn('GitHub Pages build request will continue automatically: ' + err);
  }

  const pageUrl = pages && pages.html_url ? String(pages.html_url) :
    'https://' + owner.toLowerCase() + '.github.io/' + repoName + '/';

  setRealBuildStatus_(id, 'DEPLOYING', 'GitHub Pages is deploying. Jazz is verifying the real HTTPS system.', {
    repo: fullRepo,
    url: pageUrl
  });

  return { ok: true, id: id, repo: fullRepo, url: pageUrl, stage: 'DEPLOYING' };
}

function realSystemRepoName_(system, id) {
  const source = String(system.name || system.type || system.idea || 'system')
    .replace(/^#+\s*/g, '')
    .split(/[\n\r]/)[0]
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 34) || 'system';
  const suffix = realBuildId_(id).slice(-8).toLowerCase();
  return ('jazz-' + source + '-' + suffix).slice(0, 60).replace(/-+$/g, '');
}

function generateRealSystemFiles_(system) {
  const apiKey = requiredProperty_('GEMINI_API_KEY');
  const model = props_().getProperty('GEMINI_MODEL') || DEFAULT_GEMINI_MODEL;
  const prompt = [
    'You are the production code generator inside Jazz AI Command Center.',
    'Create an ACTUAL working web system for deployment on GitHub Pages. Do not create a mockup or prototype.',
    'Return one complete self-contained index.html file with embedded CSS and JavaScript.',
    'All visible controls must work. Do not include fake buttons, TODO items, placeholder workflows, demo records, lorem ipsum, or sample beneficiaries/patients.',
    'Use IndexedDB for real persistent browser data. Provide clear backup/export and import/restore tools so records can be moved to another device.',
    'Use no CDN libraries and no external runtime dependencies. Never embed API keys or secrets.',
    'Make it mobile-first, keyboard accessible, readable, and stable. Use large controls, large tap targets, strong contrast, minimal precision interaction, reduced-motion support, and confirmation for destructive actions.',
    'If the approved specification involves Parkinson accessibility, prioritize tremor-friendly controls, minimal typing, one-tap actions and calm motion.',
    'If the specification asks for server-only features such as secure multi-user authentication or shared cloud synchronization, do NOT pretend those exist. Build all features that can be genuinely implemented in a GitHub Pages system and clearly label any server-only dependency inside a small Settings/Connection area rather than faking it.',
    'The page must include a real title, dashboard/status area appropriate to the requested system, search/filter where useful, record creation/editing where useful, timestamps, and print/export where useful.',
    'Do not use the word prototype anywhere in the user interface.',
    'APPROVED SYSTEM SPECIFICATION:',
    JSON.stringify(system || {}, null, 2)
  ].join('\n\n');

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          index_html: { type: 'STRING' },
          system_notes: { type: 'STRING' }
        },
        required: ['index_html', 'system_notes']
      },
      temperature: 0.2,
      maxOutputTokens: 32768
    }
  };

  const response = UrlFetchApp.fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent',
    {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-goog-api-key': apiKey },
      payload: JSON.stringify(body),
      muteHttpExceptions: true
    }
  );

  const code = response.getResponseCode();
  const text = response.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error('Gemini system generation failed (' + code + '). ' + text.slice(0, 700));
  }

  let data = {};
  try { data = JSON.parse(text || '{}'); }
  catch (_) { throw new Error('Gemini returned an unreadable response.'); }

  const parts = data && data.candidates && data.candidates[0] && data.candidates[0].content &&
    Array.isArray(data.candidates[0].content.parts) ? data.candidates[0].content.parts : [];
  const generatedText = parts.map(function(part) { return String(part.text || ''); }).join('').trim();
  if (!generatedText) throw new Error('Gemini returned no application files.');

  let result = {};
  try { result = JSON.parse(generatedText); }
  catch (_) {
    const cleaned = generatedText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '');
    try { result = JSON.parse(cleaned); }
    catch (err) { throw new Error('Gemini did not return the required application JSON.'); }
  }
  return result;
}

function validateGeneratedSystem_(generated) {
  const html = String(generated && generated.index_html || '');
  if (html.length < 2500) throw new Error('Generated application file is unexpectedly incomplete.');
  if (!/<html[\s>]/i.test(html) || !/<script[\s>]/i.test(html) || !/<style[\s>]/i.test(html)) {
    throw new Error('Generated application is missing required HTML, CSS, or JavaScript.');
  }
  if (/YOUR[_ -]?(API|KEY)|TODO|lorem ipsum/i.test(html)) {
    throw new Error('Generated application still contains unfinished placeholders. Jazz refused to deploy it.');
  }
}

function githubPutFile_(owner, repo, path, content, message, token) {
  return githubRequest_('put', '/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo) + '/contents/' + path.split('/').map(encodeURIComponent).join('/'), {
    message: String(message || 'Update system file'),
    content: Utilities.base64Encode(String(content || ''), Utilities.Charset.UTF_8)
  }, token, [200, 201]);
}

function githubRequest_(method, path, body, token, allowedStatuses) {
  const options = {
    method: String(method || 'get').toLowerCase(),
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: 'Bearer ' + String(token || requiredProperty_('GITHUB_TOKEN')),
      'X-GitHub-Api-Version': GITHUB_API_VERSION,
      'User-Agent': 'Jazz-AI-Command-Center'
    },
    muteHttpExceptions: true
  };
  if (body !== undefined && body !== null && options.method !== 'get') {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(body);
  }
  const response = UrlFetchApp.fetch('https://api.github.com' + path, options);
  const code = response.getResponseCode();
  const text = response.getContentText();
  const allowed = Array.isArray(allowedStatuses) ? allowedStatuses : [200];
  if (allowed.indexOf(code) === -1) {
    throw new Error('GitHub API failed (' + code + '). ' + text.slice(0, 900));
  }
  if (!text) return {};
  try { return JSON.parse(text); }
  catch (_) { return { raw: text, status: code }; }
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
