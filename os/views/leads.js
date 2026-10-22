// Leads – inkommande förfrågningar. Kontakta, kvalificera, diskvalificera eller konvertera till kund + affär.
import { html, ico, setHTML, $, $$, ago, empty, badge, LEAD_STATUS, debounce, modal, toast, withBusy, dateTime, confirmDialog } from '../lib/ui.js';
import { get, patch, post, qs } from '../lib/api.js';
import { leadForm } from './forms.js';
import { noteFormHtml, bindNoteForm } from './customer.js';

export default async function leads(view, p, app) {
  app.setCrumbs([{ label: 'Leads' }]);
  const state = { status: p.query.get('status') || 'open', q: '' };
  const w = app.can('leads:write');
  setHTML(view, html`
    <div class="page-h"><div><h1>Leads</h1><div class="sub">Nya förfrågningar – kontakta inom 24 timmar</div></div>
      <div class="act">${w ? html`<button class="btn primary" id="new">${ico('plus')} Nytt lead</button>` : ''}</div></div>
    <div class="filters">
      <div class="in-wrap">${ico('search')}<input class="in" id="q" placeholder="Sök namn, företag, e-post…"></div>
      <div class="seg" id="st">${[['open', 'Öppna'], ['new', 'Nya'], ['contacted', 'Kontaktade'], ['qualified', 'Kvalificerade'], ['converted', 'Konverterade'], ['disqualified', 'Diskvalificerade'], ['', 'Alla']]
        .map(([k, l]) => html`<button type="button" data-s="${k}" class="${state.status === k ? 'on' : ''}">${l}</button>`)}</div>
    </div>
    <div class="card" id="list"></div>`);

  async function load() {
    const r = await get('/leads' + qs({ status: state.status, q: state.q }));
    const list = $('#list');
    if (!r.leads.length) {
      setHTML(list, empty({ icon: 'inbox', title: state.q ? 'Inga träffar' : 'Inga leads här', text: 'När en förfrågan kommer in – från hemsidan, telefon eller mejl – registrerar du den som ett lead.',
        action: w && !state.q ? html`<button class="btn primary" data-new>${ico('plus')} Nytt lead</button>` : '' }));
      list.querySelector('[data-new]')?.addEventListener('click', () => leadForm({ onSaved: (id) => openLead(id) }));
      return;
    }
    setHTML(list, html`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Namn</th><th>Status</th><th class="hide-sm">Källa</th><th class="hide-sm">Ansvarig</th><th class="r">Inkom</th></tr></thead><tbody>
      ${r.leads.map((l) => html`<tr class="click" data-id="${l.id}"><td><div class="t-main">${l.company || l.name}</div><div class="t-sub">${l.company ? l.name : ''}${l.email ? ' · ' + l.email : ''}</div></td>
        <td>${badge(LEAD_STATUS, l.status)} ${l.status === 'new' && Date.now() - Date.parse(l.created_at) > 86400000 ? html`<span class="badge red plain">Över 24 h</span>` : ''}</td>
        <td class="hide-sm">${l.source}</td><td class="hide-sm">${l.owner_name || '–'}</td><td class="r faint small nowrap">${ago(l.created_at)}</td></tr>`)}</tbody></table></div>`);
    $$('tr[data-id]', list).forEach((tr) => tr.addEventListener('click', () => openLead(tr.dataset.id)));
  }

  async function openLead(id) {
    history.replaceState(null, '', `#/leads/${id}`);
    const r = await get(`/leads/${id}`);
    const l = r.lead;
    const done = () => { load(); };
    modal({
      drawer: true, title: l.company || l.name,
      body: html`<div class="flex wrap mb12">${badge(LEAD_STATUS, l.status)}<span class="faint small">Inkom ${dateTime(l.created_at)} · ${l.source}</span></div>
        <dl class="dl mb16"><dt>Namn</dt><dd>${l.name}</dd><dt>Företag</dt><dd>${l.company || '–'}</dd>
          <dt>E-post</dt><dd>${l.email ? html`<a href="mailto:${l.email}">${l.email}</a>` : '–'}</dd><dt>Telefon</dt><dd>${l.phone ? html`<a href="tel:${l.phone}">${l.phone}</a>` : '–'}</dd>
          <dt>Ansvarig</dt><dd>${l.owner_name || '–'}</dd></dl>
        ${l.message ? html`<div class="lbl mb8">Förfrågan</div><div class="tl-body mb16">${l.message}</div>` : ''}
        ${l.status === 'converted' ? html`<div class="notice green mb16">${ico('checkCircle')}<div>Konverterad till kund och affär. <a href="#/kunder/${l.customer_id}" data-close><strong>Öppna kundkortet →</strong></a></div></div>`
          : w ? html`<div class="flex wrap mb16">
            ${l.status === 'new' ? html`<button type="button" class="btn" data-st="contacted">${ico('phone')} Markera kontaktad</button>` : ''}
            ${['new', 'contacted'].includes(l.status) ? html`<button type="button" class="btn" data-st="qualified">${ico('flag')} Kvalificera</button>` : ''}
            ${l.status !== 'disqualified' ? html`<button type="button" class="btn ghost" data-st="disqualified">Diskvalificera</button>` : html`<button type="button" class="btn ghost" data-st="new">Öppna igen</button>`}
            ${app.can('customers:write') && app.can('deals:write') && l.status !== 'disqualified' ? html`<button type="button" class="btn primary ml-auto" id="convert">${ico('arrowRight')} Konvertera till kund</button>` : ''}
          </div>` : ''}
        <div class="divider"></div>
        <div class="lbl mb8">Historik</div>
        <div class="timeline mb16">${r.activities.map((a) => html`<div class="tl"><span class="tl-dot">${ico(a.type === 'system' ? 'activity' : 'note')}</span><div class="tl-b"><div class="tl-t">${a.title}</div><div class="tl-m">${a.actor_name || 'System'} · ${dateTime(a.created_at)}</div>${a.body ? html`<div class="tl-body">${a.body}</div>` : ''}</div></div>`)}</div>
        ${w ? noteFormHtml(false, 'div') : ''}`,
      onMount: (d, close) => {
        $$('[data-st]', d).forEach((b) => b.addEventListener('click', () => withBusy(b, async () => {
          await patch(`/leads/${l.id}`, { status: b.dataset.st }); toast('Status uppdaterad'); close(); done(); openLead(l.id);
        })));
        $('#convert', d)?.addEventListener('click', async (e) => {
          if (!(await confirmDialog({ title: 'Konvertera lead?', text: `${l.company || l.name} blir en kund (med ${l.name} som kontaktperson) och en ny affär i pipelinen.`, ok: 'Konvertera' }))) return;
          await withBusy(e.target.closest('button'), async () => {
            const res = await post(`/leads/${l.id}/convert`, {});
            toast('Kund och affär skapade'); close(); app.navigate(`/kunder/${res.customer_id}`);
          });
        });
        bindNoteForm(d, { lead_id: l.id }, () => { close(); openLead(l.id); });
      },
      onClose: () => { if (location.hash.startsWith('#/leads/')) history.replaceState(null, '', '#/leads'); },
    });
  }

  $('#new')?.addEventListener('click', () => leadForm({ onSaved: (id) => { load(); openLead(id); } }));
  $('#q').addEventListener('input', debounce((e) => { state.q = e.target.value.trim(); load(); }, 200));
  $$('#st [data-s]').forEach((b) => b.addEventListener('click', () => { state.status = b.dataset.s; $$('#st [data-s]').forEach((x) => x.classList.toggle('on', x === b)); load(); }));
  await load();
  if (p.id) openLead(p.id);
  if (p.query.get('ny') === '1' && w) { history.replaceState(null, '', '#/leads'); leadForm({ onSaved: (id) => { load(); openLead(id); } }); }
}
