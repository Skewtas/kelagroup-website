// Kalender – månadsvy över uppgifter, offerters giltighet och affärers nästa steg.
import { html, ico, setHTML, $, today } from '../lib/ui.js';
import { get, qs } from '../lib/api.js';

const iso = (d) => d.toLocaleDateString('sv-SE');
export default async function calendar(view, _p, app) {
  app.setCrumbs([{ label: 'Kalender' }]);
  let cur = new Date(); cur.setDate(1);
  setHTML(view, html`<div class="page-h"><div><h1 id="mon"></h1><div class="sub">Uppgifter, offerter som går ut och planerade nästa steg</div></div>
    <div class="act"><button class="btn icon" id="prev" aria-label="Föregående månad">${ico('chevLeft')}</button><button class="btn" id="now">Idag</button><button class="btn icon" id="next" aria-label="Nästa månad">${ico('chevRight')}</button></div></div>
    <div class="flex wrap mb12 small"><span class="cal-e task">Uppgift</span><span class="cal-e quote">Offert går ut</span><span class="cal-e deal">Affär</span><span class="cal-e overdue">Försenad</span><span class="faint ml-auto">Möten och externa kalendrar kopplas in i en senare fas.</span></div>
    <div class="cal" id="cal"></div>`);
  async function draw() {
    $('#mon').textContent = cur.toLocaleDateString('sv-SE', { month: 'long', year: 'numeric' }).replace(/^./, (c) => c.toUpperCase());
    const start = new Date(cur); start.setDate(1 - ((cur.getDay() + 6) % 7));
    const end = new Date(start); end.setDate(start.getDate() + 41);
    const r = await get('/calendar' + qs({ from: iso(start), to: iso(end) }));
    const t0 = today();
    const days = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
    setHTML($('#cal'), html`${['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'].map((d) => html`<div class="cal-h">${d}</div>`)}
      ${days.map((d) => { const k = iso(d); const ev = r.events.filter((e) => e.date === k);
        return html`<div class="cal-d ${d.getMonth() !== cur.getMonth() ? 'out' : ''} ${k === t0 ? 'today' : ''}"><span class="cal-n">${d.getDate()}</span>
          ${ev.slice(0, 4).map((e) => html`<a class="cal-e ${e.kind} ${e.kind === 'task' && !e.done && k < t0 ? 'overdue' : ''}" href="${e.link}" title="${e.title}">${e.done ? '✓ ' : ''}${e.title}</a>`)}
          ${ev.length > 4 ? html`<span class="faint small">+${ev.length - 4} till</span>` : ''}</div>`; })}`);
  }
  $('#prev').addEventListener('click', () => { cur.setMonth(cur.getMonth() - 1); draw(); });
  $('#next').addEventListener('click', () => { cur.setMonth(cur.getMonth() + 1); draw(); });
  $('#now').addEventListener('click', () => { cur = new Date(); cur.setDate(1); draw(); });
  await draw();
}
