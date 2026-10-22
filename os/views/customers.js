// CRM – kundlista med sök och filter.
import { html, ico, setHTML, $, money, ago, empty, badge, CUSTOMER_STATUS, debounce } from '../lib/ui.js';
import { get, qs } from '../lib/api.js';
import { customerForm } from './forms.js';

export default async function customers(view, p, app) {
  app.setCrumbs([{ label: 'CRM / Kunder' }]);
  const state = { q: p.query.get('q') || '', status: p.query.get('status') || '', archived: p.query.get('archived') === '1' };
  const canWrite = app.can('customers:write');
  const open = () => customerForm(null, { onSaved: (id) => app.navigate(`/kunder/${id}`) });

  setHTML(view, html`
    <div class="page-h"><div><h1>Kunder</h1><div class="sub">Potentiella och befintliga kunder</div></div>
      <div class="act">${canWrite ? html`<button class="btn primary" id="new">${ico('plus')} Ny kund</button>` : ''}</div></div>
    <div class="filters">
      <div class="in-wrap">${ico('search')}<input class="in" id="q" placeholder="Sök namn, org.nr, kontakt, e-post…" value="${state.q}"></div>
      <div class="seg" id="st">${[['', 'Alla'], ...Object.entries(CUSTOMER_STATUS).map(([k, [l]]) => [k, l])].map(([k, l]) => html`<button type="button" data-s="${k}" class="${state.status === k ? 'on' : ''}">${l}</button>`)}</div>
      <label class="chk small ml-auto"><input type="checkbox" id="arch" ${state.archived ? 'checked' : ''}> Visa arkiverade</label>
    </div>
    <div class="card" id="list"></div>`);

  async function load() {
    const list = $('#list');
    const r = await get('/customers' + qs({ q: state.q, status: state.status, archived: state.archived ? 1 : '' }));
    if (!r.customers.length) {
      setHTML(list, state.q || state.status || state.archived ? empty({ icon: 'search', title: 'Inga kunder matchar', text: 'Prova en annan sökning eller ett annat filter.' })
        : empty({ icon: 'building', title: 'Inga kunder ännu', text: 'Lägg upp din första kund – eller konvertera ett lead.', action: canWrite ? html`<button class="btn primary" data-new>${ico('plus')} Skapa första kunden</button>` : '' }));
      list.querySelector('[data-new]')?.addEventListener('click', open);
      return;
    }
    setHTML(list, html`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Företag</th><th>Status</th><th class="hide-sm">Kontakt</th><th class="hide-sm">Ansvarig</th><th class="r hide-sm">Öppna affärer</th><th class="r hide-sm">Förväntat värde</th><th class="r">Uppdaterad</th></tr></thead>
      <tbody>${r.customers.map((c) => html`<tr class="click" data-href="#/kunder/${c.id}">
        <td><div class="t-main">${c.name}</div><div class="t-sub">${[c.org_number, c.industry].filter(Boolean).join(' · ') || '–'}</div></td>
        <td>${badge(CUSTOMER_STATUS, c.status)}</td>
        <td class="hide-sm">${c.primary_contact || html`<span class="faint">–</span>`}</td>
        <td class="hide-sm">${c.owner_name || html`<span class="faint">–</span>`}</td>
        <td class="r hide-sm num">${c.open_deals || html`<span class="faint">0</span>`}</td>
        <td class="r hide-sm num">${c.expected_value_minor ? money(c.expected_value_minor) : html`<span class="faint">–</span>`}</td>
        <td class="r faint small nowrap">${ago(c.updated_at)}</td></tr>`)}</tbody></table></div>`);
    list.querySelectorAll('tr[data-href]').forEach((tr) => tr.addEventListener('click', () => { location.hash = tr.dataset.href; }));
  }

  $('#new')?.addEventListener('click', open);
  $('#q').addEventListener('input', debounce((e) => { state.q = e.target.value.trim(); load(); }, 200));
  view.querySelectorAll('#st [data-s]').forEach((b) => b.addEventListener('click', () => {
    state.status = b.dataset.s; view.querySelectorAll('#st [data-s]').forEach((x) => x.classList.toggle('on', x === b)); load();
  }));
  $('#arch').addEventListener('change', (e) => { state.archived = e.target.checked; load(); });
  if (p.query.get('ny') === '1' && canWrite) { history.replaceState(null, '', '#/kunder'); open(); }
  await load();
}
