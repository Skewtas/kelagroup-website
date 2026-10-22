// Projekt – översikt över alla leveranser med framsteg och deadlines.
import { html, ico, setHTML, $, $$, date, empty, debounce, applyVars, today } from '../lib/ui.js';
import { get, qs } from '../lib/api.js';
import { projectForm } from './forms.js';

export const PROJECT_STATUS = {
  planned: ['Planerat', ''], active: ['Pågår', 'blue'], waiting_customer: ['Väntar på kund', 'amber'], paused: ['Pausat', ''], done: ['Klart', 'green'], cancelled: ['Avbrutet', 'red'],
};

export default async function projects(view, p, app) {
  app.setCrumbs([{ label: 'Projekt' }]);
  const state = { status: p.query.get('status') || 'open', q: '' };
  const w = app.can('projects:write');
  const create = () => projectForm({ onSaved: (id) => app.navigate(`/projekt/${id}`) });
  setHTML(view, html`<div class="page-h"><div><h1>Projekt</h1><div class="sub">Leveranser från start till överlämning</div></div>
    <div class="act">${w ? html`<button class="btn primary" id="new">${ico('plus')} Nytt projekt</button>` : ''}</div></div>
    <div class="filters"><div class="in-wrap">${ico('search')}<input class="in" id="q" placeholder="Sök projekt eller kund…"></div>
      <div class="seg" id="st">${[['open', 'Pågående'], ['waiting_customer', 'Väntar på kund'], ['done', 'Klara'], ['', 'Alla']].map(([k, l]) => html`<button type="button" data-s="${k}" class="${state.status === k ? 'on' : ''}">${l}</button>`)}</div></div>
    <div id="list"></div>`);

  async function load() {
    const r = await get('/projects' + qs(state));
    const box = $('#list');
    if (!r.projects.length) {
      setHTML(box, html`<div class="card">${empty({ icon: 'folder', title: state.q || state.status !== 'open' ? 'Inga projekt här' : 'Inga pågående projekt',
        text: 'Projekt skapas automatiskt när en kund godkänner en offert – eller manuellt från en mall.', action: w ? html`<button class="btn primary" data-new>${ico('plus')} Nytt projekt</button>` : '' })}</div>`);
      box.querySelector('[data-new]')?.addEventListener('click', create);
      return;
    }
    const t0 = today();
    setHTML(box, html`<div class="pgrid">${r.projects.map((x) => {
      const pct = x.task_count ? Math.round((x.task_done / x.task_count) * 100) : 0;
      const late = x.due_date && x.due_date < t0 && !['done', 'cancelled'].includes(x.status);
      const [l, c] = PROJECT_STATUS[x.status];
      return html`<a class="pcard" href="#/projekt/${x.id}">
        <div class="flex"><span class="faint small mono">P${x.number}</span><span class="badge ${c} ml-auto">${l}</span></div>
        <div class="pcard-t">${x.name}</div><div class="li-s">${x.customer_name}</div>
        <div class="pbar"><i data-p="${pct}"></i></div>
        <div class="flex small"><span class="muted">${x.task_done}/${x.task_count} uppgifter</span>${x.task_overdue ? html`<span class="badge red plain">${x.task_overdue} försenade</span>` : ''}
          <span class="ml-auto ${late ? 'err' : 'faint'}">${x.due_date ? (late ? 'Försenat · ' : '') + date(x.due_date, { day: 'numeric', month: 'short' }) : ''}</span></div>
        ${x.next_task && x.status !== 'done' ? html`<div class="li-s mt4">Nästa: ${x.next_task}</div>` : ''}
      </a>`;
    })}</div>`);
    applyVars(box);
  }
  $('#new')?.addEventListener('click', create);
  $('#q').addEventListener('input', debounce((e) => { state.q = e.target.value.trim(); load(); }, 200));
  $$('#st [data-s]').forEach((b) => b.addEventListener('click', () => { state.status = b.dataset.s; $$('#st [data-s]').forEach((x) => x.classList.toggle('on', x === b)); load(); }));
  if (p.query.get('ny') === '1' && w) { history.replaceState(null, '', '#/projekt'); create(); }
  await load();
}
