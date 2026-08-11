(() => {
  'use strict';

  const WORKER_KEY = 'jazzWhatsappWorkerUrl';
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

  async function callWorker(path, options = {}) {
    const base = workerUrl();
    if (!base) throw new Error('WhatsApp fallback is not connected yet.');
    const response = await fetch(base + path, {
      method: options.method || 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: options.body ? JSON.stringify(options.body) : undefined,
      cache: 'no-store'
    });
    if (!response.ok) throw new Error((await response.text()) || 'Fallback service error');
    return response.json().catch(() => ({}));
  }

  async function heartbeat() {
    if (!workerUrl() || document.visibilityState !== 'visible') return;
    try {
      await callWorker('/heartbeat', { method: 'POST' });
    } catch (_) {
      // Silent: Jazz must remain usable even if the fallback service is offline.
    }
  }

  async function acknowledge() {
    try {
      await callWorker('/ack', { method: 'POST' });
      toast('You are checked in. No WhatsApp fallback is needed today.');
      refreshStatus();
    } catch (error) {
      toast(error.message);
    }
  }

  function setupWorker() {
    const current = workerUrl();
    const value = prompt('Paste your Jazz WhatsApp Worker URL here:', current || 'https://');
    if (value === null) return;
    const cleaned = value.trim().replace(/\/$/, '');
    if (!/^https:\/\//i.test(cleaned)) {
      toast('Please paste a secure https:// Worker URL.');
      return;
    }
    localStorage.setItem(WORKER_KEY, cleaned);
    toast('WhatsApp fallback service saved on this device.');
    heartbeat();
    refreshStatus();
  }

  async function refreshStatus() {
    const statusText = $('#waFallbackStatus');
    const connectButton = $('#waConnectButton');
    const detail = $('#waFallbackDetail');
    if (!statusText || !connectButton) return;

    if (!workerUrl()) {
      statusText.textContent = 'Not connected';
      connectButton.textContent = 'SET UP';
      if (detail) detail.textContent = 'Connect once to enable the 9:15 AM WhatsApp fallback.';
      return;
    }

    statusText.textContent = 'Checking…';
    connectButton.textContent = 'EDIT';
    try {
      const status = await callWorker('/status');
      statusText.textContent = status.ready ? 'Connected' : 'Setup incomplete';
      if (detail) {
        detail.textContent = status.ready
          ? '9:00 AM Jazz report • 9:15 AM WhatsApp only if Jazz has not seen you online.'
          : 'Worker found, but WhatsApp/KV secrets still need to be completed.';
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
        <div class="row"><span class="dot"></span><div><strong>9:00 AM</strong><small>Jazz daily report</small></div></div>
        <div class="row"><span class="dot"></span><div><strong>9:15 AM</strong><small>If Jazz has not seen you online, send a WhatsApp reminder.</small></div></div>
      </div>
      <button class="builder-go" id="waImHere" type="button">I'M HERE — NO WHATSAPP TODAY</button>
      <p class="honest">Your WhatsApp access token is never stored in this public website. It belongs only in the private backend secret store.</p>`;
    connections.appendChild(panel);
    $('#waImHere').addEventListener('click', acknowledge);
  }

  function bindReportCheckIn() {
    const reportButton = $('[data-act="report"]');
    if (!reportButton || reportButton.dataset.waBound) return;
    reportButton.dataset.waBound = 'true';
    reportButton.addEventListener('click', () => {
      if (workerUrl()) acknowledge();
    });
  }

  injectConnectionRow();
  bindReportCheckIn();
  refreshStatus();
  heartbeat();

  document.addEventListener('visibilitychange', heartbeat);
  window.addEventListener('focus', heartbeat);
  setInterval(heartbeat, 5 * 60 * 1000);
})();
