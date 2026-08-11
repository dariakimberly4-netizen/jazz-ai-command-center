(() => {
  const STORAGE_KEY = 'jazzPresenceUrl';
  const LAST_PING_KEY = 'jazzLastPresencePing';
  const connections = document.querySelector('#connections .list');
  if (!connections) return;

  const row = document.createElement('div');
  row.className = 'row';
  row.innerHTML = `
    <span class="dot"></span>
    <div>
      <strong>WhatsApp Fallback</strong>
      <small id="waFallbackStatus">Setup required • 9:15 AM fallback</small>
    </div>
    <button id="waFallbackSetup">SET UP</button>`;
  connections.appendChild(row);

  const panel = document.querySelector('#connections .panel');
  const setup = document.createElement('div');
  setup.id = 'waFallbackBox';
  setup.className = 'spec hidden';
  setup.innerHTML = `
    <div class="eyebrow">DAILY REPORT FALLBACK</div>
    <h3>WhatsApp at 9:15 AM</h3>
    <p>If Jazz has not seen you online after the 9:00 AM report, the secure GitHub workflow can send your approved WhatsApp report template.</p>
    <p class="honest">Your WhatsApp token is never stored in this page. It belongs only in GitHub Actions Secrets.</p>
    <label for="jazzPresenceUrl"><strong>Presence endpoint</strong></label>
    <input class="search" id="jazzPresenceUrl" type="url" inputmode="url" autocomplete="off" placeholder="Paste your private Apps Script web-app URL">
    <div class="approve-actions">
      <button class="yes" id="savePresenceUrl">SAVE</button>
      <button id="testPresenceUrl">TEST</button>
      <button class="cancel" id="closePresenceSetup">CLOSE</button>
    </div>
    <p><small>After this is saved, Jazz quietly checks in while this page is open. The scheduled workflow uses the same endpoint to decide whether WhatsApp is needed.</small></p>`;
  panel.appendChild(setup);

  const status = document.querySelector('#waFallbackStatus');
  const input = document.querySelector('#jazzPresenceUrl');

  function endpoint() {
    return (localStorage.getItem(STORAGE_KEY) || '').trim();
  }

  function withAction(url, action) {
    const joiner = url.includes('?') ? '&' : '?';
    return `${url}${joiner}action=${encodeURIComponent(action)}&_=${Date.now()}`;
  }

  function refreshStatus() {
    if (!endpoint()) {
      status.textContent = 'Setup required • 9:15 AM fallback';
      return;
    }
    const last = localStorage.getItem(LAST_PING_KEY);
    status.textContent = last
      ? `Presence ready • last check ${new Date(last).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}`
      : 'Presence ready • waiting for first check';
  }

  async function pingPresence(showResult = false) {
    const url = endpoint();
    if (!url || document.visibilityState === 'hidden') return false;
    try {
      await fetch(withAction(url, 'ping'), { method: 'GET', mode: 'no-cors', cache: 'no-store' });
      const now = new Date().toISOString();
      localStorage.setItem(LAST_PING_KEY, now);
      refreshStatus();
      if (showResult && typeof toast === 'function') toast('Jazz presence check sent.');
      return true;
    } catch (error) {
      if (showResult && typeof toast === 'function') toast('Presence check failed. Please verify the web-app URL.');
      return false;
    }
  }

  document.querySelector('#waFallbackSetup').onclick = () => {
    input.value = endpoint();
    setup.classList.remove('hidden');
    setup.scrollIntoView({ behavior: document.body.classList.contains('reduce') ? 'auto' : 'smooth', block: 'center' });
  };

  document.querySelector('#closePresenceSetup').onclick = () => setup.classList.add('hidden');

  document.querySelector('#savePresenceUrl').onclick = async () => {
    const value = input.value.trim();
    if (!/^https:\/\//i.test(value)) {
      if (typeof toast === 'function') toast('Please paste a secure https:// web-app URL.');
      return;
    }
    localStorage.setItem(STORAGE_KEY, value);
    refreshStatus();
    await pingPresence(true);
  };

  document.querySelector('#testPresenceUrl').onclick = async () => {
    const typed = input.value.trim();
    if (typed && typed !== endpoint()) localStorage.setItem(STORAGE_KEY, typed);
    refreshStatus();
    await pingPresence(true);
  };

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') pingPresence(false);
  });
  window.addEventListener('focus', () => pingPresence(false));
  document.querySelector('#orb')?.addEventListener('click', () => pingPresence(false));

  refreshStatus();
  pingPresence(false);
  setInterval(() => pingPresence(false), 4 * 60 * 1000);
})();
