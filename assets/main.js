(function(){
  var root = document.documentElement;

  /* theme toggle */
  var themeBtn = document.getElementById('themeBtn');
  if(themeBtn){
    themeBtn.addEventListener('click', function(){
      var cur = root.getAttribute('data-theme');
      if(!cur){ cur = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark':'light'; }
      root.setAttribute('data-theme', cur === 'dark' ? 'light':'dark');
    });
  }

  /* nav: over-video behaviour on the start page, always-solid on inner pages */
  var nav = document.getElementById('nav');
  var hasVideo = !!document.querySelector('.hero-video');
  if(nav){
    if(hasVideo){
      var onScroll = function(){
        var past = window.scrollY > (window.innerHeight - 90);
        nav.classList.toggle('solid', past);
        nav.style.setProperty('--nav-fg', past ? '' : '#F6F5F1');
      };
      onScroll(); window.addEventListener('scroll', onScroll, { passive:true });
    } else {
      nav.classList.add('solid');
    }
  }

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* scroll reveals */
  if('IntersectionObserver' in window){
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(e){ if(e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.16 });
    document.querySelectorAll('.reveal').forEach(function(el){ io.observe(el); });
  } else {
    document.querySelectorAll('.reveal').forEach(function(el){ el.classList.add('in'); });
  }

  /* counters */
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
    }, { threshold: 0.7 });
    counters.forEach(function(el){ cio.observe(el); });
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

  /* live temperature chip in the top corner (Open-Meteo, no API key, EU-hosted) */
  var navCta = document.querySelector('.nav-cta');
  if(navCta && 'fetch' in window){
    var PLACE = { name: 'Stockholm', lat: 59.3293, lon: 18.0686 };
    var chip = document.createElement('span');
    chip.className = 'temp-chip';
    chip.title = PLACE.name + ' just nu';
    chip.setAttribute('aria-label', 'Aktuell temperatur i ' + PLACE.name);
    chip.innerHTML = '<svg width="13" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 14.76V5a2 2 0 0 0-4 0v9.76a4 4 0 1 0 4 0z"/></svg><span class="temp-val">–°</span>';
    navCta.insertBefore(chip, navCta.firstChild);
    var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + PLACE.lat + '&longitude=' + PLACE.lon + '&current=temperature_2m';
    fetch(url).then(function(r){ return r.json(); }).then(function(d){
      if(d && d.current && typeof d.current.temperature_2m === 'number'){
        chip.querySelector('.temp-val').textContent = Math.round(d.current.temperature_2m) + '°';
      } else { chip.remove(); }
    }).catch(function(){ chip.remove(); });
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

  /* floating "Boka möte" button on every page except the contact page */
  if(!/kontakt\.html/i.test(location.pathname)){
    var fab=document.createElement('a');
    fab.className='fab';
    fab.href='kontakt.html';
    fab.setAttribute('aria-label','Kontakta oss – boka möte');
    fab.innerHTML='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg><span>Boka möte</span>';
    document.body.appendChild(fab);
  }
})();
