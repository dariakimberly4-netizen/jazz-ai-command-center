/*
  Jazz AI WhatsApp fallback client
  Reliable mobile greeting: prerecorded audio selected by Manila time.
*/
(function () {
  'use strict';

  const URL_KEY = 'jazzWhatsAppFallbackUrl';
  const LAST_PING_KEY = 'jazzLastPresencePing';
  const REPORT_DAY_KEY = 'jazzDailyReportShown';
  const FIVE_MINUTES = 5 * 60 * 1000;
  const $ = (s) => document.querySelector(s);
  let startupReportToken = 0;
  let greetingInstalled = false;

  const GREETING_AUDIO = {
    morning: 'https://storage.googleapis.com/adm--audio-playback--7d--public/mcp-preview/2a647350-0fc4-4b14-b2c9-798e4d61cc35.mp3',
    afternoon: 'https://storage.googleapis.com/adm--audio-playback--7d--public/mcp-preview/00da388c-39a0-4cc3-9724-b15c16bf75b7.mp3',
    evening: 'https://storage.googleapis.com/adm--audio-playback--7d--public/mcp-preview/52d393ef-02b5-4470-a2fa-e6ba21cd1b7d.mp3'
  };

  function backendUrl() { return localStorage.getItem(URL_KEY) || ''; }

  function configFromUrl() {
    const value = backendUrl();
    if (!value) return { endpoint: '', key: '' };
    try {
      const u = new URL(value);
      const key = u.searchParams.get('key') || '';
      u.searchParams.delete('key');
      return { endpoint: u.toString(), key };
    } catch { return { endpoint: '', key: '' }; }
  }

  function manilaParts(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(date);
    const get = (type) => parts.find((p) => p.type === type)?.value || '';
    return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')), minute: Number(get('minute')) };
  }

  function greetingPeriod() {
    const h = manilaParts().hour;
    return h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
  }

  function playGreetingAudio() {
    const period = greetingPeriod();
    const audio = new Audio(GREETING_AUDIO[period]);
    audio.preload = 'auto';
    audio.volume = 1;
    window.__jazzGreetingAudio = audio;
    const p = audio.play();
    if (p && typeof p.catch === 'function') {
      p.catch(() => {
        if (typeof window.toast === 'function') window.toast('Tap Jazz once more to play the greeting.');
      });
    }
    return audio;
  }

  function deployInterface() {
    const home = $('#home');
    const orb = $('#orb');
    if (!home || !orb) return;
    if (home.classList.contains('started') || home.classList.contains('deploying')) return;
    home.classList.add('deploying');
    const period = greetingPeriod();
    if (typeof window.toast === 'function') window.toast(`Good ${period}, Kimmy.`);
    const label = orb.querySelector('span');
    if (label) label.textContent = 'DEPLOYING AGENTS';
    document.querySelectorAll('.agent:not(.kimara)').forEach((agent, i) => {
      setTimeout(() => agent.classList.add('deployed'), i * 170);
    });
    playGreetingAudio();
    const reduce = document.body.classList.contains('reduce');
    const count = document.querySelectorAll('.agent:not(.kimara)').length;
    const delay = reduce ? 0 : (count * 170 + 450);
    setTimeout(() => {
      home.classList.remove('deploying');
      home.classList.add('agents-ready', 'started');
      document.body.classList.add('command-open');
      if (label) label.textContent = 'COMMAND CENTER';
      window.scrollTo({ top: 0, behavior: 'auto' });
    }, delay);
  }

  function installReliableGreeting() {
    const orb = $('#orb');
    if (!orb || greetingInstalled) return;
    greetingInstalled = true;
    orb.addEventListener('click', function (event) {
      const home = $('#home');
      if (home && !home.classList.contains('started') && !home.classList.contains('deploying')) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        deployInterface();
        queueStartupReportAfterGreeting();
      }
    }, true);
  }

  function numberFrom(selector) {
    const n = Number(String($(selector)?.textContent || '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? n : 0;
  }

  function dashboardNumbers() {
    let systems = [];
    try { systems = JSON.parse(localStorage.getItem('jazzSystems') || '[]'); } catch (_) {}
    return {
      leads: numberFrom('#totalLeads'),
      hotLeads: numberFrom('#hotLeads'),
      followLeads: numberFrom('#followLeads'),
      activeSystems: systems.filter((s) => !/archived/i.test(String(s.status || ''))).length,
      approvals: [...document.querySelectorAll('#approvalList .row')].length
    };
  }

  function reportText() {
    const d = dashboardNumbers();
    return `Good morning, Kimmy. Here is your Jazz 9 AM report. You have ${d.leads} leads, ${d.hotLeads} hot leads, ${d.followLeads} needing follow-up, ${d.activeSystems} active systems, and ${d.approvals} approvals waiting. Review urgent follow-ups and approvals first.`;
  }

  function startupReportText() {
    const d = dashboardNumbers();
    return `Here is your report, Kimmy. You currently have ${d.leads} leads, ${d.hotLeads} hot leads, ${d.followLeads} needing follow-up, ${d.activeSystems} active systems, and ${d.approvals} approvals waiting. Your first priority is to review urgent follow-ups and anything waiting for your approval. I am ready for your next instruction.`;
  }

  function post(action, extra = {}) {
    const cfg = configFromUrl();
    if (!cfg.endpoint || !cfg.key) return Promise.resolve(false);
    const payload = { action, key: cfg.key, source: 'jazz-ai-command-center', at: new Date().toISOString(), ...extra };
    return fetch(cfg.endpoint, {
      method: 'POST', mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload), keepalive: true
    }).then(() => true).catch(() => false);
  }

  function heartbeat() {
    if (document.visibilityState !== 'visible') return false;
    const cfg = configFromUrl();
    if (!cfg.endpoint || !cfg.key) return false;
    const at = new Date().toISOString();
    post('heartbeat', { report: reportText() });
    localStorage.setItem(LAST_PING_KEY, at);
    return true;
  }

  function showReportCard(text, eyebrow = 'JAZZ REPORT') {
    const home = $('#home');
    if (!home) return;
    let card = $('#jazzStartupReportCard');
    if (!card) {
      card = document.createElement('div');
      card.className = 'panel';
      card.id = 'jazzStartupReportCard';
      card.innerHTML = `<div class="eyebrow" id="jazzStartupReportEyebrow"></div><h2>Your report, Kimmy</h2><p id="jazzStartupReportText"></p><div class="approve-actions"><button class="yes" id="jazzStartupReportGotIt">GOT IT</button><button id="jazzStartupReportLiveWork">LIVE WORK</button></div>`;
      home.insertBefore(card, home.querySelector('.panel') || null);
      $('#jazzStartupReportGotIt').onclick = () => card.remove();
      $('#jazzStartupReportLiveWork').onclick = () => { if (typeof window.nav === 'function') window.nav('work'); };
    }
    $('#jazzStartupReportEyebrow').textContent = eyebrow;
    $('#jazzStartupReportText').textContent = text;
  }

  function speakStartupReport() {
    const text = startupReportText();
    showReportCard(text, 'AUTOMATIC JAZZ REPORT');
    post('startup-report', { report: text });
    if (typeof window.toast === 'function') window.toast('Jazz report is ready.');
  }

  function queueStartupReportAfterGreeting() {
    const token = ++startupReportToken;
    const audio = window.__jazzGreetingAudio;
    if (audio) {
      const finish = () => {
        if (token !== startupReportToken) return;
        audio.removeEventListener('ended', finish);
        speakStartupReport();
      };
      audio.addEventListener('ended', finish);
      setTimeout(() => {
        if (token === startupReportToken && audio.ended) finish();
      }, 700);
      return;
    }
    setTimeout(() => { if (token === startupReportToken) speakStartupReport(); }, 1200);
  }

  function showDailyReport() {
    const now = manilaParts();
    if (now.hour !== 9 || now.minute > 14 || document.visibilityState !== 'visible') return;
    if (localStorage.getItem(REPORT_DAY_KEY) === now.date) return;
    localStorage.setItem(REPORT_DAY_KEY, now.date);
    const text = reportText();
    post('online-report', { report: text });
    showReportCard(text, '9:00 AM DAILY REPORT');
  }

  function configure(url) {
    const clean = String(url || '').trim();
    if (!/^https:\/\/script\.google\.com\/macros\/s\//i.test(clean)) throw new Error('Use the HTTPS Apps Script web app URL.');
    let parsed;
    try { parsed = new URL(clean); } catch { throw new Error('Invalid connection URL.'); }
    const key = parsed.searchParams.get('key') || '';
    if (key.length < 12) throw new Error('The private connection URL must include ?key=YOUR_PRIVATE_KEY.');
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
    const cfg = configFromUrl();
    return { configured: Boolean(cfg.endpoint && cfg.key), lastPresencePing: localStorage.getItem(LAST_PING_KEY) };
  }

  window.JazzWhatsAppFallback = {
    configure, disable, heartbeat, status, showDailyReport,
    showStartupReport: speakStartupReport,
    queueStartupReportAfterGreeting
  };

  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(installReliableGreeting, 0);
    const reportButton = document.querySelector('[data-act="report"]');
    if (reportButton) reportButton.onclick = () => speakStartupReport();
  });
  window.addEventListener('load', installReliableGreeting);
  window.addEventListener('pageshow', () => {
    installReliableGreeting();
    heartbeat();
    setTimeout(showDailyReport, 700);
  });
  window.addEventListener('focus', () => { heartbeat(); showDailyReport(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { heartbeat(); showDailyReport(); }
  });
  setInterval(() => {
    if (document.visibilityState === 'visible') { heartbeat(); showDailyReport(); }
  }, FIVE_MINUTES);
  setTimeout(() => { heartbeat(); showDailyReport(); }, 1000);
})();