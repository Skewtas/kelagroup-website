// KELA OS – renderar offerten som ett exklusivt digitalt dokument (webb + utskrift/PDF).
// All text escapas. Innehåll från redigeraren är ren text: tomrad = nytt stycke, rader som börjar med "- " blir punktlistor.
import { escapeHtml as e, randomToken } from './core';
import { formatMoney, calcLine, calcQuote, calcPlan } from '../../os/lib/calc.js';

interface Opts {
  mode: 'preview' | 'public';
  draft?: boolean;
  autoPrint?: boolean;
  status?: string;
  hash?: string | null;
  token?: string;
  acceptance?: any;
  expired?: boolean;
}

function rich(text: string | null | undefined): string {
  if (!text) return '';
  return String(text).trim().split(/\n\s*\n/).map((block) => {
    const lines = block.split('\n');
    if (lines.every((l) => /^\s*[-•]\s+/.test(l))) {
      return `<ul class="bul">${lines.map((l) => `<li>${e(l.replace(/^\s*[-•]\s+/, ''))}</li>`).join('')}</ul>`;
    }
    return `<p>${lines.map((l) => e(l)).join('<br>')}</p>`;
  }).join('');
}

const fmtDate = (iso?: string | null) => iso ? new Date(iso.length === 10 ? iso + 'T12:00:00Z' : iso).toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Stockholm' }) : '–';
const pct = (bp: number) => (bp / 100).toLocaleString('sv-SE', { maximumFractionDigits: 2 }) + ' %';
const qty = (m: number) => (m / 1000).toLocaleString('sv-SE', { maximumFractionDigits: 3 });

function itemsTable(items: any[], cur: string, opts: { optional?: boolean; interactive?: boolean } = {}) {
  return `<table class="tbl price-t"><thead><tr>${opts.optional ? '<th class="ck"></th>' : ''}<th>Beskrivning</th><th class="r">Antal</th><th class="r">À-pris</th><th class="r">Belopp</th></tr></thead><tbody>
  ${items.map((it) => {
    const l = calcLine(it);
    return `<tr>${opts.optional ? `<td class="ck">${opts.interactive ? `<input type="checkbox" class="opt" value="${e(it.id)}" aria-label="Välj ${e(it.name)}">` : '<span class="box"></span>'}</td>` : ''}
      <td><strong>${e(it.name)}</strong>${it.description ? `<div class="desc">${e(it.description)}</div>` : ''}${it.discount_bp ? `<div class="desc">Rabatt ${pct(it.discount_bp)}</div>` : ''}</td>
      <td class="r nw">${qty(it.qty_milli)} ${e(it.unit || 'st')}</td>
      <td class="r nw">${formatMoney(it.unit_price_minor, cur)}${it.billing === 'monthly' ? '<span class="per">/mån</span>' : ''}</td>
      <td class="r nw">${formatMoney(l.net, cur)}${it.billing === 'monthly' ? '<span class="per">/mån</span>' : ''}</td></tr>`;
  }).join('')}</tbody></table>`;
}

