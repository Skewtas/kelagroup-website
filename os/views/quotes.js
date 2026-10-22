// Offerter – lista med statusflikar och sök.
import { html, ico, setHTML, $, $$, money, ago, date, empty, badge, QUOTE_STATUS, debounce } from '../lib/ui.js';
import { get, qs } from '../lib/api.js';
import { newQuoteDialog } from './forms.js';

const TABS = [['', 'Alla'], ['draft', 'Utkast'], ['review', 'Granskning'], ['open', 'Skickade & öppnade'], ['accepted', 'Accepterade'], ['declined', 'Avböjda'], ['expired', 'Utgångna']];

export default async function quotes(view, p, app) {
  app.setCrumbs([{ label: 'Offerter' }]);
  const state = { status: p.query.get('status') || '', q: '' };
  const w = app.can('quotes:write');
  const create = () => newQuoteDialog({ onCreated: (id) => app.navigate(`/offerter/${id}`) });
  setHTML(view, html`
    <div class="page-h"><div><h1>Offerter</h1><div class="sub">Skapa, skicka och följ upp</div></div>
      <div class="act">${w ? html`<button class="btn primary" id="new">${ico('plus')} Ny offert</button>` : ''}</div></div>
    <div class="filters"><div class="in-wrap">${ico('search')}<input class="in" id="q" placeholder="Sök rubrik, kund eller nummer…"></div>
      <div class="seg" id="st">${TABS.map(([k, l]) => html`<button type="button" data-s="${k}" class="${state.status === k ? 'on' : ''}">${l}</button>`)}</div></div>
    <div class="card" id="list"></div>`);

  async function load() {
    const r = await get('/quotes' + qs({ status: state.status, q: state.q }));
    const list = $('#list');
    if (!r.quotes.length) {
      setHTML(list, empty({ icon: 'file', title: state.status || state.q ? 'Inga offerter här' : 'Inga offerter ännu', text: 'En offert i KELA OS är en digital presentation som kunden öppnar via en säker länk och kan godkänna direkt.',
        action: w && !state.q ? html`<button class="btn primary" data-new>${ico('plus')} Skapa första offerten</button>` : '' }));
      list.querySelector('[data-new]')?.addEventListener('click', create);
      return;
    }
    setHTML(list, html`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Nr</th><th>Offert</th><th>Status</th><th class="r">Engång exkl. moms</th><th class="r hide-sm">Månad exkl. moms</th><th class="r hide-sm">Giltig till</th><th class="r">Uppdaterad</th></tr></thead><tbody>
      ${r.quotes.map((q) => html`<tr class="click" data-href="#/offerter/${q.id}"><td class="num faint">#${q.number}</td>
        <td><div class="t-main">${q.title}</div><div class="t-sub">${q.customer_name}${q.version_no > 1 ? ` · v${q.version_no}` : ''}${q.owner_name ? ' · ' + q.owner_name : ''}</div></td>
        <td>${badge(QUOTE_STATUS, q.status)}${q.status === 'viewed' && q.first_viewed_at ? html`<div class="t-sub">${ago(q.first_viewed_at)}</div>` : ''}</td>
        <td class="r num">${q.totals ? money(q.totals.once.net) : '–'}</td><td class="r num hide-sm">${q.totals?.monthly?.net ? money(q.totals.monthly.net) : html`<span class="faint">–</span>`}</td>
        <td class="r small hide-sm">${date(q.valid_until)}</td><td class="r faint small nowrap">${ago(q.updated_at)}</td></tr>`)}</tbody></table></div>`);
    $$('tr[data-href]', list).forEach((tr) => tr.addEventListener('click', () => { location.hash = tr.dataset.href; }));
  }
  $('#new')?.addEventListener('click', create);
  $('#q').addEventListener('input', debounce((e) => { state.q = e.target.value.trim(); load(); }, 200));
  $$('#st [data-s]').forEach((b) => b.addEventListener('click', () => { state.status = b.dataset.s; $$('#st [data-s]').forEach((x) => x.classList.toggle('on', x === b)); load(); }));
  if (p.query.get('ny') === '1' && w) { history.replaceState(null, '', '#/offerter'); create(); }
  await load();
}
