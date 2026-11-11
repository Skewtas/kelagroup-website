// CRM – kundkort: uppgifter, kontakter, affärer, offerter, aktivitet, uppgifter. Fas 2-delar visas som planerade.
import { html, raw, ico, setHTML, $, $$, money, ago, date, empty, badge, CUSTOMER_STATUS, QUOTE_STATUS, STAGE_LABEL, initials, toast, confirmDialog, modal, formData, showErrors, withBusy, dateTime } from '../lib/ui.js';
import { get, post, del, patch, api } from '../lib/api.js';
import { customerForm, contactForm, dealForm, newQuoteDialog } from './forms.js';
import { docListHtml, bindDocList, docForm } from './documents.js';

const ACT_ICON = { note: 'note', call: 'phone', meeting: 'users', email: 'mail', system: 'activity', visit: 'eye', answer: 'listChecks' };
const dur = (sec) => { sec = Math.round(sec || 0); if (sec < 60) return `${sec} s`; const m = Math.round(sec / 60); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`; };
// Modulnamn på offertsidan (samma nycklar som sidan sparar).
const MODULE = { adminpanel: 'Adminpanel', bokis: 'Bokis', chattis: 'Chattis', hub: 'Customer hub', kundportal: 'Kundportal', nyhetsbrev: 'Nyhetsbrev och sms', feedback: 'Kundfeedback',
  headof: 'Headof', personalapp: 'Personalapp', avtal: 'Avtalshantering', rekrytering: 'Rekrytering', content: 'Contentgenerator', seo: 'SEO och GEO', meta: 'Meta-annonser',
  influencer: 'Influencersamarbeten', paminnelser: 'Automatiska påminnelser', inkasso: 'Inkassohantering' };
const ACT_LABEL = { note: 'Anteckning', call: 'Samtal', meeting: 'Möte', email: 'Mejl' };

export default async function customer(view, p, app) {
  const tab = p.tab || 'oversikt';
  const r = await get(`/customers/${p.id}`);
  const c = r.customer;
  const w = app.can('customers:write');
  app.setCrumbs([{ label: 'Kunder', href: '#/kunder' }, { label: c.name }]);
  const reload = () => customer(view, p, app);
  const openDeals = r.deals.filter((d) => !['won', 'lost'].includes(d.stage));
  const accepted = r.quotes.filter((q) => q.status === 'accepted');
  const mrr = accepted.reduce((s, q) => s + (q.totals?.monthly?.net || 0), 0);

  const TABS = [['oversikt', 'Översikt'], ['affarer', 'Affärer', r.deals.length], ['offerter', 'Offerter', r.quotes.length], ['aktivitet', 'Aktivitet', r.activities.length + (r.customer_events || []).length], ['uppgifter', 'Uppgifter', r.tasks.filter((t) => t.status === 'open').length],
    ['projekt', 'Projekt', (r.projects || []).length], ['avtal', 'Avtal och dokument', (r.documents || []).length + (r.pages || []).filter((pg) => !(r.documents || []).some((d) => d.tracked_page_id === pg.id)).length], ['fakturor', 'Fakturor'], ['support', 'Support']];

  setHTML(view, html`
    <div class="dhead">
      <div class="logo-box">${initials(c.name).slice(0, 1)}</div>
      <div><h1>${c.name} ${badge(CUSTOMER_STATUS, c.status)} ${c.archived_at ? html`<span class="badge">Arkiverad</span>` : ''}</h1>
        <div class="meta">${c.org_number ? html`<span>${ico('building')}${c.org_number}</span>` : ''}${c.industry ? html`<span>${ico('tag')}${c.industry}</span>` : ''}
          ${c.website ? html`<span>${ico('globe')}<a href="${c.website}" target="_blank" rel="noopener noreferrer">${c.website.replace(/^https?:\/\//, '')}</a></span>` : ''}
          ${c.owner ? html`<span>${ico('user')}${c.owner.name}</span>` : ''}</div></div>
      <div class="act">
        ${w ? html`<button class="btn" id="note">${ico('note')} Anteckning</button>` : ''}
        ${app.can('deals:write') ? html`<button class="btn" id="deal">${ico('target')} Ny affär</button>` : ''}
        ${app.can('quotes:write') ? html`<button class="btn primary" id="quote">${ico('file')} Ny offert</button>` : ''}
        <button class="btn icon" id="more" aria-label="Fler val">${ico('more')}</button>
      </div>
    </div>
    <div class="tabs">${TABS.map(([k, l, n]) => html`<a href="#/kunder/${c.id}/${k}" class="${tab === k ? 'on' : ''}">${l}${n ? html` <span class="cnt">${n}</span>` : ''}</a>`)}</div>
    <div id="tab"></div>`);

  const tabEl = $('#tab');
  const quoteRow = (q) => html`<tr class="click" data-href="#/offerter/${q.id}"><td class="num faint">#${q.number}</td><td class="t-main">${q.title}</td><td>${badge(QUOTE_STATUS, q.status)}</td>
    <td class="r num">${q.totals ? money(q.totals.once.net) : '–'}</td><td class="r num">${q.totals?.monthly?.net ? money(q.totals.monthly.net) + '/mån' : '–'}</td><td class="r faint small">${ago(q.updated_at)}</td></tr>`;
  const dealRow = (d) => html`<tr class="click" data-href="#/affarer/${d.id}"><td class="t-main">${d.title}</td><td><span class="badge ${d.stage === 'won' ? 'green' : d.stage === 'lost' ? 'red' : 'accent'}">${STAGE_LABEL[d.stage]}</span></td>
    <td class="r num">${money(d.value_minor)}</td><td class="r num">${d.probability} %</td><td>${d.owner_name || '–'}</td><td class="r faint small">${ago(d.updated_at)}</td></tr>`;
  const activityList = (list) => list.length ? html`<div class="timeline">${list.map((a) => html`<div class="tl"><span class="tl-dot ${a.type === 'visit' ? 'blue' : a.type === 'answer' ? 'green' : a.type === 'system' ? '' : 'accent'}">${ico(ACT_ICON[a.type] || 'activity')}</span>
    <div class="tl-b"><div class="tl-t">${a.title}</div><div class="tl-m">${a.actor_name || 'System'} · ${dateTime(a.created_at)}${a.meta ? ' · ' + a.meta : ''}</div>${a.body ? html`<div class="tl-body">${a.body}</div>` : ''}</div></div>`)}</div>`
    : empty({ icon: 'activity', title: 'Ingen aktivitet ännu', text: 'Anteckningar, samtal, möten och systemhändelser samlas här.' });

  // Kundens egna händelser (offertsidan, checklistan) som historikposter.
  const pageById = Object.fromEntries((r.pages || []).map((pg) => [pg.id, pg]));
  const evToAct = (e) => e.kind === 'visit'
    ? { type: 'visit', created_at: e.at, title: `Öppnade ${pageById[e.page_id]?.kind === 'checklista' ? 'checklistan' : 'offertsidan'}`, actor_name: c.name,
        meta: [e.active_seconds ? `läste i ${dur(e.active_seconds)}` : null, e.max_scroll ? `${e.max_scroll} % av sidan` : null, e.device].filter(Boolean).join(' · ') }
    : { type: 'answer', created_at: e.at, title: e.done && !e.text ? `Bockade av: ${e.label || e.item_key}` : `Svarade i checklistan: ${e.label || e.item_key}`, actor_name: e.updated_by || c.name,
        body: e.text ? (e.text.length > 400 ? e.text.slice(0, 400) + '…' : e.text) : null, meta: e.section || '' };
  const timeline = [...r.activities, ...(r.customer_events || []).map(evToAct)].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));

  if (tab === 'oversikt') {
    setHTML(tabEl, html`${fromCustomerCard()}<div class="kpis">
        <div class="kpi"><div class="kpi-l">${ico('target')}Öppna affärer</div><div class="kpi-v">${openDeals.length}</div><div class="kpi-s">${money(openDeals.reduce((s, d) => s + d.value_minor, 0))} i pipeline</div></div>
        <div class="kpi"><div class="kpi-l">${ico('file')}Offerter</div><div class="kpi-v">${r.quotes.length}</div><div class="kpi-s">${accepted.length} accepterade</div></div>
        <div class="kpi"><div class="kpi-l">${ico('repeat')}Avtalad MRR</div><div class="kpi-v">${money(mrr)}</div><div class="kpi-s">från accepterade offerter</div></div>
        <div class="kpi"><div class="kpi-l">${ico('coins')}Förväntat värde</div><div class="kpi-v">${c.expected_value_minor ? money(c.expected_value_minor) : '–'}</div><div class="kpi-s">enligt kundkortet</div></div>
      </div>
      <div class="split">
        <div class="stack">
          <section class="card"><div class="card-h"><h3>Företagsuppgifter</h3><div class="act">${w ? html`<button class="btn sm" id="edit">${ico('edit')} Redigera</button>` : ''}</div></div>
            <div class="card-b"><dl class="dl">
              <dt>Organisationsnummer</dt><dd>${c.org_number || '–'}</dd><dt>Bransch</dt><dd>${c.industry || '–'}</dd>
              <dt>E-post</dt><dd>${c.email ? html`<a href="mailto:${c.email}">${c.email}</a>` : '–'}</dd><dt>Telefon</dt><dd>${c.phone ? html`<a href="tel:${c.phone}">${c.phone}</a>` : '–'}</dd>
              <dt>Fakturaadress</dt><dd class="pre">${c.billing_address || '–'}</dd><dt>Besöksadress</dt><dd>${c.visiting_address || '–'}</dd>
              <dt>Ansvarig säljare</dt><dd>${c.owner?.name || '–'}</dd><dt>Kund sedan</dt><dd>${date(c.created_at)}</dd>
              ${c.notes ? html`<dt>Anteckningar</dt><dd>${c.notes}</dd>` : ''}
            </dl></div></section>
          <section class="card"><div class="card-h"><h3>Senaste aktivitet</h3><div class="act"><a class="btn ghost sm" href="#/kunder/${c.id}/aktivitet">Visa allt</a></div></div><div class="card-b">${activityList(timeline.slice(0, 8))}</div></section>
        </div>
        <div class="stack">
          <section class="card"><div class="card-h"><h3>Kontaktpersoner</h3><div class="act">${w ? html`<button class="btn sm" id="add-contact">${ico('plus')} Lägg till</button>` : ''}</div></div>
            <div class="card-b">${r.contacts.length ? r.contacts.map((k) => html`<div class="contact"><span class="av">${initials(k.name)}</span><div class="li-b"><div class="li-t">${k.name} ${k.is_primary ? html`<span class="tag">Primär</span>` : ''}</div>
              <div class="li-s">${[k.title, k.email, k.phone].filter(Boolean).join(' · ') || '–'}</div></div>
              ${w ? html`<button class="btn ghost sm icon" data-edit-contact="${k.id}" aria-label="Redigera">${ico('edit')}</button><button class="btn ghost sm icon" data-del-contact="${k.id}" aria-label="Ta bort">${ico('trash')}</button>` : ''}</div>`)
              : empty({ icon: 'user', title: 'Inga kontakter', text: 'Lägg till personer du pratar med hos kunden.' })}</div></section>
          <section class="card"><div class="card-h"><h3>Aktiva tjänster</h3></div><div class="card-b">
            ${accepted.length ? html`<div class="list">${accepted.map((q) => html`<a class="li" href="#/offerter/${q.id}"><span class="li-ico green">${ico('checkCircle')}</span><span class="li-b"><div class="li-t">${q.title}</div><div class="li-s">Offert #${q.number} · accepterad ${date(q.accepted_at)}</div></span></a>`)}</div>`
              : html`<p class="muted small">Inga accepterade offerter ännu. Leveranser, licenser och system per kund kopplas in i fas 2–3 (KELA Systems).</p>`}
          </div></section>
        </div>
      </div>`);
  } else if (tab === 'affarer') {
    setHTML(tabEl, html`<div class="card">${r.deals.length ? html`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Affär</th><th>Steg</th><th class="r">Värde</th><th class="r">Sannolikhet</th><th>Ansvarig</th><th class="r">Uppdaterad</th></tr></thead><tbody>${r.deals.map(dealRow)}</tbody></table></div>`
      : empty({ icon: 'target', title: 'Inga affärer', text: 'Skapa en affärsmöjlighet för att följa den i pipelinen.' })}</div>`);
  } else if (tab === 'offerter') {
    setHTML(tabEl, html`<div class="card">${r.quotes.length ? html`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Nr</th><th>Rubrik</th><th>Status</th><th class="r">Engång exkl. moms</th><th class="r">Månad exkl. moms</th><th class="r">Uppdaterad</th></tr></thead><tbody>${r.quotes.map(quoteRow)}</tbody></table></div>`
      : empty({ icon: 'file', title: 'Inga offerter', text: 'Skapa en offert direkt från kundkortet.' })}</div>`);
  } else if (tab === 'aktivitet') {
    setHTML(tabEl, html`<div class="split"><section class="card"><div class="card-b">${activityList(timeline)}</div></section>
      ${w ? html`<section class="card"><div class="card-h"><h3>Logga aktivitet</h3></div><div class="card-b">${noteFormHtml()}</div></section>` : ''}</div>`);
    bindNoteForm(tabEl, { customer_id: c.id }, reload);
  } else if (tab === 'uppgifter') {
    setHTML(tabEl, html`<div class="card">${r.tasks.length ? html`<div class="list">${r.tasks.map((t) => html`<label class="li"><input type="checkbox" class="chk" data-task="${t.id}" ${t.status === 'done' ? 'checked' : ''} ${app.can('tasks:write') ? '' : 'disabled'}>
      <span class="li-b"><div class="li-t">${t.title}</div><div class="li-s">${t.due_date ? 'Förfaller ' + date(t.due_date) : 'Inget datum'}</div></span>${t.status === 'done' ? html`<span class="badge green">Klar</span>` : ''}</label>`)}</div>`
      : empty({ icon: 'checkSquare', title: 'Inga uppgifter', text: 'Uppgifter kopplade till kunden visas här.' })}</div>`);
    $$('[data-task]', tabEl).forEach((cb) => cb.addEventListener('change', async () => { await patch(`/tasks/${cb.dataset.task}`, { status: cb.checked ? 'done' : 'open' }); toast(cb.checked ? 'Uppgiften är klar' : 'Uppgiften är öppen igen'); }));
  } else if (tab === 'projekt') {
    const ps = r.projects || [];
    setHTML(tabEl, html`<div class="card"><div class="card-h"><h3>Projekt</h3><div class="act">${app.can('projects:write') ? html`<button class="btn sm primary" id="new-prj">${ico('plus')} Nytt projekt</button>` : ''}</div></div>
      <div class="card-b ${ps.length ? 'flush mt8' : ''}">${ps.length ? html`<div class="list">${ps.map((x) => html`<a class="li" href="#/projekt/${x.id}"><span class="li-ico">${ico('folder')}</span><span class="li-b"><div class="li-t">${x.name}</div>
        <div class="li-s">P${x.number} · ${x.task_done}/${x.task_count} uppgifter klara${x.due_date ? ' · deadline ' + date(x.due_date) : ''}</div></span><span class="badge ${x.status === 'done' ? 'green' : x.status === 'active' ? 'blue' : x.status === 'waiting_customer' ? 'amber' : ''}">${{ planned: 'Planerat', active: 'Pågår', waiting_customer: 'Väntar på kund', paused: 'Pausat', done: 'Klart', cancelled: 'Avbrutet' }[x.status]}</span></a>`)}</div>`
        : empty({ icon: 'folder', title: 'Inga projekt', text: 'Projekt skapas automatiskt när kunden godkänner en offert, eller manuellt här.' })}</div></div>`);
    $('#new-prj')?.addEventListener('click', () => import('./forms.js').then((m) => m.projectForm({ customerId: c.id, onSaved: (id) => app.navigate(`/projekt/${id}`) })));
  } else if (tab === 'avtal' || tab === 'dokument') {
    const docs = r.documents || []; const pages = r.pages || [];
    const unlinkedPages = pages.filter((pg) => !docs.some((d) => d.tracked_page_id === pg.id));
    setHTML(tabEl, html`<div class="flex mb12"><span class="muted small">Avtal, offerter, bilagor och presentationer för ${c.name}. Filer sparas med kontrollsumma.</span>
        ${w ? html`<button class="btn primary ml-auto" id="add-doc">${ico('plus')} Lägg till</button>` : ''}</div>
      ${unlinkedPages.length ? html`<section class="card mb16"><div class="card-h">${ico('eye')}<h3>Offertsidor och checklistor</h3></div><div class="list mt8">${unlinkedPages.map((pg) => html`<a class="li" href="#/sparning/${pg.id}">
        <span class="li-ico">${ico(pg.kind === 'checklista' ? 'listChecks' : 'file')}</span><span class="li-b"><div class="li-t">${pg.title}</div><div class="li-s">${pg.kind === 'checklista' ? 'Checklista' : `${pg.visits} besök${pg.last_seen_at ? ' · senast ' + ago(pg.last_seen_at) : ''}`}</div></span>${ico('chevRight', 'chev')}</a>`)}</div></section>` : ''}
      ${docs.length ? docListHtml(docs, { canWrite: w }) : unlinkedPages.length ? '' : html`<div class="card">${empty({ icon: 'signature', title: 'Inga avtal eller dokument än', text: 'Lägg in avtal (PDF och Word), offerter, bilagor eller länkar till presentationer.' })}</div>`}`);
    bindDocList(tabEl, docs, { reload, customerId: c.id });
    $('#add-doc')?.addEventListener('click', () => docForm({ customerId: c.id, onSaved: reload }));
  } else {
    const L = { projekt: ['folder', 'Projekt', 'Projekthantering med mallar, milstolpar och tidsåtgång byggs i fas 2. Accepterade offerter skapar redan en uppgift "Starta projekt".'],
      avtal: ['signature', 'Avtal', 'Avtal och e-signering via en etablerad e-signeringstjänst byggs i fas 2.'],
      fakturor: ['receipt', 'Fakturor', 'Fakturor och betalningsstatus hämtas från Fortnox i fas 2. KELA OS bygger ingen egen bokföring.'],
      support: ['buoy', 'Supportärenden', 'Supportärenden per kund byggs i fas 2.'],
      dokument: ['folder', 'Dokument', 'Säker filuppladdning (Cloudflare R2 i EU, virusskanning, åtkomstkontroll) byggs i fas 2.'] }[tab] || ['info', 'Okänd flik', ''];
    setHTML(tabEl, html`<div class="card">${empty({ icon: L[0], title: `${L[1]} – planerat`, text: L[2] })}</div>`);
  }

  function fromCustomerCard() {
    const pages = r.pages || [];
    if (!pages.length) return '';
    const offer = pages.filter((pg) => pg.kind !== 'checklista');
    const lists = pages.filter((pg) => pg.kind === 'checklista');
    const answers = (r.customer_events || []).filter((e) => e.kind === 'answer');
    return html`<section class="card mb16 from-cust"><div class="card-h">${ico('eye')}<h3>Från kunden</h3><span class="faint small">uppdateras automatiskt</span></div><div class="card-b"><div class="fc-grid">
      ${offer.map((pg) => {
        const ch = Object.entries(pg.choices || {});
        const by = (v) => ch.filter(([, x]) => x === v).map(([k]) => MODULE[k] || k);
        return html`<div class="fc"><div class="fc-h">${ico('file')}<strong>${pg.title}</strong><a class="btn sm ghost ml-auto" href="#/sparning/${pg.id}">Detaljer</a></div>
          <div class="fc-stats"><div><b>${pg.visits}</b><span>besök</span></div><div><b>${dur(pg.total_seconds)}</b><span>lästid</span></div><div><b>${pg.last_seen_at ? ago(pg.last_seen_at) : '–'}</b><span>senast öppnad</span></div></div>
          ${ch.length ? html`<div class="fc-choices">${by('ja').length ? html`<div><span class="badge green">Ja · ${by('ja').length}</span> ${by('ja').join(', ')}</div>` : ''}
            ${by('kanske').length ? html`<div><span class="badge amber">Kanske · ${by('kanske').length}</span> ${by('kanske').join(', ')}</div>` : ''}
            ${by('nej').length ? html`<div><span class="badge">Nej · ${by('nej').length}</span> ${by('nej').join(', ')}</div>` : ''}
            <div class="faint small">Valen ändrades senast ${dateTime(pg.choices_updated_at)}</div></div>` : html`<p class="small muted">Inga val gjorda än.</p>`}</div>`;
      })}
      ${lists.map((pg) => {
        const mine = answers.filter((e) => e.page_id === pg.id).slice(0, 4);
        return html`<div class="fc"><div class="fc-h">${ico('listChecks')}<strong>${pg.title}</strong><a class="btn sm ghost ml-auto" href="#/sparning/${pg.id}">Alla svar</a></div>
          <div class="fc-stats"><div><b>${pg.answers}</b><span>svar</span></div><div><b>${pg.answers_done}</b><span>avbockade</span></div><div><b>${pg.answers_updated_at ? ago(pg.answers_updated_at) : '–'}</b><span>senast ändrad</span></div></div>
          ${mine.length ? html`<div class="list">${mine.map((e) => html`<div class="fc-ans"><div class="li-t">${e.label || e.item_key}</div><div class="li-s">${e.updated_by || 'Okänd'} · ${ago(e.at)}</div>${e.text ? html`<div class="fc-txt">${e.text.length > 220 ? e.text.slice(0, 220) + '…' : e.text}</div>` : ''}</div>`)}</div>`
            : html`<p class="small muted">Inga svar än. Här syns det direkt när någon skriver i checklistan.</p>`}</div>`;
      })}</div></div></section>`;
  }
  // Håll kortet aktuellt medan det är öppet (var 30:e sekund, bara när fliken syns).
  if ((tab === 'oversikt' || tab === 'aktivitet') && (r.pages || []).length) {
    const here = location.hash;
    const timer = setInterval(() => {
      if (location.hash !== here || !document.body.contains(tabEl)) return clearInterval(timer);
      if (document.visibilityState !== 'visible' || document.querySelector('dialog[open]')) return;
      clearInterval(timer); reload();
    }, 30_000);
  }
  $$('tr[data-href]', view).forEach((tr) => tr.addEventListener('click', () => { location.hash = tr.dataset.href; }));

  // Åtgärder
  $('#edit')?.addEventListener('click', () => customerForm(c, { onSaved: reload }));
  $('#add-contact')?.addEventListener('click', () => contactForm(c.id, null, { onSaved: reload }));
  $$('[data-edit-contact]').forEach((b) => b.addEventListener('click', () => contactForm(c.id, r.contacts.find((k) => k.id === b.dataset.editContact), { onSaved: reload })));
  $$('[data-del-contact]').forEach((b) => b.addEventListener('click', async () => {
    if (!(await confirmDialog({ title: 'Ta bort kontakt?', text: 'Kontaktpersonen tas bort från kunden.', ok: 'Ta bort', danger: true }))) return;
    try { await del(`/contacts/${b.dataset.delContact}`); toast('Kontakten är borttagen'); reload(); } catch (e) { toast(e.message, 'err'); }
  }));
  $('#deal')?.addEventListener('click', () => dealForm(null, { customerId: c.id, onSaved: (id) => app.navigate(`/affarer/${id}`) }));
  $('#quote')?.addEventListener('click', () => newQuoteDialog({ customerId: c.id, onCreated: (id) => app.navigate(`/offerter/${id}`) }));
  $('#note')?.addEventListener('click', () => modal({
    title: 'Logga aktivitet', body: noteFormHtml(true, 'div'), onMount: (d, close) => bindNoteForm(d, { customer_id: c.id }, () => { close(); reload(); }),
  }));
  $('#more').addEventListener('click', () => modal({
    title: c.name,
    body: html`<div class="list">
      ${app.can('customers:export') ? html`<button type="button" class="li click btn ghost jc-start h-auto w100" id="exp">${ico('download')}<span class="li-b"><div class="li-t">Exportera personuppgifter (GDPR)</div><div class="li-s">All data om kunden och dess kontakter som JSON</div></span></button>` : ''}
      ${w ? html`<button type="button" class="li click btn ghost jc-start h-auto w100" id="arc">${ico('archive')}<span class="li-b"><div class="li-t">${c.archived_at ? 'Återställ kund' : 'Arkivera kund'}</div><div class="li-s">${c.archived_at ? 'Visas igen i kundlistan' : 'Döljs från listor – inget raderas'}</div></span></button>` : ''}
    </div>`,
    onMount: (d, close) => {
      $('#exp', d)?.addEventListener('click', async () => {
        const res = await api(`/customers/${c.id}/export`, { raw: true });
        const blob = await res.blob(); const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = `kela-export-${c.name.replace(/[^\wåäöÅÄÖ-]+/g, '-')}.json`; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000); toast('Exporten är nedladdad (loggad i aktivitetsloggen)'); close();
      });
      $('#arc', d)?.addEventListener('click', async () => { await post(`/customers/${c.id}/archive`, { archived: !c.archived_at }); toast(c.archived_at ? 'Kunden är återställd' : 'Kunden är arkiverad'); close(); reload(); });
    },
  }));
}

export function noteFormHtml(autofocus = false, tag = 'form') {
  return html`<${raw(tag)} class="form" data-note>
    <div class="seg" data-type>${Object.entries(ACT_LABEL).map(([k, l], i) => html`<button type="button" data-v="${k}" class="${i === 0 ? 'on' : ''}">${ico(ACT_ICON[k])} ${l}</button>`)}</div>
    <input type="hidden" name="type" value="note">
    <label class="field"><span>Rubrik</span><input class="in" name="title" placeholder="t.ex. Uppföljningssamtal" required ${autofocus ? 'autofocus' : ''}></label>
    <label class="field"><span>Anteckning</span><textarea class="ta tall" name="body" placeholder="Vad pratade ni om? Nästa steg? (Inga lösenord eller API-nycklar.)"></textarea></label>
    <div class="row-act"><button class="btn primary" type="submit">Spara</button></div></${raw(tag)}>`;
}

export function bindNoteForm(root, link, done) {
  const box = root.querySelector('[data-note]'); if (!box) return;
  const f = box.tagName === 'FORM' ? box : box.closest('form');
  box.querySelectorAll('[data-type] button').forEach((b) => b.addEventListener('click', () => {
    box.querySelector('[name=type]').value = b.dataset.v; box.querySelectorAll('[data-type] button').forEach((x) => x.classList.toggle('on', x === b));
  }));
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    await withBusy(box.querySelector('[type=submit]'), async () => {
      try { await post('/activities', { ...formData(f), ...link }); toast('Aktiviteten är sparad'); done(); } catch (err) { showErrors(f, err); }
    });
  });
}
