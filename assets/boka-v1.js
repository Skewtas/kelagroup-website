/* Kela – "Boka möte" på hela sajten (fristående, kan laddas på alla sidor).
   1) Alla Boka-länkar (text som börjar med "Boka" och pekar på kontakt.html, eller data-book)
      öppnar bokningsrutan: Videomöte / Fysiskt möte / Ring mig → kort formulär (eller kalender).
   2) En Boka-knapp som alltid syns när man scrollar (stor bottenknapp i mobil).
   Kräver pop-v6.css (färger, .btn) + boka-v1.css. */
(function(){
  if(window.__kelaBoka) return; window.__kelaBoka = true;

  /* Kalenderbokning: fyll i er Cal.com-länk (t.ex. 'kelagroup/30min') så väljer kunden
     en ledig tid direkt. Tom = kunden skickar en förfrågan via formuläret. */
  var CAL_LINK = '';
  var FORMSPREE = 'https://formspree.io/f/xojkdewo';

  var ico = {
    video:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 10l5-3v10l-5-3z"/><rect x="2" y="6" width="13" height="12" rx="2.5"/></svg>',
    pin:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>',
    phone:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>',
    back:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
    x:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    check:'<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>'
  };
  var trust = '<ul class="bm-trust"><li>Kostnadsfritt</li><li>Svar inom 24 h</li><li>Utan förpliktelse</li></ul>';

  var overlay = document.createElement('div');
  overlay.className = 'bm-overlay'; overlay.id = 'bmOverlay'; overlay.hidden = true;
  overlay.innerHTML =
    '<div class="bm-modal" role="dialog" aria-modal="true" aria-labelledby="bmTitle">'+
      '<button class="bm-close" type="button" aria-label="Stäng">'+ico.x+'</button>'+
      '<div class="bm-step" data-step="1">'+
        '<span class="bm-kick">Boka ett möte</span>'+
        '<h3 id="bmTitle">Hur vill du ta det?</h3>'+
        '<p class="bm-sub">Välj det som passar dig – det tar under en minut.</p>'+
        '<div class="bm-choices">'+
          '<button class="bm-choice" type="button" data-type="Videomöte"><span class="bm-ic">'+ico.video+'</span><span class="bm-ct">Videomöte</span><span class="bm-cd">30 min när det passar dig.</span></button>'+
          '<button class="bm-choice" type="button" data-type="Fysiskt möte"><span class="bm-ic">'+ico.pin+'</span><span class="bm-ct">Fysiskt möte</span><span class="bm-cd">Vi ses på plats i Stockholm.</span></button>'+
          '<button class="bm-choice" type="button" data-type="Ring mig"><span class="bm-ic">'+ico.phone+'</span><span class="bm-ct">Ring mig</span><span class="bm-cd">Vi ringer upp dig.</span></button>'+
        '</div>'+ trust +
      '</div>'+
      '<div class="bm-step" data-step="3" hidden>'+
        '<button class="bm-back" type="button">'+ico.back+' Tillbaka</button>'+
        '<span class="bm-kick">Boka · <span data-chosen></span></span>'+
        '<h3>Välj en tid som passar.</h3>'+
        '<div class="bm-cal"></div>'+
        '<p class="bm-alt">Hittar du ingen tid? <button type="button" class="bm-link" data-to-form>Skicka en förfrågan i stället</button></p>'+
      '</div>'+
      '<div class="bm-step" data-step="2" hidden>'+
        '<button class="bm-back" type="button">'+ico.back+' Tillbaka</button>'+
        '<span class="bm-kick">Boka · <span data-chosen></span></span>'+
        '<h3>Var når vi dig?</h3>'+
        '<form class="bm-form" action="'+FORMSPREE+'" method="POST" novalidate>'+
          '<input type="hidden" name="_subject" value="Ny mötesbokning från kelagroup.se">'+
          '<input type="hidden" name="typ_av_mote" value="">'+
          '<input type="hidden" name="sida" value="">'+
          '<div class="bm-row">'+
            '<div class="bm-field"><label for="bm-name">Namn</label><input id="bm-name" name="name" type="text" autocomplete="name" placeholder="För- och efternamn" required></div>'+
            '<div class="bm-field"><label for="bm-phone">Telefon <i data-opt>(valfritt)</i></label><input id="bm-phone" name="phone" type="tel" autocomplete="tel" placeholder="07x-xxx xx xx"></div>'+
          '</div>'+
          '<div class="bm-field"><label for="bm-email">E-post</label><input id="bm-email" name="email" type="email" autocomplete="email" placeholder="du@företag.se" required></div>'+
          '<div class="bm-field"><label for="bm-msg">Vad gäller det? <i>(valfritt)</i></label><textarea id="bm-msg" name="message" rows="3" placeholder="T.ex. ny hemsida, bokningssystem, något som tar för mycket tid …"></textarea></div>'+
          '<button type="submit" class="btn btn-dark bm-submit">Boka mötet <span class="arr" aria-hidden="true">→</span></button>'+
          '<p class="bm-err" hidden>Något gick fel — mejla oss gärna på <a href="mailto:hej@kelagroup.se">hej@kelagroup.se</a>.</p>'+
        '</form>'+ trust +
      '</div>'+
    '</div>';
  document.body.appendChild(overlay);

  var modal = overlay.querySelector('.bm-modal');
  var steps = { 1:overlay.querySelector('[data-step="1"]'), 2:overlay.querySelector('[data-step="2"]'), 3:overlay.querySelector('[data-step="3"]') };
  var form = overlay.querySelector('.bm-form');
  var phone = overlay.querySelector('#bm-phone');
  var lastFocus = null, chosen = '';

  function show(n){
    for(var k in steps) steps[k].hidden = (+k !== n);
    modal.classList.toggle('wide', n === 3);
    modal.scrollTop = 0;
  }
  function open(){
    lastFocus = document.activeElement;
    overlay.hidden = false; show(1);
    requestAnimationFrame(function(){ overlay.classList.add('open'); });
    document.body.style.overflow = 'hidden';
    var f = overlay.querySelector('.bm-choice'); if(f) f.focus();
  }
  function close(){
    overlay.classList.remove('open');
    document.body.style.overflow = '';
    setTimeout(function(){ overlay.hidden = true; }, 260);
    if(lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function choose(t){
    chosen = t;
    overlay.querySelectorAll('[data-chosen]').forEach(function(s){ s.textContent = t; });
    form.querySelector('[name="typ_av_mote"]').value = t;
    var call = (t === 'Ring mig');
    phone.required = call;
    overlay.querySelector('[data-opt]').hidden = call;
    if(CAL_LINK && !call){
      overlay.querySelector('.bm-cal').innerHTML = '<iframe title="Välj tid för möte" loading="lazy" src="https://cal.com/'+CAL_LINK+'?embed=true&layout=month_view&theme=light&notes='+encodeURIComponent(t)+'"></iframe>';
      show(3); return;
    }
    show(2);
    (call ? phone : overlay.querySelector('#bm-name')).focus();
  }

  overlay.querySelectorAll('.bm-choice').forEach(function(b){ b.addEventListener('click', function(){ choose(b.getAttribute('data-type')); }); });
  overlay.querySelectorAll('.bm-back').forEach(function(b){ b.addEventListener('click', function(){ show(1); }); });
  overlay.querySelector('[data-to-form]').addEventListener('click', function(){ show(2); overlay.querySelector('#bm-name').focus(); });
  overlay.querySelector('.bm-close').addEventListener('click', close);
  overlay.addEventListener('click', function(e){ if(e.target === overlay) close(); });
  document.addEventListener('keydown', function(e){ if(e.key === 'Escape' && !overlay.hidden) close(); });

  form.addEventListener('submit', function(e){
    e.preventDefault();
    var err = form.querySelector('.bm-err'), btn = form.querySelector('.bm-submit');
    err.hidden = true;
    if(!form.reportValidity()) return;
    form.querySelector('[name="sida"]').value = location.pathname;
    form.querySelector('[name="_subject"]').value = 'Ny mötesbokning (' + chosen + ') från kelagroup.se';
    btn.disabled = true; btn.style.opacity = '.6';
    fetch(FORMSPREE, { method:'POST', body:new FormData(form), headers:{ 'Accept':'application/json' } })
      .then(function(r){
        if(!r.ok) throw 0;
        var msg = chosen === 'Ring mig' ? 'Vi ringer upp dig inom 24 timmar på vardagar.' : 'Vi återkommer inom 24 timmar med förslag på tid för ditt ' + chosen.toLowerCase() + '.';
        steps[2].innerHTML = '<div class="bm-done"><div class="bm-check">'+ico.check+'</div><h3>Tack! Mötet är på gång.</h3><p class="bm-sub">'+msg+'</p><button class="btn btn-dark" type="button" data-done>Stäng</button></div>';
        steps[2].querySelector('[data-done]').addEventListener('click', close);
        if(sticky) sticky.classList.add('booked');
      })
      .catch(function(){ err.hidden = false; btn.disabled = false; btn.style.opacity = '1'; });
  });

  /* Alla Boka-länkar öppnar rutan */
  function isTrigger(a){
    if(a.hasAttribute('data-book')) return true;
    if(!/kontakt\.html/i.test(a.getAttribute('href') || '')) return false;
    return /^\s*boka/i.test(a.textContent || '');
  }
  document.addEventListener('click', function(e){
    var a = e.target.closest && e.target.closest('a'); if(!a) return;
    if(isTrigger(a)){ e.preventDefault(); open(); }
  });
  window.kelaBoka = open;

  /* Boka-knapp som alltid syns (döljs i heron, vid footern och där kalkylatorns prisbar finns i mobil) */
  var sticky = document.createElement('a');
  sticky.className = 'bk-sticky'; sticky.href = 'kontakt.html'; sticky.setAttribute('data-book', '');
  sticky.innerHTML = '<span class="bk-dot" aria-hidden="true"></span><span class="bk-t">Boka gratis möte</span><span class="bk-s">Svar inom 24 h</span><span class="arr" aria-hidden="true">→</span>';
  document.body.appendChild(sticky);
  if(document.querySelector('.pk-bar')) document.documentElement.classList.add('has-pkbar');
  var foot = document.querySelector('footer');
  var footIn = false;
  if(foot && 'IntersectionObserver' in window){
    new IntersectionObserver(function(es){ footIn = es[0].isIntersecting; upd(); }).observe(foot);
  }
  function upd(){
    var on = window.scrollY > Math.min(520, window.innerHeight * .6) && !footIn;
    sticky.classList.toggle('on', on);
    document.documentElement.classList.toggle('bk-on', on);
  }
  window.addEventListener('scroll', upd, { passive:true }); upd();
})();
