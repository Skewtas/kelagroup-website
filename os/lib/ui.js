// KELA OS – UI-verktyg. html`` escapar ALLA insatta värden som standard (skydd mot XSS).
import { icon } from './icons.js';
import { formatMoney } from './calc.js';

class Safe { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Safe(String(s ?? ''));
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function val(v) {
  if (v instanceof Safe) return v.s;
  if (Array.isArray(v)) return v.map(val).join('');
  if (v === false || v === null || v === undefined) return '';
  return esc(v);
}
export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += val(values[i]) + strings[i + 1];
  return new Safe(out);
}
export const ico = (n, cls) => raw(icon(n, cls));

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export function setHTML(el, h) { el.innerHTML = String(h); return el; }

// ---------- Format ----------
export const money = (m, cur = 'SEK') => formatMoney(m, cur);
const rtf = new Intl.RelativeTimeFormat('sv', { numeric: 'auto' });
export function ago(iso) {
  if (!iso) return '–';
  const s = (Date.parse(iso) - Date.now()) / 1000;
  const a = Math.abs(s);
  if (a < 60) return 'nyss';
  if (a < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (a < 86400) return rtf.format(Math.round(s / 3600), 'hour');
  if (a < 86400 * 7) return rtf.format(Math.round(s / 86400), 'day');
  return date(iso);
}
export function date(iso, opts = { day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!iso) return '–';
  return new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString('sv-SE', opts);
}
export function dateTime(iso) {
  if (!iso) return '–';
  return new Date(iso).toLocaleString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
export const today = () => new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD lokal tid
export const initials = (n) => String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase();
export const pct = (bp) => (bp / 100).toLocaleString('sv-SE', { maximumFractionDigits: 2 }) + ' %';

// ---------- Etiketter ----------
export const QUOTE_STATUS = {
  draft: ['Utkast', ''], review: ['Klar för granskning', 'amber'], sent: ['Skickad', 'blue'], viewed: ['Öppnad', 'violet'],
  accepted: ['Accepterad', 'green'], declined: ['Avböjd', 'red'], expired: ['Utgången', ''],
};
export const DEAL_STAGES = [
  ['new', 'Nytt lead'], ['contacted', 'Kontaktad'], ['meeting', 'Möte bokat'], ['analysis', 'Behovsanalys'],
  ['quote_sent', 'Offert skickad'], ['negotiation', 'Förhandling'], ['won', 'Vunnen'], ['lost', 'Förlorad'],
];
export const STAGE_LABEL = Object.fromEntries(DEAL_STAGES);
export const LOST_REASONS = { price: 'Pris', timing: 'Fel tidpunkt', competitor: 'Valde konkurrent', no_need: 'Inget behov', no_response: 'Slutade svara', scope: 'Fel omfattning', other: 'Annat' };
export const CUSTOMER_STATUS = { prospect: ['Prospekt', 'blue'], active: ['Aktiv kund', 'green'], paused: ['Vilande', 'amber'], former: ['Tidigare kund', ''] };
export const LEAD_STATUS = { new: ['Ny', 'accent'], contacted: ['Kontaktad', 'blue'], qualified: ['Kvalificerad', 'violet'], disqualified: ['Diskvalificerad', ''], converted: ['Konverterad', 'green'] };
export const badge = (map, key) => { const [l, c] = map[key] || [key, '']; return html`<span class="badge ${c}">${l}</span>`; };

// ---------- Komponenter ----------
export function empty({ icon: i = 'sparkles', title, text, action }) {
  return html`<div class="empty"><div class="empty-ico">${ico(i, 'lg')}</div><h3>${title}</h3>${text ? html`<p>${text}</p>` : ''}${action || ''}</div>`;
}
export const skeleton = (n = 4) => html`<div class="card"><div class="card-b">${Array.from({ length: n }, (_, i) => html`<div class="sk sk-line" data-w="${70 + ((i * 37) % 30)}"></div>`)}</div></div>`;
export function errorBox(e) {
  return html`<div class="errbox">${ico('alert')}<div><strong>Kunde inte ladda.</strong> ${e?.message || ''}</div></div>`;
}

let toastBox;
export function toast(msg, kind = 'ok') {
  toastBox ??= document.body.appendChild(Object.assign(document.createElement('div'), { className: 'toasts' }));
  const t = document.createElement('div');
  t.className = `toast ${kind === 'err' ? 'err' : ''}`;
  t.setAttribute('role', 'status');
  setHTML(t, html`${ico(kind === 'err' ? 'alert' : 'checkCircle')}<span>${msg}</span>`);
  toastBox.append(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 300); }, kind === 'err' ? 5000 : 2600);
}