export function renderQuoteDocument(snap: any, o: Opts): { body: string; csp: string } {
  const nonce = randomToken(16);
  const cur = snap.quote.currency || 'SEK';
  const c = snap.content || {};
  const items: any[] = snap.items || [];
  // Efter godkännande visas exakt det kunden valde: valda tillägg räknas in i respektive tabell och summa.
  const chosen = new Set<string>(o.acceptance ? JSON.parse(o.acceptance.selected_optional_json || '[]') : []);
  const t = o.acceptance ? calcQuote({ items, discount_bp: snap.discount_bp, currency: cur }, [...chosen]) : snap.totals;
  const inc = (i: any) => !i.optional || chosen.has(i.id);
  const once = items.filter((i) => i.billing === 'once' && inc(i));
  const monthly = items.filter((i) => i.billing === 'monthly' && inc(i));
  const optional = items.filter((i) => !inc(i));
  const interactive = o.mode === 'public' && !o.acceptance && !o.expired && ['sent', 'viewed'].includes(o.status || '');

  let n = 0;
  const sec = (title: string, inner: string, cls = '') => inner ? `<section class="sec ${cls}"><div class="sec-h"><span class="num">${String(++n).padStart(2, '0')}</span><h2>${e(title)}</h2></div><div class="sec-b">${inner}</div></section>` : '';

  const includes = (c.includes || []).filter(Boolean);
  // ---------- Digitaliseringsplan ----------
  const dp = c.digital_plan && c.digital_plan.enabled ? c.digital_plan : null;
  const roi = dp ? calcPlan(dp, t) : null;
  const hrs = (n: number) => `${n.toLocaleString('sv-SE', { maximumFractionDigits: 1 })} h`;
  const months = (n: number | null) => n == null ? '–' : n < 1 ? 'under 1 månad' : `${n.toLocaleString('sv-SE', { maximumFractionDigits: 1 })} mån`;
  const figures = roi && roi.has_data ? `<div class="figs">
      <div class="fig"><div class="fig-v">${hrs(roi.hours_saved)}</div><div class="fig-l">frigörs varje månad</div></div>
      <div class="fig"><div class="fig-v">${formatMoney(roi.net_saving_year, cur)}</div><div class="fig-l">nettobesparing per år</div></div>
      <div class="fig"><div class="fig-v">${months(roi.payback_months)}</div><div class="fig-l">återbetalningstid</div></div>
    </div>` : '';
  const dpSummary = dp ? (rich(dp.summary) + figures) : '';
  const dpCurrent = dp && (dp.current || []).length ? `<p class="muted">Så ser arbetet ut i dag – och hur mycket av det som kan försvinna.</p>
    <table class="tbl now"><thead><tr><th>Process</th><th>I dag</th><th class="r">Tid/mån</th><th class="r">Kan automatiseras</th></tr></thead><tbody>
    ${dp.current.map((r: any) => `<tr><td><strong>${e(r.process)}</strong>${r.problem ? `<div class="desc">${e(r.problem)}</div>` : ''}</td><td>${e(r.today || '')}</td>
      <td class="r nw">${r.hours_month ? hrs(Number(r.hours_month)) : '–'}</td><td class="r nw"><span class="pct"><i class="w${Math.round(Number(r.automation_pct || 0) / 5) * 5}"></i></span>${Number(r.automation_pct || 0)} %</td></tr>`).join('')}
    </tbody><tfoot><tr><td colspan="2"><strong>Totalt</strong></td><td class="r nw"><strong>${hrs(roi!.hours_today)}</strong></td><td class="r nw"><strong>${hrs(roi!.hours_saved)}</strong> frigörs</td></tr></tfoot></table>` : '';
  const dpGoals = dp && (dp.goals || []).length ? `<table class="tbl goals"><thead><tr><th>Mål</th><th>Så mäter vi</th><th class="r">I dag</th><th class="r">Mål</th></tr></thead><tbody>
    ${dp.goals.map((g: any) => `<tr><td><strong>${e(g.goal)}</strong></td><td>${e(g.metric || '')}</td><td class="r">${e(g.today || '–')}</td><td class="r"><strong>${e(g.target || '–')}</strong></td></tr>`).join('')}</tbody></table>` : '';
  const dpPhases = dp && (dp.phases || []).length ? `<div class="phases">${dp.phases.map((p: any, i: number) => `<div class="phase">
      <div class="ph-h"><span class="ph-n">Fas ${i + 1}</span>${p.period ? `<span class="pd">${e(p.period)}</span>` : ''}</div>
      <div class="ph-t">${e(p.title)}</div>${p.actions ? `<ul class="bul">${String(p.actions).split('\n').map((x: string) => x.replace(/^\s*[-•]\s*/, '').trim()).filter(Boolean).map((x: string) => `<li>${e(x)}</li>`).join('')}</ul>` : ''}
      ${p.effect ? `<div class="ph-e"><span>Effekt</span>${e(p.effect)}</div>` : ''}</div>`).join('')}</div>` : '';
  const dpRoi = roi && roi.has_data ? `<table class="tbl roi"><tbody>
      ${roi.hours_saved ? `<tr><td>Frigjord tid: ${hrs(roi.hours_saved)}/mån × ${formatMoney(dp.hourly_cost_minor || 0, cur)}/h</td><td class="r nw">${formatMoney(roi.time_value_month, cur)}/mån</td></tr>` : ''}
      ${(dp.removed_costs || []).map((x: any) => `<tr><td>Kostnad som försvinner: ${e(x.label)}</td><td class="r nw">${formatMoney(x.monthly_minor || 0, cur)}/mån</td></tr>`).join('')}
      <tr class="sumrow"><td>Bruttobesparing</td><td class="r nw">${formatMoney(roi.gross_saving_month, cur)}/mån</td></tr>
      ${roi.new_monthly_cost ? `<tr><td>Löpande kostnad enligt offerten</td><td class="r nw">−${formatMoney(roi.new_monthly_cost, cur)}/mån</td></tr>` : ''}
      <tr class="sumrow"><td>Nettobesparing</td><td class="r nw">${formatMoney(roi.net_saving_month, cur)}/mån</td></tr>
      <tr><td>Engångsinvestering enligt offerten</td><td class="r nw">${formatMoney(roi.investment, cur)}</td></tr>
      <tr><td>Återbetalningstid</td><td class="r nw"><strong>${months(roi.payback_months)}</strong></td></tr>
      <tr><td>Resultat efter första året</td><td class="r nw">${formatMoney(roi.result_year1, cur)}</td></tr>
      <tr class="sumrow"><td>Resultat efter tre år</td><td class="r nw">${formatMoney(roi.result_year3, cur)}</td></tr>
    </tbody></table>
    ${(dp.assumptions || []).length ? `<h3 class="sub">Antaganden</h3><ul class="bul">${dp.assumptions.map((a: string) => `<li>${e(a)}</li>`).join('')}</ul>` : ''}
    <p class="muted small">Belopp exkl. moms. Kalkylen bygger på uppgifter från ${e(snap.customer?.name || 'er')} och KELA:s bedömning. Den är en uppskattning – inte en garanti.</p>` : '';
  const plan = (c.plan || []).filter((p: any) => p && p.title);

  const priceInner = `
    ${once.length ? `<h3 class="sub">Engångskostnad</h3>${itemsTable(once, cur)}
      <div class="sum">
        ${t.once.discount ? `<div><span>Delsumma</span><span>${formatMoney(t.once.subtotal, cur)}</span></div><div><span>Rabatt ${pct(snap.discount_bp)}</span><span>−${formatMoney(t.once.discount, cur)}</span></div>` : ''}
        <div><span>Summa exkl. moms</span><span data-k="once.net">${formatMoney(t.once.net, cur)}</span></div>
        <div><span>Moms</span><span data-k="once.vat">${formatMoney(t.once.vat, cur)}</span></div>
        <div class="tot"><span>Totalt inkl. moms</span><span data-k="once.total">${formatMoney(t.once.total, cur)}</span></div>
      </div>` : ''}
    ${monthly.length ? `<h3 class="sub">Löpande månadskostnad</h3>${itemsTable(monthly, cur)}
      <div class="sum">
        <div><span>Per månad exkl. moms</span><span data-k="monthly.net">${formatMoney(t.monthly.net, cur)}</span></div>
        <div><span>Moms</span><span data-k="monthly.vat">${formatMoney(t.monthly.vat, cur)}</span></div>
        <div class="tot"><span>Per månad inkl. moms</span><span data-k="monthly.total">${formatMoney(t.monthly.total, cur)}</span></div>
      </div>` : ''}
    ${chosen.size ? `<p class="muted small">Inklusive ${chosen.size === 1 ? 'ett valt tillägg' : chosen.size + ' valda tillägg'} enligt godkännandet.</p>` : ''}
    ${optional.length ? `<h3 class="sub">${o.acceptance ? 'Tillägg som inte valdes' : 'Valfria tillägg'}</h3><p class="muted small">${interactive ? 'Markera de tillägg ni vill ha med – summorna uppdateras direkt.' : o.acceptance ? 'Ingår inte i den godkända offerten.' : 'Ingår inte i summan ovan om de inte väljs vid godkännandet.'}</p>${itemsTable(optional, cur, { optional: !o.acceptance, interactive })}` : ''}
    <div class="meta-grid">
      ${c.delivery_estimate ? `<div><div class="lbl">Preliminär leveranstid</div><div>${e(c.delivery_estimate)}</div></div>` : ''}
      ${c.payment_terms ? `<div><div class="lbl">Betalningsvillkor</div><div>${rich(c.payment_terms)}</div></div>` : ''}
      <div><div class="lbl">Giltig till</div><div>${fmtDate(snap.quote.valid_until)}</div></div>
    </div>`;

  const acceptedBlock = o.acceptance ? `
    <div class="accepted">
      <div class="acc-ico">✓</div>
      <div><strong>Offerten är godkänd</strong>
      <p>Godkänd digitalt av ${e(o.acceptance.signer_name)}${o.acceptance.signer_title ? `, ${e(o.acceptance.signer_title)}` : ''} (${e(o.acceptance.signer_email)}) den ${fmtDate(o.acceptance.created_at)} kl. ${new Date(o.acceptance.created_at).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Stockholm' })}.</p>
      <p class="small muted">Digitalt godkännande via KELA OS (klick med namn och e-post). Detta är inte en kvalificerad elektronisk underskrift. Godkänd version: v${e(snap.quote.version_no)} · kontrollsumma ${e(String(o.acceptance.snapshot_hash).slice(0, 16))}…</p></div>
    </div>` : '';

  const approveInner = o.acceptance ? acceptedBlock : `
    <p>Genom att godkänna offerten bekräftar ni att ni vill gå vidare med lösningen och villkoren ovan. Vi återkommer med avtal och startdatum.</p>
    ${interactive ? `<div class="approve-row"><button class="btn primary" data-open="accept">Godkänn offert</button><button class="btn ghost" data-open="decline">Avböj</button></div>` :
      o.expired ? '<p class="note">Offerten har gått ut. Kontakta oss så tar vi fram en uppdaterad version.</p>' :
      o.status === 'declined' ? '<p class="note">Offerten är avböjd.</p>' :
      `<div class="sign-lines"><div><span></span>Ort och datum</div><div><span></span>Underskrift ${e(snap.customer?.name || '')}</div></div>`}`;

  const body = `<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer">
<title>Offert #${e(snap.quote.number)} – ${e(snap.quote.title)} | KELA</title>
<link rel="icon" href="/assets/favicon-v2.svg">
<style nonce="${nonce}">${CSS}</style></head>
<body class="${o.mode}${o.draft ? ' is-draft' : ''}">
${o.draft ? '<div class="draft-flag">Utkast – förhandsgranskning</div>' : ''}
${o.mode === 'public' && o.expired && !o.acceptance ? '<div class="banner">Offerten gick ut ' + fmtDate(snap.quote.valid_until) + '.</div>' : ''}
<main class="doc">
  <section class="cover">
    <div class="cv-top"><div class="logo">KELA<i></i></div><div class="cv-no">Offert #${e(snap.quote.number)}${snap.quote.version_no > 1 ? ` · v${e(snap.quote.version_no)}` : ''}</div></div>
    <div class="cv-mid">
      <div class="cv-kicker">${dp ? 'Digitaliseringsplan och offert för' : 'Förslag till'} ${e(snap.customer?.name || '')}</div>
      <h1>${e(c.cover_title || snap.quote.title)}</h1>
      ${c.cover_subtitle ? `<p class="cv-sub">${e(c.cover_subtitle)}</p>` : ''}
    </div>
    <div class="cv-foot">
      <div><div class="lbl">Till</div><div>${e(snap.customer?.name || '')}${snap.contact ? `<br>${e(snap.contact.name)}` : ''}</div></div>
      <div><div class="lbl">Från</div><div>${e(snap.org?.name || 'KELA Group AB')}${snap.owner ? `<br>${e(snap.owner.name)}` : ''}</div></div>
      <div><div class="lbl">Datum</div><div>${fmtDate(snap.issued_at)}</div></div>
      <div><div class="lbl">Giltig till</div><div>${fmtDate(snap.quote.valid_until)}</div></div>
    </div>
  </section>
  <div class="pages">
    ${sec('Sammanfattning', dpSummary)}
    ${sec('Inledning', rich(c.intro))}
    ${sec('Nuläge', dpCurrent)}
    ${sec('Mål och nyckeltal', dpGoals)}
    ${sec('Färdplan', dpPhases)}
    ${sec(dp ? 'Era behov' : 'Era behov och mål', rich(c.needs))}
    ${sec('Föreslagen lösning', rich(c.solution))}
    ${sec('Det här ingår', includes.length ? `<ul class="checks">${includes.map((x: string) => `<li>${e(x)}</li>`).join('')}</ul>` : '')}
    ${sec('Genomförandeplan', plan.length ? `<ol class="plan">${plan.map((p: any, i: number) => `<li><div class="pn">${i + 1}</div><div><div class="pt">${e(p.title)}${p.duration ? `<span class="pd">${e(p.duration)}</span>` : ''}</div>${p.text ? `<div class="px">${rich(p.text)}</div>` : ''}</div></li>`).join('')}</ol>` : '')}
    ${sec('Investering', priceInner, 'price')}
    ${sec('Lönsamhet', dpRoi)}
    ${sec('Villkor', rich(c.terms) + (c.special_terms ? `<h3 class="sub">Särskilda villkor</h3>${rich(c.special_terms)}` : ''))}
    ${sec('Godkännande', approveInner, 'approve')}
    <footer class="doc-foot"><span>${e(snap.org?.name || 'KELA Group AB')}${snap.org?.org_number ? ` · Org.nr ${e(snap.org.org_number)}` : ''}</span><span>kelagroup.se · hej@kelagroup.se</span></footer>
  </div>
</main>
${o.mode === 'public' ? `
<div class="bar" role="region" aria-label="Sammanfattning">
  <div class="bar-in">
    <div class="bar-sum">${t.once.total || !t.monthly.total ? `<div><span class="lbl">Engångs inkl. moms</span><strong data-k="once.total">${formatMoney(t.once.total, cur)}</strong></div>` : ''}${t.monthly.total ? `<div><span class="lbl">Per månad inkl. moms</span><strong data-k="monthly.total">${formatMoney(t.monthly.total, cur)}</strong></div>` : ''}</div>
    <div class="bar-act"><button class="btn ghost" data-print>Ladda ner PDF</button>${interactive ? '<button class="btn primary" data-open="accept">Godkänn offert</button>' : o.acceptance ? '<span class="pill ok">Godkänd</span>' : ''}</div>
  </div>
</div>
${interactive ? `
<dialog id="accept" aria-labelledby="acc-h"><form method="dialog" class="dlg" id="acc-form">
  <h2 id="acc-h">Godkänn offert #${e(snap.quote.number)}</h2>
  <p class="muted small">Fyll i dina uppgifter. Godkännandet sparas tillsammans med exakt den version av offerten du ser nu.</p>
  <label>Namn<input name="name" required maxlength="120" autocomplete="name"></label>
  <label>E-post<input name="email" type="email" required maxlength="254" autocomplete="email"></label>
  <label><span>Roll / titel <span class="muted">(valfritt)</span></span><input name="title" maxlength="120" autocomplete="organization-title"></label>
  <div class="dlg-sum" id="acc-sum"></div>
  <label class="cbx"><input type="checkbox" name="confirm" required> <span>Jag har behörighet att godkänna offerten för ${e(snap.customer?.name || 'företaget')} och godkänner offerten med dess villkor.</span></label>
  <p class="small muted">Detta är ett digitalt godkännande (inte en kvalificerad elektronisk underskrift). Vi sparar namn, e-post, tidpunkt, IP-adress och offertversion som underlag.</p>
  <p class="err" id="acc-err" role="alert"></p>
  <div class="dlg-act"><button type="button" class="btn ghost" data-close>Avbryt</button><button type="submit" class="btn primary" id="acc-btn">Godkänn offert</button></div>
</form></dialog>
<dialog id="decline" aria-labelledby="dec-h"><form method="dialog" class="dlg" id="dec-form">
  <h2 id="dec-h">Avböj offerten</h2>
  <p class="muted small">Berätta gärna varför – det hjälper oss att bli bättre.</p>
  <label><span>Anledning <span class="muted">(valfritt)</span></span><textarea name="reason" maxlength="1000" rows="4"></textarea></label>
  <p class="err" id="dec-err" role="alert"></p>
  <div class="dlg-act"><button type="button" class="btn ghost" data-close>Avbryt</button><button type="submit" class="btn primary">Avböj offerten</button></div>
</form></dialog>` : ''}
<script type="application/json" id="qdata" nonce="${nonce}">${JSON.stringify({ token: o.token, items, discount_bp: snap.discount_bp, currency: cur, hash: o.hash, interactive }).replace(/</g, '\\u003c')}</script>
<script type="module" nonce="${nonce}">${PUBLIC_JS}</script>` : ''}
${o.autoPrint ? `<script nonce="${nonce}">addEventListener('load',()=>setTimeout(()=>print(),400))</script>` : ''}
</body></html>`;

  const csp = [
    "default-src 'none'", `style-src 'nonce-${nonce}'`, `script-src 'nonce-${nonce}' 'self'`, "font-src 'self'", "img-src 'self' data:",
    "connect-src 'self'", "form-action 'self'", "base-uri 'none'", o.mode === 'preview' ? "frame-ancestors 'self'" : "frame-ancestors 'none'",
  ].join('; ');
  return { body, csp };
}

