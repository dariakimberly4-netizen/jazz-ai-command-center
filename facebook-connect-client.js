/*
  Jazz AI — Facebook Page connector (safe client)
  ------------------------------------------------
  This public GitHub Pages file NEVER stores Meta app secrets or Page tokens.
  It reuses Jazz's private Google Apps Script connection URL already saved on
  the device for WhatsApp fallback. The backend performs Meta OAuth and stores
  Facebook credentials in Apps Script Script Properties.
*/
(function () {
  'use strict';

  const BACKEND_URL_KEY = 'jazzWhatsAppFallbackUrl';
  const CONNECTED_KEY = 'jazzFacebookPageConnected';
  const PAGE_NAME_KEY = 'jazzFacebookPageName';

  const $ = (s) => document.querySelector(s);

  function toast(message) {
    if (typeof window.toast === 'function') window.toast(message);
    else console.info(message);
  }

  function backendConfig() {
    const raw = localStorage.getItem(BACKEND_URL_KEY) || '';
    if (!raw) return { endpoint: '', key: '' };
    try {
      const url = new URL(raw);
      const key = url.searchParams.get('key') || '';
      url.searchParams.delete('key');
      return { endpoint: url.toString(), key };
    } catch (_) {
      return { endpoint: '', key: '' };
    }
  }

  function consumeFacebookReturn() {
    const url = new URL(window.location.href);
    const state = url.searchParams.get('facebook');
    if (state === 'connected') {
      const pageName = url.searchParams.get('fb_page') || 'Facebook Page';
      localStorage.setItem(CONNECTED_KEY, 'true');
      localStorage.setItem(PAGE_NAME_KEY, pageName);
      url.searchParams.delete('facebook');
      url.searchParams.delete('fb_page');
      history.replaceState({}, document.title, url.pathname + url.search + url.hash);
      setTimeout(() => toast('Facebook Page connected to Jazz.'), 250);
    } else if (state === 'error') {
      url.searchParams.delete('facebook');
      url.searchParams.delete('fb_page');
      history.replaceState({}, document.title, url.pathname + url.search + url.hash);
      setTimeout(() => toast('Facebook connection was not completed.'), 250);
    }
  }

  function refreshRow() {
    const status = $('#fbPageStatus');
    const button = $('#fbPageBtn');
    if (!status || !button) return;

    const cfg = backendConfig();
    const connected = localStorage.getItem(CONNECTED_KEY) === 'true';
    const pageName = localStorage.getItem(PAGE_NAME_KEY) || 'Facebook Page';

    if (connected) {
      status.textContent = 'Connected • ' + pageName;
      button.textContent = 'RECONNECT';
    } else if (!cfg.endpoint || !cfg.key) {
      status.textContent = 'Secure backend setup required';
      button.textContent = 'SET UP';
    } else {
      status.textContent = 'Ready to authorize securely';
      button.textContent = 'CONNECT';
    }
  }

  function startFacebookConnection() {
    const cfg = backendConfig();
    if (!cfg.endpoint || !cfg.key) {
      const waButton = $('#waFallbackBtn');
      if (waButton) {
        toast('Set up Jazz secure backend once, then tap Facebook again.');
        waButton.click();
        return;
      }
      toast('Jazz secure backend is not configured yet.');
      return;
    }

    const start = new URL(cfg.endpoint);
    start.searchParams.set('action', 'facebookStart');
    start.searchParams.set('key', cfg.key);
    window.location.assign(start.toString());
  }

  function ensureFacebookRow() {
    const connections = $('#connections .list');
    if (!connections || $('#fbPageConnectionRow')) return;

    const row = document.createElement('div');
    row.className = 'row';
    row.id = 'fbPageConnectionRow';
    row.innerHTML = `
      <span class="dot"></span>
      <div>
        <strong>Facebook Page</strong>
        <small id="fbPageStatus">Checking secure connection…</small>
      </div>
      <button id="fbPageBtn" type="button">CONNECT</button>`;

    const waButton = $('#waFallbackBtn');
    const waRow = waButton ? waButton.closest('.row') : null;
    if (waRow) connections.insertBefore(row, waRow);
    else connections.appendChild(row);

    $('#fbPageBtn').addEventListener('click', startFacebookConnection);
    refreshRow();
  }

  function init() {
    consumeFacebookReturn();
    ensureFacebookRow();
    refreshRow();
    window.addEventListener('storage', refreshRow);
  }

  window.JazzFacebookPage = {
    connect: startFacebookConnection,
    refresh: refreshRow
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
