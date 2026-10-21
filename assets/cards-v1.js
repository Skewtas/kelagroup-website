/* cards-v1.js – startar korten illustrationer bara när kortet syns */
(() => {
  const cards = document.querySelectorAll('.stack .scard');
  if (!cards.length) return;
  if (!('IntersectionObserver' in window)) { cards.forEach(c => c.classList.add('on')); return; }
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => e.target.classList.toggle('on', e.isIntersecting));
  }, { threshold: 0.25 });
  cards.forEach(c => io.observe(c));
})();
