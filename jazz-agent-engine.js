/*
  JAZZ AI — Working Agent Engine
  Adds real task routing, agent-specific local work, review/approval,
  persistent history, and honest connection states to the existing command center.
  No API keys or secrets are stored in this public file.
*/
(function () {
  const STORAGE_KEY = 'jazzAgentTasksV2';
  const APPROVED_KEY = 'jazzApprovedWorkV2';
  const MAX_TASKS = 120;

  const AGENTS = [
    { name: 'Partnership', icon: '↗', kind: 'draft' },
    { name: 'Social Media', icon: '♥', kind: 'draft' },
    { name: 'Reader Care', icon: '✉', kind: 'draft' },
    { name: 'Finance & Orders', icon: '₱', kind: 'report' },
    { name: 'Aiva Presentation', icon: '▰', kind: 'draft' },
    { name: 'Grant & Sponsorship', icon: '★', kind: 'draft' },
    { name: 'Media', icon: '◉', kind: 'draft' },
    { name: 'Website', icon: '⌘', kind: 'draft' },
    { name: 'Knowledge', icon: '◇', kind: 'report' },
    { name: 'Events', icon: '◫', kind: 'draft' },
    { name: 'Lead & CRM', icon: '♙', kind: 'report' }
  ];

  const agentMap = Object.fromEntries(AGENTS.map(a => [a.name.toLowerCase(), a]));
  let currentTaskId = null;
  let activeAgent = '';
  let engineTimers = [];

  function q(s) { return document.querySelector(s); }
  function qa(s) { return Array.from(document.querySelectorAll(s)); }
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }
  function nowIso() { return new Date().toISOString(); }
  function shortTime(iso) {
    try { return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
    catch (_) { return ''; }
  }
  function notify(message) {
    try { if (typeof toast === 'function') return toast(message); } catch (_) {}
    console.info('[Jazz]', message);
  }
  function say(message) {
    try { if (typeof speak === 'function') speak(message); } catch (_) {}
  }
  function go(view) {
    try { if (typeof nav === 'function') return nav(view); } catch (_) {}
    qa('.view').forEach(v => v.classList.toggle('active', v.id === view));
  }

  function loadTasks() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) { return []; }
  }
  function saveTasks(tasks) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks.slice(0, MAX_TASKS))); }
    catch (_) {}
  }
  function updateTask(id, patch) {
    const tasks = loadTasks();
    const i = tasks.findIndex(t => t.id === id);
    if (i < 0) return null;
    tasks[i] = Object.assign({}, tasks[i], patch, { updatedAt: nowIso() });
    saveTasks(tasks);
    currentTaskId = id;
    renderAll(tasks[i]);
    return tasks[i];
  }
  function getTask(id) { return loadTasks().find(t => t.id === id) || null; }

  function inferAgent(command) {
    const text = String(command || '').trim();
    const explicit = text.match(/^Ask\s+(.+?)\s+to\s+/i);
    if (explicit) {
      const requested = explicit[1].trim().toLowerCase();
      const exact = AGENTS.find(a => a.name.toLowerCase() === requested);
      if (exact) return exact.name;
      const loose = AGENTS.find(a => requested.includes(a.name.toLowerCase()) || a.name.toLowerCase().includes(requested));
      if (loose) return loose.name;
    }
    const rules = [
      ['Lead & CRM', /\b(crm|lead|prospect|follow[- ]?up|contact list|hot leads?)\b/i],
      ['Finance & Orders', /\b(order|payment|paid|unpaid|finance|sales|revenue|cash|book order)\b/i],
      ['Aiva Presentation', /\b(speech|presentation|slides?|speaker|talking points|q&a|opening remarks|closing remarks)\b/i],
      ['Grant & Sponsorship', /\b(grant|sponsor|sponsorship|funding|application deadline)\b/i],
      ['Social Media', /\b(facebook|instagram|tiktok|linkedin|caption|social|reel|post|hashtag|content calendar)\b/i],
      ['Reader Care', /\b(reader|review|testimonial|book question|reader reply|feedback)\b/i],
      ['Media', /\b(media|press|journalist|interview|press release|media pitch)\b/i],
      ['Website', /\b(website|webpage|seo|broken link|homepage|site update)\b/i],
      ['Events', /\b(event|guest|attendee|venue|run of show|program flow|invitation)\b/i],
      ['Partnership', /\b(partner|partnership|hospital|rotary|lions|organization outreach|proposal)\b/i],
      ['Knowledge', /\b(knowledge|remember|saved|my systems|history|report|what do we have)\b/i]
    ];
    for (const [name, re] of rules) if (re.test(text)) return name;
    return activeAgent || 'Knowledge';
  }

  function stripAgentPrefix(command) {
    return String(command || '').replace(/^Ask\s+.+?\s+to\s+/i, '').trim();
  }

  function createTask(command, forcedAgent) {
    const agentName = forcedAgent || inferAgent(command);
    const task = {
      id: 'ja_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7),
      agent: agentName,
      command: stripAgentPrefix(command) || String(command || '').trim(),
      status: 'DEPLOYING',
      step: 'Receiving instruction',
      result: '',
      error: '',
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    const tasks = loadTasks();
    tasks.unshift(task);
    saveTasks(tasks);
    currentTaskId = task.id;
    activeAgent = agentName;
    renderAll(task);
    go('work');
    notify(agentName + ' Agent deployed.');

    engineTimers.push(setTimeout(() => {
      updateTask(task.id, { status: 'WORKING', step: workingStep(agentName) });
      runTask(task.id);
    }, document.body.classList.contains('reduce') ? 0 : 350));
    return task;
  }

  function workingStep(agentName) {
    return ({
      'Partnership': 'Reviewing partnership records',
      'Social Media': 'Preparing content draft',
      'Reader Care': 'Preparing reader response',
      'Finance & Orders': 'Checking saved order records',
      'Aiva Presentation': 'Structuring presentation material',
      'Grant & Sponsorship': 'Preparing opportunity workflow',
      'Media': 'Preparing media material',
      'Website': 'Preparing website action plan',
      'Knowledge': 'Checking Jazz memory on this device',
      'Events': 'Preparing event workflow',
      'Lead & CRM': 'Checking CRM records'
    })[agentName] || 'Working on the instruction';
  }

  async function runTask(id) {
    const task = getTask(id);
    if (!task) return;
    try {
      const processor = processors[task.agent] || processors.Knowledge;
      const output = await processor(task.command, task);
      updateTask(id, {
        status: output.status || 'WAITING FOR APPROVAL',
        step: output.step || 'Ready for review',
        result: output.result || '',
        error: output.error || ''
      });
      if ((output.status || 'WAITING FOR APPROVAL') === 'WAITING FOR APPROVAL') {
        say(task.agent + ' Agent has a result ready for your review.');
      }
    } catch (err) {
      updateTask(id, {
        status: 'ERROR',
        step: 'Task stopped',
        error: String(err && err.message ? err.message : err)
      });
      notify(task.agent + ' Agent needs attention.');
    }
  }

  function lines(items) { return items.filter(Boolean).join('\n'); }

  function leadRecords() {
    try { return (typeof leadData !== 'undefined' && Array.isArray(leadData)) ? leadData : []; }
    catch (_) { return []; }
  }
  function systemRecords() {
    try { return (typeof systems !== 'undefined' && Array.isArray(systems)) ? systems : []; }
    catch (_) { return []; }
  }

  function filterLeadsByCommand(records, command) {
    let rows = records.slice();
    const c = command.toLowerCase();
    if (/\bhot\b/.test(c)) rows = rows.filter(r => /^hot/i.test(String(r.Priority || '')));
    if (/\bwarm\b/.test(c)) rows = rows.filter(r => /^warm/i.test(String(r.Priority || '')));
    if (/\bcold\b/.test(c)) rows = rows.filter(r => /^cold/i.test(String(r.Priority || '')));
    if (/follow[- ]?up/.test(c)) rows = rows.filter(r => /follow/i.test(String(r['Outreach Status'] || '') + ' ' + String(r['Next Action'] || '')));
    const categoryTerms = ['hospital', 'rotary', 'lions', 'school', 'university', 'clinic', 'foundation', 'church', 'media'];
    const term = categoryTerms.find(x => c.includes(x));
    if (term) rows = rows.filter(r => Object.values(r).some(v => String(v).toLowerCase().includes(term)));
    return rows;
  }

  const processors = {
    'Partnership': async function (command) {
      const records = leadRecords();
      if (!records.length) {
        return {
          result: lines([
            'PARTNERSHIP WORKSPACE',
            '',
            'Task: ' + command,
            '',
            'No partnership CRM records are loaded yet.',
            'Next useful action: open Lead & CRM or import/connect your partnership list.',
            '',
            'I did not invent organizations or contact details.'
          ])
        };
      }
      const rows = filterLeadsByCommand(records, command).slice(0, 8);
      return {
        result: lines([
          'PARTNERSHIP AGENT — CRM REVIEW',
          '',
          rows.length ? 'Best matching saved leads:' : 'No saved lead matched that filter.',
          ...rows.map((r, i) => `${i + 1}. ${r.Organization || 'Unnamed organization'} — ${r.Priority || 'Unclassified'}${r['Contact Person / Leader'] ? ' — ' + r['Contact Person / Leader'] : ''}${r['Next Action'] ? '\n   Next: ' + r['Next Action'] : ''}`),
          '',
          'Source: Jazz saved CRM only. No outside research was invented.'
        ])
      };
    },

    'Social Media': async function (command) {
      const c = command.toLowerCase();
      if (/tiktok|reel|video/.test(c)) {
        return { result: lines([
          'SOCIAL MEDIA AGENT — SHORT VIDEO DRAFT', '',
          'Hook: Some battles are visible. Others are carried quietly every day.',
          'Body: Beyond the Tremor is about finding strength, faith, dignity, and purpose even when life changes the plan.',
          'Close: Keep going. Your story is still being written.',
          'On-screen CTA: Beyond the Tremor — Strength, Faith, and Resilience', '',
          'Review this draft before posting.'
        ]) };
      }
      return { result: lines([
        'SOCIAL MEDIA AGENT — POST DRAFT', '',
        'Strength is not always loud. Sometimes it looks like showing up again, choosing hope again, and finding purpose in a life that did not go exactly as planned.', '',
        'Beyond the Tremor is a reminder that even when life shakes us, it does not have to break us.', '',
        '💜 Keep going. Your story still matters.', '',
        '#BeyondTheTremor #ParkinsonsAwareness #StrengthFaithResilience #Hope', '',
        'Review this draft before publishing.'
      ]) };
    },

    'Reader Care': async function (command) {
      return { result: lines([
        'READER CARE AGENT — REPLY DRAFT', '',
        'Thank you so much for taking the time to read and share your thoughts. Your message means a great deal to me.', '',
        'I hope Beyond the Tremor reminds you that difficult seasons can still hold strength, faith, dignity, and purpose. Thank you for being part of this journey.', '',
        'With gratitude,',
        'Kimberly', '',
        'Task received: ' + command,
        'Please review before sending.'
      ]) };
    },

    'Finance & Orders': async function (command) {
      let orders = [];
      try { orders = JSON.parse(localStorage.getItem('jazzOrders') || '[]'); } catch (_) {}
      if (!Array.isArray(orders) || !orders.length) {
        return { result: lines([
          'FINANCE & ORDERS AGENT — STATUS', '',
          'No Jazz order records are saved on this device yet.',
          'I cannot truthfully report paid/unpaid totals until an order source is connected or records are added.', '',
          'Suggested next action: connect/import your order list, then ask “Show unpaid orders.”'
        ]) };
      }
      const unpaid = orders.filter(o => !/paid|complete/i.test(String(o.paymentStatus || o.status || '')));
      const total = orders.reduce((n, o) => n + Number(o.amount || 0), 0);
      return { result: lines([
        'FINANCE & ORDERS AGENT — SAVED RECORDS', '',
        `Orders: ${orders.length}`,
        `Unpaid / not marked paid: ${unpaid.length}`,
        `Recorded amount total: ₱${total.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
        '',
        ...unpaid.slice(0, 10).map((o, i) => `${i + 1}. ${o.name || o.customer || 'Unnamed'} — ${o.paymentStatus || o.status || 'Status not set'}`)
      ]) };
    },

    'Aiva Presentation': async function (command) {
      return { result: lines([
        'AIVA PRESENTATION AGENT — TALK STRUCTURE', '',
        '1. OPENING — Begin with one human moment that immediately connects with the audience.',
        '2. CONTEXT — Briefly explain the challenge and why the topic matters.',
        '3. STORY — Share the turning point, lesson, or experience.',
        '4. MESSAGE — Strength, dignity, faith, resilience, and purpose.',
        '5. ACTION — Give the audience one clear idea to carry forward.',
        '6. CLOSING — End with a memorable hopeful line.', '',
        'Requested task: ' + command,
        '',
        'This is a working outline. A connected AI writing service is needed for a custom full speech generated from detailed event context.'
      ]) };
    },

    'Grant & Sponsorship': async function (command) {
      return { result: lines([
        'GRANT & SPONSORSHIP AGENT — WORK PACKAGE', '',
        'Task: ' + command, '',
        'CHECKLIST',
        '• Define the project, beneficiaries, location, and measurable outcome.',
        '• Confirm eligibility before drafting.',
        '• Record deadline, funding amount, required attachments, and contact person.',
        '• Prepare a concise need statement and impact statement.',
        '• Prepare budget and proof/supporting documents.',
        '• Put every external submission behind approval.', '',
        'No grant opportunity has been claimed or invented. Connect research/search before treating an opportunity as verified.'
      ]) };
    },

    'Media': async function (command) {
      return { result: lines([
        'MEDIA AGENT — PITCH DRAFT', '',
        'Subject: A story of resilience, purpose, and Parkinson’s advocacy', '',
        'Hello,', '',
        'I’m reaching out to share a human-interest story centered on resilience, Parkinson’s awareness, and finding purpose through life-changing circumstances. Beyond the Tremor: Strength, Faith, and Resilience offers a personal perspective that may be meaningful to your audience.', '',
        'I would be glad to share more details, interview talking points, or a review copy if this is a fit for your coverage.', '',
        'Thank you for your consideration.', '',
        'Requested task: ' + command,
        'Review before outreach.'
      ]) };
    },

    'Website': async function (command) {
      return { result: lines([
        'WEBSITE AGENT — ACTION PLAN', '',
        'Task: ' + command, '',
        '1. Identify the exact page or section to change.',
        '2. Preserve existing navigation and mobile layout.',
        '3. Prepare the copy or technical change.',
        '4. Check links, readability, accessibility, and phone layout.',
        '5. Preview before publishing.',
        '6. Keep a rollback/version history in GitHub.', '',
        'No website change has been claimed as published until a real repository/deployment action occurs.'
      ]) };
    },

    'Knowledge': async function (command) {
      const savedSystems = systemRecords();
      const leads = leadRecords();
      const tasks = loadTasks();
      return { result: lines([
        'KNOWLEDGE AGENT — CURRENT JAZZ MEMORY', '',
        `Saved Jazz systems: ${savedSystems.length}`,
        `Loaded CRM leads: ${leads.length}`,
        `Agent tasks in local history: ${tasks.length}`,
        `Waiting for approval: ${tasks.filter(t => t.status === 'WAITING FOR APPROVAL').length}`,
        '',
        savedSystems.length ? 'Recent systems:' : 'No saved systems found.',
        ...savedSystems.slice(0, 6).map((s, i) => `${i + 1}. ${s.name || s.type || 'System'} — ${s.status || 'No status'}`),
        '',
        'Question/task: ' + command,
        '',
        'This answer uses only information already available inside Jazz on this device.'
      ]) };
    },

    'Events': async function (command) {
      return { result: lines([
        'EVENTS AGENT — EVENT WORKFLOW', '',
        'Task: ' + command, '',
        'BEFORE',
        '• Confirm date, time, venue, audience, objective, and key contact.',
        '• Confirm program flow, speakers, materials, transport, and accessibility needs.',
        '• Prepare invitation/guest list and reminders.', '',
        'EVENT DAY',
        '• Arrival and setup check',
        '• Registration / guest check',
        '• Program timing and speaker support',
        '• Photos, notes, and important follow-ups', '',
        'AFTER',
        '• Thank-you messages',
        '• Expense/order reconciliation',
        '• Save photos, notes, outcomes, and next actions'
      ]) };
    },

    'Lead & CRM': async function (command) {
      const records = leadRecords();
      if (!records.length) {
        return { result: 'LEAD & CRM AGENT\n\nCRM data is not loaded yet. Open the CRM tab or refresh Jazz. No records were invented.' };
      }
      const rows = filterLeadsByCommand(records, command);
      const hot = records.filter(r => /^hot/i.test(String(r.Priority || ''))).length;
      const warm = records.filter(r => /^warm/i.test(String(r.Priority || ''))).length;
      const cold = records.filter(r => /^cold/i.test(String(r.Priority || ''))).length;
      return { result: lines([
        'LEAD & CRM AGENT — SAVED DATA', '',
        `Total leads: ${records.length}`,
        `Hot: ${hot} | Warm: ${warm} | Cold: ${cold}`,
        `Matching this request: ${rows.length}`, '',
        ...rows.slice(0, 12).map((r, i) => `${i + 1}. ${r.Organization || 'Unnamed organization'} — ${r.Priority || 'Unclassified'}${r['Outreach Status'] ? ' — ' + r['Outreach Status'] : ''}${r['Next Action'] ? '\n   Next: ' + r['Next Action'] : ''}`),
        '',
        rows.length > 12 ? `Showing 12 of ${rows.length} matches.` : '',
        'No outside lead information was invented.'
      ]) };
    }
  };

  function taskStateClass(status) {
    return ({
      'DEPLOYING': 'jazz-state-deploying',
      'WORKING': 'jazz-state-working',
      'WAITING FOR APPROVAL': 'jazz-state-review',
      'COMPLETE': 'jazz-state-complete',
      'ERROR': 'jazz-state-error',
      'CANCELLED': 'jazz-state-error'
    })[status] || '';
  }

  function renderWork(task) {
    const box = q('#workList');
    if (!box) return;
    if (!task) {
      const tasks = loadTasks();
      task = tasks[0] || null;
    }
    if (!task) {
      box.innerHTML = '<div class="empty">No agent work yet.<br>Tap an agent or talk to Jazz.</div>';
      return;
    }
    const resultHtml = task.result ? `<div class="jazz-result"><div class="eyebrow">RESULT</div><pre>${esc(task.result)}</pre></div>` : '';
    const errorHtml = task.error ? `<p class="jazz-agent-error">${esc(task.error)}</p>` : '';
    const actions = task.status === 'WAITING FOR APPROVAL' ? `
      <div class="jazz-review-actions">
        <button data-jazz-action="approve" data-task="${esc(task.id)}">APPROVE</button>
        <button data-jazz-action="edit" data-task="${esc(task.id)}">EDIT</button>
        <button data-jazz-action="retry" data-task="${esc(task.id)}">RETRY</button>
        <button class="danger" data-jazz-action="cancel" data-task="${esc(task.id)}">CANCEL</button>
      </div>` : '';
    box.innerHTML = `
      <div class="jazz-task-card ${taskStateClass(task.status)}">
        <div class="eyebrow">${esc(task.agent)} AGENT</div>
        <h3>${esc(task.status)}</h3>
        <p><strong>${esc(task.step || '')}</strong></p>
        <p>${esc(task.command)}</p>
        <small>${esc(shortTime(task.updatedAt))}</small>
        ${errorHtml}${resultHtml}${actions}
      </div>
      <button class="jazz-history-btn" id="jazzShowTaskHistory">SHOW AGENT HISTORY</button>`;

    qa('[data-jazz-action]').forEach(b => b.addEventListener('click', onReviewAction));
    const h = q('#jazzShowTaskHistory');
    if (h) h.onclick = renderHistory;
  }

  function renderHistory() {
    const box = q('#workList');
    if (!box) return;
    const tasks = loadTasks();
    box.innerHTML = tasks.length ? tasks.slice(0, 40).map(t => `
      <button class="jazz-history-row" data-history-task="${esc(t.id)}">
        <strong>${esc(t.agent)}</strong>
        <span>${esc(t.status)}</span>
        <small>${esc(t.command)}</small>
      </button>`).join('') : '<div class="empty">No agent history yet.</div>';
    qa('[data-history-task]').forEach(b => b.onclick = () => {
      currentTaskId = b.dataset.historyTask;
      renderWork(getTask(currentTaskId));
    });
  }

  function onReviewAction(e) {
    const action = e.currentTarget.dataset.jazzAction;
    const id = e.currentTarget.dataset.task;
    const task = getTask(id);
    if (!task) return;
    if (action === 'approve') {
      const approved = (() => { try { return JSON.parse(localStorage.getItem(APPROVED_KEY) || '[]'); } catch (_) { return []; } })();
      approved.unshift({ id: task.id, agent: task.agent, command: task.command, result: task.result, approvedAt: nowIso() });
      try { localStorage.setItem(APPROVED_KEY, JSON.stringify(approved.slice(0, 200))); } catch (_) {}
      updateTask(id, { status: 'COMPLETE', step: 'Approved and saved' });
      notify('Approved and saved.');
      say(task.agent + ' Agent task approved and complete.');
    } else if (action === 'edit') {
      activeAgent = task.agent;
      try {
        if (typeof openTalk === 'function') openTalk();
        const input = q('#command');
        if (input) { input.value = `Ask ${task.agent} to revise this result: `; input.focus(); }
      } catch (_) {}
      notify('Tell Jazz what to change.');
    } else if (action === 'retry') {
      updateTask(id, { status: 'WORKING', step: workingStep(task.agent), error: '', result: '' });
      runTask(id);
    } else if (action === 'cancel') {
      updateTask(id, { status: 'CANCELLED', step: 'Cancelled by Kimmy' });
      notify('Task cancelled.');
    }
  }

  function renderApprovals() {
    const box = q('#approvalList');
    if (!box) return;
    const pending = loadTasks().filter(t => t.status === 'WAITING FOR APPROVAL');
    if (!pending.length) {
      box.innerHTML = '<div class="empty">No approvals waiting.</div>';
      return;
    }
    box.innerHTML = pending.map(t => `
      <div class="row jazz-approval-row">
        <span class="dot"></span>
        <div><strong>${esc(t.agent)}</strong><small>${esc(t.command)}</small></div>
        <button data-approval-open="${esc(t.id)}">REVIEW</button>
      </div>`).join('');
    qa('[data-approval-open]').forEach(b => b.onclick = () => {
      currentTaskId = b.dataset.approvalOpen;
      go('work');
      renderWork(getTask(currentTaskId));
    });
  }

  function renderAgentStatus() {
    const tasks = loadTasks();
    const latestByAgent = {};
    tasks.forEach(t => { if (!latestByAgent[t.agent]) latestByAgent[t.agent] = t; });
    const rows = qa('#agentList .row');
    rows.forEach(row => {
      const strong = row.querySelector('strong');
      const small = row.querySelector('small');
      if (!strong || !small) return;
      const t = latestByAgent[strong.textContent.trim()];
      if (t) small.textContent = t.status + ' • ' + (t.step || '');
      else small.textContent = strong.textContent.trim() === 'Lead & CRM' ? 'CRM ready' : 'Ready for instructions';
    });
    qa('#agents .agent:not(.kimara)').forEach((button, i) => {
      const name = AGENTS[i] && AGENTS[i].name;
      const t = latestByAgent[name];
      button.classList.remove('jazz-agent-working', 'jazz-agent-review', 'jazz-agent-complete');
      if (!t) return;
      if (/DEPLOYING|WORKING/.test(t.status)) button.classList.add('jazz-agent-working');
      else if (t.status === 'WAITING FOR APPROVAL') button.classList.add('jazz-agent-review');
      else if (t.status === 'COMPLETE') button.classList.add('jazz-agent-complete');
    });
  }

  function renderAll(task) {
    renderWork(task || (currentTaskId && getTask(currentTaskId)) || loadTasks()[0]);
    renderApprovals();
    renderAgentStatus();
  }

  function assignAgent(name) {
    activeAgent = name;
    try {
      if (typeof openTalk === 'function') openTalk();
      const input = q('#command');
      if (input) {
        input.value = `Ask ${name} to `;
        input.focus();
      }
    } catch (_) {}
    notify(name + ' Agent is ready.');
  }

  function bindAgents() {
    qa('#agents .agent:not(.kimara)').forEach((button, i) => {
      const agent = AGENTS[i];
      if (!agent) return;
      button.onclick = () => agent.name === 'Lead & CRM' ? (activeAgent = agent.name, go('crm')) : assignAgent(agent.name);
      button.setAttribute('aria-label', agent.name + ' Agent');
    });
    qa('#agentList .row').forEach(row => {
      const name = row.querySelector('strong')?.textContent.trim();
      const button = row.querySelector('button');
      if (!name || !button || !agentMap[name.toLowerCase()]) return;
      button.onclick = () => name === 'Lead & CRM' ? (activeAgent = name, go('crm')) : assignAgent(name);
    });
  }

  function patchJazzWork() {
    const agentWork = function (command) {
      const text = String(command || '').trim();
      if (!text) return notify('Please give Jazz an instruction.');
      return createTask(text);
    };
    try { window.work = agentWork; } catch (_) {}
    try { work = agentWork; } catch (_) {}
  }

  function stopAgentWork() {
    engineTimers.forEach(clearTimeout);
    engineTimers = [];
    const tasks = loadTasks();
    let changed = false;
    tasks.forEach(t => {
      if (t.status === 'DEPLOYING' || t.status === 'WORKING') {
        t.status = 'CANCELLED';
        t.step = 'Stopped safely';
        t.updatedAt = nowIso();
        changed = true;
      }
    });
    if (changed) saveTasks(tasks);
    renderAll();
  }

  function injectStyles() {
    if (q('#jazzAgentEngineStyles')) return;
    const style = document.createElement('style');
    style.id = 'jazzAgentEngineStyles';
    style.textContent = `
      .jazz-task-card{display:block;padding:18px;border:1px solid rgba(156,108,255,.35);border-radius:22px;background:rgba(12,13,36,.92)}
      .jazz-task-card h3{margin:6px 0 8px;color:var(--gold)}
      .jazz-task-card p{margin:8px 0;line-height:1.45;color:var(--ivory)}
      .jazz-result{margin-top:16px;padding:15px;border-radius:18px;background:rgba(255,255,255,.05);border:1px solid rgba(217,189,124,.3)}
      .jazz-result pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;line-height:1.5;margin:8px 0 0;color:var(--ivory)}
      .jazz-review-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px}
      .jazz-review-actions button,.jazz-history-btn{min-height:58px;border:1px solid var(--gold);border-radius:17px;background:#262041;color:#fff;font-weight:1000}
      .jazz-review-actions button:first-child{background:#215b45;border-color:#69e7b4}.jazz-review-actions .danger{background:#451a25;border-color:#ff7683}
      .jazz-history-btn{width:100%;margin-top:12px}
      .jazz-history-row{width:100%;display:grid;grid-template-columns:1fr auto;gap:4px 12px;text-align:left;padding:14px;margin:0 0 10px;border:1px solid rgba(156,108,255,.3);border-radius:17px;background:#14162f;color:#fff}
      .jazz-history-row span{color:var(--gold);font-weight:900}.jazz-history-row small{grid-column:1/-1;color:var(--muted)}
      .jazz-agent-working{box-shadow:0 0 24px rgba(156,108,255,.7)!important;border-color:#c7a9ff!important}
      .jazz-agent-review{box-shadow:0 0 24px rgba(217,189,124,.55)!important;border-color:var(--gold)!important}
      .jazz-agent-complete{border-color:#69e7b4!important}
      .jazz-agent-error{color:#ffb3ba!important;font-weight:800}.jazz-approval-row button{min-width:92px}
      body.reduce .jazz-agent-working,body.reduce .jazz-agent-review{box-shadow:none!important}
    `;
    document.head.appendChild(style);
  }

  function init() {
    injectStyles();
    bindAgents();
    patchJazzWork();
    renderAll();
    const stop = q('#stopBtn');
    if (stop) stop.addEventListener('click', stopAgentWork);

    setTimeout(bindAgents, 900);
    console.info('Jazz Working Agent Engine loaded: 11 agents active.');
  }

  window.JazzAgentEngine = {
    agents: AGENTS.map(a => a.name),
    assign: assignAgent,
    run: createTask,
    tasks: loadTasks,
    render: renderAll
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
