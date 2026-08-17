/* Jazz Book Brain integration + original Live Work loader */
(function(){
  'use strict';

  var original=document.createElement('script');
  original.src='live-work-enhancement-original.js?v=31';
  document.head.appendChild(original);

  var brain=null;
  var brainReady=false;

  function byId(id){return document.getElementById(id)}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  function note(t){try{if(typeof window.toast==='function')window.toast(t)}catch(_){}}
  function say(t){try{if(typeof window.speak==='function')window.speak(t)}catch(_){}}

  function loadBrain(){
    return fetch('book-brain.json?v=31-grounding',{cache:'no-store'})
      .then(function(r){if(!r.ok)throw new Error('Book Brain unavailable');return r.json()})
      .then(function(d){brain=d;brainReady=true;renderStatus();return d})
      .catch(function(){brainReady=false;renderStatus()});
  }

  var STOP={
    what:1,when:1,where:1,which:1,who:1,whom:1,whose:1,why:1,how:1,does:1,did:1,done:1,doing:1,
    are:1,was:1,were:1,been:1,being:1,the:1,and:1,but:1,then:1,than:1,for:1,from:1,with:1,without:1,
    about:1,into:1,through:1,our:1,you:1,your:1,say:1,says:1,said:1,tell:1,tells:1,according:1,
    book:1,beyond:1,tremor:1,kimberly:1,daria:1,please:1,can:1,could:1,would:1,should:1,there:1,this:1,that:1,these:1,those:1
  };
  function norm(s){return String(s||'').toLowerCase().replace(/[’']/g,"'").replace(/[^a-z0-9₱]+/g,' ').trim()}
  function queryTerms(q){return norm(q).split(/\s+/).filter(function(t){return t.length>2&&!STOP[t]})}
  function entryText(e){return norm([e.chapter,e.summary,(e.themes||[]).join(' '),e.exact_quote||''].join(' '))}
  function chapterNumber(q){var m=norm(q).match(/\bchapter\s+(\d+)\b/);return m?m[1]:null}
  function score(entry,q){
    var text=entryText(entry),themes=norm((entry.themes||[]).join(' ')),chapter=norm(entry.chapter||'');
    var terms=queryTerms(q),ch=chapterNumber(q),s=0,matched=0;
    if(ch&&new RegExp('^chapter\\s+'+ch+'\\b').test(chapter)){s+=12;matched+=2}
    terms.forEach(function(t){
      if(text.indexOf(t)>=0){matched++;s+=1}
      if(themes.indexOf(t)>=0)s+=3;
      if(chapter.indexOf(t)>=0)s+=2;
    });
    return {s:s,matched:matched};
  }

  function searchBook(q){
    if(!brain||!Array.isArray(brain.entries))return [];
    var ch=chapterNumber(q),meaningful=queryTerms(q);
    if(!ch&&!meaningful.length)return [];
    var ranked=brain.entries.map(function(e){var x=score(e,q);return {e:e,s:x.s,matched:x.matched}}).sort(function(a,b){return b.s-a.s});
    if(ch)return ranked.filter(function(x){return x.s>=10}).slice(0,5).map(function(x){return x.e});
    var minMatched=meaningful.length>=3?2:1;
    return ranked.filter(function(x){return x.matched>=minMatched&&x.s>=1}).slice(0,5).map(function(x){return x.e});
  }

  function showNotFound(area){
    var msg="I couldn’t find that information in Beyond the Tremor.";
    area.innerHTML='<div class="row" style="display:block;border-color:rgba(255,156,165,.45)">'+
      '<div class="eyebrow" style="color:#ffb7bd">BOOK BRAIN • NOT FOUND</div>'+
      '<strong>No supported source found</strong>'+
      '<p style="margin:8px 0;color:#eee;line-height:1.5">'+esc(msg)+'</p>'+
      '<small>Source lock: ON • No unrelated chapter summaries were substituted.</small></div>';
    say(msg);
  }

  function answerBook(q){
    var area=byId('bookBrainResults');
    if(!area)return;
    if(!brainReady){area.innerHTML='<div class="empty">Book Brain is still loading. Please try again.</div>';return}
    var hits=searchBook(q);
    if(!hits.length){showNotFound(area);return}
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

  function isBookBrainButton(btn){
    if(!btn)return false;
    if(btn.id==='bookBrainBtn')return true;
    var text=String(btn.textContent||'').replace(/\s+/g,' ').trim().toUpperCase();
    return text==='BOOK BRAIN'||text.indexOf('BOOK BRAIN')>=0;
  }

  function ensureButton(){
    var actions=document.querySelector('.actions');
    if(!actions)return false;

    var matches=Array.prototype.filter.call(actions.querySelectorAll('button'),isBookBrainButton);
    var btn=matches.length?matches[0]:null;
    for(var i=1;i<matches.length;i++)matches[i].remove();

    if(!btn){
      btn=document.createElement('button');
      btn.className='action';
      btn.innerHTML='<i>🧠</i>BOOK BRAIN';
      var liveBtn=actions.querySelector('[data-nav="work"]');
      if(liveBtn&&liveBtn.nextSibling)actions.insertBefore(btn,liveBtn.nextSibling);else actions.appendChild(btn);
    }

    btn.id='bookBrainBtn';
    btn.className='action';
    btn.innerHTML='<i>🧠</i>BOOK BRAIN';
    btn.onclick=openBrain;
    btn.style.display='block';
    btn.removeAttribute('hidden');
    return true;
  }

  function ensureOverlay(){
    var overlays=document.querySelectorAll('#bookBrainOverlay');
    if(overlays.length>1){for(var i=1;i<overlays.length;i++)overlays[i].remove()}
    if(byId('bookBrainOverlay'))return;
    var overlay=document.createElement('div');
    overlay.id='bookBrainOverlay';
    overlay.className='talkbox';
    overlay.innerHTML='<div class="sheet" style="max-height:90vh;overflow:auto">'+
      '<div class="eyebrow">BEYOND THE TREMOR • KNOWLEDGE BRAIN</div><h2>🧠 Ask My Book</h2>'+
      '<p class="honest">Jazz searches the source-grounded Book Brain first. Direct quotes are never invented. Unsupported claims return NOT FOUND.</p>'+
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