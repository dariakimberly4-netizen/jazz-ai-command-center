(() => {
  'use strict';

  const WORKER_KEY = 'jazzWhatsappWorkerUrl';
  const DEVICE_KEY = 'jazzWhatsappDeviceKey';
  const REPORT_DAY_KEY = 'jazzWhatsappReportDay';
  const $ = (s, root = document) => root.querySelector(s);

  function toast(message) {
    const el = $('#toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 3200);
  }

  function workerUrl() {
    return (localStorage.getItem(WORKER_KEY) || '').trim().replace(/\/$/, '');
  }

  function deviceKey() {
    return (localStorage.getItem(DEVICE_KEY) || '').trim();
  }

  function manilaParts(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Manila',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(date);
    const get = (type) => parts.find((p) => p.type === type)?.value || '';
    return {
      date: `${get('year')}-${get('month')}-${get('day')}`,
      hour: Number(get('hour')),
      minute: Number(get('minute'))
    };
  }

  function numberFrom(id) {
    const n = Number(String($(id)?.textContent || '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? n : 0;
  }

  function snapshot() {
    let systems = [];
    try { systems = JSON.parse(localStorage.getItem('jazzSystems') || '[]'); } catch {}
    return {
      leads: {
        total: numberFrom('#totalLeads'),
        hot: numberFrom('#hotLeads'),
        followUp: numberFrom('#followLeads')
      },
      systems: {
        total: systems.length,
        active: systems.filter((s) => !/archived/i.test(String(s.status || ''))).length
      },
      approvals: [...document.querySelectorAll('#approvalList .row')].length,
      capturedAt: new Date().toISOString()
    };
  }

  function reportText(data = snapshot()) {
    return `Good morning, Kimmy. Here is your Jazz 9 AM report. You have ${data.leads.total} leads, ${data.leads.hot} hot leads, ${data.leads.followUp} needing follow-up, ${data.systems.active} active systems, and ${data.approvals} approvals waiting. Review urgent follow-ups and approvals first.`;
  }

  async function callWorker(path, options = {}) {
    const base = workerUrl();
    if (!base) throw new Error('WhatsApp fallback is not connected yet.');
    const headers = { 'Content-Type': 'application/json' };
    if (options.secure !== false) {
      if (!deviceKey()) throw new Error('Jazz secure key is missing.');
      headers['X-Jazz-Key'] = deviceKey();
    }
    const response = await fetch(base + path, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      cache: 'no-store'
    });
    if (!response.ok) throw new Error((await response.text()) || 'Fallback service error');
    return response.json().catch(() => ({}));
  }

  async function heartbeat() {
    if (!workerUrl() || !deviceKey() || document.visibilityState !== 'visible') return;
    try {
      await callWorker('/heartbeat', { method: 'POST', body: { snapshot: snapshot() } });
    } catch (_) {
      // Jazz remains usable even if the fallback service is temporarily offline.
    }
  }

  async function acknowledge(showToast = true) {
    try {
      await callWorker('/ack', { method: 'POST', body: { snapshot: snapshot() } });
      if (showToast) toast('You are checked in. No WhatsApp fallback is needed today.');
      refreshStatus();
    } catch (error) {
      if (showToast) toast(error.message);
    }
  }

  function showNineAmReport() {
    const now = manilaParts();
    if (now.hour !== 9 || now.minute > 14) return;
    if (localStorage.getItem(REPORT_DAY_KEY) === now.date) return;
    if (document.visibilityState !== 'visible') return;

    const data = snapshot();
    const text = reportText(data);
    localStorage.setItem(REPORT_DAY_KEY, now.date);

    const home = $('#home');
    if (home && !$('#jazzNineAmReport')) {
      const card = document.createElement('div');
      card.className = 'panel';
      card.id = 'jazzNineAmReport';
      card.innerHTML = `
        <div class="eyebrow">9:00 AM DAILY REPORT</div>
        <h2>Good morning, Kimmy</h2>
        <p id="jazzNineAmText"></p>
        <div class="approve-actions">
          <button class="yes" id="jazzNineAmGotIt">GOT IT</button>
          <button id="jazzNineAmWork">LIVE WORK</button>
        </div>`;
      const firstPanel = home.querySelector('.panel');
      home.insertBefore(card, firstPanel || null);
      $('#jazzNineAmText').textContent = text;
      $('#jazzNineAmGotIt').onclick = () => card.remove();
      $('#jazzNineAmWork').onclick = () => {
        if (typeof window.nav === 'function') window.nav('work');
      };
    }

    toast('Your 9:00 AM Jazz report is ready.');
    if (typeof window.speak === 'function') window.speak(text);
    acknowledge(false);
  }

  function setupWorker() {
    const currentUrl = workerUrl();
    const value = prompt('Paste your Jazz WhatsApp Worker URL here:', currentUrl || 'https://');
    if (value === null) return;
    const cleaned = value.trim().replace(/\/$/, '');
    if (!/^https:\/\//i.test(cleaned)) {
      toast('Please paste a secure https:// Worker URL.');
      return;
    }

    const key = prompt('Paste your private Jazz secure key. It stays only on this device:', deviceKey());
    if (key === null) return;
    if (key.trim().length < 12) {
      toast('Use a secure key with at least 12 characters.');
      return;
    }

    localStorage.setItem(WORKER_KEY, cleaned);
    localStorage.setItem(DEVICE_KEY, key.trim());
    toast('WhatsApp fallback saved on this device.');
    heartbeat();
    refreshStatus();
  }

  async function refreshStatus() {
    const statusText = $('#waFallbackStatus');
    const connectButton = $('#waConnectButton');
    const detail = $('#waFallbackDetail');
    if (!statusText || !connectButton) return;

    if (!workerUrl() || !deviceKey()) {
      statusText.textContent = 'Not connected';
      connectButton.textContent = 'SET UP';
      if (detail) detail.textContent = 'Connect once to enable the 9:15 AM WhatsApp fallback.';
      return;
    }

    statusText.textContent = 'Checking…';
    connectButton.textContent = 'EDIT';
    try {
      const status = await callWorker('/status', { secure: false });
      statusText.textContent = status.ready ? 'Connected' : 'Setup incomplete';
      if (detail) {
        detail.textContent = status.ready
          ? '9:00 AM Jazz report • 9:15 AM WhatsApp only if Jazz has not seen you online.'
          : 'Worker found, but WhatsApp, secure key, or storage setup is incomplete.';
      }
    } catch (_) {
      statusText.textContent = 'Service unavailable';
      if (detail) detail.textContent = 'Jazz is still usable. Check the saved Worker URL when convenient.';
    }
  }

  function injectConnectionRow() {
    const connections = $('#connections');
    if (!connections || $('#waConnectButton')) return;
    const list = $('.list', connections);
    if (!list) return;

    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = '<span class="dot"></span><div><strong>WhatsApp Fallback</strong><small id="waFallbackStatus">Not connected</small></div><button id="waConnectButton">SET UP</button>';
    list.appendChild(row);
    $('#waConnectButton').addEventListener('click', setupWorker);

    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.innerHTML = `
      <div class="eyebrow">DAILY REPORT SAFETY NET</div>
      <h2>9 AM Report + WhatsApp Fallback</h2>
      <p id="waFallbackDetail">Connect once to enable the 9:15 AM WhatsApp fallback.</p>
      <div class="list">
        <div class="row"><span class="dot"></span><div><strong>9:00 AM</strong><small>Jazz speaks and shows your daily report when the Command Center is open.</small></div></div>
        <div class="row"><span class="dot"></span><div><strong>9:15 AM</strong><small>If Jazz has not seen you online, the backend sends your fallback report on WhatsApp.</small></div></div>
      </div>
      <button class="builder-go" id="waImHere" type="button">I'M HERE — NO WHATSAPP TODAY</button>
      <p class="honest">Your WhatsApp access token never goes into this public website. It stays only in the private backend.</p>`;
    connections.appendChild(panel);
    $('#waImHere').addEventListener('click', () => acknowledge(true));
  }

  function bindReportCheckIn() {
    const reportButton = $('[data-act="report"]');
    if (!reportButton || reportButton.dataset.waBound) return;
    reportButton.dataset.waBound = 'true';
    reportButton.addEventListener('click', () => {
      if (workerUrl() && deviceKey()) acknowledge(false);
    });
  }

  injectConnectionRow();
  bindReportCheckIn();
  refreshStatus();
  heartbeat();
  showNineAmReport();

  document.addEventListener('visibilitychange', () => {
    heartbeat();
    showNineAmReport();
  });
  window.addEventListener('focus', () => {
    heartbeat();
    showNineAmReport();
  });
  setInterval(() => {
    heartbeat();
    showNineAmReport();
  }, 60 * 1000);
})();