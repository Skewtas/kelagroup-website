/* Kela – gemensamt skript för undersidorna (Pop Stilren).
   Meny, reveals, räknare, bokningsdemo, kontaktformulär, Boka möte-rutan och chatten. */
(function(){
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* mobilmeny */
  var nav = document.getElementById('nav'), burger = document.getElementById('burger'), mm = document.getElementById('mmenu');
  if(burger && mm){
    var setMenu = function(open){
      burger.setAttribute('aria-expanded', open);
      burger.setAttribute('aria-label', open ? 'Stäng meny' : 'Öppna meny');
      mm.classList.toggle('open', open);
      mm.setAttribute('aria-hidden', !open);
      document.body.style.overflow = open ? 'hidden' : '';
    };
    burger.addEventListener('click', function(){ setMenu(burger.getAttribute('aria-expanded') !== 'true'); });
    mm.querySelectorAll('a').forEach(function(a){ a.addEventListener('click', function(){ setMenu(false); }); });
    document.addEventListener('keydown', function(e){ if(e.key === 'Escape' && mm.classList.contains('open')) setMenu(false); });
  }

  /* nav får bakgrund när man scrollar */
  if(nav){
    var onScroll = function(){ nav.classList.toggle('scrolled', window.scrollY > 30); };
    window.addEventListener('scroll', onScroll, { passive:true }); onScroll();
  }

  /* reveals */
  var rvs = document.querySelectorAll('.rv');
  if('IntersectionObserver' in window && !reduce){
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(e){ if(e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: .12, rootMargin: '0px 0px -6% 0px' });
    rvs.forEach(function(el){ io.observe(el); });
  } else {
    rvs.forEach(function(el){ el.classList.add('in'); });
  }

  /* räknare */
  var counters = document.querySelectorAll('.big[data-count]');
  if(counters.length && 'IntersectionObserver' in window){
    var cio = new IntersectionObserver(function(entries){
      entries.forEach(function(e){
        if(!e.isIntersecting) return;
        var el=e.target, target=+el.getAttribute('data-count'), suf=el.getAttribute('data-suffix')||'';
        if(reduce){ el.textContent=target+suf; cio.unobserve(el); return; }
        var start=null;
        function tick(ts){ if(!start) start=ts; var p=Math.min((ts-start)/1500,1); el.textContent=Math.round((1-Math.pow(1-p,3))*target)+suf; if(p<1) requestAnimationFrame(tick); }
        requestAnimationFrame(tick); cio.unobserve(el);
      });
    }, { threshold: 0.6 });
    counters.forEach(function(el){ cio.observe(el); });
  }

  /* CTA-bubblor rör sig lite vid scroll */
  var blobs = document.querySelectorAll('[data-blob]');
  if(blobs.length && !reduce){
    var bt = false;
    var moveBlobs = function(){ bt = false; blobs.forEach(function(b){ b.style.transform = 'translate3d(0,' + (b.parentElement.getBoundingClientRect().top * parseFloat(b.dataset.blob)) + 'px,0)'; }); };
    window.addEventListener('scroll', function(){ if(!bt){ bt = true; requestAnimationFrame(moveBlobs); } }, { passive:true });
    moveBlobs();
  }

  /* booking demo (only where present) */
  var cal = document.getElementById('cal');
  var timesEl = document.getElementById('times');
  if(cal && timesEl){
    var days=[{d:'Mån',n:'12'},{d:'Tis',n:'13'},{d:'Ons',n:'14'},{d:'Tor',n:'15'}];
    var times=['09:00','10:30','13:00','15:30'];
    var summary=document.getElementById('summary'), bookBtn=document.getElementById('bookBtn'), panel=document.getElementById('demoPanel');
    var selDay=null, selTime=null;
    days.forEach(function(day){
      var el=document.createElement('button'); el.type='button'; el.className='slot';
      el.innerHTML='<span class="d">'+day.d+'</span>'+day.n;
      el.addEventListener('click', function(){ cal.querySelectorAll('.slot').forEach(function(s){s.classList.remove('sel');}); el.classList.add('sel'); selDay=day; upd(); });
      cal.appendChild(el);
    });
    times.forEach(function(t){
      var el=document.createElement('button'); el.type='button'; el.className='time'; el.textContent=t;
      el.addEventListener('click', function(){ timesEl.querySelectorAll('.time').forEach(function(s){s.classList.remove('sel');}); el.classList.add('sel'); selTime=t; upd(); });
      timesEl.appendChild(el);
    });
    function upd(){
      if(selDay&&selTime){ summary.innerHTML='<b>'+selDay.d+' '+selDay.n+' aug</b>, kl <b>'+selTime+'</b> · 30 min'; bookBtn.disabled=false; bookBtn.style.opacity='1'; }
      else if(selDay){ summary.textContent='Välj en tid för '+selDay.d.toLowerCase()+' den '+selDay.n+'.'; }
    }
    if(bookBtn) bookBtn.addEventListener('click', function(){
      if(!selDay||!selTime) return;
      var bt=document.getElementById('bookedText'); if(bt) bt.textContent='Bokat: '+selDay.d+' '+selDay.n+' aug, kl '+selTime+' — bekräftelse skickad.';
      if(panel) panel.classList.add('done');
    });
  }

  /* contact form → Formspree (AJAX, no redirect) */
  var form = document.getElementById('contactForm');
  if(form){
    var okEl=document.getElementById('formOk'), errEl=document.getElementById('formErr'), btn=document.getElementById('cf-submit');
    form.addEventListener('submit', function(e){
      e.preventDefault();
      if(okEl) okEl.style.display='none';
      if(errEl) errEl.style.display='none';
      var action=form.getAttribute('action')||'';
      if(action.indexOf('REPLACE_WITH_FORM_ID')!==-1){ /* demo until endpoint is set */
        if(okEl) okEl.style.display='flex'; form.reset(); return;
      }
      if(btn){ btn.disabled=true; btn.style.opacity='.6'; }
      fetch(action, { method:'POST', body:new FormData(form), headers:{ 'Accept':'application/json' } })
        .then(function(r){
          if(r.ok){ if(okEl) okEl.style.display='flex'; form.reset(); }
          else { if(errEl) errEl.style.display='block'; }
        })
        .catch(function(){ if(errEl) errEl.style.display='block'; })
        .then(function(){ if(btn){ btn.disabled=false; btn.style.opacity='1'; } });
    });
  }

  /* ---------- Boka möte-modal (fysiskt / online → välj tid i kalendern, eller formulär) ---------- */
  /* Kalenderbokning: fyll i er Cal.com-länk (t.ex. 'kelagroup/30min') så väljer kunden
     en ledig tid direkt. Tom = kunden skickar en förfrågan via formuläret som tidigare. */
  var CAL_LINK = '';
  (function(){
    var overlay=document.createElement('div');
    overlay.className='bm-overlay'; overlay.id='bmOverlay'; overlay.hidden=true;
    overlay.innerHTML=''+
      '<div class="bm-modal" role="dialog" aria-modal="true" aria-labelledby="bmTitle">'+
        '<button class="bm-close" id="bmClose" type="button" aria-label="Stäng"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>'+
        '<div class="bm-step" data-step="1">'+
          '<span class="kicker">Boka möte</span>'+
          '<h3 id="bmTitle">Hur vill du träffas?</h3>'+
          '<p class="bm-sub">Välj det som passar dig bäst — vi återkommer inom 24 timmar.</p>'+
          '<div class="bm-choices">'+
            '<button class="bm-choice" type="button" data-type="Fysiskt möte">'+
              '<span class="bm-ic"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg></span>'+
              '<span class="bm-ct">Fysiskt möte</span>'+
              '<span class="bm-cd">Vi ses på plats i Stockholm.</span>'+
            '</button>'+
            '<button class="bm-choice" type="button" data-type="Online-möte">'+
              '<span class="bm-ic"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 10l5-3v10l-5-3z"/><rect x="2" y="6" width="13" height="12" rx="2.5"/></svg></span>'+
              '<span class="bm-ct">Online-möte</span>'+
              '<span class="bm-cd">Videosamtal när det passar dig.</span>'+
            '</button>'+
          '</div>'+
        '</div>'+
        '<div class="bm-step" data-step="3" hidden>'+
          '<button class="bm-back" data-back type="button"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg> Tillbaka</button>'+
          '<span class="kicker">Boka möte · <span class="bm-chosen" id="bmChosenCal"></span></span>'+
          '<h3>Välj en tid som passar.</h3>'+
          '<div class="bm-cal" id="bmCal"></div>'+
          '<p class="bm-alt">Hittar du ingen tid? <button type="button" class="bm-link" id="bmToForm">Skicka en förfrågan i stället</button></p>'+
        '</div>'+
        '<div class="bm-step" data-step="2" hidden>'+
          '<button class="bm-back" id="bmBack" type="button"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg> Tillbaka</button>'+
          '<span class="kicker">Boka möte · <span class="bm-chosen" id="bmChosen"></span></span>'+
          '<h3>Berätta lite kort om er.</h3>'+
          '<p class="bm-sub">Så återkommer vi med förslag på tid.</p>'+
          '<form class="form" id="bmForm" action="https://formspree.io/f/xojkdewo" method="POST" novalidate>'+
            '<input type="hidden" name="_subject" value="Ny mötesförfrågan från kelagroup.se">'+
            '<input type="hidden" name="typ_av_mote" id="bmTypeField" value="">'+
            '<div class="field"><label for="bm-name">Namn</label><input id="bm-name" name="name" type="text" autocomplete="name" placeholder="För- och efternamn" required></div>'+
            '<div class="field"><label for="bm-email">E-post</label><input id="bm-email" name="email" type="email" autocomplete="email" placeholder="du@företag.se" required></div>'+
            '<div class="field"><label for="bm-msg">Vad gäller det?</label><textarea id="bm-msg" name="message" placeholder="Berätta kort om ert projekt eller vad som tar tid …" required></textarea></div>'+
            '<button type="submit" class="btn btn-dark" id="bmSubmit">Skicka förfrågan <span class="arr" aria-hidden="true">→</span></button>'+
            '<p class="bm-err" id="bmErr" hidden>Något gick fel — mejla oss gärna på <a href="mailto:hej@kelagroup.se">hej@kelagroup.se</a>.</p>'+
          '</form>'+
        '</div>'+
      '</div>';
    document.body.appendChild(overlay);

    var step1=overlay.querySelector('[data-step="1"]');
    var step2=overlay.querySelector('[data-step="2"]');
    var typeField=overlay.querySelector('#bmTypeField');
    var chosenEl=overlay.querySelector('#bmChosen');
    var bmForm=overlay.querySelector('#bmForm');
    var bmErr=overlay.querySelector('#bmErr');
    var bmSubmit=overlay.querySelector('#bmSubmit');
    var lastFocus=null;

    var step3=overlay.querySelector('[data-step="3"]');
    function showStep(n){
      step1.hidden = (n!==1); step2.hidden = (n!==2); step3.hidden = (n!==3);
      overlay.querySelector('.bm-modal').classList.toggle('wide', n===3);
    }
    function openModal(){
      lastFocus=document.activeElement;
      overlay.hidden=false; showStep(1);
      requestAnimationFrame(function(){ overlay.classList.add('open'); });
      document.body.style.overflow='hidden';
      var f=overlay.querySelector('.bm-choice'); if(f) f.focus();
    }
    function closeModal(){
      overlay.classList.remove('open');
      document.body.style.overflow='';
      setTimeout(function(){ overlay.hidden=true; }, 260);
      if(lastFocus && lastFocus.focus) lastFocus.focus();
    }
    function chooseType(t){
      typeField.value=t; chosenEl.textContent=t;
      if(CAL_LINK){
        overlay.querySelector('#bmChosenCal').textContent=t;
        var cal=overlay.querySelector('#bmCal');
        cal.innerHTML='<iframe title="Välj tid för möte" loading="lazy" src="https://cal.com/'+CAL_LINK+'?embed=true&layout=month_view&theme=light&notes='+encodeURIComponent(t)+'"></iframe>';
        showStep(3); return;
      }
      showStep(2);
      var n=overlay.querySelector('#bm-name'); if(n) n.focus();
    }
    overlay.querySelector('#bmToForm').addEventListener('click', function(){ showStep(2); var n=overlay.querySelector('#bm-name'); if(n) n.focus(); });
    overlay.querySelector('[data-back]').addEventListener('click', function(){ showStep(1); });

    overlay.querySelectorAll('.bm-choice').forEach(function(b){
      b.addEventListener('click', function(){ chooseType(b.getAttribute('data-type')); });
    });
    overlay.querySelector('#bmClose').addEventListener('click', closeModal);
    overlay.querySelector('#bmBack').addEventListener('click', function(){ showStep(1); });
    overlay.addEventListener('click', function(e){ if(e.target===overlay) closeModal(); });
    document.addEventListener('keydown', function(e){ if(e.key==='Escape' && !overlay.hidden) closeModal(); });

    /* submit → Formspree */
    bmForm.addEventListener('submit', function(e){
      e.preventDefault();
      if(bmErr) bmErr.hidden=true;
      var action=bmForm.getAttribute('action')||'';
      if(bmSubmit){ bmSubmit.disabled=true; bmSubmit.style.opacity='.6'; }
      fetch(action, { method:'POST', body:new FormData(bmForm), headers:{ 'Accept':'application/json' } })
        .then(function(r){
          if(r.ok){
            step2.innerHTML='<div class="bm-done"><div class="bm-check"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></div><h3>Tack! Vi hör av oss.</h3><p class="bm-sub">Vi återkommer inom 24 timmar med förslag på tid för ditt '+(typeField.value.toLowerCase())+'.</p><button class="btn btn-dark" type="button" id="bmDone">Stäng</button></div>';
            var db=overlay.querySelector('#bmDone'); if(db) db.addEventListener('click', closeModal);
          } else { if(bmErr) bmErr.hidden=false; if(bmSubmit){ bmSubmit.disabled=false; bmSubmit.style.opacity='1'; } }
        })
        .catch(function(){ if(bmErr) bmErr.hidden=false; if(bmSubmit){ bmSubmit.disabled=false; bmSubmit.style.opacity='1'; } });
    });

    /* triggers: FAB + alla "Boka…"-länkar som pekar mot kontakt.html */
    function isBookTrigger(a){
      if(a.hasAttribute('data-book')) return true;
      var href=a.getAttribute('href')||'';
      if(!/kontakt\.html/i.test(href)) return false;
      return /^\s*boka/i.test(a.textContent||'');
    }
    document.addEventListener('click', function(e){
      var a=e.target.closest('a, .fab'); if(!a) return;
      if(isBookTrigger(a)){ e.preventDefault(); openModal(); }
    });
  })();

  /* ---------- KELA chatt-assistent ---------- */
  (function(){
    var launcher=document.createElement('button');
    launcher.className='kchat-btn'; launcher.type='button'; launcher.setAttribute('aria-label','Öppna chatten');
    launcher.innerHTML='<span class="kb-av">K<span class="on"></span></span><span class="kb-tx"><b>Chatta med oss</b><i>Svarar oftast direkt</i></span>';
    document.body.appendChild(launcher);

    var panel=document.createElement('div');
    panel.className='kchat'; panel.setAttribute('role','dialog'); panel.setAttribute('aria-label','Kela chatt');
    panel.innerHTML=''+
      '<div class="kchat-hd"><div class="av">K<span class="on"></span></div><div class="ti"><b>Kela assistent</b><span>Online · svarar oftast direkt</span></div><button class="kchat-x" type="button" aria-label="Stäng"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>'+
      '<div class="kchat-msgs" id="kchatMsgs"></div>'+
      '<div class="kchat-qr" id="kchatQr"></div>'+
      '<form class="kchat-in" id="kchatForm"><textarea id="kchatInput" rows="1" placeholder="Skriv ditt meddelande…" aria-label="Meddelande"></textarea><button class="kchat-send" type="submit" aria-label="Skicka"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/></svg></button></form>'+
      '<div class="kchat-foot">⚡ Drivs av Kela AI</div>';
    document.body.appendChild(panel);

    var msgs=panel.querySelector('#kchatMsgs'), qr=panel.querySelector('#kchatQr'), form=panel.querySelector('#kchatForm'), input=panel.querySelector('#kchatInput');
    var history=[], greeted=false, typingEl=null;
    var QUICK=['Vad kan ni bygga?','Koppla ihop våra system','Vad kostar det?','Boka ett möte'];
    function scroll(){ msgs.scrollTop=msgs.scrollHeight; }
    function esc(s){ return (s||'').replace(/[&<>]/g,function(c){return c==='&'?'&amp;':c==='<'?'&lt;':'&gt;';}); }
    function addMsg(role,html){ var d=document.createElement('div'); d.className='kmsg '+role; d.innerHTML=html; msgs.appendChild(d); scroll(); }
    function showQuick(){ qr.innerHTML=''; QUICK.forEach(function(t){ var b=document.createElement('button'); b.type='button'; b.textContent=t; b.onclick=function(){ send(t); }; qr.appendChild(b); }); }
    function typing(on){ if(on){ typingEl=document.createElement('div'); typingEl.className='ktyping'; typingEl.innerHTML='<i></i><i></i><i></i>'; msgs.appendChild(typingEl); scroll(); } else if(typingEl){ typingEl.remove(); typingEl=null; } }

    function local(qRaw){
      var q=(qRaw||'').toLowerCase();
      var has=function(){ for(var i=0;i<arguments.length;i++){ if(q.indexOf(arguments[i])>-1) return true; } return false; };
      var BOOK='<a href="kontakt.html" class="kbook" data-book>Boka ett möte →</a>';
      if(has('hej','hallå','tja','tjena','god morgon','god kväll','hello')) return 'Hej! 👋 Vad kul att du hör av dig. Jag kan hjälpa dig med allt om Kela group — tjänster, priser, bokning och våra kundcase. Vad undrar du?';
      if(has('pris','kostar','kostnad','offert','dyrt','billig')) return 'Du kan räkna ut ditt eget pris på <strong>60 sekunder</strong> i vår priskalkylator 👉 <a href="priskalkylator.html">Räkna ut priset →</a><br><br>Ungefärligt: hemsida fr. 9 900 kr, e-handel fr. 19 900 kr, eget system fr. 29 900 kr. Du kan även delbetala på 2–3 år. Vill du ha ett exakt pris? '+BOOK;
      if(has('boka','möte','ring','prata','träffas','kontakt','mejl','mail','maila','hör av')) return 'Absolut! Vi tar gärna ett kostnadsfritt samtal — fysiskt eller online. '+BOOK+'<br><br>Eller mejla oss på <a href="mailto:hej@kelagroup.se">hej@kelagroup.se</a> så svarar vi inom 24 timmar.';
      if(has('integr','integrera','api','koppl','synk','ekonomisystem','ekonomi','bokför','fortnox','visma','business central','dynamics','navision','erp','lager','lön ','löne')) return 'Ja — <strong>vi kopplar ihop allt</strong>. Har systemet ett API kan vi integrera det: affärssystem och ekonomisystem (t.ex. Fortnox, Visma, Business Central), CRM, lager, lön, e-handel, bokning och mer.<br><br>Era system slutar vara isolerade öar och börjar prata med varandra automatiskt — ingen dubbelregistrering, allt på ett ställe. Berätta vilka system ni använder idag så föreslår vi en lösning: '+BOOK;
      if(has('modul','färdig','personalapp','kundapp','feedback','påminnel','dashboard','översikt','nyhetsbrev',' sms','annons',' ads','content','presentkort','in- och ut','incheck','utcheck')) return 'Vi har flera <strong>färdiga system</strong> som redan används i skarp drift — redo att koppla på:<br>• Personalapp (in-/utcheck &amp; kvalitetskontroller)<br>• Kundapp<br>• Feedbackhantering<br>• Automatiska fakturapåminnelser<br>• Dashboard &amp; översikt<br>• SEO &amp; analys<br>• Nyhetsbrev &amp; SMS<br>• Automatisk annonshantering<br>• Content generator (AI)<br>• Presentkort<br><br>Vill du veta vilka som passar er verksamhet? '+BOOK;
      if(has('hemsida','webb','website','sajt','e-handel','webbshop','butik')) return 'Vi bygger snabba, snygga och konverterande hemsidor och webbshoppar från grunden — din bästa säljare dygnet runt. Hemsida fr. 9 900 kr, e-handel fr. 19 900 kr.<br><br><a href="priskalkylator.html">Räkna ut priset →</a>';
      if(has('system','crm','affärssystem','portal','bokning','rekryter')) return 'Vi bygger egna system, CRM, bokning och portaler — anpassade efter hur ni faktiskt jobbar. Hos Stodona bytte vi dyra abonnemang mot egna system och sänkte kostnaden med ca <strong>565 000 kr/år</strong>.<br><br><a href="priskalkylator.html">Räkna ut ett pris →</a> eller '+BOOK;
      if(has('automation','automatisera',' ai','ai-','chatbot','agent','robot')) return 'Vi bygger automationer och AI som sköter det repetitiva — offerter, uppföljning, fakturor och kundtjänst dygnet runt (precis som jag 😊).<br><br>Vill du veta vad ni kan automatisera? '+BOOK;
      if(has('app','mobil','ios','android','play')) return 'Vi bygger native appar för iOS och Android och lanserar dem åt er i App Store och Google Play — kopplade till era system. <a href="priskalkylator.html">Se ett pris →</a>';
      if(has('case','kund','stodona','resultat','exempel','referens','besparing')) return 'Kundcase <strong>Stodona AB</strong>: vi sänkte löpande kostnad från ca <strong>52 000 → 5 000 kr/mån</strong> (~565 000 kr/år lägre) med egna system och AI. Engångsinvesteringen var intjänad på ungefär en månad.<br><br>Vill du ha liknande resultat? '+BOOK;
      if(has('tid','hur lång','när ','snabbt','leverans','deadline','klar')) return 'Det beror på omfattning — en enklare hemsida kan vara live på 1–2 veckor, större system tar längre. Vi sätter alltid en tydlig tidsplan innan vi börjar. '+BOOK;
      if(has('delbetal','avbetal','månadskostnad','ränta','finansier')) return 'Ja! Du kan delbetala projektet på upp till 2–3 år och komma igång direkt istället för en stor engångskostnad. Månadskostnaden sätter vi i offerten.';
      if(has('vad gör','vad kan','vilka tjänst','erbjuder','jobbar ni','bygger ni','hjälpa')) return 'Vi är en digital byrå som bygger:<br>• <strong>Hemsidor</strong> &amp; e-handel<br>• <strong>System &amp; portaler</strong> (CRM, bokning, rekrytering)<br>• <strong>Automationer &amp; AI</strong><br>• <strong>Appar</strong> (iOS &amp; Android)<br>• <strong>Integrationer</strong> (Fortnox, API)<br><br>Allt som sparar tid och sänker kostnader. <a href="priskalkylator.html">Räkna ut priset →</a>';
      if(has('tack','tackar','toppen','perfekt','grymt','super')) return 'Varsågod! 😊 Finns det något mer jag kan hjälpa dig med? Annars är du varmt välkommen att '+BOOK.replace('Boka ett möte','boka ett möte')+'.';
      return 'Bra fråga! Det vill jag ge dig ett riktigt bra svar på — enklast är att vi tar ett kort samtal, då får du svar direkt och anpassat efter er. '+BOOK+'<br><br>Du kan också mejla <a href="mailto:hej@kelagroup.se">hej@kelagroup.se</a>.';
    }

    function getReply(userText){
      return new Promise(function(resolve){
        var done=false, ctrl=('AbortController' in window)?new AbortController():null;
        var to=setTimeout(function(){ if(ctrl) try{ctrl.abort();}catch(e){} }, 9000);
        if(!('fetch' in window)){ clearTimeout(to); return resolve(local(userText)); }
        fetch('/api/chat',{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({messages:history}), signal:ctrl?ctrl.signal:undefined })
          .then(function(r){ if(!r.ok) throw 0; return r.json(); })
          .then(function(d){ clearTimeout(to); done=true; if(d&&d.reply){ resolve(esc(d.reply).replace(/\n/g,'<br>')); } else { resolve(local(userText)); } })
          .catch(function(){ clearTimeout(to); if(!done) resolve(local(userText)); });
      });
    }

    function send(text){
      text=(text||'').trim(); if(!text) return;
      addMsg('user', esc(text)); history.push({role:'user',content:text});
      input.value=''; input.style.height='auto'; qr.innerHTML=''; typing(true);
      getReply(text).then(function(html){
        setTimeout(function(){ typing(false); addMsg('bot', html); history.push({role:'assistant',content:html.replace(/<[^>]+>/g,' ')}); showQuick(); }, 450);
      });
    }

    function openChat(){ panel.classList.add('open'); launcher.classList.add('hide');
      if(!greeted){ greeted=true; typing(true); setTimeout(function(){ typing(false); addMsg('bot','Hej! 👋 Jag är Kelas assistent. Jag hjälper dig med tjänster, priser, bokning, kundcase — och hur vi <strong>kopplar ihop era system</strong> med allt som har ett API. Vad kan jag hjälpa dig med?'); showQuick(); }, 500); }
      setTimeout(function(){ input.focus(); }, 360);
    }
    function closeChat(){ panel.classList.remove('open'); launcher.classList.remove('hide'); }

    launcher.addEventListener('click', openChat);
    panel.querySelector('.kchat-x').addEventListener('click', closeChat);
    form.addEventListener('submit', function(e){ e.preventDefault(); send(input.value); });
    input.addEventListener('keydown', function(e){ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); send(input.value); } });
    input.addEventListener('input', function(){ input.style.height='auto'; input.style.height=Math.min(input.scrollHeight,96)+'px'; });
  })();
})();
