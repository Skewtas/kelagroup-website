// Dashboard – KELA:s kontrollcentral. Alla siffror kommer från databasen; saknas data visas ett tomt läge.
import { html, ico, setHTML, money, ago, empty } from '../lib/ui.js';
import { get } from '../lib/api.js';

const FEED_ICON = (a) => /accepter/i.test(a.title) ? ['checkCircle', 'green'] : /öppnats/i.test(a.title) ? ['eye', 'blue'] : /avböj|förlor/i.test(a.title) ? ['xCircle', 'red']
  : /förfrågan|lead/i.test(a.title) ? ['inbox', 'accent'] : /offert/i.test(a.title) ? ['file', ''] : a.type === 'note' ? ['note', ''] : a.type === 'call' ? ['phone', ''] : a.type === 'meeting' ? ['users', ''] : ['activity', ''];
const TODO_ICON = { project: 'folder', task: 'checkSquare', lead: 'inbox', quote: 'file', deal: 'target', customer: 'building' };

function greeting(name) {
  const h = new Date().getHours();
  const g = h < 5 ? 'God natt' : h < 10 ? 'God morgon' : h < 17 ? 'Hej' : 'God kväll';
  return `${g}, ${String(name || '').split(' ')[0]}`;
}

function feedLink(a) {
  return a.quote_id ? `#/offerter/${a.quote_id}` : a.deal_id ? `#/affarer/${a.deal_id}` : a.customer_id ? `#/kunder/${a.customer_id}` : a.lead_id ? `#/leads/${a.lead_id}` : '#/';
}

