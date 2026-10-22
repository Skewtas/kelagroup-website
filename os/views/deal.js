// Affärsdetaljer – steg, värde, nästa steg, kopplade offerter och historik.
import { html, ico, setHTML, $, $$, money, date, dateTime, empty, badge, DEAL_STAGES, STAGE_LABEL, LOST_REASONS, QUOTE_STATUS, toast } from '../lib/ui.js';
import { get, patch } from '../lib/api.js';
import { dealForm, lostReasonDialog, newQuoteDialog } from './forms.js';
import { noteFormHtml, bindNoteForm } from './customer.js';

export default async function deal(view, p, app) {
  const r = await get(`/deals/${p.id}`);
  const d = r.deal;
  const w = app.can('deals:write');
  const reload = () => deal(view, p, app);
  app.setCrumbs([{ label: 'Affärsmöjligheter', href: '#/affarer' }, { label: d.title }]);
  const idx = DEAL_STAGES.findIndex(([k]) => k === d.stage);

  setHTML(view, html`
    <div class="dhead"><div class="logo-box">${ico('target', 'lg')}</div>
      <div><h1>${d.title} <span class="badge ${d.stage === 'won' ? 'green' : d.stage === 'lost' ? 'red' : 'accent'}">${STAGE_LABEL[d.stage]}</span></h1>
        <div class="meta">${r.customer ? html`<span>${ico('building')}<a href="#/kunder/${r.customer.id}">${r.customer.name}</a></span>` : html`<span class="faint">Ingen kund kopplad</span>`}
          <span>${ico('coins')}${money(d.value_minor)}${d.monthly_value_minor ? ` + ${money(d.monthly_value_minor)}/mån` : ''}</span><span>${ico('percent')}${d.probability} %</span></div></div>
      <div class="act">${w ? html`<button class="btn" id="edit">${ico('edit')} Redigera</button>` : ''}${app.can('quotes:write') && r.customer ? html`<button class="btn primary" id="quote">${ico('file')} Skapa offert</button>` : ''}</div></div>
    ${w ? html`<div class="seg mb16 w100 tbl-wrap" id="stages">${DEAL_STAGES.map(([k, l], i) => html`<button type="button" data-s="${k}" class="${k === d.stage ? 'on' : ''}">${i < idx && d.stage !== 'lost' ? ico('check') : ''}${l}</button>`)}</div>` : ''}
    ${d.stage === 'lost' ? html`<div class="notice amber mb16">${ico('info')}<div><strong>Förlorad:</strong> ${LOST_REASONS[d.lost_reason] || '–'}${d.lost_note ? ` – ${d.lost_note}` : ''}</div></div>` : ''}
    <div class="split">
      <div class="stack">
        <section class="card"><div class="card-h"><h3>Offerter</h3></div><div class="card-b ${r.quotes.length ? 'flush' : ''}">
          ${r.quotes.length ? html`<div class="list">${r.quotes.map((q) => html`<a class="li" href="#/offerter/${q.id}"><span class="li-ico">${ico('file')}</span><span class="li-b"><div class="li-t">#${q.number} ${q.title}</div></span>${badge(QUOTE_STATUS, q.status)}</a>`)}</div>`
            : html`<p class="muted small">Ingen offert kopplad ännu.</p>`}</div></section>
        <section class="card"><div class="card-h"><h3>Historik</h3></div><div class="card-b">
          ${r.activities.length ? html`<div class="timeline">${r.activities.map((a) => html`<div class="tl"><span class="tl-dot ${a.type === 'system' ? '' : 'accent'}">${ico(a.type === 'system' ? 'activity' : 'note')}</span><div class="tl-b"><div class="tl-t">${a.title}</div><div class="tl-m">${a.actor_name || 'System'} · ${dateTime(a.created_at)}</div>${a.body ? html`<div class="tl-body">${a.body}</div>` : ''}</div></div>`)}</div>`
            : empty({ icon: 'activity', title: 'Ingen historik' })}</div></section>
      </div>
      <div class="stack">
        <section class="card"><div class="card-h"><h3>Detaljer</h3></div><div class="card-b"><dl class="dl">
          <dt>Ansvarig</dt><dd>${d.owner_user_id ? '' : '–'}<span id="owner"></span></dd><dt>Förväntat avslut</dt><dd>${date(d.expected_close_date)}</dd>
          <dt>Nästa steg</dt><dd>${d.next_step || '–'}${d.next_step_date ? html`<div class="faint small">${date(d.next_step_date)}</div>` : ''}</dd>
          <dt>Skapad</dt><dd>${date(d.created_at)}</dd>${d.won_at ? html`<dt>Vunnen</dt><dd>${date(d.won_at)}</dd>` : ''}</dl></div></section>
        ${app.can('customers:write') ? html`<section class="card"><div class="card-h"><h3>Logga aktivitet</h3></div><div class="card-b">${noteFormHtml()}</div></section>` : ''}
      </div>
    </div>`);

  if (d.owner_user_id) get('/users').then((u) => { const o = u.users.find((x) => x.id === d.owner_user_id); if (o && $('#owner')) $('#owner').textContent = o.name; }).catch(() => {});
  $('#edit')?.addEventListener('click', () => dealForm(d, { onSaved: reload }));
  $('#quote')?.addEventListener('click', () => newQuoteDialog({ customerId: d.customer_id, dealId: d.id, onCreated: (id) => app.navigate(`/offerter/${id}`) }));
  $$('#stages [data-s]').forEach((b) => b.addEventListener('click', async () => {
    const stage = b.dataset.s; if (stage === d.stage) return;
    const body = { stage };
    if (stage === 'lost') { const x = await lostReasonDialog(); if (!x) return; Object.assign(body, x); }
    try { await patch(`/deals/${d.id}`, body); toast(`Flyttad till ${STAGE_LABEL[stage]}`); reload(); } catch (e) { toast(e.message, 'err'); }
  }));
  bindNoteForm(view, { deal_id: d.id, customer_id: d.customer_id || undefined }, reload);
}
