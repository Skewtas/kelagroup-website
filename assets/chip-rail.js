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
  stage.appendChild(rail);
})();
