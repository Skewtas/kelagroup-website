// Säljpipeline – Kanban med dra-och-släpp samt listvy med filter.
import { html, ico, setHTML, $, $$, money, empty, DEAL_STAGES, STAGE_LABEL, initials, toast, date, applyVars, LOST_REASONS } from '../lib/ui.js';
import { get, patch, qs } from '../lib/api.js';
import { dealForm, lostReasonDialog, users } from './forms.js';
import { parseMoney } from '../lib/calc.js';

let VIEW_KEY = 'kela-os-pipeline-view';

export default async function pipeline(view, p, app) {
  app.setCrumbs([{ label: 'Affärsmöjligheter' }]);
  view.classList.add('wide');
  let mode = 'board';
  try { mode = localStorage.getItem(VIEW_KEY) || 'board'; } catch { /* */ }
  const state = { owner: '', min_value: '', min_prob: '', from: '', to: '', q: '' };
  const w = app.can('deals:write');
  const us = await users();

  setHTML(view, html`
    <div class="page-h"><div><h1>Affärsmöjligheter</h1><div class="sub" id="sum"></div></div>
      <div class="act"><div class="seg" id="mode"><button type="button" data-m="board">${ico('columns')} Kanban</button><button type="button" data-m="list">${ico('list')} Lista</button></div>
        ${w ? html`<button class="btn primary" id="new">${ico('plus')} Ny affär</button>` : ''}</div></div>
    <div class="filters">
      <div class="in-wrap">${ico('search')}<input class="in" name="q" placeholder="Sök affär eller kund…"></div>
      <select class="sel" name="owner"><option value="">Alla ansvariga</option>${us.map((u) => html`<option value="${u.id}">${u.name}</option>`)}</select>
      <select class="sel" name="min_prob"><option value="">Alla sannolikheter</option>${[25, 50, 75].map((n) => html`<option value="${n}">Minst ${n} %</option>`)}</select>
      <div class="in-wrap"><input class="in r has-suf" name="min_value" placeholder="Minsta värde" inputmode="decimal"><span class="in-suf">kr</span></div>
      <input class="in" type="date" name="from" aria-label="Skapad från"><input class="in" type="date" name="to" aria-label="Skapad till">
    </div>
    <div id="area"></div>`);

  let deals = [];
  async function load() {
    const mv = parseMoney(state.min_value);
    const r = await get('/deals' + qs({ owner: state.owner, min_prob: state.min_prob, min_value: Number.isNaN(mv) ? '' : mv, from: state.from, to: state.to, q: state.q }));
    deals = r.deals;
    const open = deals.filter((d) => !['won', 'lost'].includes(d.stage));
    $('#sum').textContent = `${open.length} öppna · ${money(open.reduce((s, d) => s + d.value_minor, 0))} i pipeline · viktat ${money(open.reduce((s, d) => s + Math.round(d.value_minor * d.probability / 100), 0))}`;
    $$('#mode button').forEach((b) => b.classList.toggle('on', b.dataset.m === mode));
    if (!deals.length && !Object.values(state).some(Boolean)) {
      setHTML($('#area'), html`<div class="card">${empty({ icon: 'target', title: 'Pipelinen är tom', text: 'Skapa en affärsmöjlighet eller konvertera ett lead för att komma igång.', action: w ? html`<button class="btn primary" data-new>${ico('plus')} Ny affär</button>` : '' })}</div>`);
      $('[data-new]')?.addEventListener('click', create);
      return;
    }
    mode === 'board' ? board() : list();
  }

  function card(d) {
    return html`<a class="dcard" draggable="${w}" data-id="${d.id}" href="#/affarer/${d.id}">
      <div class="dcard-t">${d.title}</div><div class="dcard-c">${d.customer_name || 'Ingen kund kopplad'}</div>
      <div class="dcard-f"><span class="v">${money(d.value_minor)}</span>${d.monthly_value_minor ? html`<span>+ ${money(d.monthly_value_minor)}/mån</span>` : ''}
        ${d.owner_name ? html`<span class="av sm" title="${d.owner_name}">${initials(d.owner_name)}</span>` : ''}</div>
      ${d.next_step_date ? html`<div class="dcard-c mt4 ${d.next_step_date < new Date().toISOString().slice(0, 10) ? 'err' : ''}">${ico('clock')} ${d.next_step || 'Nästa steg'} · ${date(d.next_step_date, { day: 'numeric', month: 'short' })}</div>` : ''}
      ${d.stage === 'lost' && d.lost_reason ? html`<div class="dcard-c mt4">${LOST_REASONS[d.lost_reason]}</div>` : ''}
      <div class="prob"><i data-p="${d.probability}"></i></div></a>`;
  }

  function board() {
    const area = $('#area');
    setHTML(area, html`<div class="board">${DEAL_STAGES.map(([k, l]) => {
      const ds = deals.filter((d) => d.stage === k);
      return html`<section class="col" data-stage="${k}"><div class="col-h"><span class="dot"></span><h3>${l}</h3><span class="n">${ds.length}</span></div>
        <div class="col-v">${money(ds.reduce((s, d) => s + d.value_minor, 0))}</div>
        <div class="col-b" data-drop="${k}">${ds.map(card)}</div></section>`;
    })}</div>`);
    applyVars(area);
    if (!w) return;
    let dragId = null;
    $$('.dcard', area).forEach((c) => {
      c.addEventListener('dragstart', (e) => { dragId = c.dataset.id; c.classList.add('drag'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragId); });
      c.addEventListener('dragend', () => c.classList.remove('drag'));
    });
    $$('[data-drop]', area).forEach((col) => {
      col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('over'); });
      col.addEventListener('dragleave', () => col.classList.remove('over'));
      col.addEventListener('drop', async (e) => {
        e.preventDefault(); col.classList.remove('over');
        const id = dragId || e.dataTransfer.getData('text/plain'); const stage = col.dataset.drop;
        const d = deals.find((x) => x.id === id);
        if (!d || d.stage === stage) return;
        await move(d, stage);
      });
    });
  }

  async function move(d, stage) {
    const body = { stage };
    if (stage === 'lost') {
      const r = await lostReasonDialog(); if (!r) return;
      Object.assign(body, r);
    }
    try {
      await patch(`/deals/${d.id}`, body);
      toast(`${d.title} → ${STAGE_LABEL[stage]}`);
      load();
    } catch (e) { toast(e.message, 'err'); }
  }

  function list() {
    const area = $('#area');
    setHTML(area, html`<div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Affär</th><th>Kund</th><th>Steg</th><th class="r">Värde</th><th class="r">Månad</th><th class="r">Sannolikhet</th><th>Ansvarig</th><th>Nästa steg</th><th class="r">Förv. avslut</th></tr></thead><tbody>
      ${deals.map((d) => html`<tr class="click" data-href="#/affarer/${d.id}"><td class="t-main">${d.title}</td><td>${d.customer_name || '–'}</td>
        <td>${w ? html`<select class="sel" data-stage="${d.id}">${DEAL_STAGES.map(([k, l]) => html`<option value="${k}" ${k === d.stage ? 'selected' : ''}>${l}</option>`)}</select>` : STAGE_LABEL[d.stage]}</td>
        <td class="r num">${money(d.value_minor)}</td><td class="r num">${d.monthly_value_minor ? money(d.monthly_value_minor) : '–'}</td><td class="r num">${d.probability} %</td><td>${d.owner_name || '–'}</td>
        <td class="small">${d.next_step ? html`${d.next_step}<div class="faint">${date(d.next_step_date)}</div>` : '–'}</td><td class="r small">${date(d.expected_close_date)}</td></tr>`)}
      </tbody></table></div>${deals.length ? '' : empty({ icon: 'search', title: 'Inga affärer matchar filtret' })}</div>`);
    $$('tr[data-href]', area).forEach((tr) => tr.addEventListener('click', (e) => { if (!e.target.closest('select')) location.hash = tr.dataset.href; }));
    $$('select[data-stage]', area).forEach((s) => s.addEventListener('change', async () => {
      const d = deals.find((x) => x.id === s.dataset.stage); const prev = d.stage;
      await move(d, s.value); if (d.stage === prev) s.value = prev;
    }));
  }

  const create = () => dealForm(null, { onSaved: () => load() });
  $('#new')?.addEventListener('click', create);
  $$('#mode button').forEach((b) => b.addEventListener('click', () => { mode = b.dataset.m; try { localStorage.setItem(VIEW_KEY, mode); } catch { /* */ } load(); }));
  $$('.filters [name]', view).forEach((el) => el.addEventListener(el.tagName === 'INPUT' && el.type !== 'date' ? 'input' : 'change', () => { state[el.name] = el.value.trim(); clearTimeout(el._t); el._t = setTimeout(load, 220); }));
  await load();
}
