/* Mobil: alla klisterlappar runt hero-bilden visas i två rullande rader */
(() => {
  const stage = document.getElementById('stage');
  if (!stage) return;
  const cs = [...stage.querySelectorAll(':scope > .chipw')];
  if (!cs.length) return;
  const rail = document.createElement('div');
  rail.className = 'chip-rail'; rail.setAttribute('aria-hidden', 'true');
  const half = Math.ceil(cs.length / 2);
  [cs.slice(0, half), cs.slice(half)].forEach((group, r) => {
    const row = document.createElement('div'); row.className = 'chip-row' + (r ? ' rev' : '');
    const track = document.createElement('div'); track.className = 'chip-track';
    for (let k = 0; k < 2; k++) group.forEach(c => {
      const n = c.cloneNode(true);
      n.removeAttribute('data-speed'); n.removeAttribute('style');
      n.className = 'chipw' + (c.classList.contains('dark') ? ' dark' : '');
      track.appendChild(n);
    });
    row.appendChild(track); rail.appendChild(row);
  });
  // Har heron ett videokort sitter raderna fast i videon (en uppe, en nere)
  const vcard = stage.querySelector('#vcard');
  if (vcard) {
    rail.classList.add('in-video');
    vcard.appendChild(rail);
    const st = document.createElement('style');
    st.textContent = '@media (max-width:640px){'
      + '#vcard .chip-rail.in-video{position:absolute;inset:0;margin:0;z-index:2;pointer-events:none;display:flex;flex-direction:column;justify-content:space-between;padding:14px 0 76px}'
      + '#vcard .chip-rail.in-video .chip-row{padding:0}'
      + '#vcard .chip-rail.in-video .chip{box-shadow:0 8px 22px -10px rgba(0,0,0,.45)}'
      + '#vcard::after{content:"";position:absolute;inset:0;z-index:1;pointer-events:none;background:linear-gradient(rgba(0,0,0,.22),transparent 26%,transparent 62%,rgba(0,0,0,.3))}'
      + '}';
    document.head.appendChild(st);
  } else {
    stage.appendChild(rail);
  }
})();
