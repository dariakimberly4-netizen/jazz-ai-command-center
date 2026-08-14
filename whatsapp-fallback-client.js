/*
  Jazz AI WhatsApp fallback client
  Mobile greeting fix: ensure the first tap speaks a time-aware greeting on Android.
*/
(function () {
  'use strict';

  const URL_KEY = 'jazzWhatsAppFallbackUrl';
  const LAST_PING_KEY = 'jazzLastPresencePing';
  const REPORT_DAY_KEY = 'jazzDailyReportShown';
  const FIVE_MINUTES = 5 * 60 * 1000;

  const $ = (s) => document.querySelector(s);
  let startupReportToken = 0;

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

  function mobileSpeak(text) {
    if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
      if (typeof window.toast === 'function') window.toast('Spoken greeting is not supported by this browser.');
      return;
    }
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const voices = synth.getVoices();
    const voice = voices.find(v => /fil-PH|en-PH/i.test(v.lang) && !/male|Angelo/i.test(v.name))
      || voices.find(v => /female|Samantha|Zira|Rosa|Blessica/i.test(v.name))
      || voices.find(v => /fil-PH|en-PH|en-US|en-GB/i.test(v.lang))
      || voices[0];
    if (voice) { u.voice = voice; u.lang = voice.lang || 'en-PH'; }
    else u.lang = 'en-PH';
    u.rate = 0.9; u.pitch = 1.04; u.volume = 1;
    synth.resume();
    synth.speak(u);
  }

  function installMobileGreeting() {
    const orb = $('#orb');
    if (!orb) return;
    orb.onclick = function () {
      const home = $('#home');
      if (!home || home.classList.contains('deploying') || home.classList.contains('started')) return;
      home.classList.add('deploying');
      const greeting = `Good ${greetingPeriod()}, Kimmy.`;
      if (typeof window.toast === 'function') window.toast(greeting);
      const label = orb.querySelector('span');
      if (label) label.textContent = 'DEPLOYING AGENTS';
      document.querySelectorAll('.agent:not(.kimara)').forEach((agent, i) => setTimeout(() => agent.classList.add('deployed'), i * 170));
      mobileSpeak(`${greeting} Deploying all eleven agents now. They are ready for your instructions.`);
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
    };
  }

  function numberFrom(selector) {
    const n = Number(String($(selector)?.textContent || '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? n : 0;
  }

  function dashboardNumbers() {
    let systems = [];
    try { systems = JSON.parse(localStorage.getItem('jazzSystems') || '[]'); } catch (_) {}
    return { leads: numberFrom('#totalLeads'), hotLeads: numberFrom('#hotLeads'), followLeads: numberFrom('#followLeads'), activeSystems: systems.filter((s) => !/archived/i.test(String(s.status || ''))).length, approvals: [...document.querySelectorAll('#approvalList .row')].length };
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
    return fetch(cfg.endpoint, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload), keepalive: true }).then(() => true).catch(() => false);
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
      card.className = 'panel'; card.id = 'jazzStartupReportCard';
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
    if (typeof window.toast === 'function') window.toast('Jazz is giving you your report.');
    mobileSpeak(text);
  }

  function queueStartupReportAfterGreeting() {
    const token = ++startupReportToken;
    const wait = () => {
      if (token !== startupReportToken) return;
      if ('speechSynthesis' in window && window.speechSynthesis.speaking) return setTimeout(wait, 250);
      speakStartupReport();
    };
    setTimeout(wait, 700);
  }

  function showDailyReport() {
    const now = manilaParts();
    if (now.hour !== 9 || now.minute > 14 || document.visibilityState !== 'visible') return;
    if (localStorage.getItem(REPORT_DAY_KEY) === now.date) return;
    localStorage.setItem(REPORT_DAY_KEY, now.date);
    const text = reportText(); post('online-report', { report: text }); mobileSpeak(text);
  }

  function configure(url) {
    const clean = String(url || '').trim();
    if (!/^https:\/\/script\.google\.com\/macros\/s\//i.test(clean)) throw new Error('Use the HTTPS Apps Script web app URL.');
    let parsed; try { parsed = new URL(clean); } catch { throw new Error('Invalid connection URL.'); }
    const key = parsed.searchParams.get('key') || '';
    if (key.length < 12) throw new Error('The private connection URL must include ?key=YOUR_PRIVATE_KEY.');
    localStorage.setItem(URL_KEY, clean); heartbeat(); return status();
  }

  function disable() { localStorage.removeItem(URL_KEY); localStorage.removeItem(LAST_PING_KEY); return status(); }
  function status() { const cfg = configFromUrl(); return { configured: Boolean(cfg.endpoint && cfg.key), lastPresencePing: localStorage.getItem(LAST_PING_KEY) }; }

  window.JazzWhatsAppFallback = { configure, disable, heartbeat, status, showDailyReport, showStartupReport: speakStartupReport, queueStartupReportAfterGreeting };

  document.addEventListener('DOMContentLoaded', () => {
    installMobileGreeting();
    const orb = $('#orb'); if (orb) orb.addEventListener('click', queueStartupReportAfterGreeting);
    const reportButton = document.querySelector('[data-act="report"]'); if (reportButton) reportButton.onclick = () => speakStartupReport();
  });

  window.addEventListener('pageshow', () => { heartbeat(); setTimeout(showDailyReport, 700); });
  window.addEventListener('focus', () => { heartbeat(); showDailyReport(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { heartbeat(); showDailyReport(); } });
  setInterval(() => { if (document.visibilityState === 'visible') { heartbeat(); showDailyReport(); } }, FIVE_MINUTES);
  setTimeout(() => { heartbeat(); showDailyReport(); }, 1000);
})();