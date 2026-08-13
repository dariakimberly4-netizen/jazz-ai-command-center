/*
  JAZZ AI — Supabase Cloud Memory
  Browser-safe connection: publishable key only + authenticated RLS.
  Syncs Jazz agent tasks/results/approvals across devices after sign-in.
*/
(function () {
  'use strict';

  const SUPABASE_URL = 'https://nrdmakgigcixmzhxthrh.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_OhoPpv-hRk56QGy3PZJSBQ_W72oHkq1';
  const TASKS_KEY = 'jazzAgentTasksV2';
  const MAX_TASKS = 120;
  const SYNC_MS = 4500;

  let client = null;
  let session = null;
  let syncTimer = null;
  let syncing = false;
  let lastLocalFingerprint = '';

  const $ = (s) => document.querySelector(s);

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
    }[c]));
  }

  function toastSafe(message) {
    try { if (typeof toast === 'function') return toast(message); } catch (_) {}
    console.info('[Jazz Cloud]', message);
  }

  function readLocalTasks() {
    try {
      const data = JSON.parse(localStorage.getItem(TASKS_KEY) || '[]');
      return Array.isArray(data) ? data.slice(0, MAX_TASKS) : [];
    } catch (_) { return []; }
  }

  function writeLocalTasks(tasks) {
    try {
      localStorage.setItem(TASKS_KEY, JSON.stringify(tasks.slice(0, MAX_TASKS)));
      if (window.JazzAgentEngine && typeof window.JazzAgentEngine.render === 'function') {
        window.JazzAgentEngine.render();
      }
    } catch (_) {}
  }

  function fingerprint(tasks) {
    return JSON.stringify(tasks.map(t => [t.id,t.agent,t.command,t.status,t.step,t.result,t.error,t.updatedAt]));
  }

  function stepForStatus(status) {
    return ({
      'DEPLOYING':'Receiving instruction',
      'WORKING':'Working on the instruction',
      'WAITING FOR APPROVAL':'Ready for review',
      'COMPLETE':'Approved and saved',
      'ERROR':'Task stopped',
      'CANCELLED':'Cancelled'
    })[status] || 'Saved in Jazz cloud memory';
  }

  function injectStyles() {
    if ($('#jazzCloudStyles')) return;
    const style = document.createElement('style');
    style.id = 'jazzCloudStyles';
    style.textContent = `
      .jazz-cloud-row{border-color:rgba(105,231,180,.34)!important}
      .jazz-cloud-row .dot{background:#69e7b4!important;box-shadow:0 0 12px #69e7b4!important}
      .jazz-cloud-panel{margin-top:14px}
      .jazz-cloud-panel input{width:100%;min-height:58px;margin:8px 0;border:2px solid #6a54a2;border-radius:18px;background:#090a1c;color:#fff;padding:0 15px;font-size:1rem}
      .jazz-cloud-actions{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:10px}
      .jazz-cloud-actions button{min-height:56px;border:1px solid #6a54a2;border-radius:16px;background:#1a1939;color:#fff;font-weight:900}
      .jazz-cloud-actions .primary{background:#215b45;border-color:#69e7b4}
      .jazz-cloud-actions .danger{background:#451a25;border-color:#ff7683}
      .jazz-cloud-note{font-size:.83rem;color:var(--muted);line-height:1.45}
    `;
    document.head.appendChild(style);
  }

  function ensureConnectionUI() {
    const connections = $('#connections .list');
    if (!connections || $('#jazzCloudRow')) return;

    const row = document.createElement('div');
    row.className = 'row jazz-cloud-row';
    row.id = 'jazzCloudRow';
    row.innerHTML = `
      <span class="dot"></span>
      <div><strong>Jazz Cloud Memory</strong><small id="jazzCloudStatus">Checking secure connection…</small></div>
      <button id="jazzCloudButton">OPEN</button>`;
    connections.prepend(row);

    const panel = document.createElement('div');
    panel.id = 'jazzCloudPanel';
    panel.className = 'spec hidden jazz-cloud-panel';
    panel.innerHTML = `
      <h3>Jazz Cloud Memory</h3>
      <p class="jazz-cloud-note">Sign in with the same email account you use for this Supabase project. Your Jazz tasks, results, and approvals will then sync across devices.</p>
      <div id="jazzCloudSignedOut">
        <input id="jazzCloudEmail" type="email" inputmode="email" autocomplete="email" placeholder="Email" aria-label="Email">
        <input id="jazzCloudPassword" type="password" autocomplete="current-password" placeholder="Password" aria-label="Password">
        <div class="jazz-cloud-actions">
          <button class="primary" id="jazzCloudSignIn">SIGN IN</button>
          <button id="jazzCloudCreate">CREATE ACCOUNT</button>
        </div>
      </div>
      <div id="jazzCloudSignedIn" class="hidden">
        <p><strong id="jazzCloudIdentity">Connected</strong></p>
        <p class="jazz-cloud-note">Cloud sync is active. Jazz keeps a local copy too, so your current device still has your recent work.</p>
        <div class="jazz-cloud-actions">
          <button class="primary" id="jazzCloudSyncNow">SYNC NOW</button>
          <button class="danger" id="jazzCloudSignOut">SIGN OUT</button>
        </div>
      </div>
      <button class="close" id="jazzCloudClose">CLOSE</button>`;
    $('#connections .panel').appendChild(panel);

    $('#jazzCloudButton').onclick = () => panel.classList.remove('hidden');
    $('#jazzCloudClose').onclick = () => panel.classList.add('hidden');
    $('#jazzCloudSignIn').onclick = signIn;
    $('#jazzCloudCreate').onclick = signUp;
    $('#jazzCloudSyncNow').onclick = () => syncCloud(true);
    $('#jazzCloudSignOut').onclick = signOut;
  }

  function setConnectionState() {
    const status = $('#jazzCloudStatus');
    const button = $('#jazzCloudButton');
    const signedOut = $('#jazzCloudSignedOut');
    const signedIn = $('#jazzCloudSignedIn');
    const identity = $('#jazzCloudIdentity');
    if (!status || !button) return;

    if (session && session.user) {
      status.textContent = 'Connected • secure cloud sync on';
      button.textContent = 'MANAGE';
      if (signedOut) signedOut.classList.add('hidden');
      if (signedIn) signedIn.classList.remove('hidden');
      if (identity) identity.textContent = 'Connected as ' + (session.user.email || 'your account');
    } else {
      status.textContent = 'Sign in to sync phone + computer';
      button.textContent = 'SIGN IN';
      if (signedOut) signedOut.classList.remove('hidden');
      if (signedIn) signedIn.classList.add('hidden');
    }
  }

  async function signIn() {
    const email = ($('#jazzCloudEmail')?.value || '').trim();
    const password = $('#jazzCloudPassword')?.value || '';
    if (!email || !password) return toastSafe('Enter your email and password.');
    const button = $('#jazzCloudSignIn');
    if (button) { button.disabled = true; button.textContent = 'SIGNING IN…'; }
    try {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      session = data.session;
      setConnectionState();
      toastSafe('Jazz Cloud Memory connected.');
      await syncCloud(true);
      $('#jazzCloudPanel')?.classList.add('hidden');
    } catch (err) {
      toastSafe(String(err && err.message ? err.message : err));
    } finally {
      if (button) { button.disabled = false; button.textContent = 'SIGN IN'; }
    }
  }

  async function signUp() {
    const email = ($('#jazzCloudEmail')?.value || '').trim();
    const password = $('#jazzCloudPassword')?.value || '';
    if (!email || password.length < 6) return toastSafe('Use your email and a password with at least 6 characters.');
    const button = $('#jazzCloudCreate');
    if (button) { button.disabled = true; button.textContent = 'CREATING…'; }
    try {
      const { data, error } = await client.auth.signUp({ email, password });
      if (error) throw error;
      session = data.session || null;
      setConnectionState();
      if (session) {
        toastSafe('Jazz account created and connected.');
        await syncCloud(true);
      } else {
        toastSafe('Account created. Check your email if confirmation is required, then sign in.');
      }
    } catch (err) {
      toastSafe(String(err && err.message ? err.message : err));
    } finally {
      if (button) { button.disabled = false; button.textContent = 'CREATE ACCOUNT'; }
    }
  }

  async function signOut() {
    try { await client.auth.signOut(); } catch (_) {}
    session = null;
    setConnectionState();
    stopSyncTimer();
    toastSafe('Jazz Cloud Memory signed out. Local Jazz history remains on this device.');
  }

  async function pushLocalTasks() {
    if (!session?.user?.id) return;
    const userId = session.user.id;
    const local = readLocalTasks();
    if (!local.length) return;

    const taskRows = local.map(t => ({
      user_id: userId,
      external_id: String(t.id),
      agent_name: String(t.agent || 'Knowledge'),
      command: String(t.command || ''),
      status: String(t.status || 'WORKING'),
      step: String(t.step || ''),
      error_text: String(t.error || ''),
      created_at: t.createdAt || new Date().toISOString(),
      updated_at: t.updatedAt || new Date().toISOString()
    }));

    const { error: taskError } = await client
      .from('jazz_tasks')
      .upsert(taskRows, { onConflict: 'user_id,external_id' });
    if (taskError) throw taskError;

    const { data: savedTasks, error: fetchError } = await client
      .from('jazz_tasks')
      .select('id,external_id,status')
      .in('external_id', local.map(t => String(t.id)));
    if (fetchError) throw fetchError;

    const dbByExternal = new Map((savedTasks || []).map(t => [String(t.external_id), t]));
    const resultRows = [];
    const approvalRows = [];

    local.forEach(t => {
      const dbTask = dbByExternal.get(String(t.id));
      if (!dbTask) return;
      if (t.result) {
        resultRows.push({
          user_id: userId,
          task_id: dbTask.id,
          result_text: String(t.result),
          created_at: t.updatedAt || new Date().toISOString()
        });
      }
      if (t.status === 'COMPLETE' || t.status === 'CANCELLED') {
        approvalRows.push({
          user_id: userId,
          task_id: dbTask.id,
          decision: t.status === 'COMPLETE' ? 'APPROVED' : 'CANCELLED',
          decided_at: t.updatedAt || new Date().toISOString()
        });
      }
    });

    if (resultRows.length) {
      const { error } = await client.from('jazz_task_results').upsert(resultRows, { onConflict: 'user_id,task_id' });
      if (error) throw error;
    }
    if (approvalRows.length) {
      const { error } = await client.from('jazz_approvals').upsert(approvalRows, { onConflict: 'user_id,task_id' });
      if (error) throw error;
    }
  }

  async function pullRemoteTasks() {
    if (!session?.user?.id) return;

    const { data: remoteTasks, error: taskError } = await client
      .from('jazz_tasks')
      .select('id,external_id,agent_name,command,status,step,error_text,created_at,updated_at')
      .order('updated_at', { ascending: false })
      .limit(MAX_TASKS);
    if (taskError) throw taskError;

    const ids = (remoteTasks || []).map(t => t.id);
    let remoteResults = [];
    if (ids.length) {
      const { data, error } = await client
        .from('jazz_task_results')
        .select('task_id,result_text,created_at')
        .in('task_id', ids);
      if (error) throw error;
      remoteResults = data || [];
    }

    const resultsByTask = new Map(remoteResults.map(r => [r.task_id, r.result_text]));
    const local = readLocalTasks();
    const byId = new Map(local.map(t => [String(t.id), t]));

    (remoteTasks || []).forEach(r => {
      if (!r.external_id) return;
      const id = String(r.external_id);
      const existing = byId.get(id);
      const remoteTime = new Date(r.updated_at || r.created_at || 0).getTime();
      const localTime = existing ? new Date(existing.updatedAt || existing.createdAt || 0).getTime() : 0;
      if (!existing || remoteTime >= localTime) {
        byId.set(id, {
          id,
          agent: r.agent_name || 'Knowledge',
          command: r.command || '',
          status: r.status || 'WORKING',
          step: r.step || stepForStatus(r.status),
          result: resultsByTask.get(r.id) || '',
          error: r.error_text || '',
          createdAt: r.created_at || new Date().toISOString(),
          updatedAt: r.updated_at || r.created_at || new Date().toISOString()
        });
      }
    });

    const merged = Array.from(byId.values())
      .sort((a,b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt))
      .slice(0, MAX_TASKS);
    writeLocalTasks(merged);
    lastLocalFingerprint = fingerprint(merged);
  }

  async function logSyncEvent() {
    if (!session?.user?.id) return;
    try {
      await client.from('jazz_activity_log').insert({
        user_id: session.user.id,
        event_type: 'CLOUD_SYNC',
        detail: 'Jazz agent memory synchronized from GitHub Pages.'
      });
    } catch (_) {}
  }

  async function syncCloud(showMessage) {
    if (!session?.user?.id || syncing) return;
    syncing = true;
    try {
      const local = readLocalTasks();
      const currentFingerprint = fingerprint(local);
      if (showMessage || currentFingerprint !== lastLocalFingerprint) {
        await pushLocalTasks();
      }
      await pullRemoteTasks();
      if (showMessage) {
        await logSyncEvent();
        toastSafe('Jazz cloud memory synced.');
      }
    } catch (err) {
      console.error('Jazz cloud sync failed', err);
      if (showMessage) toastSafe('Cloud sync needs attention: ' + String(err && err.message ? err.message : err));
    } finally {
      syncing = false;
    }
  }

  function startSyncTimer() {
    stopSyncTimer();
    if (!session) return;
    syncTimer = setInterval(() => syncCloud(false), SYNC_MS);
  }

  function stopSyncTimer() {
    if (syncTimer) clearInterval(syncTimer);
    syncTimer = null;
  }

  async function init() {
    injectStyles();
    ensureConnectionUI();

    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      const status = $('#jazzCloudStatus');
      if (status) status.textContent = 'Connection library did not load';
      return;
    }

    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });

    const { data } = await client.auth.getSession();
    session = data.session || null;
    setConnectionState();

    client.auth.onAuthStateChange((_event, nextSession) => {
      session = nextSession || null;
      setConnectionState();
      if (session) {
        syncCloud(false);
        startSyncTimer();
      } else {
        stopSyncTimer();
      }
    });

    if (session) {
      await syncCloud(false);
      startSyncTimer();
    }

    window.JazzSupabaseCloud = {
      connected: () => Boolean(session),
      sync: () => syncCloud(true),
      client: () => client
    };

    console.info('Jazz Supabase Cloud Memory ready.');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
