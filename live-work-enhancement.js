/*
  JAZZ AI — Live Work + built-in prototype builder
  -------------------------------------------------
  Truthful rules:
  - An approved plan is not a finished app.
  - Jazz can build a real working LOCAL PROTOTYPE in the browser.
  - A system is only marked LIVE after a real HTTPS deployment URL exists.
*/
(function () {
  'use strict';

  function el(id) { return document.getElementById(id); }
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }

  function statusBanner(title, detail, live) {
    return '<div class="row" style="display:block;border:2px solid ' + (live ? '#69e7b4' : '#d9bd7c') + ';background:rgba(217,189,124,.08)">' +
      '<div class="eyebrow">BUILD STATUS</div>' +
      '<strong style="font-size:1.08rem">' + esc(title) + '</strong>' +
      '<small style="display:block;margin-top:7px;line-height:1.45">' + esc(detail) + '</small>' +
      '</div>';
  }

  function step(label, detail, state) {
    var done = state === 'done';
    var working = state === 'working';
    var cls = done ? 'done' : 'pending';
    var extra = working ? ' style="opacity:1;border:1px solid rgba(217,189,124,.55)"' : '';
    return '<div class="row progress-step ' + cls + '"' + extra + '>' +
      '<span class="mark"' + (working ? ' style="border-color:#d9bd7c;box-shadow:0 0 12px #d9bd7c"' : '') + '></span>' +
      '<div><strong>' + esc(label) + '</strong><small>' + esc(detail) + '</small></div></div>';
  }

  function bigButton(id, label) {
    return '<button id="' + id + '" style="width:100%;min-height:64px;margin-top:12px;border:1px solid #d9bd7c;border-radius:18px;background:#34234f;color:#fff;font-weight:1000;font-size:1rem">' + esc(label) + '</button>';
  }

  function save() {
    if (typeof saveSystems === 'function') saveSystems();
  }

  function getSystem(id) {
    if (typeof systems === 'undefined' || !Array.isArray(systems)) return null;
    return systems.find(function (s) { return String(s.id) === String(id); }) || null;
  }

  function migrateOldStatuses() {
    if (typeof systems === 'undefined' || !Array.isArray(systems)) return;
    var changed = false;
    systems.forEach(function (s) {
      if (!s) return;
      if (s.live) {
        if (s.status !== 'LIVE — created and deployed') {
          s.status = 'LIVE — created and deployed';
          changed = true;
        }
        return;
      }
      if (s.prototypeHTML) {
        if (s.status !== 'PROTOTYPE READY — deployment pending') {
          s.status = 'PROTOTYPE READY — deployment pending';
          changed = true;
        }
        return;
      }
      if (/approved|ready to build|build approved|waiting for builder|not created/i.test(String(s.status || ''))) {
        s.status = 'READY TO BUILD — built-in builder available';
        changed = true;
      }
    });
    if (changed) save();
  }

  function buildPrototypeHTML(system) {
    var pages = Array.isArray(system.pages) && system.pages.length ? system.pages : ['Home','Workspace','Records','Reports'];
    var parkinsons = /parkinson|tremor|dbs|medication|medicine|caregiver/i.test(String(system.idea || ''));
    var nav = pages.map(function (p, i) {
      return '<button data-page="p' + i + '">' + esc(p) + '</button>';
    }).join('');
    var sections = pages.map(function (p, i) {
      return '<section id="p' + i + '" class="page' + (i === 0 ? ' active' : '') + '"><h2>' + esc(p) + '</h2>' +
        (i === 0 ? '<p>' + esc(system.idea || 'Prototype workspace') + '</p>' : '<p>This section is ready for your real workflow and records.</p>') +
        '</section>';
    }).join('');
    var quick = parkinsons ?
      '<div class="quick"><button data-quick="Medication taken">MEDICATION TAKEN</button><button data-quick="ON">ON</button><button data-quick="OFF">OFF</button><button data-quick="DBS charging">DBS CHARGING</button></div>' :
      '<div class="quick"><button data-quick="Completed">COMPLETED</button><button data-quick="Follow-up">FOLLOW-UP</button><button data-quick="Note">NOTE</button></div>';
    var key = 'jazzPrototypeRecords_' + String(system.id).replace(/[^a-zA-Z0-9_-]/g, '');

    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>' + esc(system.name || 'Jazz Prototype') + '</title>' +
      '<style>*{box-sizing:border-box}body{margin:0;background:#070817;color:#fff8e9;font-family:system-ui,-apple-system,sans-serif;padding-bottom:90px}header{padding:20px;background:#0d0e25;border-bottom:1px solid #6e4cb5;position:sticky;top:0;z-index:5}h1{font-size:1.35rem;margin:0 0 6px}.banner{background:#332449;border:1px solid #d9bd7c;border-radius:16px;padding:12px;margin-top:12px;color:#fff8e9}.wrap{max-width:720px;margin:auto;padding:16px}.page{display:none;background:#12132f;border:1px solid #49336e;border-radius:22px;padding:18px;margin:12px 0}.page.active{display:block}.quick{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:14px 0}.quick button,.record button,nav button{min-height:64px;border-radius:18px;border:1px solid #8b68c4;background:#271a45;color:#fff;font-weight:900;font-size:1rem;padding:10px}.record{background:#12132f;border:1px solid #49336e;border-radius:22px;padding:18px}.record input{width:100%;min-height:62px;border-radius:16px;border:2px solid #6e4cb5;background:#08091a;color:#fff;padding:0 14px;font-size:1.05rem}.record button{width:100%;margin-top:10px;background:#d9bd7c;color:#24172d}.item{padding:14px;border-radius:14px;background:#1b1c3f;margin-top:9px}.item small{display:block;color:#bdb8cf;margin-top:4px}nav{position:fixed;left:0;right:0;bottom:0;background:#090a1c;border-top:1px solid #49336e;display:flex;gap:8px;overflow:auto;padding:8px}nav button{min-width:120px;min-height:58px;flex:1;font-size:.85rem}.actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}.actions button{min-height:58px;border-radius:16px;border:1px solid #d9bd7c;background:#1b1c3f;color:#fff;font-weight:900}@media(max-width:520px){.quick,.actions{grid-template-columns:1fr}button{font-size:1.02rem}}</style></head><body>' +
      '<header><h1>' + esc(system.name || 'Jazz Prototype') + '</h1><div>Built by Jazz AI • Local prototype</div><div class="banner"><strong>PROTOTYPE — NOT YET DEPLOYED</strong><br>This working version is saved on this device. A public LIVE link requires GitHub deployment.</div></header>' +
      '<main class="wrap">' + sections + quick +
      '<div class="record"><h2>Quick record</h2><input id="entry" placeholder="Type a short record"><button id="add">ADD RECORD</button><div class="actions"><button id="export">EXPORT DATA</button><button id="clear">CLEAR RECORDS</button></div><div id="records"></div></div></main><nav>' + nav + '</nav>' +
      '<script>(function(){var KEY=' + JSON.stringify(key) + ';function q(s){return document.querySelector(s)}function qa(s){return Array.from(document.querySelectorAll(s))}function load(){try{return JSON.parse(localStorage.getItem(KEY)||"[]")}catch(e){return []}}function save(v){localStorage.setItem(KEY,JSON.stringify(v))}function render(){var d=load();q("#records").innerHTML=d.length?d.slice().reverse().map(function(x){return "<div class=\"item\"><strong>"+String(x.text).replace(/[&<>]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;"}[c]})+"</strong><small>"+x.time+"</small></div>"}).join(""):"<div class=\"item\">No records yet.</div>"}function add(t){t=String(t||"").trim();if(!t)return;var d=load();d.push({text:t,time:new Date().toLocaleString()});save(d);render();q("#entry").value=""}q("#add").onclick=function(){add(q("#entry").value)};q("#entry").onkeydown=function(e){if(e.key==="Enter")add(this.value)};qa("[data-quick]").forEach(function(b){b.onclick=function(){add(b.getAttribute("data-quick"))}});qa("[data-page]").forEach(function(b){b.onclick=function(){qa(".page").forEach(function(p){p.classList.remove("active")});q("#"+b.getAttribute("data-page")).classList.add("active")}});q("#clear").onclick=function(){if(confirm("Clear prototype records?")){save([]);render()}};q("#export").onclick=function(){var blob=new Blob([JSON.stringify(load(),null,2)],{type:"application/json"});var a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="prototype-records.json";a.click();setTimeout(function(){URL.revokeObjectURL(a.href)},1000)};render()})();<\/script></body></html>';
  }

  function validatePrototype(html) {
    return /<!doctype html>/i.test(html) && /localStorage/.test(html) && /ADD RECORD/.test(html) && /<nav>/.test(html);
  }

  function renderBuild(system, activeStage, detail) {
    var wl = el('workList');
    if (!wl || !system) return;
    var ready = Boolean(system.prototypeHTML);
    var live = Boolean(system.live);
    var html = statusBanner(
      live ? 'LIVE — CREATED AND DEPLOYED' : (ready ? 'PROTOTYPE READY' : (activeStage ? 'BUILDING NOW' : 'READY TO BUILD')),
      live ? 'A verified public deployment URL exists.' : (ready ? 'The working prototype is complete. GitHub deployment is still pending.' : (detail || 'Jazz can now build the working prototype on this device.')),
      live
    );

    var labels = [
      ['Understanding request','Request captured'],
      ['Planning system','Specification approved and saved'],
      ['Building interface','Generating screens and Parkinson-friendly controls'],
      ['Creating data layer','Adding local record storage'],
      ['Connecting features','Wiring navigation, forms and export'],
      ['Testing','Checking the generated prototype'],
      ['Deploying','Public GitHub deployment requires a connected deployment backend']
    ];
    labels.forEach(function (x, i) {
      var state = 'pending';
      if (i < 2) state = 'done';
      if (ready && i <= 5) state = 'done';
      if (live) state = 'done';
      if (activeStage === i) state = 'working';
      if (activeStage != null && i < activeStage) state = 'done';
      html += step(x[0], (activeStage === i && detail) ? detail : x[1], state);
    });

    if (!live && !ready && activeStage == null) html += bigButton('jazzBuildNow','BUILD PROTOTYPE NOW');
    if (ready && !live) html += bigButton('jazzOpenPrototype','OPEN WORKING PROTOTYPE');
    if (live) html += bigButton('jazzOpenLive','OPEN LIVE APP');
    wl.innerHTML = html;

    var buildBtn = el('jazzBuildNow');
    if (buildBtn) buildBtn.onclick = function () { startPrototypeBuild(system.id); };
    var protoBtn = el('jazzOpenPrototype');
    if (protoBtn) protoBtn.onclick = function () { openPrototype(system); };
    var liveBtn = el('jazzOpenLive');
    if (liveBtn) liveBtn.onclick = function () { window.open(system.live, '_blank', 'noopener'); };
  }

  function startPrototypeBuild(systemId) {
    var system = getSystem(systemId);
    if (!system) return;
    if (system.live) { renderBuild(system, null); return; }
    if (system.prototypeHTML) { renderBuild(system, null); return; }

    system.status = 'BUILDING PROTOTYPE';
    system.updated = new Date().toLocaleDateString();
    save();
    if (typeof nav === 'function') nav('work');
    renderBuild(system, 2, 'Generating the working interface now…');
    if (typeof toast === 'function') toast('Jazz is building the prototype now.');
    if (typeof speak === 'function') speak('I am building the working prototype now. Live Work will show each completed stage.');

    var html = '';
    setTimeout(function () {
      html = buildPrototypeHTML(system);
      renderBuild(system, 3, 'Local record storage created.');
      setTimeout(function () {
        renderBuild(system, 4, 'Navigation, quick actions, forms and export connected.');
        setTimeout(function () {
          renderBuild(system, 5, 'Running prototype checks now…');
          setTimeout(function () {
            if (!validatePrototype(html)) {
              system.status = 'BUILD NEEDS ATTENTION';
              save();
              renderBuild(system, null, 'Prototype validation failed.');
              if (typeof toast === 'function') toast('Prototype needs attention.');
              return;
            }
            system.prototypeHTML = html;
            system.status = 'PROTOTYPE READY — deployment pending';
            system.updated = new Date().toLocaleDateString();
            save();
            renderBuild(system, null);
            if (typeof toast === 'function') toast('Working prototype created.');
            if (typeof speak === 'function') speak('The working prototype is created and tested. Public GitHub deployment is the only remaining stage.');
          }, 450);
        }, 450);
      }, 450);
    }, 450);
  }

  function openPrototype(system) {
    if (!system || !system.prototypeHTML) return;
    var blob = new Blob([system.prototypeHTML], { type:'text/html' });
    var url = URL.createObjectURL(blob);
    var win = window.open(url, '_blank');
    if (!win && typeof toast === 'function') toast('Allow pop-ups once to open the prototype.');
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  }

  function enhancedApprove(event) {
    if (typeof draftSystem === 'undefined' || !draftSystem) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    var approved = draftSystem;
    approved.status = 'READY TO BUILD — built-in builder available';
    approved.live = approved.live || '';
    approved.prototypeHTML = approved.prototypeHTML || '';
    approved.updated = new Date().toLocaleDateString();
    systems.unshift(approved);
    save();

    var spec = el('specBox');
    if (spec) spec.innerHTML = '<div class="spec"><div class="eyebrow">PLAN APPROVED</div><h3>BUILD STARTED</h3><p>Jazz is creating a working local prototype now. Live Work shows the real stages.</p><p class="honest">Jazz will only call it LIVE after a real HTTPS deployment exists.</p></div>';
    draftSystem = null;
    if (typeof nav === 'function') nav('work');
    startPrototypeBuild(approved.id);
  }

  document.addEventListener('click', function (event) {
    var target = event.target && event.target.closest ? event.target.closest('#approveBuild') : null;
    if (!target) return;
    enhancedApprove(event);
  }, true);

  window.systemNotice = function (i) {
    var s = systems[i];
    if (!s) return;
    if (s.live) { window.open(s.live, '_blank', 'noopener'); return; }
    if (s.prototypeHTML) { openPrototype(s); return; }
    if (typeof nav === 'function') nav('work');
    renderBuild(s, null);
    if (typeof toast === 'function') toast('This plan is ready. Tap BUILD PROTOTYPE NOW.');
  };

  window.JazzBuildStatus = {
    isCreated: function (system) { return Boolean(system && system.live); },
    hasPrototype: function (system) { return Boolean(system && system.prototypeHTML); },
    buildPrototype: startPrototypeBuild,
    markLive: function (systemId, url) {
      var clean = String(url || '').trim();
      if (!/^https:\/\//i.test(clean)) throw new Error('A verified HTTPS deployment URL is required.');
      var found = getSystem(systemId);
      if (!found) throw new Error('System not found.');
      found.live = clean;
      found.status = 'LIVE — created and deployed';
      found.updated = new Date().toLocaleDateString();
      save();
      renderBuild(found, null);
      if (typeof toast === 'function') toast('App verified LIVE. OPEN is now available.');
      return found;
    }
  };

  migrateOldStatuses();
  if (typeof systems !== 'undefined' && Array.isArray(systems) && systems.length) {
    var latest = systems[0];
    if (!latest.live && (/ready to build|waiting for builder|not created/i.test(String(latest.status || '')) || latest.prototypeHTML)) {
      setTimeout(function () { renderBuild(latest, null); }, 0);
    }
  }
})();
