// Avtal och dokument – allt per kund på ett ställe: avtal, offerter, bilagor, presentationer, checklistor och länkar.
import { html, ico, setHTML, $, $$, date, empty, modal, formData, showErrors, withBusy, toast, confirmDialog, debounce } from '../lib/ui.js';
import { get, post, patch, qs, ApiError } from '../lib/api.js';

export const KIND = {
  avtal: ['Avtal', 'signature'], offert: ['Offerter', 'file'], bilaga: ['Bilagor', 'clipboard'], presentation: ['Presentationer', 'layout'],
  checklista: ['Checklistor', 'listChecks'], ovrigt: ['Övrigt', 'folder'],
};
const KIND_ONE = { avtal: 'Avtal', offert: 'Offert', bilaga: 'Bilaga', presentation: 'Presentation', checklista: 'Checklista', ovrigt: 'Dokument' };
const STATUS_AVTAL = { draft: ['Utkast', ''], sent: ['Skickat för underskrift', 'blue'], signed: ['Signerat', 'green'], active: ['Gäller', 'green'], terminated: ['Uppsagt', 'red'], replaced: ['Ersatt', ''] };
const STATUS_DOC = { draft: ['Utkast', ''], sent: ['Skickat', 'blue'], final: ['Klar', 'green'], replaced: ['Ersatt', ''], signed: ['Signerat', 'green'], active: ['Gäller', 'green'], terminated: ['Avslutat', ''] };
const statusMap = (kind) => (kind === 'avtal' ? STATUS_AVTAL : STATUS_DOC);
const kb = (n) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toLocaleString('sv-SE', { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(n / 1024))} kB`);
const ext = (name) => (name.split('.').pop() || '').toUpperCase();
const extLabel = (name) => ({ DOCX: 'Word', DOC: 'Word', XLSX: 'Excel', PPTX: 'PowerPoint' }[ext(name)] || ext(name));

/** Lista med dokument grupperade per typ. */
export function docListHtml(docs, { showCustomer = false, canWrite = false } = {}) {
  const groups = Object.keys(KIND).map((k) => [k, docs.filter((d) => d.kind === k)]).filter(([, l]) => l.length);
  return html`${groups.map(([k, list]) => html`<section class="card mb16"><div class="card-h">${ico(KIND[k][1])}<h3>${KIND[k][0]}</h3><span class="faint small">${list.length}</span></div>
    <div class="list mt8">${list.map((d) => {
      const [sl, sc] = statusMap(d.kind)[d.status] || [d.status, ''];
      const meta = [showCustomer ? d.customer_name : null, d.signed_at ? `Signerat ${date(d.signed_at)}` : d.sent_at ? `Skickat ${date(d.sent_at)}` : null,
        d.valid_from ? `Gäller från ${date(d.valid_from)}` : null, d.notice_months != null ? `${d.notice_months} mån uppsägning` : null].filter(Boolean).join(' · ');
      return html`<div class="li doc ${d.status === 'replaced' ? 'faint' : ''}">
        <span class="li-ico ${d.kind === 'avtal' ? 'accent' : ''}">${ico(KIND[d.kind][1])}</span>
        <span class="li-b"><div class="li-t">${d.title} <span class="badge ${sc}">${sl}</span></div>
          ${meta ? html`<div class="li-s">${meta}</div>` : ''}${d.description ? html`<div class="li-s pre">${d.description}</div>` : ''}
          <div class="doc-files">${d.files.map((f) => html`<span class="doc-file">${ext(f.file_name) === 'PDF'
              ? html`<a class="btn sm" href="/api/os/documents/${d.id}/files/${f.id}?visa=1" target="_blank" rel="noopener">${ico('eye')} Visa</a>` : ''}
            <a class="btn sm ghost" href="/api/os/documents/${d.id}/files/${f.id}" title="Ladda ner ${f.file_name} (${kb(f.size)})">${ico('download')} ${extLabel(f.file_name)}</a></span>`)}
            ${d.url ? html`<a class="btn sm" href="${d.url}" target="_blank" rel="noopener noreferrer">${ico('external')} Öppna länk</a>` : ''}
            ${d.tracked_page_id ? html`<a class="btn sm ghost" href="#/sparning/${d.tracked_page_id}">${ico('eye')} Spårning</a>` : ''}</div></span>
        ${canWrite ? html`<button type="button" class="btn ghost sm icon" data-doc-edit="${d.id}" aria-label="Ändra">${ico('edit')}</button>` : ''}</div>`;
    })}</div></section>`)}`;
}

export function bindDocList(root, docs, { reload, customerId } = {}) {
  $$('[data-doc-edit]', root).forEach((b) => b.addEventListener('click', () => docForm({ doc: docs.find((d) => d.id === b.dataset.docEdit), customerId, onSaved: reload })));
}

/** Formulär för nytt eller befintligt dokument. Nya: fil(er) och/eller länk. */
export async function docForm({ doc = null, customerId = null, kind = 'avtal', onSaved } = {}) {
  const customers = !doc && !customerId ? (await get('/customers')).customers : null;
  const k0 = doc?.kind || kind;
  const statusOpts = (k) => Object.entries(statusMap(k)).filter(([s]) => (k === 'avtal' ? s !== 'final' : !['signed', 'active', 'terminated'].includes(s) || s === doc?.status));
  modal({
    drawer: true, title: doc ? doc.title : `Lägg till ${KIND_ONE[k0].toLowerCase()}`,
    body: html`<div class="form">
      ${customers ? html`<label class="field"><span>Kund</span><select class="sel" name="customer_id" required><option value="">– Välj kund –</option>${customers.map((c) => html`<option value="${c.id}">${c.name}</option>`)}</select></label>` : ''}
      <div class="fr"><label class="field"><span>Typ</span><select class="sel" name="kind" id="d-kind">${Object.entries(KIND_ONE).map(([k, l]) => html`<option value="${k}" ${k === k0 ? 'selected' : ''}>${l}</option>`)}</select></label>
        <label class="field"><span>Status</span><select class="sel" name="status" id="d-status">${statusOpts(k0).map(([s, [l]]) => html`<option value="${s}" ${s === (doc?.status || 'draft') ? 'selected' : ''}>${l}</option>`)}</select></label></div>
      <label class="field"><span>Rubrik</span><input class="in" name="title" value="${doc?.title || ''}" required placeholder="t.ex. SaaS- och leveransavtal"></label>
      ${doc ? '' : html`<label class="field"><span>Filer <span class="hint">PDF, Word, Excel, bild – högst 15 MB per fil. Lägg gärna PDF och Word tillsammans.</span></span><input class="in file-in" type="file" name="file" multiple accept=".pdf,.docx,.doc,.xlsx,.pptx,.png,.jpg,.jpeg,.txt,.csv"></label>`}
      <label class="field"><span>Länk <span class="hint">valfritt – t.ex. offertsida eller presentation</span></span><input class="in" name="url" value="${doc?.url || ''}" placeholder="https://"></label>
      <div class="fr"><label class="field"><span>Skickat</span><input class="in" type="date" name="sent_at" value="${doc?.sent_at || ''}"></label>
        <label class="field"><span>Signerat</span><input class="in" type="date" name="signed_at" value="${doc?.signed_at || ''}"></label></div>
      <div class="fr3"><label class="field"><span>Gäller från</span><input class="in" type="date" name="valid_from" value="${doc?.valid_from || ''}"></label>
        <label class="field"><span>Gäller till</span><input class="in" type="date" name="valid_to" value="${doc?.valid_to || ''}"></label>
        <label class="field"><span>Uppsägning (mån)</span><input class="in r" name="notice_months" value="${doc?.notice_months ?? ''}" inputmode="numeric"></label></div>
      <label class="field"><span>Anteckning</span><textarea class="ta" name="description">${doc?.description || ''}</textarea></label>
      ${doc?.files?.length ? html`<div class="notice small">${ico('lock')}<div>${doc.files.length} fil(er) sparade med kontrollsumma. Filer ändras aldrig – ladda upp en ny version i stället.</div></div>` : ''}
      ${doc ? html`<label class="field"><span>Lägg till fil</span><input class="in file-in" type="file" name="file" multiple accept=".pdf,.docx,.doc,.xlsx,.pptx,.png,.jpg,.jpeg,.txt,.csv"></label>` : ''}
    </div>`,
    footer: html`${doc ? html`<button type="button" class="btn ghost danger" id="d-arch">${ico('archive')} Arkivera</button>` : ''}<button type="button" class="btn ml-auto" data-close>Avbryt</button><button type="submit" class="btn primary">${doc ? 'Spara' : 'Lägg till'}</button>`,
    onMount: (d, close) => {
      const f = d.querySelector('form');
      $('#d-kind', d).addEventListener('change', (e) => {
        setHTML($('#d-status', d), html`${statusOpts(e.target.value).map(([s, [l]]) => html`<option value="${s}">${l}</option>`)}`);
      });
      $('#d-arch', d)?.addEventListener('click', async () => {
        if (!(await confirmDialog({ title: 'Arkivera dokumentet?', text: 'Det döljs från listorna men raderas inte och kan återställas.', ok: 'Arkivera' }))) return;
        await post(`/documents/${doc.id}/archive`, { archived: true }); toast('Arkiverat'); close(); onSaved?.();
      });
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        await withBusy(f.querySelector('[type=submit]'), async () => {
          try {
            const o = formData(f); const input = f.querySelector('input[type=file]');
            delete o.file;
            if (o.notice_months === '') o.notice_months = null;
            for (const key of ['url', 'sent_at', 'signed_at', 'valid_from', 'valid_to', 'description']) if (o[key] === '') o[key] = null;
            if (doc) {
              await patch(`/documents/${doc.id}`, o);
              if (input?.files.length) await upload(`/documents/${doc.id}/files`, input.files);
            } else {
              o.customer_id = customerId || o.customer_id;
              if (!o.customer_id) throw { details: { customer_id: 'Välj kund.' } };
              await upload('/documents', input?.files || [], o);
            }
            toast('Sparat'); close(); onSaved?.();
          } catch (err) { showErrors(f, err); }
        });
      });
    },
  });
}

async function upload(path, files, meta) {
  const fd = new FormData();
  if (meta) fd.append('meta', JSON.stringify(meta));
  for (const file of files) fd.append('file', file);
  const res = await fetch('/api/os' + path, { method: 'POST', credentials: 'same-origin', headers: { 'x-kela-os': '1' }, body: fd });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

// ---------- Sidan "Avtal och dokument" ----------
export default async function documents(view, p, app) {
  app.setCrumbs([{ label: 'Avtal och dokument' }]);
  const w = app.can('customers:write');
  const state = { kind: p.query.get('typ') || 'avtal', q: '' };
  setHTML(view, html`<div class="page-h"><div><h1>Avtal och dokument</h1><div class="sub">Avtal, offerter, bilagor och presentationer – samlade per kund</div></div>
    <div class="act">${w ? html`<button class="btn primary" id="new">${ico('plus')} Lägg till</button>` : ''}</div></div>
    <div class="filters"><div class="in-wrap">${ico('search')}<input class="in" id="q" placeholder="Sök dokument eller kund…"></div>
      <div class="seg" id="kind">${[['avtal', 'Avtal'], ['', 'Allt'], ['offert', 'Offerter'], ['bilaga', 'Bilagor'], ['presentation', 'Presentationer'], ['checklista', 'Checklistor']]
        .map(([k, l]) => html`<button type="button" data-k="${k}" class="${state.kind === k ? 'on' : ''}">${l}</button>`)}</div></div>
    <div id="list"></div>`);
  async function load() {
    const r = await get('/documents' + qs({ kind: state.kind, q: state.q }));
    const box = $('#list');
    if (!r.documents.length) {
      setHTML(box, html`<div class="card">${empty({ icon: 'signature', title: state.q ? 'Inga träffar' : 'Inget här än', text: 'Lägg in avtal och dokument per kund – PDF och Word sparas med kontrollsumma och kan laddas ner när som helst.' })}</div>`);
      return;
    }
    // Gruppera per kund.
    const byCust = new Map();
    for (const d of r.documents) { if (!byCust.has(d.customer_id)) byCust.set(d.customer_id, []); byCust.get(d.customer_id).push(d); }
    setHTML(box, html`${[...byCust.entries()].map(([cid, list]) => html`<div class="doc-cust"><a class="doc-cust-h" href="#/kunder/${cid}/avtal">${ico('building')} ${list[0].customer_name}</a>${docListHtml(list, { canWrite: w })}</div>`)}`);
    bindDocList(box, r.documents, { reload: load });
  }
  $('#new')?.addEventListener('click', () => docForm({ kind: state.kind || 'avtal', onSaved: load }));
  $('#q').addEventListener('input', debounce((e) => { state.q = e.target.value.trim(); load(); }, 200));
  $$('#kind [data-k]').forEach((b) => b.addEventListener('click', () => { state.kind = b.dataset.k; $$('#kind [data-k]').forEach((x) => x.classList.toggle('on', x === b)); load(); }));
  await load();
}
