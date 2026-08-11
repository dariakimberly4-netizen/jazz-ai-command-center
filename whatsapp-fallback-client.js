/*
  Jazz AI WhatsApp fallback presence client
  ----------------------------------------
  This file contains NO WhatsApp/Meta secrets.
  It only pings Kimmy's private fallback backend when Jazz is open/visible.

  Activate after deploying the private Google Apps Script backend:
    JazzWhatsAppFallback.configure('YOUR_APPS_SCRIPT_WEB_APP_URL?key=YOUR_PRIVATE_PRESENCE_KEY')

  The URL is stored only in this browser's localStorage and is not committed to GitHub.
*/
(function () {
  const URL_KEY = 'jazzWhatsAppFallbackUrl';
  const LAST_PING_KEY = 'jazzLastPresencePing';
  const FIVE_MINUTES = 5 * 60 * 1000;

  function backendUrl() {
    return localStorage.getItem(URL_KEY) || '';
  }

  function heartbeat() {
    const url = backendUrl();
    if (!url) return false;

    const at = new Date().toISOString();
    const payload = {
      action: 'heartbeat',
      source: 'jazz-ai-command-center',
      at
    };

    // no-cors lets the static GitHub Pages app signal Apps Script without
    // exposing or reading any protected response.
    fetch(url, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    }).catch(() => {});

    localStorage.setItem(LAST_PING_KEY, at);
    return true;
  }

  function configure(url) {
    const clean = String(url || '').trim();
    if (!/^https:\/\//i.test(clean)) {
      throw new Error('Use the HTTPS Apps Script web app URL.');
    }
    localStorage.setItem(URL_KEY, clean);
    heartbeat();
    return status();
  }

  function disable() {
    localStorage.removeItem(URL_KEY);
    localStorage.removeItem(LAST_PING_KEY);
    return status();
  }

  function status() {
    return {
      configured: Boolean(backendUrl()),
      lastPresencePing: localStorage.getItem(LAST_PING_KEY)
    };
  }

  window.JazzWhatsAppFallback = { configure, disable, heartbeat, status };

  window.addEventListener('pageshow', heartbeat);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') heartbeat();
  });
  setInterval(() => {
    if (document.visibilityState === 'visible') heartbeat();
  }, FIVE_MINUTES);

  heartbeat();
})();
