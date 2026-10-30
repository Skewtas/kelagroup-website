/* KELA AI – laddare (≈ 8 kB). Visar den levande AI-orben direkt och laddar själva assistenten först när
   besökaren visar intresse (hovrar, fokuserar, klickar eller efter en stund i viloläge) – sajten förblir snabb.
   Inbäddning:  <script src="/assets/kela-ai/loader-v2.js" data-tenant="kela" defer></script>
   Tangentbord: orben är en knapp (Enter/Mellanslag). Ctrl/Cmd + K öppnar assistenten. Esc stänger. */
(function () {
  if (window.KelaAI) return;
  var me = document.currentScript || document.querySelector('script[src*="kela-ai/loader"]');
  var BASE = (me && me.src) ? me.src.replace(/loader-v\d+\.js.*$/, '') : '/assets/kela-ai/';
  var API = (me && me.getAttribute('data-api')) || (BASE.indexOf(location.origin) === 0 ? '/api/ai' : new URL('/api/ai', BASE).href);
  var TENANT = (me && me.getAttribute('data-tenant')) || 'kela';
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var ss = { get: function (k) { try { return sessionStorage.getItem('kelaai:' + k); } catch (e) { return null; } }, set: function (k, v) { try { sessionStorage.setItem('kelaai:' + k, v); } catch (e) {} } };

  var CSS = '' +
    '.kai-launch{position:fixed;right:max(20px,env(safe-area-inset-right));bottom:max(20px,env(safe-area-inset-bottom));z-index:2147483000;width:56px;height:56px;border:0;padding:0;border-radius:50%;background:transparent;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:transform .5s cubic-bezier(.22,1,.36,1),opacity .35s,visibility 0s}' +
    '.kai-launch:focus-visible{outline:2px solid #5C1A26;outline-offset:5px}' +
    '.kai-launch.kai-hidden{opacity:0;visibility:hidden;transform:scale(.4);transition:transform .45s cubic-bezier(.22,1,.36,1),opacity .3s,visibility 0s .45s}' +
    '.kai-orb{--mx:30%;--my:28%;position:relative;display:block;width:100%;height:100%;border-radius:50%;isolation:isolate;' +
      'background:radial-gradient(circle at var(--mx) var(--my),#fff 0,#FBE3E7 14%,#EBA9B5 38%,#A8445A 66%,#5C1A26 88%,#3A0E17 100%);' +
      'box-shadow:0 18px 40px -12px rgba(92,26,38,.65),0 0 0 1.5px rgba(255,255,255,.55),inset 0 -6px 16px rgba(46,12,18,.45),inset 0 4px 10px rgba(255,255,255,.4);animation:kai-breathe 7s ease-in-out infinite}' +
    '.kai-orb::before{content:"";position:absolute;inset:8%;border-radius:50%;background:conic-gradient(from 0deg,transparent 0 20%,rgba(255,220,228,.85) 32%,transparent 46%,rgba(255,255,255,.55) 64%,transparent 80%);filter:blur(5px);mix-blend-mode:screen;animation:kai-spin 9s linear infinite;z-index:1}' +
    '.kai-orb::after{content:"";position:absolute;left:22%;top:14%;width:36%;height:24%;border-radius:50%;background:radial-gradient(closest-side,rgba(255,255,255,.95),rgba(255,255,255,0));filter:blur(1px);z-index:2}' +
    '.kai-orb i{position:absolute;inset:-6px;border-radius:50%;border:1.5px solid rgba(232,160,174,.55);opacity:0;z-index:0}' +
        '.kai-launch:hover{transform:scale(1.04)}' +
        '.kai-launch[data-busy] .kai-orb::before{animation-duration:1.4s}' +
    '.kai-dot{position:absolute;right:2px;top:2px;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:#fff;color:#5C1A26;font:800 11px/18px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;box-shadow:0 2px 8px rgba(46,12,18,.35);z-index:3;display:none}' +
    '.kai-launch[data-unread] .kai-dot{display:block}' +
    '.kai-tip{position:fixed;right:calc(max(20px,env(safe-area-inset-right)) + 68px);bottom:calc(max(20px,env(safe-area-inset-bottom)) + 8px);z-index:2147483000;max-width:min(300px,calc(100vw - 120px));padding:12px 16px;border-radius:18px 18px 6px 18px;background:rgba(255,255,255,.82);-webkit-backdrop-filter:blur(18px) saturate(1.6);backdrop-filter:blur(18px) saturate(1.6);color:#2E0C12;font:600 14px/1.35 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;box-shadow:0 18px 50px -18px rgba(92,26,38,.5),0 0 0 1px rgba(92,26,38,.08);opacity:0;transform:translateX(10px) scale(.96);transform-origin:right bottom;transition:opacity .35s,transform .5s cubic-bezier(.22,1,.36,1);pointer-events:none}' +
    '.kai-tip.kai-on{opacity:1;transform:none}' +
    '.kai-tip.ctx{pointer-events:auto;cursor:pointer;padding-right:34px}' +
    '.kai-tip small{display:block;font-weight:700;font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:#A8445A;margin-bottom:3px}' +
    '.kai-tip button{position:absolute;right:6px;top:6px;width:24px;height:24px;border:0;border-radius:50%;background:transparent;color:#7A4E56;cursor:pointer;font-size:16px;line-height:1}' +
    '.kai-ask{position:absolute;z-index:2147482999;display:inline-flex;align-items:center;gap:6px;padding:7px 12px 7px 9px;border:0;border-radius:999px;background:#2E0C12;color:#fff;font:700 12.5px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;box-shadow:0 10px 30px -10px rgba(46,12,18,.7);cursor:pointer;opacity:0;transform:translateY(4px);transition:opacity .2s,transform .3s cubic-bezier(.22,1,.36,1)}' +
    '.kai-ask.kai-on{opacity:1;transform:none}' +
    '.kai-ask b{width:14px;height:14px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff,#EBA9B5 40%,#5C1A26)}' +
    'body.kai-on .snd-toggle{bottom:calc(max(20px,env(safe-area-inset-bottom)) + 70px)!important}' +
    'body.kai-on .kchat-btn,body.kai-on .kchat{display:none!important}' +
    '@keyframes kai-breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.025)}}' +
    '@keyframes kai-spin{to{transform:rotate(360deg)}}' +
    '@keyframes kai-ring{0%{opacity:.9;transform:scale(.92)}100%{opacity:0;transform:scale(1.5)}}' +
    '@media (max-width:640px){.kai-launch{width:52px;height:52px}.kai-tip{right:calc(max(16px,env(safe-area-inset-right)) + 70px)}}' +
    '@media (prefers-reduced-motion:reduce){.kai-orb,.kai-orb::before,.kai-launch:hover .kai-orb i{animation:none!important}.kai-launch,.kai-tip{transition:opacity .2s!important}}' +
    '@media print{.kai-launch,.kai-tip,.kai-ask{display:none!important}}';

  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

  var style = el('style'); style.textContent = CSS; document.head.appendChild(style);
  var btn = el('button', 'kai-launch', '<span class="kai-orb" aria-hidden="true"><i></i><i></i></span><span class="kai-dot" aria-hidden="true"></span>');
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Öppna Kela AI – AI-assistent');
  btn.setAttribute('aria-haspopup', 'dialog');
  btn.setAttribute('aria-expanded', 'false');
  var tip = el('div', 'kai-tip'); tip.setAttribute('role', 'status'); tip.setAttribute('aria-live', 'polite');

  function mount() { document.body.appendChild(btn); document.body.appendChild(tip); document.body.classList.add('kai-on'); }
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);

  // ---------- Konfiguration (hämtas tidigt, används för tips och av appen) ----------
  var cfgPromise = fetch(API + '/config?tenant=' + encodeURIComponent(TENANT), { credentials: 'omit' })
    .then(function (r) { return r.ok ? r.json() : { offline: true }; })
    .catch(function () { return { offline: true }; });

  // ---------- Levande ljus: orben följer muspekaren när den kommer nära ----------
  var orb = btn.firstChild, raf = 0;
  if (!reduce) window.addEventListener('pointermove', function (e) {
    if (raf) return;
    raf = requestAnimationFrame(function () {
      raf = 0;
      var r = btn.getBoundingClientRect(); var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      var dx = e.clientX - cx, dy = e.clientY - cy, d = Math.hypot(dx, dy);
      if (d > 260) { orb.style.removeProperty('--mx'); orb.style.removeProperty('--my'); return; }
      var k = Math.max(0, 1 - d / 260);
      orb.style.setProperty('--mx', (50 + (dx / (d || 1)) * 22 * k) + '%');
      orb.style.setProperty('--my', (50 + (dy / (d || 1)) * 22 * k) + '%');
    });
  }, { passive: true });

  // ---------- Tips vid hovring + ett kontextuellt tips per session ----------
  var hoverTexts = ['Fråga mig vad som helst. Eller utmana mig.', 'Nyfiken på vad AI kan göra för ditt företag?', 'Jag är mer än en vanlig chatbot.', 'Har ni något som borde automatiseras?'];
  var hi = 0, tipTimer = 0, ctxRule = null;
  function showTip(text, ctx) {
    clearTimeout(tipTimer);
    tip.className = 'kai-tip' + (ctx ? ' ctx' : '');
    tip.innerHTML = ctx ? '<small>Kela AI</small>' + esc(text) + '<button type="button" aria-label="Stäng tipset">×</button>' : esc(text);
    requestAnimationFrame(function () { tip.classList.add('kai-on'); });
  }
  function hideTip(delay) { clearTimeout(tipTimer); tipTimer = setTimeout(function () { tip.classList.remove('kai-on'); }, delay || 0); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  btn.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse' && !open) { showTip(hoverTexts[hi++ % hoverTexts.length]); warm(); } });
  btn.addEventListener('pointerleave', function () { if (!tip.classList.contains('ctx')) hideTip(120); });
  btn.addEventListener('focus', function () { warm(); });
  tip.addEventListener('click', function (e) {
    if (e.target.tagName === 'BUTTON') { hideTip(); ss.set('tipDone', '1'); return; }
    if (ctxRule) { ss.set('tipDone', '1'); hideTip(); openAI({ prompt: ctxRule.prompt, source: 'tip' }); }
  });

  cfgPromise.then(function (cfg) {
    if (cfg && cfg.hover_texts && cfg.hover_texts.length) hoverTexts = cfg.hover_texts;
    if (cfg && cfg.brand && cfg.brand.name) btn.setAttribute('aria-label', 'Öppna ' + cfg.brand.name + ' – AI-assistent');
    if (ss.get('tipDone') || ss.get('opened')) return;
    var path = location.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/';
    var rules = (cfg && cfg.page_rules) || [];
    for (var i = 0; i < rules.length; i++) if (path === rules[i].match || path.indexOf(rules[i].match + '/') === 0) { ctxRule = rules[i]; break; }
    if (!ctxRule) return;
    // Visas en gång per session, först när besökaren faktiskt läst en stund – aldrig som popup.
    var engaged = 0, shown = false;
    function bump() { engaged++; if (!shown && engaged > 2) { shown = true; setTimeout(function () { if (!open && !ss.get('tipDone')) { showTip(ctxRule.tip, true); ss.set('tipDone', '1'); hideTip(9000); } }, 600); } }
    window.addEventListener('scroll', function onS() { bump(); if (shown) window.removeEventListener('scroll', onS); }, { passive: true });
    setTimeout(bump, 9000); setTimeout(bump, 14000); setTimeout(bump, 18000);
  });

  // ---------- "Fråga Kela AI" om markerad text på sidan ----------
  var ask = el('button', 'kai-ask', '<b aria-hidden="true"></b>Fråga Kela AI'); ask.type = 'button';
  var askText = '';
  document.addEventListener('mouseup', function (e) {
    if (ask.contains(e.target)) return;
    setTimeout(function () {
      var sel = window.getSelection(); var t = sel ? String(sel).trim() : '';
      var node = sel && sel.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement);
      if (!t || t.length < 12 || t.length > 500 || !node || node.closest('input,textarea,[contenteditable],.kai-panel,nav,.nav')) { ask.classList.remove('kai-on'); return; }
      var r = sel.getRangeAt(0).getBoundingClientRect();
      askText = t;
      if (!ask.parentNode) document.body.appendChild(ask);
      ask.style.left = Math.max(8, Math.min(window.scrollX + r.left + r.width / 2 - 64, window.scrollX + document.documentElement.clientWidth - 150)) + 'px';
      ask.style.top = (window.scrollY + r.top - 42) + 'px';
      requestAnimationFrame(function () { ask.classList.add('kai-on'); });
    }, 10);
  });
  document.addEventListener('mousedown', function (e) { if (!ask.contains(e.target)) ask.classList.remove('kai-on'); });
  ask.addEventListener('click', function () {
    ask.classList.remove('kai-on');
    openAI({ prompt: 'Jag läste det här på er sida: "' + askText.slice(0, 400) + '" – kan du förklara vad det skulle betyda för mitt företag?', source: 'select_ask', send: true });
  });

  // ---------- Ladda appen ----------
  var appPromise = null, open = false;
  function warm() {
    if (!appPromise) {
      var link = el('link'); link.rel = 'stylesheet'; link.href = BASE + 'kela-ai-v2.css'; document.head.appendChild(link);
      appPromise = Promise.all([import(BASE + 'app-v2.js'), cfgPromise, new Promise(function (res) { link.onload = res; link.onerror = res; })])
        .then(function (r) { return r[0].create({ api: API, tenant: TENANT, base: BASE, config: r[1], launcher: btn, onState: onState }); });
      appPromise.catch(function () { appPromise = null; });
    }
    return appPromise;
  }
  function onState(s) {
    open = !!s.open;
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.classList.toggle('kai-hidden', open);
    if (s.busy) btn.setAttribute('data-busy', ''); else btn.removeAttribute('data-busy');
    if (s.unread) { btn.setAttribute('data-unread', ''); btn.lastChild.textContent = s.unread > 9 ? '9+' : s.unread; } else btn.removeAttribute('data-unread');
    if (open) { hideTip(); ss.set('opened', '1'); }
  }
  function openAI(opts) {
    hideTip();
    btn.setAttribute('data-busy', '');
    return warm().then(function (app) { btn.removeAttribute('data-busy'); app.open(opts || {}); return app; })
      .catch(function () { btn.removeAttribute('data-busy'); location.href = '/kontakt'; });
  }
  btn.addEventListener('click', function () { openAI({ source: 'orb' }); });
  document.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && !e.altKey && (e.key === 'k' || e.key === 'K')) {
      var t = e.target; if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) && !(t.closest && t.closest('.kai-panel'))) return;
      e.preventDefault(); openAI({ source: 'shortcut' });
    }
  });
  // Förladda i lugnt läge så att första klicket känns omedelbart.
  var idle = window.requestIdleCallback || function (f) { return setTimeout(f, 2500); };
  setTimeout(function () { idle(function () { if (!navigator.connection || !navigator.connection.saveData) warm(); }); }, 4000);
  // Återuppta ett pågående samtal (t.ex. om personal svarat) efter sidbyte.
  if (ss.get('conv')) setTimeout(warm, 800);

  window.KelaAI = { open: openAI, ask: function (prompt) { return openAI({ prompt: prompt, send: true, source: 'api' }); } };
})();
