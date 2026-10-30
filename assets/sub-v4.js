/* Kela – gemensamt skript för undersidorna (Pop Stilren).
   Meny, reveals, räknare, bokningsdemo och kontaktformulär. (Chatten är ersatt av Kela AI – assets/kela-ai/.)
   (Kontakt-/Boka-rutan finns i boka-v2.js.) */
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

  /* kontaktformulär → Formspree (AJAX, utan omdirigering) */
  var form = document.getElementById('contactForm');
  if(form){
    var okEl=document.getElementById('formOk'), errEl=document.getElementById('formErr'), invEl=document.getElementById('formInv'), btn=document.getElementById('cf-submit');
    form.addEventListener('submit', function(e){
      e.preventDefault();
      if(okEl) okEl.style.display='none';
      if(errEl) errEl.style.display='none';
      var name=form.querySelector('[name="name"]'), email=form.querySelector('[name="email"]'), bad=[];
      [name,email].forEach(function(i){ if(i) i.removeAttribute('aria-invalid'); });
      if(name && !name.value.trim()) bad.push([name,'namn']);
      if(email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) bad.push([email,'en giltig e-postadress']);
      if(bad.length){
        bad.forEach(function(b){ b[0].setAttribute('aria-invalid','true'); });
        if(invEl){ invEl.textContent='Fyll i '+bad.map(function(b){return b[1];}).join(' och ')+'.'; invEl.style.display='block'; }
        bad[0][0].focus(); return;
      }
      if(invEl) invEl.style.display='none';
      var how=form.querySelector('[name="kontaktsatt"]:checked'), subj=form.querySelector('[name="_subject"]');
      if(subj) subj.value='Ny förfrågan'+(how?' ('+how.value+')':'')+' – Kontaktsidan – kelagroup.se';
      var action=form.getAttribute('action')||'';
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

})();