export default async function dashboard(view, _p, app) {
  app.setCrumbs([{ label: 'Dashboard' }]);
  const d = await get('/dashboard');
  const k = d.kpis;
  const nothing = !d.feed.length && !(k.quotes?.outstanding) && !(k.deals?.active) && !(k.leads?.new_30d);

  const kpi = (href, icon, label, value, sub, cls = '') => html`<a class="kpi ${cls}" href="${href}"><div class="kpi-l">${ico(icon)}${label}</div><div class="kpi-v">${value}</div><div class="kpi-s">${sub}</div></a>`;
  const q = k.quotes, dl = k.deals, ld = k.leads, ts = k.tasks;

  setHTML(view, html`
    <div class="page-h"><div><h1>${greeting(app.me.user.name)}</h1><div class="sub">${new Date().toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' })} · här är läget i ${app.me.org?.name || 'företaget'}</div></div>
      <div class="act">${app.can('leads:write') ? html`<a class="btn" href="#/leads?ny=1">${ico('plus')} Lead</a>` : ''}${app.can('quotes:write') ? html`<a class="btn primary" href="#/offerter?ny=1">${ico('plus')} Ny offert</a>` : ''}</div></div>

    ${nothing ? html`<div class="hero-card"><div><h2>Välkommen till KELA OS</h2><p class="muted">Tre steg så är affärsgrunden igång.</p></div></div>
      <div class="onboard mb16">
        <a class="ob" href="#/tjanster"><span class="n">1</span><strong>Sätt era priser</strong><span class="muted small">Tjänstekatalogen är förifylld med namn – lägg in priser, moms och interna kostnader.</span></a>
        <a class="ob" href="#/kunder?ny=1"><span class="n">2</span><strong>Lägg upp första kunden</strong><span class="muted small">Företagsuppgifter, kontaktpersoner och ansvarig säljare.</span></a>
        <a class="ob" href="#/offerter?ny=1"><span class="n">3</span><strong>Skapa första offerten</strong><span class="muted small">Välj tjänster, förhandsgranska och dela via säker länk.</span></a>
      </div>` : ''}

    <div class="kpis">
      ${ld ? kpi('#/leads', 'inbox', 'Nya leads', ld.new_30d, ld.uncontacted ? `${ld.uncontacted} väntar på kontakt` : 'senaste 30 dagarna') : ''}
      ${dl ? kpi('#/affarer', 'target', 'Aktiva affärsmöjligheter', dl.active, dl.active ? `${money(dl.pipeline_value)} i pipeline · viktat ${money(dl.weighted_value)}` : 'Inga öppna affärer') : ''}
      ${q ? kpi('#/offerter?status=open', 'file', 'Utestående offerter', q.outstanding, q.outstanding ? `${money(q.outstanding_once_net)} engång${q.outstanding_monthly_net ? ` + ${money(q.outstanding_monthly_net)}/mån` : ''} exkl. moms` : 'Inga skickade offerter') : ''}
      ${q ? kpi('#/offerter?status=accepted', 'checkCircle', 'Accepterade offerter', q.accepted_30d, q.accepted_30d ? `${money(q.accepted_30d_once_net)} senaste 30 d` : 'senaste 30 dagarna') : ''}
      ${q ? kpi('#/offerter', 'percent', 'Konverteringsgrad', q.conversion_90d == null ? '–' : `${q.conversion_90d.toLocaleString('sv-SE')} %`, q.decided_90d ? `av ${q.decided_90d} avgjorda offerter (90 d)` : 'Ingen avgjord offert ännu') : ''}
      ${q ? kpi('#/offerter?status=accepted', 'coins', 'Vunnet ordervärde i månaden', money(q.won_this_month_once_net), q.won_this_month_monthly_net ? `+ ${money(q.won_this_month_monthly_net)}/mån · exkl. moms` : 'engångsbelopp exkl. moms') : ''}
      ${q ? kpi('#/offerter?status=accepted', 'repeat', 'Avtalad MRR', money(q.contracted_mrr_net), 'från accepterade offerter · ej fakturerat') : ''}
      ${ts ? kpi('#/uppgifter', 'clock', 'Försenade uppgifter', ts.overdue, `${ts.open} öppna totalt`, ts.overdue ? 'alert' : '') : ''}
    </div>
    <div class="kpis mini">
      ${k.projects ? kpi('#/projekt', 'folder', 'Aktiva projekt', k.projects.open, k.projects.late ? `${k.projects.late} försenade${k.projects.waiting_customer ? ` · ${k.projects.waiting_customer} väntar på kund` : ''}` : k.projects.waiting_customer ? `${k.projects.waiting_customer} väntar på kund` : 'enligt plan', k.projects.late ? 'alert' : '') : ''}
      ${[['receipt', 'Kommande fakturering', 'Kopplas mot Fortnox'], ['buoy', 'Supportärenden', 'Supportmodulen – fas 2']]
        .map(([i, l, s]) => html`<div class="kpi dim"><div class="kpi-l">${ico(i)}${l}</div><div class="kpi-v">Ej kopplat ännu</div><div class="kpi-s">${s}</div></div>`)}
    </div>

    <div class="split">
      <section class="card">
        <div class="card-h"><h2>Att göra</h2><span class="tag">Prioriterat</span><div class="act"><a class="btn ghost sm" href="#/uppgifter">Alla uppgifter</a></div></div>
        <div class="card-b flush mt8">
          ${d.todo.length ? html`<div class="list">${d.todo.map((t) => html`<a class="li" href="${t.link}">
              <span class="li-ico ${t.overdue ? 'red' : t.score >= 55 ? 'accent' : ''}">${ico(TODO_ICON[t.kind] || 'checkSquare')}</span>
              <span class="li-b"><div class="li-t">${t.title}</div><div class="li-s">${t.sub}</div></span>
              ${t.overdue ? html`<span class="badge red">Försenad</span>` : ''}${ico('chevRight', 'chev')}</a>`)}</div>`
            : empty({ icon: 'checkCircle', title: 'Allt är under kontroll', text: 'Inga leads, offerter eller uppgifter som behöver dig just nu.' })}
        </div>
      </section>
      <section class="card">
        <div class="card-h"><h2>Aktivitet</h2><div class="act"><a class="btn ghost sm" href="#/notiser">Visa alla</a></div></div>
        <div class="card-b">
          ${d.feed.length ? html`<div class="timeline">${d.feed.slice(0, 12).map((a) => { const [i, c] = FEED_ICON(a); return html`<a class="tl" href="${feedLink(a)}">
              <span class="tl-dot ${c}">${ico(i)}</span><span class="tl-b"><div class="tl-t">${a.title}</div><div class="tl-m">${a.customer_name ? a.customer_name + ' · ' : ''}${a.actor_name || (a.type === 'system' ? 'System' : '')} · ${ago(a.created_at)}</div></span></a>`; })}</div>`
            : empty({ icon: 'activity', title: 'Inget har hänt ännu', text: 'Här syns nya förfrågningar, öppnade och accepterade offerter, anteckningar och statusbyten.' })}
        </div>
      </section>
    </div>`);
}
