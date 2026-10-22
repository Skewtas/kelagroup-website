// Mina uppgifter – manuella och automatiskt skapade uppgifter (t.ex. offertuppföljning).
import { html, ico, setHTML, $, $$, date, empty, modal, formData, showErrors, withBusy, toast, today } from '../lib/ui.js';
import { get, post, patch, qs } from '../lib/api.js';
import { users } from './forms.js';

export default async function tasks(view, p, app) {
  app.setCrumbs([{ label: 'Mina uppgifter' }]);
  const state = { mine: '1', status: 'open' };
  const w = app.can('tasks:write');
  setHTML(view, html`<div class="page-h"><div><h1>Uppgifter</h1><div class="sub">Det som behöver göras – sorterat efter förfallodatum</div></div>
    <div class="act">${w ? html`<button class="btn primary" id="new">${ico('plus')} Ny uppgift</button>` : ''}</div></div>
    <div class="filters"><div class="seg" id="who"><button type="button" data-v="1" class="on">Mina</button><button type="button" data-v="">Alla</button></div>
      <div class="seg" id="st"><button type="button" data-v="open" class="on">Öppna</button><button type="button" data-v="done">Klara</button></div></div>
    <div class="card" id="list"></div>`);
  async function load() {
    const r = await get('/tasks' + qs({ mine: state.mine, status: state.status }));
    const t0 = today();
    const groups = state.status === 'done' ? [['Klara', r.tasks]] : [
      ['Försenade', r.tasks.filter((t) => t.due_date && t.due_date < t0)], ['Idag', r.tasks.filter((t) => t.due_date === t0)],
      ['Kommande', r.tasks.filter((t) => t.due_date && t.due_date > t0)], ['Utan datum', r.tasks.filter((t) => !t.due_date)]].filter(([, l]) => l.length);
    setHTML($('#list'), r.tasks.length ? html`${groups.map(([g, l]) => html`<div class="card-h"><h3>${g}</h3><span class="faint small">${l.length}</span></div><div class="list mt8">${l.map((t) => html`<div class="li">
        <input type="checkbox" class="chkbox" data-id="${t.id}" ${t.status === 'done' ? 'checked' : ''} ${w ? '' : 'disabled'} aria-label="Markera klar">
        <a class="li-b" href="${t.quote_id ? '#/offerter/' + t.quote_id : t.customer_id ? '#/kunder/' + t.customer_id : '#/uppgifter'}"><div class="li-t">${t.title}</div>
          <div class="li-s">${[t.customer_name, t.quote_number ? 'Offert #' + t.quote_number : null, state.mine ? null : t.assignee_name, t.source_key ? 'Automatisk' : null].filter(Boolean).join(' · ') || '–'}</div></a>
        <span class="li-r ${g === 'Försenade' ? 'err' : ''}">${t.due_date ? date(t.due_date, { day: 'numeric', month: 'short' }) : ''}</span></div>`)}</div>`)}`
      : empty({ icon: 'checkCircle', title: state.status === 'done' ? 'Inga klara uppgifter' : 'Inga öppna uppgifter', text: 'Uppgifter skapas manuellt eller automatiskt – till exempel uppföljning tre dagar efter att en offert skickats.' }));
    $$('[data-id]', $('#list')).forEach((cb) => cb.addEventListener('change', async () => {
      await patch(`/tasks/${cb.dataset.id}`, { status: cb.checked ? 'done' : 'open' }); toast(cb.checked ? 'Klar!' : 'Öppnad igen'); load(); app.refreshCounts();
    }));
  }
  const seg = (id, key) => $$(`#${id} button`).forEach((b) => b.addEventListener('click', () => { state[key] = b.dataset.v; $$(`#${id} button`).forEach((x) => x.classList.toggle('on', x === b)); load(); }));
  seg('who', 'mine'); seg('st', 'status');
  $('#new')?.addEventListener('click', async () => {
    const us = await users();
    modal({ title: 'Ny uppgift', body: html`<div class="form"><label class="field"><span>Uppgift</span><input class="in" name="title" required autofocus></label>
      <div class="fr"><label class="field"><span>Förfaller</span><input class="in" type="date" name="due_date" value="${today()}"></label>
      <label class="field"><span>Ansvarig</span><select class="sel" name="assignee_user_id">${us.map((u) => html`<option value="${u.id}" ${u.id === app.me.user.id ? 'selected' : ''}>${u.name}</option>`)}</select></label></div></div>`,
      footer: html`<button type="button" class="btn" data-close>Avbryt</button><button class="btn primary" type="submit">Skapa</button>`,
      onMount: (d, close) => d.querySelector('form').addEventListener('submit', async (e) => {
        e.preventDefault(); const f = e.currentTarget;
        await withBusy(f.querySelector('[type=submit]'), async () => { try { await post('/tasks', formData(f)); toast('Uppgiften är skapad'); close(); load(); } catch (err) { showErrors(f, err); } });
      }) });
  });
  await load();
}
