// Offertbyggaren. Utkast sparas automatiskt. Skickade versioner är låsta och ändras aldrig.
import { html, raw, ico, setHTML, $, $$, money, date, dateTime, ago, empty, badge, QUOTE_STATUS, STAGE_LABEL, modal, toast, confirmDialog, withBusy, copy, debounce, pct, formData, showErrors, esc } from '../lib/ui.js';
import { get, post, patch } from '../lib/api.js';
import { calcQuote, calcLine, parseMoney, parseQty, parsePercent, moneyInput, qtyInput, percentInput } from '../lib/calc.js';

const VAT = [[2500, '25 %'], [1200, '12 %'], [600, '6 %'], [0, '0 %']];
const UNITS = ['st', 'tim', 'mån', 'paket', 'sida', 'licens'];
const WEBSITE_PLAN = [
  ['Kundmöte och behovsanalys', 'Vecka 1'], ['Insamling av material', 'Vecka 1–2'], ['Designförslag', 'Vecka 2–3'], ['Kundens godkännande', ''],
  ['Utveckling', 'Vecka 3–5'], ['SEO-konfiguration', ''], ['Testning', ''], ['Säkerhetskontroll', ''], ['Publicering', ''], ['Överlämning', ''], ['Uppföljning', '30 dagar efter lansering'],
];
const EVENT = {
  created: ['Offerten skapades', 'plus', ''], updated: ['Uppdaterad', 'edit', ''], sent: ['Låst och delad med kund', 'send', 'blue'],
  viewed: ['Öppnad i webbläsare', 'eye', 'blue'], accepted: ['Accepterad digitalt', 'checkCircle', 'green'], declined: ['Avböjd', 'xCircle', 'red'],
  version_created: ['Ny version skapad', 'layers', ''], status_changed: ['Status ändrad', 'flag', ''], link_regenerated: ['Ny länk skapad – gamla länken slutade gälla', 'link', ''],
  pdf_exported: ['PDF/utskrift öppnad', 'download', ''], expired: ['Giltighetstiden gick ut', 'clock', ''], automation: ['Automatiska åtgärder', 'zap', 'accent'],
};