const PUBLIC_JS = `
import { calcQuote, formatMoney } from '/os/lib/calc.js';
const D = JSON.parse(document.getElementById('qdata').textContent);
const $ = (s, r = document) => r.querySelector(s);
const post = (path, body) => fetch('/api/offert/' + encodeURIComponent(D.token) + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) });
// Registrera visning först när sidan faktiskt visats i webbläsaren en stund (inte vid förhandsladdning av länkar).
let sent = false;
function markViewed() { if (sent || document.visibilityState !== 'visible') return; sent = true; post('/viewed', {}).catch(() => {}); }
setTimeout(markViewed, 2000);
document.addEventListener('visibilitychange', () => setTimeout(markViewed, 2000));
document.querySelectorAll('[data-print]').forEach((b) => b.addEventListener('click', () => print()));
const selected = () => [...document.querySelectorAll('.opt:checked')].map((x) => x.value);
function refresh() {
  const t = calcQuote({ items: D.items, discount_bp: D.discount_bp, currency: D.currency }, selected());
  document.querySelectorAll('[data-k]').forEach((el) => { const [a, b] = el.dataset.k.split('.'); el.textContent = formatMoney(t[a][b], D.currency); });
  const s = $('#acc-sum');
  if (s) s.innerHTML = '';
  if (s) { if (t.once.total) s.append(row('Engångskostnad inkl. moms', formatMoney(t.once.total, D.currency))); if (t.monthly.total) s.append(row('Per månad inkl. moms', formatMoney(t.monthly.total, D.currency))); }
}
function row(a, b) { const d = document.createElement('div'); const x = document.createElement('span'); x.textContent = a; const y = document.createElement('strong'); y.textContent = b; d.append(x, y); return d; }
document.querySelectorAll('.opt').forEach((x) => x.addEventListener('change', refresh));
refresh();
document.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => $('#' + b.dataset.open).showModal()));
document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));
const af = $('#acc-form');
if (af) af.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const f = new FormData(af); const btn = $('#acc-btn'); btn.disabled = true; $('#acc-err').textContent = '';
  try {
    const r = await post('/accept', { name: f.get('name'), email: f.get('email'), title: f.get('title'), confirm: !!f.get('confirm'), snapshot_hash: D.hash, selected_optional: selected() });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.message || 'Något gick fel. Försök igen.');
    location.reload();
  } catch (err) { $('#acc-err').textContent = err.message; btn.disabled = false; }
});
const df = $('#dec-form');
if (df) df.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const f = new FormData(df);
  const r = await post('/decline', { reason: f.get('reason') });
  if (r.ok) location.reload(); else $('#dec-err').textContent = 'Något gick fel. Försök igen.';
});
`;

