// Projektsida – Kanban, lista, tidslinje och översikt. Uppgifter kan flyttas, bockas av och läggas till.
import { html, ico, setHTML, $, $$, money, date, dateTime, empty, modal, formData, showErrors, withBusy, toast, initials, applyVars, today } from '../lib/ui.js';
import { get, post, patch } from '../lib/api.js';
import { PROJECT_STATUS } from './projects.js';
import { users } from './forms.js';
import { parseMoney, moneyInput } from '../lib/calc.js';

const STAGES = [['todo', 'Att göra'], ['doing', 'Pågår'], ['review', 'Granskning / väntar'], ['done', 'Klart']];

export default async function project(view, p, app) {
  const tab = p.tab || 'kanban';
  const r = await get(`/projects/${p.id}`);
  const pr = r.project; const tasks = r.tasks;
  const w = app.can('projects:write'), tw = app.can('tasks:write');
  const reload = () => project(view, p, app);
  app.setCrumbs([{ label: 'Projekt', href: '#/projekt' }, { label: pr.name }]);
  view.classList.add('wide');
  const done = tasks.filter((t) => t.status === 'done').length;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  const t0 = today();
  const late = tasks.filter((t) => t.status !== 'done' && t.due_date && t.due_date < t0).length;

  setHTML(view, html`
    <div class="dhead"><div class="logo-box">${ico('folder', 'lg')}</div>
      <div><h1>${pr.name} <span class="tag">P${pr.number}</span></h1>
        <div class="meta"><span>${ico('building')}<a href="#/kunder/${r.customer.id}">${r.customer.name}</a></span>
          ${r.quote ? html`<span>${ico('file')}<a href="#/offerter/${r.quote.id}">Offert #${r.quote.number}</a></span>` : ''}
          <span>${ico('calendar')}${date(pr.start_date)} – ${date(pr.due_date)}</span>${pr.owner ? html`<span>${ico('user')}${pr.owner.name}</span>` : ''}</div></div>
      <div class="act">${w ? html`<select class="sel" id="status" aria-label="Projektstatus">${Object.entries(PROJECT_STATUS).map(([k, [l]]) => html`<option value="${k}" ${k === pr.status ? 'selected' : ''}>${l}</option>`)}</select>
        <button class="btn" id="edit">${ico('edit')} Redigera</button><button class="btn primary" id="add">${ico('plus')} Uppgift</button>` : ''}</div></div>
    <div class="kpis">
      <div class="kpi"><div class="kpi-l">${ico('checkSquare')}Framsteg</div><div class="kpi-v">${pct} %</div><div class="pbar"><i data-p="${pct}"></i></div><div class="kpi-s">${done} av ${tasks.length} uppgifter klara</div></div>
      <div class="kpi ${late ? 'alert' : ''}"><div class="kpi-l">${ico('clock')}Försenade uppgifter</div><div class="kpi-v">${late}</div><div class="kpi-s">${pr.due_date ? `Deadline ${date(pr.due_date)}` : 'Ingen deadline'}</div></div>
      <div class="kpi"><div class="kpi-l">${ico('history')}Tid</div><div class="kpi-v">${pr.actual_hours || 0} h</div><div class="kpi-s">${pr.estimated_hours ? `av beräknade ${pr.estimated_hours} h` : 'Ingen tidsuppskattning'}</div></div>
      <div class="kpi"><div class="kpi-l">${ico('coins')}Budget</div><div class="kpi-v">${pr.budget_minor != null ? money(pr.budget_minor) : '–'}</div><div class="kpi-s">intern budget exkl. moms</div></div>
    </div>
    <div class="tabs">${[['kanban', 'Kanban'], ['lista', 'Lista'], ['tidslinje', 'Tidslinje'], ['oversikt', 'Översikt']].map(([k, l]) => html`<a href="#/projekt/${pr.id}/${k}" class="${tab === k ? 'on' : ''}">${l}</a>`)}</div>
    <div id="tab"></div>`);
  applyVars(view);
  const tabEl = $('#tab');
  const taskLabel = (t) => html`${t.milestone ? html`<span class="ms" title="Milstolpe">◆</span> ` : ''}${t.title}`;
  const dueTag = (t) => t.due_date ? html`<span class="${t.status !== 'done' && t.due_date < t0 ? 'err' : 'faint'}">${date(t.due_date, { day: 'numeric', month: 'short' })}</span>` : '';

  if (tab === 'kanban') {
    setHTML(tabEl, html`<div class="board board4">${STAGES.map(([k, l]) => {
      const ts = tasks.filter((t) => (t.stage || (t.status === 'done' ? 'done' : 'todo')) === k);
      return html`<section class="col" data-stage="${k === 'done' ? 'won' : k === 'doing' ? 'meeting' : k === 'review' ? 'negotiation' : 'new'}"><div class="col-h"><span class="dot"></span><h3>${l}</h3><span class="n">${ts.length}</span></div>
        <div class="col-b" data-drop="${k}">${ts.map((t) => html`<div class="dcard" draggable="${tw}" data-id="${t.id}">
          <div class="dcard-t">${taskLabel(t)}</div>${t.description ? html`<div class="dcard-c">${t.description.slice(0, 90)}</div>` : ''}
          <div class="dcard-f">${dueTag(t)}${t.assignee_name ? html`<span class="av sm" title="${t.assignee_name}">${initials(t.assignee_name)}</span>` : ''}</div></div>`)}</div></section>`;
    })}</div>`);
    if (tw) {
      let dragId = null;
      $$('.dcard', tabEl).forEach((c) => {
        c.addEventListener('dragstart', (e) => { dragId = c.dataset.id; c.classList.add('drag'); e.dataTransfer.setData('text/plain', dragId); });
        c.addEventListener('dragend', () => c.classList.remove('drag'));
        c.addEventListener('click', () => taskDialog(tasks.find((t) => t.id === c.dataset.id)));
      });
      $$('[data-drop]', tabEl).forEach((col) => {
        col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('over'); });
        col.addEventListener('dragleave', () => col.classList.remove('over'));
        col.addEventListener('drop', async (e) => {
          e.preventDefault(); col.classList.remove('over');
          const id = dragId || e.dataTransfer.getData('text/plain'); const t = tasks.find((x) => x.id === id);
          if (!t || t.stage === col.dataset.drop) return;
          try { await patch(`/tasks/${id}`, { stage: col.dataset.drop }); reload(); } catch (err) { toast(err.message, 'err'); }
        });
      });
    }
  } else if (tab === 'lista') {
    setHTML(tabEl, html`<div class="card">${tasks.length ? html`<div class="list">${tasks.map((t) => html`<div class="li">
        <input type="checkbox" class="chkbox" data-done="${t.id}" ${t.status === 'done' ? 'checked' : ''} ${tw ? '' : 'disabled'} aria-label="Klar">
        <span class="li-b click" data-open="${t.id}"><div class="li-t ${t.status === 'done' ? 'faint' : ''}">${taskLabel(t)}</div><div class="li-s">${STAGES.find(([k]) => k === t.stage)?.[1] || ''}${t.assignee_name ? ' · ' + t.assignee_name : ''}${t.estimated_hours ? ` · ${t.estimated_hours} h` : ''}</div></span>
        <span class="li-r">${dueTag(t)}</span></div>`)}</div>` : empty({ icon: 'listChecks', title: 'Inga uppgifter', text: 'Lägg till uppgifter eller skapa projektet från en mall.' })}</div>`);
    $$('[data-done]', tabEl).forEach((cb) => cb.addEventListener('change', async () => { await patch(`/tasks/${cb.dataset.done}`, { status: cb.checked ? 'done' : 'open' }); toast(cb.checked ? 'Klar!' : 'Öppnad igen'); reload(); }));
    $$('[data-open]', tabEl).forEach((el) => el.addEventListener('click', () => taskDialog(tasks.find((t) => t.id === el.dataset.open))));
  } else if (tab === 'tidslinje') {
    const s0 = Date.parse(pr.start_date || pr.created_at.slice(0, 10)); const dates = tasks.map((t) => t.due_date).filter(Boolean).map(Date.parse);
    const end = Math.max(Date.parse(pr.due_date || t0), ...dates, s0 + 86400000);
    const span = end - s0; const pos = (d) => Math.max(0, Math.min(100, ((Date.parse(d) - s0) / span) * 100));
    const months = []; for (let d = new Date(s0); d.getTime() <= end; d.setDate(d.getDate() + 7)) months.push(new Date(d));
    const sorted = [...tasks].sort((a, b) => (a.due_date || '9').localeCompare(b.due_date || '9'));
    setHTML(tabEl, html`<div class="card"><div class="card-b"><div class="gantt">
      <div class="g-head"><span></span><div class="g-scale">${months.map((m) => html`<span data-l="${pos(m.toISOString().slice(0, 10))}">v.${weekNo(m)}</span>`)}<i class="g-today" data-l="${pos(t0)}"></i></div></div>
      ${sorted.map((t, i) => { const prev = i ? sorted[i - 1].due_date : pr.start_date; const a = pos(prev || pr.start_date || t0), b = t.due_date ? pos(t.due_date) : a;
        return html`<div class="g-row"><span class="g-lbl ${t.status === 'done' ? 'faint' : ''}">${taskLabel(t)}</span><div class="g-track">${t.milestone
          ? html`<i class="g-ms ${t.status === 'done' ? 'done' : ''}" data-l="${b}"></i>` : html`<i class="g-bar ${t.status === 'done' ? 'done' : t.due_date && t.due_date < t0 ? 'late' : ''}" data-l="${a}" data-w="${Math.max(1.5, b - a)}"></i>`}</div></div>`; })}
    </div><p class="small faint mt12">Staplarna visar perioden fram till varje uppgifts deadline. ◆ = milstolpe. Linjen visar idag.</p></div></div>`);
    $$('[data-l]', tabEl).forEach((el) => el.style.left = el.dataset.l + '%');
    applyVars(tabEl);
  } else {
    const ms = tasks.filter((t) => t.milestone);
    setHTML(tabEl, html`<div class="split"><div class="stack">
      <section class="card"><div class="card-h"><h3>Om projektet</h3></div><div class="card-b"><dl class="dl">
        <dt>Status</dt><dd><span class="badge ${PROJECT_STATUS[pr.status][1]}">${PROJECT_STATUS[pr.status][0]}</span></dd><dt>Mall</dt><dd>${r.templates[pr.template_key] || 'Ingen'}</dd>
        <dt>Kund</dt><dd><a href="#/kunder/${r.customer.id}">${r.customer.name}</a></dd><dt>Offert</dt><dd>${r.quote ? html`<a href="#/offerter/${r.quote.id}">#${r.quote.number} ${r.quote.title}</a>` : '–'}</dd>
        <dt>Period</dt><dd>${date(pr.start_date)} – ${date(pr.due_date)}</dd>${pr.completed_at ? html`<dt>Klart</dt><dd>${date(pr.completed_at)}</dd>` : ''}
        <dt>Beskrivning</dt><dd class="pre">${pr.description || '–'}</dd></dl></div></section>
      <section class="card"><div class="card-h"><h3>Historik</h3></div><div class="card-b">${r.history.length ? html`<div class="timeline">${r.history.map((h) => html`<div class="tl"><span class="tl-dot">${ico('activity')}</span><div class="tl-b"><div class="tl-t">${h.summary}</div><div class="tl-m">${h.actor_name || 'System'} · ${dateTime(h.created_at)}</div></div></div>`)}</div>` : html`<p class="muted small">Ingen historik ännu.</p>`}</div></section>
    </div><div class="stack">
      <section class="card"><div class="card-h"><h3>Milstolpar</h3></div><div class="card-b">${ms.length ? html`<div class="list">${ms.map((t) => html`<div class="li"><span class="li-ico ${t.status === 'done' ? 'green' : 'accent'}">${ico(t.status === 'done' ? 'checkCircle' : 'flag')}</span><span class="li-b"><div class="li-t">${t.title}</div><div class="li-s">${t.due_date ? date(t.due_date) : 'Inget datum'}</div></span></div>`)}</div>` : html`<p class="muted small">Inga milstolpar.</p>`}</div></section>
      <section class="card"><div class="card-h"><h3>Kommer i nästa steg</h3></div><div class="card-b"><ul class="small muted"><li>Filer och designförslag (Cloudflare R2)</li><li>Kundens feedback och godkännande av milstolpar via kundportalen</li><li>Tidrapportering per uppgift</li></ul></div></section>
    </div></div>`);
  }

  // ---------- Åtgärder ----------
  $('#status')?.addEventListener('change', async (e) => { try { await patch(`/projects/${pr.id}`, { status: e.target.value }); toast('Status uppdaterad'); reload(); } catch (err) { toast(err.message, 'err'); } });
  $('#add')?.addEventListener('click', () => taskDialog(null));
  $('#edit')?.addEventListener('click', async () => {
    const us = await users();
    modal({ drawer: true, title: 'Redigera projekt', body: html`<div class="form">
      <label class="field"><span>Namn</span><input class="in" name="name" value="${pr.name}" required></label>
      <div class="fr"><label class="field"><span>Start</span><input class="in" type="date" name="start_date" value="${pr.start_date || ''}"></label><label class="field"><span>Deadline</span><input class="in" type="date" name="due_date" value="${pr.due_date || ''}"></label></div>
      <label class="field"><span>Ansvarig</span><select class="sel" name="owner_user_id">${us.map((u) => html`<option value="${u.id}" ${u.id === pr.owner_user_id ? 'selected' : ''}>${u.name}</option>`)}</select></label>
      <div class="fr3"><label class="field"><span>Budget</span><div class="in-wrap"><input class="in r has-suf" name="budget_minor" value="${moneyInput(pr.budget_minor)}" inputmode="decimal"><span class="in-suf">kr</span></div></label>
        <label class="field"><span>Beräknad tid</span><div class="in-wrap"><input class="in r has-suf" name="estimated_hours" value="${pr.estimated_hours ?? ''}" inputmode="numeric"><span class="in-suf">h</span></div></label>
        <label class="field"><span>Faktisk tid</span><div class="in-wrap"><input class="in r has-suf" name="actual_hours" value="${pr.actual_hours ?? ''}" inputmode="decimal"><span class="in-suf">h</span></div></label></div>
      <label class="field"><span>Beskrivning</span><textarea class="ta tall" name="description">${pr.description || ''}</textarea></label></div>`,
      footer: html`<button type="button" class="btn" data-close>Avbryt</button><button class="btn primary" type="submit">Spara</button>`,
      onMount: (d, close) => d.querySelector('form').addEventListener('submit', async (e) => {
        e.preventDefault(); const f = e.currentTarget;
        await withBusy(f.querySelector('[type=submit]'), async () => {
          try {
            const o = formData(f); const b = parseMoney(o.budget_minor);
            if (Number.isNaN(b)) throw { details: { budget_minor: 'Ogiltigt belopp.' } };
            o.budget_minor = b; o.actual_hours = o.actual_hours === '' ? 0 : String(o.actual_hours).replace(',', '.'); if (o.estimated_hours === '') o.estimated_hours = null;
            await patch(`/projects/${pr.id}`, o); toast('Projektet är sparat'); close(); reload();
          } catch (err) { showErrors(f, err); }
        });
      }) });
  });

  async function taskDialog(t) {
    const us = await users();
    const ro = t ? !tw : !w;
    modal({ title: t ? 'Uppgift' : 'Ny uppgift', body: html`<div class="form">
      <label class="field"><span>Uppgift</span><input class="in" name="title" value="${t?.title || ''}" required ${ro ? 'disabled' : ''}></label>
      <div class="fr"><label class="field"><span>Deadline</span><input class="in" type="date" name="due_date" value="${t?.due_date || ''}" ${ro ? 'disabled' : ''}></label>
        <label class="field"><span>Ansvarig</span><select class="sel" name="assignee_user_id" ${ro ? 'disabled' : ''}>${us.map((u) => html`<option value="${u.id}" ${u.id === (t?.assignee_user_id || app.me.user.id) ? 'selected' : ''}>${u.name}</option>`)}</select></label></div>
      ${t ? html`<label class="field"><span>Steg</span><select class="sel" name="stage" ${ro ? 'disabled' : ''}>${STAGES.map(([k, l]) => html`<option value="${k}" ${k === t.stage ? 'selected' : ''}>${l}</option>`)}</select></label>` : ''}
      <label class="field"><span>Beskrivning</span><textarea class="ta" name="description" ${ro ? 'disabled' : ''}>${t?.description || ''}</textarea></label>
      <div class="fr"><label class="field"><span>Beräknad tid (h)</span><input class="in" name="estimated_hours" value="${t?.estimated_hours ?? ''}" inputmode="decimal" ${ro ? 'disabled' : ''}></label>
        <label class="chk mt24"><input type="checkbox" name="milestone" ${t?.milestone ? 'checked' : ''} ${ro ? 'disabled' : ''}> Milstolpe</label></div></div>`,
      footer: ro ? html`<button type="button" class="btn" data-close>Stäng</button>` : html`<button type="button" class="btn" data-close>Avbryt</button><button class="btn primary" type="submit">${t ? 'Spara' : 'Lägg till'}</button>`,
      onMount: (d, close) => d.querySelector('form').addEventListener('submit', async (e) => {
        e.preventDefault(); const f = e.currentTarget;
        await withBusy(f.querySelector('[type=submit]'), async () => {
          try {
            const o = formData(f); o.estimated_hours = o.estimated_hours === '' ? null : String(o.estimated_hours).replace(',', '.');
            if (t) await patch(`/tasks/${t.id}`, o); else await post(`/projects/${pr.id}/tasks`, o);
            toast('Sparat'); close(); reload();
          } catch (err) { showErrors(f, err); }
        });
      }) });
  }
}

function weekNo(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day);
  return Math.ceil(((t - new Date(Date.UTC(t.getUTCFullYear(), 0, 1))) / 86400000 + 1) / 7);
}
