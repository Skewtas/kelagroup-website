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
        ${x.kind === 'checklista'
          ? html`<td class="r">${x.answers} svar</td><td class="r hide-sm faint">Checklista</td><td class="r small nowrap">${x.answers_updated_at ? ago(x.answers_updated_at) : html`<span class="faint">Inga svar än</span>`}</td>`
          : html`<td class="r">${x.visits}</td><td class="r hide-sm">${dur(x.total_seconds)}</td><td class="r small nowrap">${x.last_seen_at ? ago(x.last_seen_at) : html`<span class="faint">Inte öppnad än</span>`}</td>`}</tr>`)}
      </tbody></table></div>` : empty({ icon: 'eye', title: 'Inga offertsidor än', text: 'Offertsidor läggs in med en databasmigrering.' })}</div>`);
  view.querySelectorAll('tr[data-href]').forEach((tr) => tr.addEventListener('click', () => { location.hash = tr.dataset.href; }));
}

async function detail(view, id, app) {
  const d = await get('/sparning/' + id);
  const pg = d.page;
  if (pg.kind === 'checklista') return checklist(view, d, app);
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
    if (e.type === 'notified') return ['mail', '', 'Mejlnotis skickad till KELA'];
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

// Checklista: kundens svar per punkt, vem som skrev och när, plus historik.
function checklist(view, d, app) {
  const pg = d.page;
  app.setCrumbs([{ label: 'Offertsidor – spårning', href: '#/sparning' }, { label: pg.customer_name || pg.title }]);
  const answers = d.answers.filter((a) => a.text || a.done);
  const done = answers.filter((a) => a.done).length;
  const last = answers.reduce((m, a) => (a.updated_at > m ? a.updated_at : m), '');
  const people = [...new Set(answers.map((a) => a.updated_by).filter(Boolean))];
  const sections = [...new Set(answers.map((a) => a.section || 'Övrigt'))];
  const kpi = (icon, label, value, sub) => html`<div class="kpi"><div class="kpi-l">${ico(icon)}${label}</div><div class="kpi-v">${value}</div><div class="kpi-s">${sub}</div></div>`;
  const asText = () => `${pg.customer_name || ''} – ${pg.title}\n\n` + sections.map((s) => `${s.toUpperCase()}\n` + answers.filter((a) => (a.section || 'Övrigt') === s)
    .map((a) => `${a.done ? '[x]' : '[ ]'} ${a.label || a.item_key}${a.text ? '\n    ' + a.text.replace(/\n/g, '\n    ') : ''}`).join('\n')).join('\n\n');
  setHTML(view, html`<div class="page-h"><div><h1>${pg.customer_name || pg.title}</h1><div class="sub">${pg.title}</div></div>
      <div class="act"><button class="btn" id="cp-all">${ico('copy')} Kopiera alla svar</button><button class="btn" id="cp">${ico('copy')} Kopiera länk</button><a class="btn" href="${pageUrl(pg.slug)}" target="_blank" rel="noopener">${ico('external')} Öppna sidan</a></div></div>
    <div class="notice mb16">${ico('info')}<div>Kunden fyller i utan konto. Alla som har länken kan läsa och skriva, och namnet skriver de in själva. Det du skriver på sidan sparas här också.</div></div>
    <div class="kpis">
      ${kpi('edit', 'Ifyllda punkter', answers.length, 'Med svar eller bock')}
      ${kpi('checkCircle', 'Klara', done, 'Bockade som klara')}
      ${kpi('clock', 'Senast ändrat', last ? ago(last) : '–', last ? dateTime(last) : 'Inga svar än')}
      ${kpi('users', 'Har skrivit', people.length, people.join(', ') || 'Ingen än')}
    </div>
    ${answers.length ? sections.map((s) => html`<div class="card mt16"><div class="card-h"><h2>${s}</h2></div><div class="card-b"><div class="timeline">
      ${answers.filter((a) => (a.section || 'Övrigt') === s).map((a) => html`<div class="tl"><span class="tl-dot ${a.done ? 'green' : ''}">${ico(a.done ? 'checkCircle' : 'edit')}</span><div class="tl-b">
        <div class="tl-t">${a.label || a.item_key} ${a.done ? html`<span class="badge green">Klar</span>` : ''}</div>
        <div class="tl-m">${a.updated_by || 'Okänd'} · ${dateTime(a.updated_at)}</div>
        ${a.text ? html`<div class="tl-body">${a.text}</div>` : ''}</div></div>`)}
    </div></div></div>`) : html`<div class="card mt16">${empty({ icon: 'edit', title: 'Inga svar än', text: 'Svaren dyker upp här när kunden börjar skriva.' })}</div>`}
    ${d.history.length ? html`<div class="card mt16"><div class="card-h"><h2>Historik</h2><div class="act small faint">${d.history.length} sparade versioner</div></div><div class="card-b"><div class="timeline">
      ${d.history.slice(0, 200).map((h) => { const a = d.answers.find((x) => x.item_key === h.item_key); return html`<div class="tl"><span class="tl-dot">${ico('clock')}</span><div class="tl-b">
        <div class="tl-t">${a?.label || h.item_key}${h.done ? ' · klar' : ''}</div><div class="tl-m">${h.updated_by || 'Okänd'} · ${dateTime(h.updated_at)}</div>
        ${h.text ? html`<div class="tl-body">${h.text}</div>` : ''}</div></div>`; })}
    </div></div></div>` : ''}`);
  $('#cp').addEventListener('click', () => { copy(pageUrl(pg.slug)); toast('Länken är kopierad'); });
  $('#cp-all').addEventListener('click', () => copy(asText()));
}
