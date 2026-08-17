/* Compatibility loader.
   Jazz uses the private Google Apps Script backend for connected services.
   No Supabase runtime or Supabase credentials are loaded by Jazz.
*/
console.info('Jazz connected services use the private Google Apps Script backend.');

(function loadJazzFacebookConnector(){
  if (document.querySelector('script[data-jazz-facebook]')) return;
  const script = document.createElement('script');
  script.src = 'facebook-connect-client.js';
  script.dataset.jazzFacebook = 'true';
  document.head.appendChild(script);
})();

(function loadJazzWorkingAgents(){
  if (document.querySelector('script[data-jazz-agent-engine]')) return;
  const script = document.createElement('script');
  script.src = 'jazz-agent-engine.js';
  script.dataset.jazzAgentEngine = 'true';
  document.head.appendChild(script);
})();

(function loadJazzAppsScriptAgents(){
  if (document.querySelector('script[data-jazz-apps-script-agents]')) return;
  const script = document.createElement('script');
  script.src = 'jazz-apps-script-agents.js';
  script.dataset.jazzAppsScriptAgents = 'true';
  document.head.appendChild(script);
})();

(function installRealDeployAll(){
  'use strict';
  const TASKS_KEY='jazzAgentTasksV2';
  const AGENTS=[
    'Partnership','Social Media','Reader Care','Finance & Orders','Aiva Presentation',
    'Grant & Sponsorship','Media','Website','Knowledge','Events','Lead & CRM'
  ];
  const JOBS={
    'Partnership':'Review partnership outreach priorities and prepare a safe follow-up shortlist. Do not send anything.',
    'Social Media':'Create one useful Beyond the Tremor social-media draft for today. Keep publishing behind approval.',
    'Reader Care':'Prepare a reader-care triage result. If real Gmail message data is not available, say so clearly and do not invent messages.',
    'Finance & Orders':'Review any connected order or payment information available. If no real records are available, say so clearly and do not invent totals.',
    'Aiva Presentation':'Prepare a concise presentation readiness brief and one useful next speaking task for Kimberly.',
    'Grant & Sponsorship':'Prepare a grant and sponsorship priority brief. Do not claim live opportunity research unless verified sources are actually available.',
    'Media':'Prepare one media-outreach work package for Beyond the Tremor. Do not send anything.',
    'Website':'Prepare a practical Jazz Command Center website check plan. Do not claim a repository or deployment change unless it actually happened.',
    'Knowledge':'Prepare a concise Jazz knowledge-work summary. Do not invent private records not provided to the task.',
    'Events':'Prepare an events readiness brief. If real Calendar data is not available, say so clearly and do not invent events.',
    'Lead & CRM':'Search the web for 5 verified Parkinson’s advocacy or book partnership leads in the Philippines. Include source URLs and never guess contact details.'
  };
  let active=false, ids={}, timers=[], boardTimer=null;
  const $=s=>document.querySelector(s);
  const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function tasks(){try{const x=JSON.parse(localStorage.getItem(TASKS_KEY)||'[]');return Array.isArray(x)?x:[]}catch(_){return[]}}
  function taskById(id){return tasks().find(t=>t.id===id)}
  function label(s){return({'DEPLOYING':'DEPLOYING','WORKING':'WORKING','WAITING FOR APPROVAL':'REVIEW','COMPLETE':'COMPLETE','ERROR':'CHECK NEEDED','CANCELLED':'CANCELLED'})[s]||s||'QUEUED'}
  function color(s){if(s==='COMPLETE')return'#69e7b4';if(s==='ERROR'||s==='CANCELLED')return'#ff7683';if(s==='WAITING FOR APPROVAL')return'#d9bd7c';if(s==='WORKING'||s==='DEPLOYING')return'#9c6cff';return'#777'}
  function note(t){try{if(typeof window.toast==='function')window.toast(t)}catch(_){}}
  function go(v){try{if(typeof window.nav==='function')window.nav(v)}catch(_){}}
  function renderBoard(){
    if(!active)return;
    const box=$('#workList'); if(!box)return;
    box.innerHTML='<div style="padding:16px;border:1px solid rgba(156,108,255,.4);border-radius:20px;background:rgba(12,13,36,.9);margin-bottom:12px"><div class="eyebrow">11-AGENT LIVE DEPLOYMENT</div><h3 style="margin:6px 0;color:var(--gold)">Jazz agents are working through your private backend</h3><p style="margin:0;color:var(--muted)">Results that need action stay behind approval.</p></div>'+ 
      AGENTS.map(name=>{
        const t=ids[name]?taskById(ids[name]):null,s=t?t.status:'QUEUED',detail=t?(t.step||t.result||t.command):'Waiting to start';
        return '<div class="row" data-live-agent="'+esc(name)+'"><span class="dot" style="background:'+color(s)+';box-shadow:0 0 12px '+color(s)+'"></span><div style="min-width:0"><strong>'+esc(name)+' — '+esc(label(s))+'</strong><small>'+esc(detail)+'</small></div>'+(t?'<button data-open-live-task="'+esc(t.id)+'">OPEN</button>':'')+'</div>';
      }).join('');
    box.querySelectorAll('[data-open-live-task]').forEach(b=>b.onclick=()=>{
      active=false; clearInterval(boardTimer);
      const t=taskById(b.dataset.openLiveTask);
      try{window.JazzAgentEngine?.render(t)}catch(_){}
    });
  }
  function start(e){
    if(e){e.preventDefault();e.stopImmediatePropagation()}
    try{if(typeof window.deploy==='function')window.deploy()}catch(_){}
    const bridge=window.JazzAppsScriptAgents;
    if(!bridge||!bridge.isConfigured||!bridge.isConfigured()){
      note('Google Apps Script is not connected yet. Open Connections and press CHECK.');
      go('connections'); return;
    }
    active=true; ids={}; timers.forEach(clearTimeout); timers=[]; clearInterval(boardTimer);
    go('work'); renderBoard(); boardTimer=setInterval(renderBoard,350);
    note('Deploying all 11 agents through Google Apps Script.');
    AGENTS.forEach((name,i)=>timers.push(setTimeout(()=>{
      try{
        const t=bridge.run('Ask '+name+' to '+JOBS[name]);
        if(t&&t.id)ids[name]=t.id;
        active=true; renderBoard();
      }catch(err){note(name+' could not start.')}
    },i*650)));
  }
  function bind(){
    const b=document.querySelector('[data-act="deploy"]');
    if(!b||b.dataset.realDeployAll==='1')return;
    b.dataset.realDeployAll='1';
    b.addEventListener('click',start,true);
    const stop=$('#stopBtn');
    if(stop&&!stop.dataset.realDeployStop){
      stop.dataset.realDeployStop='1';
      stop.addEventListener('click',()=>{active=false;clearInterval(boardTimer);timers.forEach(clearTimeout);timers=[]});
    }
  }
  window.JazzDeployAll={start,show:()=>{active=true;go('work');renderBoard()},state:()=>({active,ids:Object.assign({},ids)})};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{setTimeout(bind,0);setTimeout(bind,900)});
  else{setTimeout(bind,0);setTimeout(bind,900)}
  window.addEventListener('pageshow',()=>setTimeout(bind,100));
})();