const CSS = `
@font-face{font-family:'Archivo Black';src:url('/assets/fonts/archivo-black.woff2') format('woff2');font-display:swap}
:root{--pink:#F3D3D7;--pink-2:#ECC3C9;--pink-soft:#FBF0F1;--wine:#5C1A26;--wine-2:#6E2331;--ink:#2A1418;--muted:#7A5A60;--line:rgba(92,26,38,.14);--dot:#E09AA6;
--display:'Archivo Black',-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;--sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:#EFE7E8;color:var(--ink);font:16px/1.65 var(--sans);-webkit-font-smoothing:antialiased}
body.public{padding-bottom:96px}
.doc{max-width:880px;margin:32px auto;background:#fff;box-shadow:0 30px 80px -40px rgba(92,26,38,.35),0 0 0 1px var(--line);border-radius:20px;overflow:hidden}
.cover{background:var(--pink);color:var(--wine);padding:44px 56px 40px;min-height:620px;display:flex;flex-direction:column;justify-content:space-between;position:relative;overflow:hidden}
.cover::after{content:"";position:absolute;right:-120px;top:-120px;width:420px;height:420px;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,.55),rgba(255,255,255,0) 70%)}
.cv-top{display:flex;justify-content:space-between;align-items:center;position:relative;z-index:1}
.logo{font-family:var(--display);font-size:28px;letter-spacing:-.03em;line-height:1;position:relative;padding-bottom:6px}
.logo i{position:absolute;left:0;bottom:0;width:100%;height:3px;background:var(--wine);border-radius:2px}
.cv-no{font-size:13px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;opacity:.75}
.cv-mid{position:relative;z-index:1;margin:56px 0}
.cv-kicker{font-size:14px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;display:flex;align-items:center;gap:10px;margin-bottom:22px}
.cv-kicker::before{content:"";width:10px;height:10px;border-radius:50%;background:var(--wine)}
h1{font-family:var(--display);font-weight:400;font-size:clamp(40px,7vw,68px);line-height:.98;letter-spacing:-.035em;margin:0;max-width:12ch;text-wrap:balance}
.cv-sub{font-size:19px;line-height:1.5;margin:22px 0 0;max-width:46ch;opacity:.85}
.cv-foot{display:grid;grid-template-columns:repeat(4,1fr);gap:20px;border-top:1px solid rgba(92,26,38,.22);padding-top:20px;position:relative;z-index:1;font-size:14px}
.lbl{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;opacity:.6;margin-bottom:4px}
.pages{padding:24px 56px 40px}
.sec{padding:36px 0;border-bottom:1px solid var(--line);break-inside:avoid-page}
.sec:last-of-type{border-bottom:0}
.sec-h{display:flex;align-items:baseline;gap:16px;margin-bottom:18px}
.num{font-family:var(--display);font-size:13px;color:var(--dot);letter-spacing:.02em}
h2{font-family:var(--display);font-weight:400;font-size:28px;letter-spacing:-.03em;line-height:1.05;margin:0;color:var(--wine)}
.sub{font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:26px 0 10px}
.sec-b p{margin:0 0 14px;max-width:68ch}
.bul{margin:0 0 14px;padding-left:20px}.bul li{margin:4px 0}
.checks{list-style:none;padding:0;margin:0;display:grid;grid-template-columns:1fr 1fr;gap:10px 24px}
.checks li{position:relative;padding-left:30px}
.checks li::before{content:"";position:absolute;left:0;top:4px;width:18px;height:18px;border-radius:50%;background:var(--pink)}
.checks li::after{content:"";position:absolute;left:6px;top:8px;width:6px;height:9px;border:solid var(--wine);border-width:0 2px 2px 0;transform:rotate(45deg)}
.plan{list-style:none;margin:0;padding:0;position:relative}
.plan li{display:grid;grid-template-columns:36px 1fr;gap:16px;padding:0 0 22px;position:relative;break-inside:avoid}
.plan li:not(:last-child)::before{content:"";position:absolute;left:17px;top:36px;bottom:0;width:2px;background:var(--pink)}
.pn{width:36px;height:36px;border-radius:50%;background:var(--wine);color:#fff;display:grid;place-items:center;font-weight:700;font-size:14px}
.pt{font-weight:700;padding-top:6px;display:flex;gap:12px;align-items:baseline;flex-wrap:wrap}
.pd{font-weight:600;font-size:12px;color:var(--wine);background:var(--pink-soft);border-radius:99px;padding:2px 10px}
.px{color:var(--muted);margin-top:4px}.px p{margin:0 0 8px}
.tbl{width:100%;border-collapse:collapse;font-size:15px}
.tbl th{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);text-align:left;padding:10px 8px;border-bottom:1px solid var(--line)}
.tbl td{padding:14px 8px;border-bottom:1px solid var(--line);vertical-align:top}
.tbl .r{text-align:right}.nw{white-space:nowrap}
.tbl .ck{width:34px}.tbl input{width:18px;height:18px;accent-color:var(--wine);margin:2px 0 0}
.box{display:inline-block;width:14px;height:14px;border:1.5px solid var(--muted);border-radius:3px;margin-top:4px}
.desc{color:var(--muted);font-size:14px;margin-top:2px;white-space:pre-line}
.per{font-size:12px;color:var(--muted);margin-left:2px}
.sum{margin:14px 0 0 auto;max-width:360px;font-size:15px}
.sum div{display:flex;justify-content:space-between;padding:5px 8px}
.sum .tot{border-top:2px solid var(--wine);margin-top:6px;padding-top:12px;font-weight:700;font-size:18px;color:var(--wine)}
.meta-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:20px;margin-top:30px;background:var(--pink-soft);border-radius:14px;padding:20px 22px;font-size:15px}
.meta-grid p{margin:0}
.muted{color:var(--muted)}.small{font-size:13px}
.note{background:var(--pink-soft);padding:14px 18px;border-radius:12px}
.approve-row{display:flex;gap:12px;flex-wrap:wrap;margin-top:18px}
.sign-lines{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:48px;font-size:13px;color:var(--muted)}
.sign-lines span{display:block;border-top:1px solid var(--ink);margin-bottom:6px;height:0}
.accepted{display:flex;gap:16px;background:#EEF7F0;border:1px solid #CFE6D5;border-radius:14px;padding:20px 22px}
.accepted p{margin:6px 0 0}
.acc-ico{width:36px;height:36px;flex:none;border-radius:50%;background:#2E7D4F;color:#fff;display:grid;place-items:center;font-weight:700}
.doc-foot{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;font-size:12px;color:var(--muted);padding-top:28px;border-top:1px solid var(--line);margin-top:8px}
.btn{font:600 15px/1 var(--sans);border-radius:999px;padding:14px 22px;border:1px solid var(--wine);cursor:pointer;transition:transform .2s,background .2s}
.btn.primary{background:var(--wine);color:#fff}.btn.primary:hover{background:var(--wine-2);transform:translateY(-1px)}
.btn.ghost{background:transparent;color:var(--wine)}.btn.ghost:hover{background:var(--pink-soft)}
.btn:disabled{opacity:.5;cursor:wait}
.bar{position:fixed;left:0;right:0;bottom:0;background:rgba(255,255,255,.92);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-top:1px solid var(--line);z-index:10}
.bar-in{max-width:880px;margin:0 auto;padding:12px 20px;display:flex;justify-content:space-between;align-items:center;gap:16px}
.bar-sum{display:flex;gap:28px}.bar-sum div{display:flex;flex-direction:column}.bar-sum strong{font-size:18px;color:var(--wine)}
.bar-act{display:flex;gap:10px;align-items:center}
.pill{font-size:13px;font-weight:700;padding:8px 14px;border-radius:99px}.pill.ok{background:#EEF7F0;color:#2E7D4F}
.banner{background:var(--wine);color:#fff;text-align:center;padding:12px 16px;font-weight:600;font-size:14px}
.draft-flag{position:fixed;top:14px;right:14px;z-index:20;background:#1d1d1f;color:#fff;font:600 12px/1 var(--sans);letter-spacing:.06em;text-transform:uppercase;padding:9px 14px;border-radius:99px}
dialog{border:0;border-radius:20px;padding:0;max-width:480px;width:calc(100% - 32px);box-shadow:0 40px 100px -30px rgba(42,20,24,.5)}
dialog::backdrop{background:rgba(42,20,24,.45);backdrop-filter:blur(3px)}
.dlg{padding:28px;display:grid;gap:14px}
.dlg h2{font-size:24px}
.dlg label{display:grid;gap:6px;font-size:14px;font-weight:600}
.dlg input:not([type=checkbox]),.dlg textarea{font:16px var(--sans);padding:12px 14px;border:1px solid var(--line);border-radius:12px;background:#fff;color:var(--ink)}
.dlg input:focus,.dlg textarea:focus{outline:2px solid var(--wine);outline-offset:1px}
.cbx{display:flex!important;grid-template-columns:none;gap:10px!important;align-items:flex-start;font-weight:500!important}
.cbx input{margin-top:3px;accent-color:var(--wine);width:18px;height:18px;flex:none}
.dlg-sum{background:var(--pink-soft);border-radius:12px;padding:6px 14px}.dlg-sum div{display:flex;justify-content:space-between;padding:6px 0}
.dlg-act{display:flex;justify-content:flex-end;gap:10px}
.err{color:#B3261E;font-size:14px;margin:0;min-height:0}
@media (max-width:700px){
  .doc{margin:0;border-radius:0}.cover{padding:28px 22px;min-height:540px}.pages{padding:8px 22px 28px}
  .cv-foot{grid-template-columns:1fr 1fr}.checks{grid-template-columns:1fr}
  .price-t thead{display:none}.price-t tr{display:grid;grid-template-columns:auto 1fr auto;gap:2px 10px;padding:12px 0;border-bottom:1px solid var(--line)}
  .price-t td{border:0;padding:0}.price-t td:nth-last-child(2){display:none}
  .tbl.now,.tbl.goals{font-size:13px}.tbl.now td,.tbl.goals td{padding:10px 4px}
  .bar-sum{gap:16px}.bar-sum strong{font-size:15px}.bar-act .ghost{display:none}.bar-in{padding:10px 16px}
  h2{font-size:24px}
}
.figs{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:22px}
.fig{background:var(--pink);border-radius:16px;padding:18px 20px;color:var(--wine);-webkit-print-color-adjust:exact;print-color-adjust:exact}
.fig-v{font-family:var(--display);font-size:26px;letter-spacing:-.02em;line-height:1.1}
.fig-l{font-size:13px;margin-top:6px;opacity:.8}
.tbl.now tfoot td{border-top:2px solid var(--wine);border-bottom:0;padding-top:12px}
.pct{display:inline-block;width:46px;height:6px;border-radius:6px;background:var(--pink-soft);margin-right:8px;vertical-align:middle;overflow:hidden}
.pct i{display:block;height:100%;background:var(--wine);border-radius:6px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.pct i.w0{width:0%}.pct i.w5{width:5%}.pct i.w10{width:10%}.pct i.w15{width:15%}.pct i.w20{width:20%}.pct i.w25{width:25%}.pct i.w30{width:30%}.pct i.w35{width:35%}.pct i.w40{width:40%}.pct i.w45{width:45%}.pct i.w50{width:50%}.pct i.w55{width:55%}.pct i.w60{width:60%}.pct i.w65{width:65%}.pct i.w70{width:70%}.pct i.w75{width:75%}.pct i.w80{width:80%}.pct i.w85{width:85%}.pct i.w90{width:90%}.pct i.w95{width:95%}.pct i.w100{width:100%}
.phases{display:grid;gap:12px}
.phase{border:1px solid var(--line);border-radius:16px;padding:18px 20px;break-inside:avoid;position:relative}
.phase::before{content:"";position:absolute;left:0;top:18px;bottom:18px;width:3px;border-radius:3px;background:var(--dot)}
.ph-h{display:flex;gap:10px;align-items:center}
.ph-n{font:700 11px/1 var(--sans);letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.ph-t{font-weight:700;font-size:17px;margin:6px 0 8px;color:var(--wine)}
.ph-e{background:var(--pink-soft);border-radius:10px;padding:10px 12px;font-size:14px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.ph-e span{display:block;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-bottom:2px}
.tbl.roi td{padding:10px 8px}
.tbl.roi .sumrow td{font-weight:700;color:var(--wine);border-bottom:2px solid var(--wine)}
@media (max-width:700px){.figs{grid-template-columns:1fr}.tbl.now thead{display:none}}
@page{size:A4;margin:14mm 0}
@page:first{margin:0}
@media print{
  body{background:#fff;padding:0!important;font-size:11pt}
  .doc{margin:0;box-shadow:none;border-radius:0;max-width:none}
  .cover{height:297mm;min-height:0;padding:20mm 18mm;break-after:page;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .pages{padding:0 18mm}
  .sec{padding:8mm 0}
  .bar,.approve-row,dialog,.draft-flag,.banner{display:none!important}
  .meta-grid,.checks li::before,.pn,.plan li::before,.pd,.accepted,.acc-ico{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .tbl tr,.plan li,.sum{break-inside:avoid}
  .is-draft .cover::before{content:"UTKAST";position:absolute;right:18mm;bottom:20mm;font:700 10pt var(--sans);letter-spacing:.2em;opacity:.5}
}
`;
