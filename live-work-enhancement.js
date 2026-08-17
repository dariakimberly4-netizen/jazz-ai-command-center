/* Jazz Book Brain integration + original Live Work loader */
(function(){
  'use strict';

  var original=document.createElement('script');
  original.src='live-work-enhancement-original.js?v=22';
  document.head.appendChild(original);

  var brain=null;
  var brainReady=false;

  function byId(id){return document.getElementById(id)}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]})}
  function note(t){try{if(typeof window.toast==='function')window.toast(t)}catch(_){}}
  function say(t){try{if(typeof window.speak==='function')window.speak(t)}catch(_){}}

  function loadBrain(){
    return fetch('book-brain.json?v=22',{cache:'no-store'})
      .then(function(r){if(!r.ok)throw new Error('Book Brain unavailable');return r.json()})
      .then(function(d){brain=d;brainReady=true;renderStatus();return d})
      .catch(function(){brainReady=false;renderStatus()});
  }

  function score(entry,q){
    var terms=String(q||'').toLowerCase().split(/[^a-z0-9₱]+/).filter(function(x){return x.length>2});
    var themes=(entry.themes||[]).join(' ').toLowerCase();
    var hay=[entry.chapter,entry.summary,themes,entry.exact_quote||''].join(' ').toLowerCase();
    var s=0;
    terms.forEach(function(t){if(hay.indexOf(t)>=0)s+=1;if(themes.indexOf(t)>=0)s+=2;if(String(entry.chapter||'').toLowerCase().indexOf(t)>=0)s+=2});
    return s;
  }

  function searchBook(q){
    if(!brain||!Array.isArray(brain.entries))return [];
    var ranked=brain.entries.map(function(e){return {e:e,s:score(e,q)}}).sort(function(a,b){return b.s-a.s});
    var hits=ranked.filter(function(x){return x.s>0}).slice(0,4).map(function(x){return x.e});
    return hits.length?hits:brain.entries.slice(0,3);
  }

  function answerBook(q){
    var area=byId('bookBrainResults');
    if(!area)return;
    if(!brainReady){area.innerHTML='<div class="empty">Book Brain is still loading. Please try again.</div>';return}
    var hits=searchBook(q);
    area.innerHTML=hits.map(function(e){return '<div class="row" style="display:block">'+
      '<div class="eyebrow">BOOK SOURCE • '+esc(e.pages?('PAGE '+e.pages):'SOURCE')+'</div>'+
      '<strong>'+esc(e.chapter)+'</strong>'+
      '<p style="margin:8px 0;color:#ddd;line-height:1.5">'+esc(e.summary)+'</p>'+
      (e.exact_quote?'<p style="margin:8px 0"><strong>Exact quote:</strong> “'+esc(e.exact_quote)+'”</p>':'')+
      '<small>Source mode: Beyond the Tremor • '+(e.exact_quote?'quote verified in Book Brain':'summary/paraphrase')+'</small></div>'}).join('');
    if(hits[0])say('I found this in Beyond the Tremor. '+hits[0].summary);
  }

  function renderStatus(){var s=byId('bookBrainStatus');if(s)s.textContent=brainReady?'READY • SOURCE LOCK ON':'LOADING BOOK…'}

  function openBrain(){
    ensureUI();
    var o=byId('bookBrainOverlay');
    if(o)o.classList.add('open');
    var q=byId('bookBrainQuery');
    if(q)setTimeout(function(){q.focus()},80);
    note('Beyond the Tremor Book Brain opened.');
  }
  function closeBrain(){var o=byId('bookBrainOverlay');if(o)o.classList.remove('open')}

  function ensureButton(){
    var actions=document.querySelector('.actions');
    if(!actions)return false;
    var btn=byId('bookBrainBtn');
    if(!btn){
      btn=document.createElement('button');
      btn.id='bookBrainBtn';
      btn.className='action';
      btn.innerHTML='<i>🧠</i>BOOK BRAIN';
      var liveBtn=actions.querySelector('[data-nav="work"]');
      if(liveBtn&&liveBtn.nextSibling)actions.insertBefore(btn,liveBtn.nextSibling);else actions.appendChild(btn);
    }
    btn.onclick=openBrain;
    btn.style.display='block';
    btn.removeAttribute('hidden');
    return true;
  }

  function ensureOverlay(){
    if(byId('bookBrainOverlay'))return;
    var overlay=document.createElement('div');
    overlay.id='bookBrainOverlay';
    overlay.className='talkbox';
    overlay.innerHTML='<div class="sheet" style="max-height:90vh;overflow:auto">'+
      '<div class="eyebrow">BEYOND THE TREMOR • KNOWLEDGE BRAIN</div><h2>🧠 Ask My Book</h2>'+
      '<p class="honest">Jazz searches the source-grounded Book Brain first. Direct quotes are never invented.</p>'+
      '<div class="badge" id="bookBrainStatus">LOADING BOOK…</div>'+
      '<div class="input" style="grid-template-columns:minmax(0,1fr) 68px;margin-top:14px">'+
      '<input id="bookBrainQuery" placeholder="Ask about faith, DBS, family, resilience…" aria-label="Ask Beyond the Tremor">'+
      '<button id="bookBrainAsk">ASK</button></div>'+
      '<div class="quick"><button data-book-q="What does my book say about resilience?">Resilience</button><button data-book-q="What does my book say about my mother and family?">Family</button><button data-book-q="What does my book say about DBS?">DBS</button><button data-book-q="What does my book say about advocacy and purpose?">Purpose</button></div>'+
      '<div class="list" id="bookBrainResults"><div class="empty">Ask a question about your book.</div></div>'+
      '<button class="close" id="bookBrainClose">CLOSE</button></div>';
    document.body.appendChild(overlay);
    byId('bookBrainClose').onclick=closeBrain;
    byId('bookBrainAsk').onclick=function(){answerBook((byId('bookBrainQuery').value||'').trim())};
    byId('bookBrainQuery').onkeydown=function(e){if(e.key==='Enter')byId('bookBrainAsk').click()};
    overlay.querySelectorAll('[data-book-q]').forEach(function(b){b.onclick=function(){byId('bookBrainQuery').value=b.getAttribute('data-book-q');answerBook(byId('bookBrainQuery').value)}});
    renderStatus();
  }

  function ensureUI(){ensureButton();ensureOverlay()}

  function looksLikeBookQuestion(q){return /\b(book|beyond the tremor|chapter|what did i write|my story|my memoir|quote|resilience|faith|dbs|parkinson|mother|sister|advocacy)\b/i.test(q)}

  function enhanceTalk(){
    var send=byId('send'),cmd=byId('command');
    if(!send||!cmd||send.dataset.bookBrainEnhanced==='1')return;
    send.dataset.bookBrainEnhanced='1';
    var oldClick=send.onclick;
    send.onclick=function(ev){
      var q=(cmd.value||'').trim();
      if(q&&looksLikeBookQuestion(q)){
        var t=byId('talkbox');if(t)t.classList.remove('open');
        openBrain();byId('bookBrainQuery').value=q;answerBook(q);cmd.value='';return false;
      }
      if(typeof oldClick==='function')return oldClick.call(this,ev);
    };
  }

  function init(){
    ensureUI();
    loadBrain();
    enhanceTalk();
    var tries=0;
    var retry=setInterval(function(){
      ensureUI();enhanceTalk();tries++;
      if(tries>20&&byId('bookBrainBtn'))clearInterval(retry);
    },500);
    window.addEventListener('pageshow',function(){ensureUI();enhanceTalk()});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
  window.JazzBookBrain={open:openBrain,search:searchBook,answer:answerBook,get ready(){return brainReady}};
})();