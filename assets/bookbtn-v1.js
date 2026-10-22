/* Boka-knappen: gör om alla "Boka …"-knappar till samma lekfulla knapp
   (kalenderbricka + text + pil i egen cirkel). Rör inte vanliga textlänkar. */
(function(){
  var CAL = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="3.5" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M3.5 10h17M8 3v4M16 3v4" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><circle class="bb-day" cx="12" cy="15" r="2.1" fill="currentColor"/></svg>';
  var ARR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function label(el){
    var t = el.querySelector('.bk-t');
    var s = (t ? t.textContent : el.textContent).replace(/[→↗›]/g, '').replace(/\s+/g, ' ').trim();
    return s || 'Boka ett möte';
  }
  function upgrade(el){
    if(el.classList.contains('bb')) return;
    var txt = label(el);
    if(!/^boka/i.test(txt)) return;
    var sub = el.classList.contains('bk-sticky') ? '<span class="bb-sub">Gratis · svar inom 24 h</span>' : '';
    el.classList.add('bb');
    el.innerHTML = '<span class="bb-cal">' + CAL + '</span><span class="bb-txt"><span class="bb-t">' + txt + '</span>' + sub + '</span><span class="bb-go">' + ARR + '</span><span class="bb-spark" aria-hidden="true">✦</span>';
    if(!el.getAttribute('aria-label')) el.setAttribute('aria-label', txt);
  }
  function scan(root){
    (root || document).querySelectorAll('a.btn, button.btn, a.bk-sticky').forEach(upgrade);
  }
  function go(){
    scan();
    new MutationObserver(function(ms){
      ms.forEach(function(m){ m.addedNodes.forEach(function(n){
        if(n.nodeType !== 1) return;
        if(n.matches && n.matches('a.btn, button.btn, a.bk-sticky')) upgrade(n);
        if(n.querySelectorAll) scan(n);
      }); });
    }).observe(document.body, { childList:true, subtree:true });
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})();