/**
 * Öppnar en modal eller sidopanel. Returnerar { el, close }. body: Safe-HTML. onSubmit får FormData + hjälpare.
 */
export function modal({ title, body, footer, drawer = false, wide = false, onMount, onClose }) {
  const d = document.createElement('dialog');
  if (drawer) d.className = 'drawer';
  setHTML(d, html`<form class="modal ${wide ? 'wide' : ''}" method="dialog" novalidate>
    <div class="modal-h"><h2>${title}</h2><button type="button" class="btn ghost icon x" data-close aria-label="Stäng">${ico('x')}</button></div>
    <div class="modal-b">${body}</div>
    ${footer ? html`<div class="modal-f">${footer}</div>` : ''}
  </form>`);
  document.body.append(d);
  const close = () => { d.close(); };
  d.addEventListener('close', () => { d.remove(); onClose?.(); });
  d.addEventListener('click', (e) => { if (e.target === d) close(); if (e.target.closest('[data-close]')) close(); });
  d.showModal();
  onMount?.(d, close);
  return { el: d, close };
}

export function confirmDialog({ title, text, ok = 'Bekräfta', danger = false }) {
  return new Promise((resolve) => {
    let result = false;
    modal({
      title, body: html`<p class="muted">${text}</p>`,
      footer: html`<button type="button" class="btn" data-close>Avbryt</button><button type="button" class="btn ${danger ? 'danger' : 'primary'}" data-ok>${ok}</button>`,
      onMount: (d, close) => d.querySelector('[data-ok]').addEventListener('click', () => { result = true; close(); }),
      onClose: () => resolve(result),
    });
  });
}

/** Visar fältfel från API:t (422) vid respektive input[name]. */
export function showErrors(form, err) {
  $$('.err', form).forEach((e) => e.remove());
  $$('.bad', form).forEach((e) => e.classList.remove('bad'));
  const det = err?.details || {};
  let first;
  for (const [k, msg] of Object.entries(det)) {
    const el = form.querySelector(`[name="${CSS.escape(k)}"]`);
    if (!el) continue;
    el.classList.add('bad');
    el.insertAdjacentHTML('afterend', String(html`<span class="err">${msg}</span>`));
    first ??= el;
  }
  first?.focus();
  if (!Object.keys(det).length || !first) toast(err?.message || 'Något gick fel.', 'err');
}

export function formData(form) {
  const o = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    if (el.type === 'checkbox') o[el.name] = el.checked;
    else if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; }
    else o[el.name] = el.value;
  }
  return o;
}

export async function withBusy(btn, fn) {
  btn?.classList.add('loading');
  try { return await fn(); } finally { btn?.classList.remove('loading'); }
}

export function copy(text) {
  return navigator.clipboard.writeText(text).then(() => toast('Kopierat till urklipp'), () => toast('Kunde inte kopiera', 'err'));
}

export function debounce(fn, ms) {
  let t;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.flush = (...a) => { clearTimeout(t); return fn(...a); };
  d.cancel = () => clearTimeout(t);
  return d;
}

/** Sätter procentbredder etc. utan inline-style i markup (CSP). */
export function applyVars(root) {
  $$('[data-w]', root).forEach((el) => el.style.width = el.dataset.w + '%');
  $$('[data-p]', root).forEach((el) => el.style.setProperty('--p', el.dataset.p + '%'));
}
