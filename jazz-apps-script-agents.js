/*
  JAZZ AI — Google Apps Script Agent Bridge
  ------------------------------------------
  Replaces Supabase cloud memory for Jazz agents.
  Uses the same private Apps Script Web App URL already stored by Jazz.
  The private key stays only in localStorage on the user's device.
*/
(function () {
  'use strict';

  const URL_KEYS = ['jazzAgentBackendUrl', 'jazzWhatsAppFallbackUrl', 'jazzRealBuilderUrl'];
  const TASKS_KEY = 'jazzAgentTasksV2';
  const MAX_TASKS = 120;
  const POLL_MS = 1800;
  const MAX_POLLS = 45;
  const AGENTS = [
    'Partnership','Social Media','Reader Care','Finance & Orders','Aiva Presentation',
    'Grant & Sponsorship','Media','Website','Knowledge','Events','Lead & CRM'
  ];
  const polling = {};

  const $ = (s) => document.querySelector(s);
  const qa = (s) => Array.from(document.querySelectorAll(s));
  const nowIso = () => new Date().toISOString();

  function toastSafe(message) {
    try { if (typeof toast === 'function') return toast(message); } catch (_) {}
    console.info('[Jazz Apps Script]', message);
  }

  function config() {
    let raw = '';
    for (const key of URL_KEYS) {
      raw = localStorage.getItem(key) || '';
      if (raw) break;
    }
    if (!raw) return { endpoint: '', key: '', raw: '' };
    try {
      const url = new URL(raw);
      const key = url.searchParams.get('key') || '';
      url.searchParams.delete('key');
      return { endpoint: url.toString(), key, raw };
    } catch (_) {
      return { endpoint: '', key: '', raw: '' };
    }
  }

  function configured() {
    const c = config();
    return Boolean(c.endpoint && c.key);
  }

  function readTasks() {
    try {
      const rows = JSON.parse(localStorage.getItem(TASKS_KEY) || '[]');
      return Array.isArray(rows) ? rows : [];
    } catch (_) { return []; }
  }

  function writeTasks(rows) {
    localStorage.setItem(TASKS_KEY, JSON.stringify(rows.slice(0, MAX_TASKS)));
  }

  function saveTask(task) {
    const rows = readTasks();
    const i = rows.findIndex(x => x.id === task.id);
    if (i >= 0) rows[i] = task; else rows.unshift(task);
    writeTasks(rows);
    try { window.JazzAgentEngine?.render(task); } catch (_) {}
    return task;
  }

  function patchTask(id, patch) {
    const rows = readTasks();
    const i = rows.findIndex(x => x.id === id);
    if (i < 0) return null;
    rows[i] = Object.assign({}, rows[i], patch, { updatedAt: nowIso() });
    writeTasks(rows);
    try { window.JazzAgentEngine?.render(rows[i]); } catch (_) {}
    return rows[i];
  }

  function inferAgent(command) {
    const text = String(command || '').trim();
    const explicit = text.match(/^Ask\s+(.+?)\s+to\s+/i);
    if (explicit) {
      const requested = explicit[1].trim().toLowerCase();
      const exact = AGENTS.find(a => a.toLowerCase() === requested);
      if (exact) return exact;
      const loose = AGENTS.find(a => requested.includes(a.toLowerCase()) || a.toLowerCase().includes(requested));
      if (loose) return loose;
    }
    const rules = [
      ['Lead & CRM', /\b(crm|lead|prospect|follow[- ]?up|contact list|hot leads?)\b/i],
      ['Finance & Orders', /\b(order|payment|paid|unpaid|finance|sales|revenue|cash|book order)\b/i],
      ['Aiva Presentation', /\b(speech|presentation|slides?|speaker|talking points|q&a|opening remarks|closing remarks)\b/i],
      ['Grant & Sponsorship', /\b(grant|sponsor|sponsorship|funding|application deadline)\b/i],
      ['Social Media', /\b(facebook|instagram|tiktok|linkedin|caption|social|reel|post|hashtag|content calendar)\b/i],
      ['Reader Care', /\b(reader|review|testimonial|book question|reader reply|feedback)\b/i],
      ['Media', /\b(media|press|journalist|interview|press release|media pitch)\b/i],
      ['Website', /\b(website|webpage|seo|broken link|homepage|site update)\b/i],
      ['Events', /\b(event|guest|attendee|venue|run of show|program flow|invitation)\b/i],
      ['Partnership', /\b(partner|partnership|hospital|rotary|lions|organization outreach|proposal)\b/i]
    ];
    for (const [name, re] of rules) if (re.test(text)) return name;
    return 'Knowledge';
  }

  function cleanCommand(command) {
    return String(command || '').replace(/^Ask\s+.+?\s+to\s+/i, '').trim();
  }

  function post(action, extra) {
    const c = config();
    if (!c.endpoint || !c.key) return Promise.reject(new Error('Google Apps Script is not connected.'));
    const payload = Object.assign({
      action,
      key: c.key,
      source: 'jazz-ai-command-center',
      at: nowIso()
    }, extra || {});
    return fetch(c.endpoint, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      keepalive: true
    });
  }

  function jsonp(action, params, timeoutMs) {
    const c = config();
    if (!c.endpoint || !c.key) return Promise.reject(new Error('Google Apps Script is not connected.'));
    return new Promise((resolve, reject) => {
      const cb = '__jazzAgent_' + Date.now() + '_' + Math.random().toString(36).slice(2);
      const script = document.createElement('script');
      let finished = false;
      const timer = setTimeout(() => finish(new Error('Apps Script response timed out.')), timeoutMs || 10000);

      function finish(err, data) {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        try { delete window[cb]; } catch (_) { window[cb] = undefined; }
        script.remove();
        if (err) reject(err); else resolve(data || {});
      }

      window[cb] = data => finish(null, data);
      script.onerror = () => finish(new Error('Could not read the Apps Script agent service.'));
      const url = new URL(c.endpoint);
      url.searchParams.set('action', action);
      url.searchParams.set('key', c.key);
      url.searchParams.set('callback', cb);
      Object.entries(params || {}).forEach(([k, v]) => url.searchParams.set(k, String(v)));
      url.searchParams.set('_', Date.now());
      script.src = url.toString();
      document.body.appendChild(script);
    });
  }

  function createRemoteTask(command) {
    const raw = String(command || '').trim();
    if (!raw) return toastSafe('Please give Jazz an instruction.');
    if (!configured()) {
      showConnectionNeeded();
      return toastSafe('Connect Google Apps Script first.');
    }

    const task = {
      id: 'ja_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7),
      agent: inferAgent(raw),
      command: cleanCommand(raw) || raw,
      status: 'DEPLOYING',
      step: 'Sending task to Google Apps Script',
      result: '',
      error: '',
      source: 'Google Apps Script',
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    saveTask(task);
    try { if (typeof nav === 'function') nav('work'); } catch (_) {}
    toastSafe(task.agent + ' Agent deployed through Google Apps Script.');

    post('agentRun', { task }).then(() => {
      patchTask(task.id, { status: 'WORKING', step: 'Connected service is working' });
      pollTask(task.id, 0);
    }).catch(err => {
      patchTask(task.id, { status: 'ERROR', step: 'Apps Script connection failed', error: String(err.message || err) });
    });
    return task;
  }

  function pollTask(id, count) {
    clearTimeout(polling[id]);
    jsonp('agentTask', { task_id: id }, 12000).then(data => {
      if (!data || data.ok === false) {
        const message = String(data?.error || 'Apps Script agent backend needs to be updated.');
        patchTask(id, { status: 'ERROR', step: 'Backend update required', error: message });
        return;
      }
      const remote = data.task || data;
      const status = String(remote.status || 'WORKING');
      patchTask(id, {
        status,
        step: String(remote.step || remote.detail || (status === 'WORKING' ? 'Connected service is working' : 'Ready for review')),
        result: String(remote.result || ''),
        error: String(remote.error || '')
      });
      if (/WAITING FOR APPROVAL|COMPLETE|ERROR|CANCELLED/.test(status)) {
        if (status === 'WAITING FOR APPROVAL') {
          try { if (typeof speak === 'function') speak('Your connected ' + remote.agent + ' Agent result is ready for review.'); } catch (_) {}
        }
        return;
      }
      if (count < MAX_POLLS) polling[id] = setTimeout(() => pollTask(id, count + 1), POLL_MS);
      else patchTask(id, { status: 'ERROR', step: 'Connected task timed out', error: 'The Apps Script task did not finish in time. You can retry it.' });
    }).catch(err => {
      if (count < 3) polling[id] = setTimeout(() => pollTask(id, count + 1), 2500);
      else patchTask(id, { status: 'ERROR', step: 'Backend update required', error: 'Jazz reached your Apps Script URL, but the agent endpoint is not available yet.' });
    });
  }

  function sendDecision(id, decision) {
    const task = readTasks().find(t => t.id === id);
    if (!task || !configured()) return;
    post('agentDecision', { task_id: id, decision, task }).catch(() => {});
  }

  function retryRemote(id) {
    const task = readTasks().find(t => t.id === id);
    if (!task) return;
    patchTask(id, { status: 'DEPLOYING', step: 'Retrying through Google Apps Script', result: '', error: '' });
    post('agentRun', { task: Object.assign({}, task, { status: 'DEPLOYING', result: '', error: '' }) })
      .then(() => { patchTask(id, { status: 'WORKING', step: 'Connected service is working' }); pollTask(id, 0); })
      .catch(err => patchTask(id, { status: 'ERROR', step: 'Retry failed', error: String(err.message || err) }));
  }

  function installWorkOverride() {
    if (!window.JazzAgentEngine) return false;
    try { window.work = createRemoteTask; } catch (_) {}
    try { work = createRemoteTask; } catch (_) {}
    return true;
  }

  function statusText() {
    if (!configured()) return 'Not connected';
    return 'Private Apps Script URL saved on this device';
  }

  function addConnectionRow() {
    const panel = $('#connections .list');
    if (!panel || $('#jazzAgentAppsScriptRow')) return;
    const row = document.createElement('div');
    row.className = 'row';
    row.id = 'jazzAgentAppsScriptRow';
    row.innerHTML = '<span class="dot"></span><div><strong>Google Apps Script Agents</strong><small id="jazzAgentAppsScriptStatus"></small></div><button id="jazzAgentAppsScriptBtn">CHECK</button>';
    panel.prepend(row);
    $('#jazzAgentAppsScriptStatus').textContent = statusText();
    $('#jazzAgentAppsScriptBtn').onclick = async () => {
      if (!configured()) {
        const wa = $('#waFallbackBtn');
        if (wa) wa.click();
        else toastSafe('Add your private Apps Script Web App URL first.');
        return;
      }
      const button = $('#jazzAgentAppsScriptBtn');
      button.textContent = 'CHECKING';
      try {
        const data = await jsonp('agentStatus', {}, 10000);
        if (data && data.ok && data.agentService) {
          $('#jazzAgentAppsScriptStatus').textContent = 'Connected • agent service ready';
          button.textContent = 'READY';
          toastSafe('Google Apps Script agents are connected.');
        } else {
          $('#jazzAgentAppsScriptStatus').textContent = 'Backend update required';
          button.textContent = 'UPDATE';
          toastSafe('Your Apps Script URL works, but the agent backend needs the new JazzAgents code.');
        }
      } catch (_) {
        $('#jazzAgentAppsScriptStatus').textContent = 'Backend update required';
        button.textContent = 'UPDATE';
        toastSafe('Apps Script agent backend needs the new JazzAgents code.');
      }
    };
  }

  function showConnectionNeeded() {
    try { if (typeof nav === 'function') nav('connections'); } catch (_) {}
    addConnectionRow();
  }

  function interceptReviewActions() {
    document.addEventListener('click', event => {
      const button = event.target.closest('[data-jazz-action]');
      if (!button) return;
      const decision = button.dataset.jazzAction;
      const id = button.dataset.task;
      if (!id) return;
      if (decision === 'retry' && configured()) {
        event.preventDefault();
        event.stopImmediatePropagation();
        retryRemote(id);
        return;
      }
      if (decision === 'approve' || decision === 'cancel') {
        sendDecision(id, decision.toUpperCase());
      }
    }, true);
  }

  function resumeRemoteTasks() {
    if (!configured()) return;
    readTasks().filter(t => t.source === 'Google Apps Script' && /DEPLOYING|WORKING/.test(t.status)).slice(0, 6)
      .forEach(t => pollTask(t.id, 0));
  }

  function init() {
    addConnectionRow();
    interceptReviewActions();
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (installWorkOverride() || tries > 20) clearInterval(timer);
    }, 150);
    setTimeout(resumeRemoteTasks, 900);
    console.info('Jazz Google Apps Script Agent Bridge loaded. Supabase is not used.');
  }

  window.JazzAppsScriptAgents = {
    isConfigured: configured,
    run: createRemoteTask,
    status: () => ({ configured: configured(), connection: statusText() }),
    check: () => jsonp('agentStatus', {}, 10000),
    retry: retryRemote
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