export default async function quoteEditor(view, p, app) {
  const tab = p.tab || 'redigera';
  const data = await get(`/quotes/${p.id}`);
  const q = data.quote, ver = data.version;
  const canWrite = app.can('quotes:write'), canSend = app.can('quotes:send');
  const editable = canWrite && !ver.locked && q.status !== 'accepted';
  const reload = (t = tab) => { if (t !== tab) app.navigate(`/offerter/${q.id}/${t}`); else quoteEditor(view, p, app); };
  app.setCrumbs([{ label: 'Offerter', href: '#/offerter' }, { label: `#${q.number} ${q.title}` }]);
  view.classList.add('wide');

  const model = {
    title: q.title, contact_id: q.contact_id || '', valid_until: q.valid_until || '',
    content: structuredClone(ver.content), discount_bp: ver.discount_bp,
    items: ver.items.map((i) => ({ id: i.id, service_id: i.service_id, name: i.name, description: i.description || '', billing: i.billing, unit: i.unit, qty_milli: i.qty_milli,
      unit_price_minor: i.unit_price_minor, discount_bp: i.discount_bp, vat_bp: i.vat_bp, optional: i.optional })),
  };

  const TABS = [['redigera', editable ? 'Redigera' : 'Översikt'], ['forhandsgranska', 'Förhandsgranska'], ['handelser', 'Händelser', data.events.length], ['versioner', 'Versioner', data.versions.length]];
  setHTML(view, html`
    <div class="dhead"><div class="logo-box">${ico('file', 'lg')}</div>
      <div><h1>#${q.number} ${q.title} ${badge(QUOTE_STATUS, q.status)} <span class="tag">v${ver.version_no}</span></h1>
        <div class="meta"><span>${ico('building')}<a href="#/kunder/${data.customer.id}">${data.customer.name}</a></span>
          ${data.project ? html`<span>${ico('folder')}<a href="#/projekt/${data.project.id}">Projekt P${data.project.number}</a></span>` : ''}
          ${data.deal ? html`<span>${ico('target')}<a href="#/affarer/${data.deal.id}">${data.deal.title}</a> · ${STAGE_LABEL[data.deal.stage]}</span>` : ''}
          <span>${ico('clock')}Giltig till ${date(q.valid_until)}</span>${data.owner ? html`<span>${ico('user')}${data.owner.name}</span>` : ''}</div></div>
      <div class="act"><a class="btn" href="/api/os/quotes/${q.id}/preview?print=1" target="_blank" rel="noopener">${ico('download')} PDF</a>
        <button class="btn icon" id="more" aria-label="Fler val">${ico('more')}</button></div></div>
    <div class="tabs">${TABS.map(([k, l, n]) => html`<a href="#/offerter/${q.id}/${k}" class="${tab === k ? 'on' : ''}">${l}${n ? html` <span class="cnt">${n}</span>` : ''}</a>`)}</div>
    <div id="tab"></div>`);
  const tabEl = $('#tab');

  // ---------- Flikar ----------
  if (tab === 'forhandsgranska') {
    setHTML(tabEl, html`<iframe class="preview-frame" src="/api/os/quotes/${q.id}/preview" title="Förhandsgranskning av offert"></iframe>`);
  } else if (tab === 'handelser') {
    setHTML(tabEl, html`<div class="card"><div class="card-b">${data.events.length ? html`<div class="timeline">${data.events.map((e) => {
      const [l, i, c] = EVENT[e.type] || [e.type, 'activity', ''];
      const extra = e.type === 'status_changed' ? `${QUOTE_STATUS[e.data.from]?.[0] || e.data.from} → ${QUOTE_STATUS[e.data.to]?.[0] || e.data.to}${e.data.reason ? ' · ' + e.data.reason : ''}`
        : e.type === 'sent' ? `Version ${e.data.version_no} · kontrollsumma ${String(e.data.snapshot_hash || '').slice(0, 12)}…`
        : e.type === 'accepted' ? `${e.data.signer_name} (${e.data.signer_email})${e.data.selected_optional?.length ? ` · ${e.data.selected_optional.length} tillägg valda` : ''}`
        : e.type === 'declined' ? (e.data.reason || 'Ingen anledning angiven') : e.type === 'version_created' ? `Version ${e.data.version_no}` : '';
      return html`<div class="tl"><span class="tl-dot ${c}">${ico(i)}</span><div class="tl-b"><div class="tl-t">${l}</div>
        <div class="tl-m">${e.actor_kind === 'customer' ? 'Kunden' : e.actor_kind === 'system' ? 'System' : e.actor_name || 'Användare'} · ${dateTime(e.created_at)}${e.type === 'viewed' && e.ua ? ' · ' + browserName(e.ua) : ''}</div>
        ${extra ? html`<div class="tl-m">${extra}</div>` : ''}
        ${e.type === 'automation' ? html`<div class="tl-body">${(e.data.done || []).map((x) => html`✓ ${x}\n`)}${(e.data.skipped || []).map((x) => html`– ${x}\n`)}</div>` : ''}</div></div>`;
    })}</div>
    <p class="small faint mt16">"Öppnad" registreras först när offerten visats i en webbläsare i minst två sekunder. Det är en indikation, inte ett läskvitto – länkförhandsgranskare och delade länkar kan påverka.</p>`
      : empty({ icon: 'activity', title: 'Inga händelser' })}</div></div>`);
  } else if (tab === 'versioner') {
    setHTML(tabEl, html`<div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Version</th><th>Status</th><th class="r">Engång exkl. moms</th><th class="r">Månad exkl. moms</th><th>Kontrollsumma</th><th class="r">Skapad</th><th></th></tr></thead><tbody>
      ${data.versions.map((v) => html`<tr><td class="t-main">v${v.version_no}${v.id === q.sent_version_id ? html` <span class="tag">Hos kund</span>` : ''}${v.id === q.current_version_id && !v.locked ? html` <span class="tag">Utkast</span>` : ''}</td>
        <td>${v.locked ? html`<span class="badge blue">${ico('lock')} Låst ${date(v.locked_at)}</span>` : html`<span class="badge">Redigerbar</span>`}</td>
        <td class="r num">${v.totals ? money(v.totals.once.net) : '–'}</td><td class="r num">${v.totals?.monthly?.net ? money(v.totals.monthly.net) : '–'}</td>
        <td class="mono faint">${v.snapshot_hash ? v.snapshot_hash.slice(0, 16) + '…' : '–'}</td><td class="r small">${dateTime(v.created_at)}</td>
        <td class="r"><a class="btn sm" href="/api/os/quotes/${q.id}/preview?version=${v.id}" target="_blank" rel="noopener">${ico('eye')} Visa</a></td></tr>`)}</tbody></table></div></div>
      <p class="small faint mt12">Låsta versioner sparas som en fryst kopia med kontrollsumma (SHA-256). De påverkas inte av ändringar i tjänstekatalogen eller kundregistret.</p>`);
  } else if (!editable) {
    renderLocked();
  } else {
    renderEditor();
  }

  $('#more').addEventListener('click', moreMenu);

  // ---------- Låst / skrivskyddad vy ----------
  function renderLocked() {
    const acc = data.acceptance;
    setHTML(tabEl, html`<div class="qe"><div>
      ${q.status === 'accepted' && acc ? html`<div class="notice green mb16">${ico('checkCircle')}<div><strong>Accepterad ${dateTime(acc.created_at)}</strong> av ${acc.signer_name}${acc.signer_title ? ', ' + acc.signer_title : ''} (${acc.signer_email}).
          Version v${data.versions.find((v) => v.id === acc.version_id)?.version_no || '?'} · kontrollsumma ${acc.snapshot_hash.slice(0, 16)}… · IP ${acc.ip || '–'}
          ${acc.selected_optional.length ? html`<br>Valda tillägg: ${acc.selected_optional.length}` : ''}<br><span class="small">Digitalt godkännande (klick) – inte en kvalificerad elektronisk underskrift. E-signering kopplas in i fas 2.</span></div></div>`
        : ver.locked ? html`<div class="locked-banner">${ico('lock', 'lg')}<div><strong>Version ${ver.version_no} är skickad och låst.</strong><div class="muted small">Låst ${dateTime(ver.locked_at)}. Kunden ser exakt den här versionen. Vill du ändra något skapar du en ny version.</div></div>
          ${canWrite && q.status !== 'accepted' ? html`<button class="btn primary ml-auto" id="newver">${ico('layers')} Skapa ny version</button>` : ''}</div>`
        : html`<div class="notice mb16">${ico('lock')}<div>Du har läsbehörighet till offerter.</div></div>`}
      <iframe class="preview-frame" src="/api/os/quotes/${q.id}/preview?version=${ver.id}" title="Offert"></iframe>
    </div><aside class="qe-side">${sideHtml()}</aside></div>`);
    bindSide();
    $('#newver')?.addEventListener('click', newVersion);
  }

  // ---------- Redigerare ----------
  function renderEditor() {
    const c = model.content;
    setHTML(tabEl, html`<div class="qe"><div class="stack">
      <section class="card qsec"><div class="card-h"><span class="n">01</span><h3>Detaljer</h3></div><div class="card-b form">
        <label class="field"><span>Rubrik (internt och i listor)</span><input class="in" data-f="title" value="${model.title}"></label>
        <div class="fr"><label class="field"><span>Kontaktperson</span><select class="sel" data-f="contact_id"><option value="">– Ingen –</option>${data.contacts.map((k) => html`<option value="${k.id}" ${k.id === model.contact_id ? 'selected' : ''}>${k.name}${k.title ? ' · ' + k.title : ''}</option>`)}</select></label>
          <label class="field"><span>Giltig till</span><input class="in" type="date" data-f="valid_until" value="${model.valid_until}"></label></div>
      </div></section>
      <section class="card qsec"><div class="card-h"><span class="n">02</span><h3>Omslag och inledning</h3></div><div class="card-b form">
        <label class="field"><span>Rubrik på omslaget</span><input class="in" data-c="cover_title" value="${c.cover_title}" placeholder="${model.title}"></label>
        <label class="field"><span>Underrubrik</span><input class="in" data-c="cover_subtitle" value="${c.cover_subtitle}" placeholder="t.ex. En snabbare väg från förfrågan till bokning"></label>
        <label class="field"><span>Personlig introduktion</span><textarea class="ta tall" data-c="intro" placeholder="Hej ${data.contacts.find((k) => k.id === model.contact_id)?.name?.split(' ')[0] || ''}! Tack för ett givande möte…">${c.intro}</textarea><span class="hint">Tom rad = nytt stycke. Rader som börjar med "- " blir punktlista.</span></label>
      </div></section>
      <section class="card qsec"><div class="card-h"><span class="n">03</span><h3>Behov och föreslagen lösning</h3></div><div class="card-b form">
        <label class="field"><span>Kundens behov och mål</span><textarea class="ta tall" data-c="needs">${c.needs}</textarea></label>
        <label class="field"><span>Föreslagen lösning</span><textarea class="ta tall" data-c="solution">${c.solution}</textarea></label>
      </div></section>
      <section class="card qsec"><div class="card-h"><span class="n">04</span><h3>Prisrader</h3><div class="act"><button class="btn sm" id="add-free">${ico('plus')} Fri rad</button><button class="btn sm primary" id="add-cat">${ico('tag')} Från tjänstekatalogen</button></div></div>
        <div class="card-b"><div id="items"></div></div></section>
      <section class="card qsec"><div class="card-h"><span class="n">05</span><h3>Det här ingår och genomförandeplan</h3><div class="act"><button class="btn sm" id="pull-inc">${ico('download')} Hämta från valda tjänster</button></div></div><div class="card-b form">
        <label class="field"><span>Vad som ingår <span class="hint">en punkt per rad</span></span><textarea class="ta tall" data-c="includes" data-lines>${(c.includes || []).join('\n')}</textarea></label>
        <div class="flex"><span class="lbl">Genomförandeplan</span><button class="btn sm ghost ml-auto" id="std-plan">${ico('layers')} Standardplan: ny hemsida</button><button class="btn sm" id="add-step">${ico('plus')} Steg</button></div>
        <div id="plan"></div>
      </div></section>
      <section class="card qsec"><div class="card-h"><span class="n">06</span><h3>Rabatt, leverans och villkor</h3></div><div class="card-b form">
        <div class="fr"><label class="field"><span>Rabatt på engångskostnad</span><div class="in-wrap"><input class="in r has-suf" id="disc" value="${percentInput(model.discount_bp)}" inputmode="decimal" placeholder="0"><span class="in-suf">%</span></div></label>
          <label class="field"><span>Preliminär leveranstid</span><input class="in" data-c="delivery_estimate" value="${c.delivery_estimate}" placeholder="t.ex. 6–8 veckor från start"></label></div>
        <label class="field"><span>Betalningsvillkor</span><textarea class="ta" data-c="payment_terms" placeholder="t.ex. 50 % vid start, 50 % vid lansering. 30 dagar netto.">${c.payment_terms}</textarea></label>
        <label class="field"><span>Villkor</span><textarea class="ta tall" data-c="terms">${c.terms}</textarea></label>
        <label class="field"><span>Särskilda villkor</span><textarea class="ta" data-c="special_terms">${c.special_terms}</textarea></label>
      </div></section>
    </div><aside class="qe-side">${sideHtml()}</aside></div>`);
    drawItems(); drawPlan(); bindSide();

    $$('[data-f]', tabEl).forEach((el) => el.addEventListener(el.tagName === 'SELECT' || el.type === 'date' ? 'change' : 'input', () => { model[el.dataset.f] = el.value; queueSave(); }));
    $$('[data-c]', tabEl).forEach((el) => el.addEventListener('input', () => {
      model.content[el.dataset.c] = 'lines' in el.dataset ? el.value.split('\n').map((x) => x.trim()).filter(Boolean) : el.value; queueSave();
    }));
    $('#disc').addEventListener('input', (e) => {
      const v = parsePercent(e.target.value);
      e.target.classList.toggle('bad', Number.isNaN(v));
      if (!Number.isNaN(v)) { model.discount_bp = v; drawTotals(); queueSave(); }
    });
    $('#add-free').addEventListener('click', () => { model.items.push(newItem({})); drawItems(); queueSave(); focusLast(); });
    $('#add-cat').addEventListener('click', pickServices);
    $('#pull-inc').addEventListener('click', pullIncludes);
    $('#add-step').addEventListener('click', () => { (model.content.plan ||= []).push({ title: '', duration: '', text: '' }); drawPlan(); });
    $('#std-plan').addEventListener('click', async () => {
      if ((model.content.plan || []).length && !(await confirmDialog({ title: 'Ersätta planen?', text: 'Nuvarande steg ersätts med standardplanen för en ny hemsida (11 steg).', ok: 'Ersätt' }))) return;
      model.content.plan = WEBSITE_PLAN.map(([title, duration]) => ({ title, duration, text: '' })); drawPlan(); queueSave();
    });
  }

  const newItem = (o) => ({ id: undefined, service_id: null, name: '', description: '', billing: 'once', unit: 'st', qty_milli: 1000, unit_price_minor: 0, discount_bp: 0, vat_bp: app.me.org?.default_vat_bp ?? 2500, optional: false, ...o });
  const focusLast = () => setTimeout(() => $$('#items [data-k="name"]').pop()?.focus(), 0);

  function drawItems() {
    const box = $('#items');
    if (!model.items.length) {
      setHTML(box, empty({ icon: 'tag', title: 'Inga prisrader ännu', text: 'Lägg till tjänster från katalogen eller skriv en fri rad.' }));
      drawTotals(); return;
    }
    setHTML(box, html`<div class="items">${model.items.map((it, i) => html`<div class="item ${it.optional ? 'opt' : ''}" data-i="${i}">
        <div class="item-top"><span class="item-n">${i + 1}</span>
          <input class="in item-name" data-k="name" value="${it.name}" placeholder="Tjänst eller beskrivning" aria-label="Beskrivning">
          <div class="item-sum" data-sum>${money(calcLine(it).net)}${it.billing === 'monthly' ? html`<span class="faint small">/mån</span>` : ''}</div>
          <div class="item-act"><button type="button" class="btn ghost sm icon" data-mv="-1" aria-label="Flytta upp" ${i === 0 ? 'disabled' : ''}>${ico('arrowUp')}</button><button type="button" class="btn ghost sm icon" data-mv="1" aria-label="Flytta ner" ${i === model.items.length - 1 ? 'disabled' : ''}>${ico('arrowDown')}</button><button type="button" class="btn ghost sm icon danger" data-rm aria-label="Ta bort rad">${ico('trash')}</button></div>
        </div>
        <div class="item-fields">
          <label class="mini"><span>Typ</span><select class="sel" data-k="billing"><option value="once" ${it.billing === 'once' ? 'selected' : ''}>Engång</option><option value="monthly" ${it.billing === 'monthly' ? 'selected' : ''}>Per månad</option></select></label>
          <label class="mini"><span>Antal</span><input class="in r" data-k="qty_milli" value="${qtyInput(it.qty_milli)}" inputmode="decimal"></label>
          <label class="mini"><span>Enhet</span><select class="sel" data-k="unit">${[...new Set([...UNITS, it.unit])].map((u) => html`<option ${u === it.unit ? 'selected' : ''}>${u}</option>`)}</select></label>
          <label class="mini wide"><span>À-pris exkl. moms</span><div class="in-wrap"><input class="in r has-suf" data-k="unit_price_minor" value="${moneyInput(it.unit_price_minor)}" inputmode="decimal"><span class="in-suf">kr</span></div></label>
          <label class="mini"><span>Rabatt</span><div class="in-wrap"><input class="in r has-suf sm-suf" data-k="discount_bp" value="${percentInput(it.discount_bp)}" inputmode="decimal" placeholder="0"><span class="in-suf">%</span></div></label>
          <label class="mini"><span>Moms</span><select class="sel" data-k="vat_bp">${VAT.map(([v, l]) => html`<option value="${v}" ${it.vat_bp === v ? 'selected' : ''}>${l}</option>`)}</select></label>
        </div>
        <div class="item-foot"><textarea class="ta" data-k="description" rows="1" placeholder="Detaljer som visas för kunden (valfritt)" aria-label="Detaljer">${it.description}</textarea>
          <label class="chk small"><input type="checkbox" data-k="optional" ${it.optional ? 'checked' : ''}> Valfritt tillägg</label></div>
      </div>`)}</div>`);
    $$('.item[data-i]', box).forEach((tr) => {
      const it = model.items[Number(tr.dataset.i)];
      $$('[data-k]', tr).forEach((el) => el.addEventListener(el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input', () => {
        const k = el.dataset.k; let v = el.type === 'checkbox' ? el.checked : el.value;
        if (k === 'qty_milli') v = parseQty(v); else if (k === 'unit_price_minor') v = parseMoney(v) ?? 0; else if (k === 'discount_bp') v = parsePercent(v); else if (k === 'vat_bp') v = Number(v);
        const bad = typeof v === 'number' && (Number.isNaN(v) || (k === 'qty_milli' && v <= 0) || v < 0);
        el.classList.toggle('bad', bad);
        if (bad) { markDirty('Kontrollera fältet'); return; }
        it[k] = v;
        if (k === 'optional') tr.classList.toggle('opt', v);
        setHTML($('[data-sum]', tr), html`${money(calcLine(it).net)}${it.billing === 'monthly' ? html`<span class="faint small">/mån</span>` : ''}`);
        drawTotals(); queueSave();
      }));
      $('[data-rm]', tr).addEventListener('click', () => { model.items.splice(Number(tr.dataset.i), 1); drawItems(); queueSave(); });
      $$('[data-mv]', tr).forEach((b) => b.addEventListener('click', () => {
        const i = Number(tr.dataset.i), j = i + Number(b.dataset.mv);
        [model.items[i], model.items[j]] = [model.items[j], model.items[i]]; drawItems(); queueSave();
      }));
    });
    drawTotals();
  }

  function drawPlan() {
    const box = $('#plan'); if (!box) return;
    const plan = model.content.plan || [];
    setHTML(box, plan.length ? html`${plan.map((s, i) => html`<div class="plan-row" data-i="${i}"><input class="in" data-p="title" value="${s.title}" placeholder="Steg ${i + 1}"><input class="in" data-p="duration" value="${s.duration || ''}" placeholder="Tid, t.ex. Vecka 2">
      <button class="btn ghost icon danger" data-rm aria-label="Ta bort steg">${ico('trash')}</button><textarea class="ta" data-p="text" placeholder="Beskrivning (valfritt)">${s.text || ''}</textarea></div>`)}`
      : html`<p class="muted small">Inga steg ännu. Lägg till steg eller använd en standardplan.</p>`);
    $$('.plan-row', box).forEach((row) => {
      const s = plan[Number(row.dataset.i)];
      $$('[data-p]', row).forEach((el) => el.addEventListener('input', () => { s[el.dataset.p] = el.value; queueSave(); }));
      $('[data-rm]', row).addEventListener('click', () => { plan.splice(Number(row.dataset.i), 1); drawPlan(); queueSave(); });
    });
  }

  function totalsHtml(t) {
    const cur = ver.currency;
    const once = t.once, mon = t.monthly;
    return html`<div class="totals">
      <div class="tgroup">Engångskostnad</div>
      ${once.discount ? html`<div class="row"><span>Delsumma</span><span>${money(once.subtotal, cur)}</span></div><div class="row"><span>Rabatt ${pct(model.discount_bp || ver.discount_bp)}</span><span>−${money(once.discount, cur)}</span></div>` : ''}
      <div class="row"><span>Exkl. moms</span><span>${money(once.net, cur)}</span></div>
      ${once.vat_by_rate.map((v) => html`<div class="row"><span>Moms ${pct(v.vat_bp)}</span><span>${money(v.vat, cur)}</span></div>`)}
      <div class="row big"><span>Totalt</span><span>${money(once.total, cur)}</span></div>
      ${mon.net || mon.subtotal ? html`<div class="tgroup mt12">Per månad</div><div class="row"><span>Exkl. moms</span><span>${money(mon.net, cur)}</span></div>
        <div class="row"><span>Moms</span><span>${money(mon.vat, cur)}</span></div><div class="row big"><span>Per månad</span><span>${money(mon.total, cur)}</span></div>` : ''}
      ${t.optional_count ? html`<p class="small faint mt8">${t.optional_count} valfria tillägg ingår inte i summan.</p>` : ''}
    </div>`;
  }
  function drawTotals() {
    const el = $('#totals'); if (!el) return;
    setHTML(el, totalsHtml(calcQuote({ items: model.items, discount_bp: model.discount_bp, currency: ver.currency })));
  }

  function sideHtml() {
    // Accepterad offert: visa exakt det godkända beloppet (inkl. valda tillägg).
    const t = data.acceptance?.totals || data.totals;
    const st = q.status;
    return html`<section class="card"><div class="card-h"><h3>${data.acceptance ? 'Godkänt belopp' : 'Summering'}</h3><div class="act"><span class="savestate ok" id="save">${editable ? 'Sparat' : ver.locked ? 'Låst' : ''}</span></div></div>
        <div class="card-b" id="totals">${totalsHtml(t)}</div></section>
      <section class="card"><div class="card-h"><h3>Status</h3><div class="act">${badge(QUOTE_STATUS, st)}</div></div><div class="card-b form">
        ${st === 'draft' && canWrite ? html`<button class="btn w100" data-status="review">${ico('flag')} Markera klar för granskning</button>` : ''}
        ${st === 'review' && canWrite ? html`<button class="btn w100" data-status="draft">${ico('edit')} Tillbaka till utkast</button>` : ''}
        ${['draft', 'review'].includes(st) && canSend ? html`<button class="btn primary w100" id="send">${ico('send')} Skicka till kund</button><p class="small faint">Versionen låses och du får en säker personlig länk att dela. Inget mejl skickas automatiskt.</p>` : ''}
        ${['sent', 'viewed', 'expired', 'declined', 'accepted'].includes(st) && data.share_url ? html`<div class="lbl">Kundens länk</div><div class="linkbox"><code>${data.share_url}</code><button class="btn sm" id="cp">${ico('copy')}</button></div>
          <div class="flex wrap"><a class="btn sm" href="${data.share_url}" target="_blank" rel="noopener">${ico('external')} Öppna kundens vy</a>${data.contacts.find((k) => k.id === q.contact_id)?.email ? html`<a class="btn sm" id="mailto" href="#">${ico('mail')} Mejla länken</a>` : ''}</div>` : ''}
        ${['sent', 'viewed'].includes(st) ? html`<dl class="dl small"><dt>Skickad</dt><dd>${dateTime(q.sent_at)}</dd><dt>Öppnad</dt><dd>${q.first_viewed_at ? `${dateTime(q.first_viewed_at)}${q.last_viewed_at && q.last_viewed_at !== q.first_viewed_at ? ` · senast ${ago(q.last_viewed_at)}` : ''}` : 'Inte öppnad ännu'}</dd></dl>` : ''}
        ${['sent', 'viewed', 'expired'].includes(st) && canWrite ? html`<div class="flex wrap"><button class="btn sm" id="newver2">${ico('layers')} Ny version</button><button class="btn sm ghost danger" data-status="declined">Markera avböjd</button></div>` : ''}
        ${st === 'declined' ? html`<div class="notice">${ico('xCircle')}<div>Avböjd ${dateTime(q.declined_at)}${q.decline_reason ? `: ${q.decline_reason}` : ''}</div></div>${canWrite ? html`<button class="btn w100" id="newver3">${ico('layers')} Skapa ny version</button>` : ''}` : ''}
      </div></section>
      <section class="card"><div class="card-h"><h3>KELA Intelligence</h3><span class="tag ai-tag">${ico('sparkles')} Fas 3</span></div><div class="card-b"><p class="small muted">AI-utkast till introduktion, behov och lösning – alltid markerade och granskade innan de används. Aktiveras i fas 3.</p></div></section>`;
  }

  function bindSide() {
    $('#cp')?.addEventListener('click', (e) => { e.preventDefault(); copy(data.share_url); });
    $('#mailto')?.addEventListener('click', (e) => {
      e.preventDefault();
      const k = data.contacts.find((x) => x.id === q.contact_id);
      const body = `Hej ${k.name.split(' ')[0]}!\n\nHär är vår offert "${q.title}":\n${data.share_url}\n\nDu kan läsa den, välja eventuella tillägg och godkänna den direkt i webbläsaren. Hör av dig om du har frågor.\n\nVänliga hälsningar\n${app.me.user.name}\n${app.me.org?.name || 'KELA Group AB'}`;
      location.href = `mailto:${encodeURIComponent(k.email)}?subject=${encodeURIComponent(`Offert #${q.number} – ${q.title}`)}&body=${encodeURIComponent(body)}`;
    });
    $$('[data-status]').forEach((b) => b.addEventListener('click', async () => {
      let reason;
      if (b.dataset.status === 'declined') {
        reason = await new Promise((res) => { let v = null; modal({ title: 'Markera som avböjd', body: html`<label class="field"><span>Anledning (valfritt)</span><textarea class="ta" name="reason"></textarea></label>`,
          footer: html`<button type="button" class="btn" data-close>Avbryt</button><button class="btn primary" type="submit">Markera avböjd</button>`,
          onMount: (d, close) => d.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); v = formData(e.currentTarget).reason || ''; close(); }), onClose: () => res(v) }); });
        if (reason === null) return;
      }
      await save.flush?.();
      await withBusy(b, async () => { try { await post(`/quotes/${q.id}/status`, { status: b.dataset.status, reason }); toast('Status uppdaterad'); reload(); } catch (e) { toast(e.message, 'err'); } });
    }));
    $('#send')?.addEventListener('click', sendQuote);
    ['#newver2', '#newver3'].forEach((s) => $(s)?.addEventListener('click', newVersion));
  }

  // ---------- Spara ----------
  let saving = Promise.resolve();
  function markDirty(msg = 'Osparade ändringar') { const s = $('#save'); if (s) { s.className = 'savestate dirty'; s.textContent = msg; } }
  function payload() {
    return { title: model.title, contact_id: model.contact_id || null, valid_until: model.valid_until || null, discount_bp: model.discount_bp, content: model.content,
      items: model.items.map((it) => ({ ...it, description: it.description || null })) };
  }
  const doSave = async () => {
    const s = $('#save'); if (s) { s.className = 'savestate'; s.textContent = 'Sparar…'; }
    saving = saving.then(async () => {
      try {
        const r = await patch(`/quotes/${q.id}`, payload());
        if (r.items) r.items.forEach((it, i) => { if (model.items[i]) model.items[i].id = it.id; });
        if (s) { s.className = 'savestate ok'; s.textContent = 'Sparat'; }
      } catch (e) {
        if (s) { s.className = 'savestate dirty'; s.textContent = 'Kunde inte spara'; }
        if (e.code === 'version_locked') { toast(e.message, 'err'); reload(); } else showErrorsInline(e);
      }
    });
    return saving;
  };
  const save = debounce(doSave, 700);
  save.flush = async () => { save.cancel(); if ($('#save')?.classList.contains('dirty')) await doSave(); await saving; };
  function queueSave() { markDirty(); save(); }
  function showErrorsInline(e) {
    const first = Object.entries(e.details || {})[0];
    toast(first ? `${first[1]}` : e.message, 'err');
  }
  // Spara innan man lämnar sidan.
  const leave = () => { if ($('#save')?.classList.contains('dirty')) doSave(); };
  addEventListener('hashchange', leave, { once: true });

  // ---------- Åtgärder ----------
  async function pickServices() {
    const r = await get('/services');
    const picked = new Set();
    modal({
      title: 'Lägg till från tjänstekatalogen', wide: true,
      body: html`<div class="in-wrap mb12">${ico('search')}<input class="in" id="sf" placeholder="Filtrera…"></div><div class="picker" id="pl">${r.services.map((s) => html`<button type="button" class="pick" data-id="${s.id}">
        <input type="checkbox" tabindex="-1" aria-hidden="true"><span><div class="li-t">${s.name}</div><div class="li-s">${s.category || ''}${s.delivery_time ? ' · ' + s.delivery_time : ''}</div></span>
        <span class="p">${s.price ? html`${s.price.once_price_minor != null ? money(s.price.once_price_minor) : ''}${s.price.monthly_price_minor != null ? html`<div>${money(s.price.monthly_price_minor)}/mån</div>` : ''}` : html`<span class="badge amber">Pris saknas</span>`}</span></button>`)}</div>`,
      footer: html`<button type="button" class="btn" data-close>Avbryt</button><button type="submit" class="btn primary" id="addsel">Lägg till</button>`,
      onMount: (d, close) => {
        $$('.pick', d).forEach((b) => b.addEventListener('click', () => { const on = !picked.has(b.dataset.id); on ? picked.add(b.dataset.id) : picked.delete(b.dataset.id); b.querySelector('input').checked = on; }));
        $('#sf', d).addEventListener('input', (e) => { const v = e.target.value.toLowerCase(); $$('.pick', d).forEach((b) => b.classList.toggle('hidden', !b.textContent.toLowerCase().includes(v))); });
        d.querySelector('form').addEventListener('submit', (e) => {
          e.preventDefault();
          let noPrice = 0;
          for (const id of picked) {
            const s = r.services.find((x) => x.id === id); const pr = s.price;
            const base = { service_id: s.id, name: s.name, description: s.description ? s.description.slice(0, 500) : '', vat_bp: pr?.vat_bp ?? 2500 };
            if (pr?.once_price_minor != null) model.items.push(newItem({ ...base, billing: 'once', unit_price_minor: pr.once_price_minor }));
            if (pr?.monthly_price_minor != null) model.items.push(newItem({ ...base, billing: 'monthly', unit: 'mån', unit_price_minor: pr.monthly_price_minor, name: pr.once_price_minor != null ? `${s.name} – löpande` : s.name }));
            if (!pr || (pr.once_price_minor == null && pr.monthly_price_minor == null)) { model.items.push(newItem(base)); noPrice++; }
          }
          close(); drawItems(); queueSave();
          if (noPrice) toast(`${noPrice} tjänst(er) saknar pris i katalogen – fyll i priset på raden.`, 'err');
        });
      },
    });
  }

  async function pullIncludes() {
    const ids = [...new Set(model.items.map((i) => i.service_id).filter(Boolean))];
    if (!ids.length) return toast('Lägg till tjänster från katalogen först.', 'err');
    const r = await get('/services');
    const inc = r.services.filter((s) => ids.includes(s.id)).flatMap((s) => s.includes);
    const merged = [...new Set([...(model.content.includes || []), ...inc])];
    model.content.includes = merged;
    $('[data-c="includes"]').value = merged.join('\n');
    queueSave(); toast(`${inc.length} punkter hämtade`);
  }

  async function sendQuote() {
    await save.flush();
    if (!model.items.length) return toast('Lägg till minst en prisrad innan du skickar.', 'err');
    const t = calcQuote({ items: model.items, discount_bp: model.discount_bp });
    const ok = await confirmDialog({ title: `Skicka offert #${q.number}?`, ok: 'Lås och skapa länk',
      text: `Version ${ver.version_no} låses (${money(t.once.total)} inkl. moms${t.monthly.total ? ` + ${money(t.monthly.total)}/mån` : ''}). Du får en säker personlig länk att dela med ${data.customer.name}. Inget mejl skickas automatiskt.` });
    if (!ok) return;
    try {
      const r = await post(`/quotes/${q.id}/send`);
      modal({
        title: 'Offerten är redo att delas',
        body: html`<p class="muted mb12">Version ${ver.version_no} är låst. Dela länken med kunden – den ger åtkomst till just den här offerten.</p>
          <div class="linkbox"><code>${r.share_url}</code><button type="button" class="btn sm" id="cp2">${ico('copy')} Kopiera</button></div>
          <p class="small faint mt12">Tips: använd "Mejla länken" i statuspanelen för att öppna ett färdigt mejl i ditt mejlprogram.</p>`,
        footer: html`<a class="btn" href="${r.share_url}" target="_blank" rel="noopener">${ico('external')} Öppna kundens vy</a><button type="button" class="btn primary" data-close>Klar</button>`,
        onMount: (d) => $('#cp2', d).addEventListener('click', () => copy(r.share_url)),
        onClose: () => reload(),
      });
    } catch (e) { toast(e.message, 'err'); }
  }

  async function newVersion() {
    if (!(await confirmDialog({ title: 'Skapa ny version?', text: `En kopia av version ${ver.version_no} skapas som nytt utkast. Den skickade versionen sparas oförändrad${['sent', 'viewed'].includes(q.status) ? ' och kunden ser den tills du skickar den nya' : ''}.`, ok: 'Skapa version' }))) return;
    try { await post(`/quotes/${q.id}/versions`); toast('Ny version skapad'); reload('redigera'); } catch (e) { toast(e.message, 'err'); }
  }

  function moreMenu() {
    modal({
      title: `Offert #${q.number}`,
      body: html`<div class="list">
        ${canWrite ? html`<button type="button" class="li click btn ghost jc-start h-auto w100" data-a="dup">${ico('copy')}<span class="li-b"><div class="li-t">Duplicera offert</div><div class="li-s">Ny offert med samma innehåll</div></span></button>
        <button type="button" class="li click btn ghost jc-start h-auto w100" data-a="tpl">${ico('layers')}<span class="li-b"><div class="li-t">Spara som mall</div><div class="li-s">Återanvänd rader och texter för liknande kunder</div></span></button>` : ''}
        ${canSend && q.has_link ? html`<button type="button" class="li click btn ghost jc-start h-auto w100" data-a="link">${ico('refresh')}<span class="li-b"><div class="li-t">Skapa ny länk</div><div class="li-s">Den gamla länken slutar fungera direkt</div></span></button>` : ''}
        <a class="li" href="/api/os/quotes/${q.id}/preview?print=1" target="_blank" rel="noopener">${ico('download')}<span class="li-b"><div class="li-t">Exportera PDF</div><div class="li-s">Öppnar utskriftsdialogen – välj "Spara som PDF"</div></span></a>
      </div>`,
      onMount: (d, close) => {
        $('[data-a="dup"]', d)?.addEventListener('click', async () => { const r = await post(`/quotes/${q.id}/duplicate`); close(); toast(`Offert #${r.number} skapad`); app.navigate(`/offerter/${r.id}`); });
        $('[data-a="link"]', d)?.addEventListener('click', async () => {
          if (!(await confirmDialog({ title: 'Skapa ny länk?', text: 'Kunden kan inte längre öppna den gamla länken.', ok: 'Skapa ny länk', danger: true }))) return;
          await post(`/quotes/${q.id}/link`); close(); toast('Ny länk skapad'); reload();
        });
        $('[data-a="tpl"]', d)?.addEventListener('click', () => {
          close();
          modal({ title: 'Spara som mall', body: html`<div class="form"><label class="field"><span>Namn på mallen</span><input class="in" name="name" value="${q.title}" required></label><label class="field"><span>Beskrivning</span><input class="in" name="description" placeholder="t.ex. Städbolag – hemsida + bokning"></label></div>`,
            footer: html`<button type="button" class="btn" data-close>Avbryt</button><button class="btn primary" type="submit">Spara mall</button>`,
            onMount: (d2, close2) => d2.querySelector('form').addEventListener('submit', async (e) => {
              e.preventDefault(); const f = e.currentTarget;
              try { await save.flush?.(); await post('/quote-templates', { quote_id: q.id, ...formData(f) }); toast('Mallen är sparad'); close2(); } catch (err) { showErrors(f, err); }
            }) });
        });
      },
    });
  }
}

function browserName(ua) {
  return /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /Firefox\//.test(ua) ? 'Firefox' : 'Webbläsare';
}
void raw; void esc;
