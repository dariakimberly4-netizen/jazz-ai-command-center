/*
  JAZZ AI — Live Work truth layer
  --------------------------------
  Approved plans are NOT treated as completed apps.
  Jazz opens Live Work immediately after approval and shows a clear status.
  A system counts as created/live only when it has a real deployment URL.
*/
(function () {
  'use strict';

  function el(id) { return document.getElementById(id); }

  function statusBanner(title, detail, live) {
    return '<div class="row" style="display:block;border:2px solid ' + (live ? '#69e7b4' : '#d9bd7c') + ';background:rgba(217,189,124,.08)">' +
      '<div class="eyebrow">BUILD STATUS</div>' +
      '<strong style="font-size:1.08rem">' + title + '</strong>' +
      '<small style="display:block;margin-top:7px;line-height:1.45">' + detail + '</small>' +
      '</div>';
  }

  function step(label, detail, done) {
    return '<div class="row progress-step ' + (done ? 'done' : 'pending') + '">' +
      '<span class="mark"></span><div><strong>' + label + '</strong><small>' + detail + '</small></div></div>';
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
      if (/approved|ready to build|build approved/i.test(String(s.status || ''))) {
        s.status = 'NOT CREATED — waiting for builder';
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

    draftSystem.status = 'NOT CREATED — waiting for builder';
    draftSystem.live = draftSystem.live || '';
    draftSystem.updated = new Date().toLocaleDateString();

    systems.unshift(draftSystem);
    saveSystems();

    var wl = el('workList');
    if (wl) {
      wl.innerHTML =
        statusBanner(
          'NOT CREATED YET',
          'Your plan is approved and saved. Jazz will only show LIVE when a real deployed app URL exists.',
          false
        ) +
        step('Understanding request', draftSystem.idea, true) +
        step('Planning system', 'Specification approved and saved', true) +
        step('Building interface', 'Waiting for a connected System Builder service', false) +
        step('Creating data layer', 'Waiting for a connected System Builder service', false) +
        step('Connecting features', 'Waiting for a connected System Builder service', false) +
        step('Testing', 'Starts after a real build exists', false) +
        step('Deploying', 'Jazz will mark this LIVE only after a real URL is verified', false);
    }

    var spec = el('specBox');
    if (spec) {
      spec.innerHTML = '<div class="spec"><div class="eyebrow">PLAN SAVED</div><h3>NOT CREATED YET</h3><p>Your system plan is approved. Live Work is open so you can see exactly what has and has not been completed.</p><p class="honest">Jazz will never call an app CREATED or LIVE without a real deployment link.</p></div>';
    }

    if (typeof nav === 'function') nav('work');
    if (typeof toast === 'function') toast('Plan saved. Opening Live Work — the app is not created yet.');
    if (typeof speak === 'function') speak('Your plan is approved. I am opening Live Work. The app is not created yet. I will tell you when a real build and live link exist.');

    draftSystem = null;
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
    if (typeof toast === 'function') toast('NOT CREATED YET — there is no verified live deployment link.');
    if (typeof nav === 'function') nav('work');
  };

  window.JazzBuildStatus = {
    isCreated: function (system) { return Boolean(system && system.live); },
    markLive: function (systemId, url) {
      var clean = String(url || '').trim();
      if (!/^https:\/\//i.test(clean)) throw new Error('A verified HTTPS deployment URL is required.');
      var found = systems.find(function (s) { return String(s.id) === String(systemId); });
      if (!found) throw new Error('System not found.');
      found.live = clean;
      found.status = 'LIVE — created and deployed';
      found.updated = new Date().toLocaleDateString();
      saveSystems();
      if (typeof toast === 'function') toast('App verified LIVE. OPEN is now available.');
      return found;
    }
  };

  migrateOldStatuses();
})();
