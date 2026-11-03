// Offertsidor – spårning: när kunden öppnar sidan, hur länge och hur långt den läses, vilka delar som visats och kundens val.
import { html, ico, setHTML, $, ago, dateTime, empty, copy, toast } from '../lib/ui.js';
import { get } from '../lib/api.js';

const NAMES = {
  adminpanel: 'Adminpanel', bokis: 'Bokis', chattis: 'Chattis', hub: 'Customer hub', kundportal: 'Kundportal', nyhetsbrev: 'Nyhetsbrev och sms',
  feedback: 'Kundfeedback', headof: 'Headof', personalapp: 'Personalapp', avtal: 'Avtalshantering', rekrytering: 'Rekrytering',
  content: 'Contentgenerator', seo: 'SEO och GEO', meta: 'Meta-annonser', influencer: 'Influencersamarbeten och adlinks',
  paminnelser: 'Automatiska påminnelser', inkasso: 'Inkassohantering',
};
const SECTION = { offert: 'Offertbladet', erbjudande: 'Referenskundserbjudandet', moduler: 'Modullistan', villkor: 'Installation och villkor', 'nasta-steg': 'Nästa steg' };
const CHOICE = { ja: ['Ja', 'green'], kanske: ['Kanske', 'amber'], nej: ['Nej', ''] };
const nm = (k) => NAMES[k] || k;
const dur = (s) => { s = Math.round(s || 0); if (s < 60) return `${s} s`; const m = Math.floor(s / 60); return m < 60 ? `${m} min ${s % 60 ? (s % 60) + ' s' : ''}`.trim() : `${Math.floor(m / 60)} h ${m % 60} min`; };
const pageUrl = (slug) => `${location.origin}/s/${slug}/`;

export default async function tracking(view, p, app) {
  if (p.id) return detail(view, p.id, app);
  app.setCrumbs([{ label: 'Offertsidor – spårning' }]);
  const d = await get('/sparning');
  setHTML(view, html`<div class="page-h"><div><h1>Offertsidor – spårning</h1><div class="sub">Se när kunden öppnar offerten, hur länge den läses och vad kunden väljer</div></div></div>
    <div class="card">${d.pages.length ? html`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Sida</th><th class="r">Besök</th><th class="r hide-sm">Total lästid</th><th class="r">Senast öppnad</th></tr></thead><tbody>
      ${d.pages.map((x) => html`<tr class="click" data-href="#/sparning/${x.id}"><td><div class="t-main">${x.customer_name || x.title}</div><div class="t-sub">${x.title}</div></td>
        <td class="r">${x.visits}</td><td class="r hide-sm">${dur(x.total_seconds)}</td><td class="r small nowrap">${x.last_seen_at ? ago(x.last_seen_at) : html`<span class="faint">Inte öppnad än</span>`}</td></tr>`)}
      </tbody></table></div>` : empty({ icon: 'eye', title: 'Inga offertsidor än', text: 'Offertsidor läggs in med en databasmigrering.' })}</div>`);
  view.querySelectorAll('tr[data-href]').forEach((tr) => tr.addEventListener('click', () => { location.hash = tr.dataset.href; }));
}

