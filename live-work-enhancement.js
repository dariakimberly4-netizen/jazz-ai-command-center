/*
  JAZZ AI — REAL SYSTEM Live Work layer
  --------------------------------------
  Truthful rules:
  - Jazz never creates or labels a prototype as the finished result.
  - An approved plan is not a created system.
  - A REAL SYSTEM must have real files, a real data layer when needed,
    working features, testing, deployment, and a verified HTTPS URL.
  - Jazz only marks a system LIVE after that URL exists.
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
      '<div class="eyebrow">REAL SYSTEM STATUS</div>' +
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

  function button(id, label) {
    return '<button id="' + id + '" style="width:100%;min-height:66px;margin-top:12px;border:1px solid #d9bd7c;border-radius:18px;background:#34234f;color:#fff;font-weight:1000;font-size:1rem">' + esc(label) + '</button>';
  }

  function builderConnected() {
    return Boolean(window.JazzRealSystemBuilder && typeof window.JazzRealSystemBuilder.start === 'function');
  }

  function realWorkView(system) {
    var connected = builderConnected();
    var wl = el('workList');
    if (!wl || !system) return;

    wl.innerHTML =
      statusBanner(
        connected ? 'READY TO BUILD REAL SYSTEM' : 'REAL SYSTEM BUILDER NOT CONNECTED',
        connected
          ? 'Jazz is ready to create real files, data, features, tests and a deployed system.'
          : 'Jazz will not substitute a prototype. Connect the secure Real System Builder before building.',
        false
      ) +
      step('Understanding request', system.idea || system.name || 'Approved system request', 'done') +
      step('Planning system', 'Specification approved and saved', 'done') +
      step('Creating real application files', connected ? 'Ready to start' : 'Waiting for secure Real System Builder', 'pending') +
      step('Creating real data layer', connected ? 'Runs when the build starts' : 'Waiting for secure Real System Builder', 'pending') +
      step('Connecting real features', connected ? 'Runs when the build starts' : 'Waiting for secure Real System Builder', 'pending') +
      step('Testing real system', 'Must pass before deployment', 'pending') +
      step('Deploying', 'Must produce a verified HTTPS URL before Jazz says LIVE', 'pending') +
      (connected ? button('jazzBuildRealSystem', 'BUILD REAL SYSTEM NOW') : button('jazzConnectRealBuilder', 'CONNECT REAL SYSTEM BUILDER'));

    var build = el('jazzBuildRealSystem');
    if (build) {
      build.onclick = function () {
        build.disabled = true;
        build.textContent = 'BUILDING REAL SYSTEM…';
        system.status = 'BUILDING — real system';
        system.updated = new Date().toLocaleDateString();
        if (typeof saveSystems === 'function') saveSystems();

        window.JazzRealSystemBuilder.start(system, {
          onStage: function (stage, detail) {
            if (typeof toast === 'function') toast(stage + ': ' + detail);
          },
          onLive: function (url) {
            window.JazzBuildStatus.markLive(system.id, url);
            realWorkView(system);
          },
          onError: function (message) {
            system.status = 'BUILD ERROR — needs attention';
            if (typeof saveSystems === 'function') saveSystems();
            realWorkView(system);
            if (typeof toast === 'function') toast(message || 'Real system build failed.');
          }
        });
      };
    }

    var connect = el('jazzConnectRealBuilder');
    if (connect) {
      connect.onclick = function () {
        if (typeof nav === 'function') nav('connections');
        if (typeof toast === 'function') toast('Connect the secure Real System Builder. Jazz will not build a prototype.');
      };
    }
  }

  function migrateOldStatuses() {
    if (typeof systems === 'undefined' || !Array.isArray(systems)) return;
    var changed = false;
    systems.forEach(function (s) {
      if (!s) return;
      if (s.live) {
        if (s.status !== 'LIVE — real system deployed') {
          s.status = 'LIVE — real system deployed';
          changed = true;
        }
        return;
      }
      if (/prototype|approved|ready to build|build approved/i.test(String(s.status || ''))) {
        s.status = 'NOT CREATED — real builder required';
        delete s.prototype;
        changed = true;
      }
    });
    if (changed && typeof saveSystems === 'function') saveSystems();
  }

  function enhancedApprove(event) {
    if (typeof draftSystem === 'undefined' || !draftSystem) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    draftSystem.status = builderConnected() ? 'READY — real system build' : 'NOT CREATED — real builder required';
    draftSystem.live = draftSystem.live || '';
    draftSystem.updated = new Date().toLocaleDateString();
    systems.unshift(draftSystem);
    if (typeof saveSystems === 'function') saveSystems();

    var system = draftSystem;
    draftSystem = null;

    var spec = el('specBox');
    if (spec) {
      spec.innerHTML = '<div class="spec"><div class="eyebrow">PLAN APPROVED</div><h3>REAL SYSTEM ONLY</h3><p>Jazz will create the actual working system, not a prototype.</p><p class="honest">It will only be marked LIVE after deployment returns a real verified HTTPS link.</p></div>';
    }

    if (typeof nav === 'function') nav('work');
    realWorkView(system);
    if (typeof speak === 'function') speak('Approved. Jazz will build a real system only. I will not call a prototype finished.');
  }

  document.addEventListener('click', function (event) {
    var target = event.target && event.target.closest ? event.target.closest('#approveBuild') : null;
    if (!target) return;
    enhancedApprove(event);
  }, true);

  window.systemNotice = function (i) {
    var s = systems[i];
    if (s && s.live) {
      window.open(s.live, '_blank', 'noopener');
      return;
    }
    if (s) realWorkView(s);
    if (typeof nav === 'function') nav('work');
    if (typeof toast === 'function') toast('NOT LIVE YET — Jazz requires a real deployed system and verified URL.');
  };

  window.JazzBuildStatus = {
    isCreated: function (system) { return Boolean(system && /^https:\/\//i.test(String(system.live || ''))); },
    markLive: function (systemId, url) {
      var clean = String(url || '').trim();
      if (!/^https:\/\//i.test(clean)) throw new Error('A verified HTTPS deployment URL is required.');
      var found = systems.find(function (s) { return String(s.id) === String(systemId); });
      if (!found) throw new Error('System not found.');
      found.live = clean;
      found.status = 'LIVE — real system deployed';
      found.updated = new Date().toLocaleDateString();
      if (typeof saveSystems === 'function') saveSystems();
      if (typeof toast === 'function') toast('REAL SYSTEM VERIFIED LIVE.');
      return found;
    },
    show: function (systemId) {
      var found = systems.find(function (s) { return String(s.id) === String(systemId); });
      if (found) realWorkView(found);
    }
  };

  migrateOldStatuses();
})();
