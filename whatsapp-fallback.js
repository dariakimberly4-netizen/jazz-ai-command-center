/* JAZZ AI — WhatsApp fallback client
   Keeps Meta credentials OUT of the public GitHub Pages app.
   The only values stored in this browser are the private Apps Script endpoint,
   a device key, and the recipient number for display/configuration.
*/
(() => {
  'use strict';

  const STORE = {
    endpoint: 'jazzWaEndpoint',
    key: 'jazzWaDeviceKey',
    recipient: 'jazzWaRecipient',
    enabled: 'jazzWaEnabled',
    shown: 'jazzDailyReportShown',
    ack: 'jazzDailyReportAck'
  };

  const qs = (s, root = document) => root.querySelector(s);
  const get = k => localStorage.getItem(k) || '';
  const enabled = () => get(STORE.enabled) === 'true';
  const configured = () => Boolean(get(STORE.endpoint) && get(STORE.key) && get(STORE.recipient));

  function phDate(d = new Date()) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(d);
  }

  function phParts(d = new Date()) {
    const p = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Manila', hour12: false,
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).formatToParts(d).reduce((o, x) => (o[x.type] = x.value, o), {});
    return { hour: Number(p.hour), minute: Number(p.minute), second: Number(p.second) };
  }

  function cleanEndpoint(v) {
    v = String(v || '').trim();
    return /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec(?:\?.*)?$/.test(v) ? v : '';
  }

  function cleanPhone(v) {
    return String(v || '').replace(/[^0-9]/g, '');
  }

  function notify(text) {
    if (typeof window.toast === 'function') window.toast(text);
    else alert(text);
  }

  function backend(action, extra = {}) {
    if (!configured()) return Promise.resolve(false);
    const body = {
      action,
      key: get(STORE.key),
      recipient: cleanPhone(get(STORE.recipient)),
      page: location.href,
      clientDate: phDate(),
      ...extra
    };
    // no-cors is intentional. Apps Script receives the request while secrets remain server-side.
    return fetch(get(STORE.endpoint), {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      keepalive: true
    }).then(() => true).catch(() => false);
  }

  function heartbeat() {
    if (!enabled() || !configured() || document.visibilityState !== 'visible') return;
    backend('heartbeat', { visible: true, at: new Date().toISOString() });
  }

  function reportText() {
    const total = qs('#totalLeads')?.textContent?.trim() || '—';
    const hot = qs('#hotLeads')?.textContent?.trim() || '—';
    const follow = qs('#followLeads')?.textContent?.trim() || '—';
    return `Good morning, Kimmy. Here is your Jazz 9 AM report. Lead and CRM has ${total} leads, ${hot} marked Hot, and ${follow} needing follow-up. Your priority is to review urgent follow-ups and approvals first. Open Live Work for active tasks. If connected services are not yet authorized, Jazz will never invent email, calendar, or Drive results.`;
  }

  function showDailyReport() {
    const today = phDate();
    if (get(STORE.shown) === today) return;
    const { hour, minute } = phParts();
    if (hour !== 9 || minute > 14) return;

    const home = qs('#home');
    if (!home) return;
    localStorage.setItem(STORE.shown, today);

    const old = qs('#jazzDailyReportCard');
    if (old) old.remove();
    const card = document.createElement('div');
    card.className = 'panel';
    card.id = 'jazzDailyReportCard';
    card.innerHTML = `
      <div class="eyebrow">9:00 AM DAILY REPORT</div>
      <h2>Good morning, Kimmy</h2>
      <p id="jazzDailyReportText"></p>
      <div class="approve-actions">
        <button class="yes" id="jazzReportAck">GOT IT</button>
        <button id="jazzOpenWork">LIVE WORK</button>
      </div>`;
    const firstPanel = home.querySelector('.panel');
    home.insertBefore(card, firstPanel || null);
    qs('#jazzDailyReportText').textContent = reportText();

    qs('#jazzReportAck').onclick = () => {
      localStorage.setItem(STORE.ack, today);
      backend('ack', { report: reportText() });
      card.remove();
      notify('Daily report acknowledged.');
    };
    qs('#jazzOpenWork').onclick = () => {
      if (typeof window.nav === 'function') window.nav('work');
      else location.hash = '#work';
    };

    backend('online-report', { report: reportText() });
    if (typeof window.speak === 'function') window.speak(reportText());
  }

  function connectionRow() {
    const connections = qs('#connections .list');
    if (!connections || qs('#waConnectionRow')) return;
    const row = document.createElement('div');
    row.className = 'row';
    row.id = 'waConnectionRow';
    row.innerHTML = `
      <span class="dot"></span>
      <div><strong>WhatsApp Fallback</strong><small id="waConnectionStatus">${configured() && enabled() ? 'Ready for 9:15 fallback' : 'Setup required'}</small></div>
      <button id="waSetupBtn">SET UP</button>`;
    connections.appendChild(row);
    qs('#waSetupBtn').onclick = openSettings;
  }

  function openSettings() {
    const section = qs('#connections .panel');
    if (!section) return;
    qs('#waSettings')?.remove();
    const box = document.createElement('div');
    box.className = 'spec';
    box.id = 'waSettings';
    box.innerHTML = `
      <div class="eyebrow">WHATSAPP FALLBACK</div>
      <h3>9:00 AM report → WhatsApp if offline</h3>
      <p class="honest">Jazz never stores your Meta access token in this public website. The token stays inside your private Google Apps Script properties.</p>
      <label class="wa-label">Your WhatsApp number</label>
      <input class="search" id="waRecipient" inputmode="tel" autocomplete="tel" placeholder="Example: 639XXXXXXXXX" value="${cleanPhone(get(STORE.recipient))}">
      <label class="wa-label">Private Apps Script Web App URL</label>
      <input class="search" id="waEndpoint" inputmode="url" placeholder="https://script.google.com/macros/s/.../exec" value="${get(STORE.endpoint).replace(/\"/g, '&quot;')}">
      <label class="wa-label">Private device key</label>
      <input class="search" id="waDeviceKey" type="password" autocomplete="off" placeholder="Paste the same key used in Apps Script" value="${get(STORE.key).replace(/\"/g, '&quot;')}">
      <div class="toggle">
        <p><strong>WhatsApp fallback</strong><br><small>At about 9:15 AM Manila time, the backend checks whether Jazz saw you online during the 9:00–9:14 report window.</small></p>
        <button id="waToggle" class="${enabled() ? '' : 'off'}">${enabled() ? 'ON' : 'OFF'}</button>
      </div>
      <div class="approve-actions">
        <button class="yes" id="waSave">SAVE</button>
        <button id="waTest">TEST</button>
        <button class="cancel" id="waClose">CLOSE</button>
      </div>
      <p><small>Setup file in this repository: <strong>WHATSAPP_SETUP.md</strong></small></p>`;
    section.appendChild(box);

    qs('#waToggle').onclick = e => {
      const on = e.currentTarget.classList.toggle('off') === false;
      e.currentTarget.textContent = on ? 'ON' : 'OFF';
    };
    qs('#waClose').onclick = () => box.remove();
    qs('#waSave').onclick = () => {
      const endpoint = cleanEndpoint(qs('#waEndpoint').value);
      const phone = cleanPhone(qs('#waRecipient').value);
      const key = qs('#waDeviceKey').value.trim();
      const on = !qs('#waToggle').classList.contains('off');
      if (!endpoint) return notify('Paste the Apps Script Web App URL ending in /exec.');
      if (phone.length < 10) return notify('Enter your WhatsApp number with country code, digits only.');
      if (key.length < 12) return notify('Use a private device key of at least 12 characters.');
      localStorage.setItem(STORE.endpoint, endpoint);
      localStorage.setItem(STORE.recipient, phone);
      localStorage.setItem(STORE.key, key);
      localStorage.setItem(STORE.enabled, String(on));
      qs('#waConnectionStatus').textContent = on ? 'Ready for 9:15 fallback' : 'Configured — fallback OFF';
      notify('WhatsApp fallback settings saved on this device.');
      heartbeat();
    };
    qs('#waTest').onclick = () => {
      if (!configured()) return notify('Save the WhatsApp settings first.');
      backend('test', { report: reportText() });
      notify('Test request sent. Check WhatsApp in a moment.');
    };
  }

  function installStyles() {
    const st = document.createElement('style');
    st.textContent = `
      .wa-label{display:block;margin:14px 0 2px;color:var(--ivory);font-weight:900}
      #waSettings .search{margin-top:6px}
      #waConnectionRow .dot{background:#69e7b4;box-shadow:0 0 12px #69e7b4}
      #jazzDailyReportCard{border-color:rgba(217,189,124,.55);box-shadow:0 0 30px rgba(217,189,124,.10)}
    `;
    document.head.appendChild(st);
  }

  function boot() {
    installStyles();
    connectionRow();
    heartbeat();
    showDailyReport();
    setInterval(() => { heartbeat(); showDailyReport(); }, 60000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { heartbeat(); showDailyReport(); } });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