async function detail(view, id, app) {
  const d = await get('/sparning/' + id);
  const pg = d.page;
  app.setCrumbs([{ label: 'Offertsidor – spårning', href: '#/sparning' }, { label: pg.customer_name || pg.title }]);
  const visits = d.visits;
  const total = visits.reduce((s, v) => s + (v.active_seconds || 0), 0);
  const maxScroll = visits.reduce((m, v) => Math.max(m, v.max_scroll || 0), 0);
  const entries = Object.entries(pg.choices || {});
  const by = (c) => entries.filter(([, v]) => v === c).map(([k]) => nm(k));
  const kpi = (icon, label, value, sub) => html`<div class="kpi"><div class="kpi-l">${ico(icon)}${label}</div><div class="kpi-v">${value}</div><div class="kpi-s">${sub}</div></div>`;
  const evLine = (e) => {
    if (e.type === 'open') return ['eye', 'accent', `Öppnade offerten${e.data.device ? ' (' + e.data.device + ')' : ''}`];
    if (e.type === 'section') return ['layers', '', `Tittade på: ${SECTION[e.data.section] || e.data.section}`];
    if (e.type === 'choice') return ['checkCircle', 'green', Object.entries(e.data.changed || {}).map(([k, v]) => `${nm(k)}: ${v ? CHOICE[v]?.[0] || v : 'ångrade valet'}`).join(' · ')];
    if (e.type === 'all_yes') return ['check', 'green', 'Tryckte på "Ja på alla"'];
    if (e.type === 'clear') return ['x', '', 'Rensade sina val'];
    if (e.type === 'copy') return ['copy', 'accent', 'Kopierade sina val'];
    return ['activity', '', e.type];
  };
  setHTML(view, html`<div class="page-h"><div><h1>${pg.customer_name || pg.title}</h1><div class="sub">${pg.title}</div></div>
      <div class="act"><button class="btn" id="cp">${ico('copy')} Kopiera länk</button><a class="btn" href="${pageUrl(pg.slug)}" target="_blank" rel="noopener">${ico('external')} Öppna sidan</a></div></div>
    <div class="notice mb16">${ico('info')}<div>Dina egna besök räknas också. Öppna helst sidan i ett privat fönster om du bara vill titta, eller håll koll på tiden för dina egna besök.</div></div>
    <div class="kpis">
      ${kpi('eye', 'Besök', visits.length, visits.length ? `Först ${dateTime(visits[visits.length - 1].started_at)}` : 'Inte öppnad än')}
      ${kpi('clock', 'Total lästid', dur(total), 'Tid som sidan varit synlig')}
      ${kpi('arrowDown', 'Längst ner', `${maxScroll} %`, 'Hur långt kunden scrollat')}
      ${kpi('checkCircle', 'Val', `${by('ja').length} ja`, `${by('kanske').length} kanske · ${by('nej').length} nej`)}
    </div>
    <div class="grid g2">
      <div class="card"><div class="card-h"><h2>Kundens val</h2><div class="act small faint">${pg.choices_updated_at ? 'Ändrat ' + ago(pg.choices_updated_at) : ''}</div></div><div class="card-b">
        ${entries.length ? ['ja', 'kanske', 'nej'].map((c) => by(c).length ? html`<div class="mb12"><div class="small faint mb4">${CHOICE[c][0]}</div><div class="pill-row">${by(c).map((n) => html`<span class="badge ${CHOICE[c][1]}">${n}</span>`)}</div></div>` : '')
          : html`<p class="faint">Kunden har inte valt något än.</p>`}
      </div></div>
      <div class="card"><div class="card-h"><h2>Besök</h2></div><div class="card-b">
        ${visits.length ? html`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Öppnad</th><th class="r">Lästid</th><th class="r">Scroll</th><th class="hide-sm">Enhet</th></tr></thead><tbody>
          ${visits.map((v) => html`<tr title="${v.sections.map((s) => SECTION[s] || s).join(', ')}"><td class="small nowrap">${dateTime(v.started_at)}</td><td class="r">${dur(v.active_seconds)}</td><td class="r">${v.max_scroll} %</td><td class="hide-sm small">${v.device || '–'}</td></tr>`)}
          </tbody></table></div>` : html`<p class="faint">Inga besök än.</p>`}
      </div></div>
    </div>
    <div class="card mt16"><div class="card-h"><h2>Händelser</h2></div><div class="card-b">
      ${d.events.length ? html`<div class="timeline">${d.events.map((e) => { const [i, c, t] = evLine(e); return html`<div class="tl"><span class="tl-dot ${c}">${ico(i)}</span><div class="tl-b"><div class="tl-t">${t}</div><div class="tl-m">${dateTime(e.created_at)}</div></div></div>`; })}</div>`
        : html`<p class="faint">Inga händelser än.</p>`}
    </div></div>`);
  $('#cp').addEventListener('click', () => { copy(pageUrl(pg.slug)); toast('Länken är kopierad'); });
}
