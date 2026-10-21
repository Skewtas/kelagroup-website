/* Kela – kontakt-/förfrågningsruta på hela sajten (fristående, kan laddas på alla sidor).
   1) Knappar och länkar som går till kontakt.html, har data-book, eller vars text börjar med
      Boka / Kontakta / Offert / Förfrågan / Hör av öppnar rutan (data-nobook stänger av).
   2) Ett formulär: Namn*, E-post*, Telefon, Företag, Önskemål + valfria chips (vad det gäller)
      och "klistermärken" för hur man vill ses. Skickas till Formspree och visar tack-läge.
   3) En Boka-knapp som alltid syns när man scrollar (stor bottenknapp i mobil).
   Utan JS går alla länkar till kontakt.html som har samma formulär.
   Kräver pop-v6.css (färger, .btn) + boka-v2.css. */
(function(){
  if(window.__kelaBoka) return; window.__kelaBoka = true;

  var FORMSPREE = 'https://formspree.io/f/xojkdewo';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var x = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  /* handritade detaljer */
  var squiggle = '<svg class="bm-squiggle" width="74" height="40" viewBox="0 0 74 40" fill="none" aria-hidden="true"><path d="M3 30c8-14 16 6 24-6s14-16 22-4 10 8 20-8" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M60 8l9 4-4 9" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var star = '<svg class="bm-star" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c.6 4.6 2.4 7.4 10 10-7.6 2.6-9.4 5.4-10 10-.6-4.6-2.4-7.4-10-10 7.6-2.6 9.4-5.4 10-10z" fill="currentColor"/></svg>';

  var topics = ['Hemsida','App','System','AI & automation','Något annat'];
  var meets = [['Videomöte','🎥','Video'],['Fysiskt möte','☕','Ses på plats'],['Ring mig','📞','Ring mig']];

  var overlay = document.createElement('div');
  overlay.className = 'bm-overlay'; overlay.id = 'bmOverlay'; overlay.hidden = true;
  overlay.innerHTML =
    '<div class="bm-modal" role="dialog" aria-modal="true" aria-labelledby="bmTitle">'+
      '<span class="bm-grab" aria-hidden="true"></span>'+
      '<button class="bm-close" type="button" aria-label="Stäng">'+x+'</button>'+
      '<div class="bm-body">'+
        '<div class="bm-hello">'+
          '<figure class="bm-team"><img src="assets/team/team.webp" alt="" width="84" height="84" loading="lazy"><figcaption>Vi som svarar</figcaption></figure>'+
          squiggle+
        '</div>'+
        '<h3 id="bmTitle">Hej! <span class="bm-wave" aria-hidden="true">👋</span> Vad vill du bygga?</h3>'+
        '<p class="bm-sub">Berätta lite, så hör vi av oss. Ingen säljpitch – bara en riktig människa som läser.</p>'+
        '<form class="bm-form" action="'+FORMSPREE+'" method="POST" novalidate>'+
          '<input type="hidden" name="_subject" value="Ny förfrågan från kelagroup.se">'+
          '<input type="hidden" name="sida" value="">'+
          '<input type="hidden" name="galler" value="">'+
          '<input type="hidden" name="kontaktsatt" value="">'+
          '<div class="bm-pills" role="group" aria-label="Vad gäller det? (välj gärna flera)">'+
            topics.map(function(t){ return '<button type="button" class="bm-pill" aria-pressed="false" data-topic="'+t+'">'+t+'</button>'; }).join('')+
          '</div>'+
          '<div class="bm-row">'+
            '<div class="bm-field"><label for="bm-name">Ditt namn *</label><input id="bm-name" name="name" type="text" autocomplete="name" placeholder="Förnamn Efternamn" required></div>'+
            '<div class="bm-field"><label for="bm-email">E-post *</label><input id="bm-email" name="email" type="email" autocomplete="email" placeholder="du@företag.se" required></div>'+
          '</div>'+
          '<div class="bm-row">'+
            '<div class="bm-field"><label for="bm-phone">Telefon <i data-opt>– om du vill</i></label><input id="bm-phone" name="phone" type="tel" autocomplete="tel" placeholder="07x-xxx xx xx"></div>'+
            '<div class="bm-field"><label for="bm-company">Företag</label><input id="bm-company" name="company" type="text" autocomplete="organization" placeholder="Vad heter firman?"></div>'+
          '</div>'+
          '<div class="bm-field"><label for="bm-msg">Önskemål</label><textarea id="bm-msg" name="message" rows="3" placeholder="Skriv fritt – en idé, ett problem eller något som tar alldeles för mycket tid."></textarea></div>'+
          '<p class="bm-q" id="bmMeetQ">Hur vill du helst ses?</p>'+
          '<div class="bm-stickers" role="group" aria-labelledby="bmMeetQ">'+
            meets.map(function(m){ return '<button type="button" class="bm-sticker" aria-pressed="false" data-meet="'+m[0]+'"><span class="e" aria-hidden="true">'+m[1]+'</span>'+m[2]+'</button>'; }).join('')+
          '</div>'+
          '<p class="bm-inv" hidden role="alert"></p>'+
          '<div class="bm-send">'+
            '<button type="submit" class="bm-submit">Skicka iväg <span class="arr" aria-hidden="true">→</span></button>'+
            '<p class="bm-promise">'+star+'Vi svarar inom 24 h. Lovar.</p>'+
          '</div>'+
          '<p class="bm-err" hidden role="alert">Hoppsan, något strulade. Mejla oss på <a href="mailto:hej@kelagroup.se">hej@kelagroup.se</a> så löser vi det.</p>'+
        '</form>'+
      '</div>'+
    '</div>';
  document.body.appendChild(overlay);

  var modal = overlay.querySelector('.bm-modal');
  var body = overlay.querySelector('.bm-body');
  var form = overlay.querySelector('.bm-form');
  var phone = overlay.querySelector('#bm-phone');
  var inv = overlay.querySelector('.bm-inv');
  var lastFocus = null, chosen = '', src = '';

  function pop(el){ if(reduce) return; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }

  /* vad det gäller – flera val */
  overlay.querySelectorAll('.bm-pill').forEach(function(b){
    b.addEventListener('click', function(){
      b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
      pop(b);
      form.querySelector('[name="galler"]').value = [].map.call(overlay.querySelectorAll('.bm-pill[aria-pressed="true"]'), function(p){ return p.getAttribute('data-topic'); }).join(', ');
    });
  });
  /* hur vi ses – ett val */
  function setMeet(t){
    chosen = (chosen === t) ? '' : t;
    overlay.querySelectorAll('.bm-sticker').forEach(function(b){
      var on = b.getAttribute('data-meet') === chosen;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      if(on) pop(b);
    });
    form.querySelector('[name="kontaktsatt"]').value = chosen;
    var call = (chosen === 'Ring mig');
    phone.required = call;
    overlay.querySelector('[data-opt]').textContent = call ? '* (så vi kan ringa)' : '– om du vill';
  }
  overlay.querySelectorAll('.bm-sticker').forEach(function(b){ b.addEventListener('click', function(){ setMeet(b.getAttribute('data-meet')); }); });

  function open(opts){
    opts = opts || {};
    lastFocus = document.activeElement;
    src = opts.source || '';
    if(opts.chip && opts.chip !== chosen) setMeet(opts.chip);
    if(opts.message){ var m = form.querySelector('#bm-msg'); if(m && !m.value) m.value = opts.message; }
    overlay.hidden = false;
    modal.scrollTop = 0;
    void overlay.offsetWidth; /* tvinga omflödning så att övergången syns */
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    var f = overlay.querySelector('#bm-name') || overlay.querySelector('[data-done]');
    if(f) setTimeout(function(){ try{ f.focus({preventScroll:true}); }catch(e){ f.focus(); } }, 60);
  }
  function close(){
    overlay.classList.remove('open');
    document.body.style.overflow = '';
    setTimeout(function(){ overlay.hidden = true; }, reduce ? 0 : 280);
    if(lastFocus && lastFocus.focus) lastFocus.focus();
  }
  overlay.querySelector('.bm-close').addEventListener('click', close);
  overlay.addEventListener('click', function(e){ if(e.target === overlay) close(); });
  document.addEventListener('keydown', function(e){
    if(overlay.hidden) return;
    if(e.key === 'Escape') close();
    if(e.key === 'Tab'){ /* håll fokus i rutan */
      var f = modal.querySelectorAll('button:not([disabled]),input:not([type="hidden"]),textarea,a[href]');
      if(!f.length) return;
      var first = f[0], last = f[f.length-1];
      if(e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
      else if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
    }
  });

  function validate(){
    var bad = [];
    var name = form.querySelector('#bm-name'), email = form.querySelector('#bm-email');
    [name, email, phone].forEach(function(i){ i.removeAttribute('aria-invalid'); });
    if(!name.value.trim()) bad.push([name, 'ditt namn']);
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) bad.push([email, 'en e-post vi kan svara på']);
    if(phone.required && phone.value.replace(/\D/g,'').length < 6) bad.push([phone, 'ett nummer att ringa']);
    if(!bad.length){ inv.hidden = true; return true; }
    bad.forEach(function(b){ b[0].setAttribute('aria-invalid', 'true'); });
    inv.textContent = 'Nästan! Vi behöver ' + bad.map(function(b){ return b[1]; }).join(' och ') + '.';
    inv.hidden = false; pop(inv);
    bad[0][0].focus();
    return false;
  }
  form.addEventListener('input', function(e){ if(e.target.getAttribute('aria-invalid')) e.target.removeAttribute('aria-invalid'); });

  function confetti(){
    if(reduce) return;
    var box = document.createElement('div'); box.className = 'bm-confetti'; box.setAttribute('aria-hidden','true');
    var cols = ['var(--ink)','var(--white)','var(--butter)','var(--peach)','var(--lav-2)'];
    for(var i=0;i<34;i++){
      var p = document.createElement('i');
      p.style.left = (Math.random()*100)+'%';
      p.style.background = cols[i % cols.length];
      p.style.animationDelay = (Math.random()*.35)+'s';
      p.style.animationDuration = (1.1+Math.random()*.9)+'s';
      p.style.setProperty('--dx', (Math.random()*120-60)+'px');
      p.style.setProperty('--rot', (Math.random()*720-360)+'deg');
      if(i % 3 === 0) p.style.borderRadius = '50%';
      box.appendChild(p);
    }
    modal.appendChild(box);
    setTimeout(function(){ box.remove(); }, 2400);
  }

  form.addEventListener('submit', function(e){
    e.preventDefault();
    var err = form.querySelector('.bm-err'), btn = form.querySelector('.bm-submit');
    err.hidden = true;
    if(!validate()) return;
    var page = (document.title || '').split('|')[0].trim() || location.pathname;
    var topic = form.querySelector('[name="galler"]').value;
    form.querySelector('[name="sida"]').value = location.pathname + (src ? ' · knapp: ' + src : '');
    form.querySelector('[name="_subject"]').value = 'Ny förfrågan' + (topic ? ': ' + topic : '') + (chosen ? ' (' + chosen + ')' : '') + ' – ' + page + ' – kelagroup.se';
    btn.disabled = true; btn.classList.add('busy');
    fetch(FORMSPREE, { method:'POST', body:new FormData(form), headers:{ 'Accept':'application/json' } })
      .then(function(r){
        if(!r.ok) throw 0;
        var first = (form.querySelector('#bm-name').value.trim().split(/\s+/)[0] || '');
        var msg = chosen === 'Ring mig' ? 'Ha telefonen nära – vi slår en signal.'
          : chosen === 'Fysiskt möte' ? 'Vi föreslår en tid att ses – kaffet bjuder vi på.'
          : chosen === 'Videomöte' ? 'Du får en länk och ett förslag på tid i inkorgen.'
          : 'Håll utkik i inkorgen – vi läser allt själva.';
        body.innerHTML = '<div class="bm-done"><div class="bm-burst" aria-hidden="true">🎉</div><h3 id="bmTitle">Tack'+(first ? ' ' + first.replace(/[<>&"]/g,'') : '')+'! Vi hör av oss inom 24&nbsp;h.</h3><p class="bm-sub">'+msg+'</p><button class="bm-submit" type="button" data-done>Toppen, stäng <span class="arr" aria-hidden="true">→</span></button></div>';
        body.querySelector('[data-done]').addEventListener('click', close);
        body.querySelector('[data-done]').focus();
        confetti();
        if(sticky) sticky.classList.add('booked');
      })
      .catch(function(){ err.hidden = false; btn.disabled = false; btn.classList.remove('busy'); });
  });

  /* Vilka länkar/knappar öppnar rutan */
  var TXT = /^\s*(boka|kontakta|offert|förfrågan|hör av)/i;
  function isTrigger(a){
    if(a.hasAttribute('data-nobook')) return false;
    if(a.hasAttribute('data-book')) return true;
    var href = a.getAttribute('href') || '';
    if(/(^|\/)kontakt\.html(\?|#|$)/i.test(href)) return true;
    if(/^(mailto:|tel:)/i.test(href) || /priskalkylator\.html/i.test(href)) return false;
    return TXT.test(a.textContent || '');
  }
  document.addEventListener('click', function(e){
    if(e.defaultPrevented || e.button > 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest && e.target.closest('a,button'); if(!a || overlay.contains(a)) return;
    if(a.tagName === 'BUTTON' && !a.hasAttribute('data-book')) return;
    if(isTrigger(a)){
      e.preventDefault();
      open({ source:(a.textContent || '').replace(/\s+/g,' ').replace('→','').trim().slice(0,60), chip:a.getAttribute('data-chip') || '' });
    }
  });
  window.kelaBoka = open;

  /* Boka-knapp som alltid syns (döljs i heron, vid footern och där offertguidens bar finns i mobil) */
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
