/* Kela – små ljudeffekter (Web Audio, inga ljudfiler).
   Hover = mjukt "tick", klick = "pop", Boka = glad tvåtonsplingning,
   kontaktrutan = "swish", skickat = liten fanfar, nålade lappar = "boing".
   Ljudet startar först efter användarens första klick/tryck (webbläsarregel)
   och kan stängas av med knappen nere till höger (sparas i webbläsaren). */
(function(){
  var KEY = 'kela-sound';
  var on = true;
  try { on = localStorage.getItem(KEY) !== 'off'; } catch(e){}
  var ctx = null, master = null, unlocked = false, lastHover = 0, lastEl = null;

  function ac(){
    if(ctx) return ctx;
    var C = window.AudioContext || window.webkitAudioContext;
    if(!C) return null;
    ctx = new C();
    master = ctx.createGain(); master.gain.value = .55; master.connect(ctx.destination);
    return ctx;
  }
  function unlock(){
    if(unlocked) return;
    var c = ac(); if(!c) return;
    if(c.state === 'suspended') c.resume();
    unlocked = true;
  }
  function tone(o){
    if(!on || !unlocked) return;
    var c = ac(); if(!c) return;
    var t = c.currentTime + (o.delay || 0);
    var osc = c.createOscillator(), g = c.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f, t);
    if(o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t + (o.slide || o.d));
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.v || .08, t + (o.a || .006));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.d);
    osc.connect(g); g.connect(master);
    osc.start(t); osc.stop(t + o.d + .03);
  }
  function noise(o){
    if(!on || !unlocked) return;
    var c = ac(); if(!c) return;
    var t = c.currentTime, len = Math.floor(c.sampleRate * o.d);
    var buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for(var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = c.createBufferSource(); src.buffer = buf;
    var f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(o.f, t); f.frequency.exponentialRampToValueAtTime(o.f2, t + o.d);
    var g = c.createGain(); g.gain.setValueAtTime(o.v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + o.d);
    src.connect(f); f.connect(g); g.connect(master); src.start(t);
  }

  var S = {
    tick:   function(){ tone({ f: 2100, f2: 1700, d: .045, v: .035, type: 'triangle' }); },
    pop:    function(){ tone({ f: 520, f2: 880, d: .09, slide: .05, v: .11 }); tone({ f: 1320, d: .05, v: .03, delay: .015, type: 'triangle' }); },
    boka:   function(){ tone({ f: 660, d: .16, v: .09, type: 'triangle' }); tone({ f: 990, d: .26, v: .09, delay: .09, type: 'triangle' }); tone({ f: 1980, d: .2, v: .02, delay: .09 }); },
    boing:  function(){ tone({ f: 300, f2: 640, d: .22, slide: .12, v: .07 }); tone({ f: 640, f2: 520, d: .18, v: .03, delay: .1 }); },
    swish:  function(){ noise({ f: 600, f2: 3200, d: .28, v: .16 }); },
    close:  function(){ noise({ f: 2600, f2: 500, d: .2, v: .1 }); },
    yay:    function(){ [523, 659, 784, 1047].forEach(function(f, i){ tone({ f: f, d: .32, v: .08, delay: i * .085, type: 'triangle' }); }); },
    toggle: function(){ tone({ f: 880, d: .07, v: .08 }); tone({ f: 1320, d: .1, v: .06, delay: .06 }); }
  };

  var HOVER = 'a, button, summary, [role="button"], .chip, .card, .bcard, .cost-chip, label';
  function kind(el){
    if(!el) return 'pop';
    if(el.closest('.chipw.pin')) return 'boing';
    if(el.closest('.bb, [data-book]')) return 'boka';
    return 'pop';
  }

  // hover (bara med mus)
  document.addEventListener('pointerover', function(e){
    if(e.pointerType !== 'mouse') return;
    var el = e.target.closest && e.target.closest(HOVER);
    if(!el || el === lastEl) return;
    lastEl = el;
    var now = performance.now();
    if(now - lastHover < 70) return;
    lastHover = now;
    if(el.closest('.chipw.pin')) S.boing(); else S.tick();
  }, { passive: true });
  document.addEventListener('pointerout', function(e){
    var el = e.target.closest && e.target.closest(HOVER);
    if(el && !el.contains(e.relatedTarget)) lastEl = null;
  }, { passive: true });

  // klick / tryck
  document.addEventListener('pointerdown', function(e){
    unlock();
    var el = e.target.closest && e.target.closest(HOVER + ', input, textarea, select');
    if(!el || el.closest('.snd-toggle')) return;
    if(el.matches('input[type="text"], input[type="email"], input[type="tel"], textarea')) { S.tick(); return; }
    S[kind(el)]();
  }, true);
  document.addEventListener('keydown', function(e){
    unlock();
    if((e.key === 'Enter' || e.key === ' ') && e.target.closest && e.target.closest('a, button')) S[kind(e.target)]();
  }, true);

  // kontaktrutan: öppna / stäng / skickat
  new MutationObserver(function(ms){
    ms.forEach(function(m){
      var el = m.target;
      if(m.type === 'attributes' && el.classList){
        if(el.classList.contains('bm-overlay')){
          var was = (m.oldValue || '').indexOf('open') > -1, is = el.classList.contains('open');
          if(is && !was) S.swish(); else if(!is && was) S.close();
        }
        if(el.classList.contains('booked') && (m.oldValue || '').indexOf('booked') < 0) S.yay();
      }
      if(m.type === 'childList') m.addedNodes.forEach(function(n){
        if(n.nodeType === 1 && n.classList && n.classList.contains('bm-confetti')) S.yay();
      });
    });
  }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true });

  // av/på-knapp
  var css = document.createElement('style');
  css.textContent =
    '.snd-toggle{position:fixed;right:18px;bottom:18px;z-index:86;width:46px;height:46px;border-radius:50%;border:1px solid rgba(92,26,38,.14);' +
    'background:rgba(255,250,251,.9);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);color:var(--ink,#5C1A26);cursor:pointer;display:grid;place-items:center;' +
    'box-shadow:0 10px 26px -14px rgba(60,18,28,.55);transition:transform .4s cubic-bezier(.34,1.56,.64,1),background .2s}' +
    '.snd-toggle:hover{transform:scale(1.1) rotate(-6deg);background:var(--lav,#F3D3D7)}' +
    '.snd-toggle svg{width:20px;height:20px}.snd-toggle .w{transition:opacity .2s}.snd-toggle.off .w{opacity:0}.snd-toggle .x{opacity:0}.snd-toggle.off .x{opacity:1}' +
    '.snd-toggle.off{opacity:.75}' +
    'body:has(.kchat-btn) .snd-toggle{bottom:150px}' +
    '@media (max-width:640px){.snd-toggle,body:has(.kchat-btn) .snd-toggle{right:12px;bottom:auto;top:80px;width:40px;height:40px}}';
  document.head.appendChild(css);
  var b = document.createElement('button');
  b.type = 'button'; b.className = 'snd-toggle' + (on ? '' : ' off');
  b.setAttribute('aria-pressed', on ? 'true' : 'false');
  b.setAttribute('aria-label', on ? 'Stäng av ljud' : 'Slå på ljud');
  b.title = on ? 'Ljud på' : 'Ljud av';
  b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" stroke="none"/><path class="w" d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/><path class="x" d="M16 9.5l5 5M21 9.5l-5 5"/></svg>';
  b.addEventListener('click', function(){
    on = !on;
    try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch(e){}
    b.classList.toggle('off', !on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.setAttribute('aria-label', on ? 'Stäng av ljud' : 'Slå på ljud');
    b.title = on ? 'Ljud på' : 'Ljud av';
    unlock(); if(on) S.toggle();
  });
  function mount(){ document.body.appendChild(b); }
  if(document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
})();
