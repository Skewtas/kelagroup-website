// KELA AI – rich-komponenter. Rendering sker ENBART från validerade props med textContent – aldrig HTML från AI:n.
// Varje komponent: render(props, ctx) → HTMLElement. ctx: { send, event, lead, cfg, wide, append, scroll, demo }.

export const ICONS = {
  spark: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  diamond: '<path d="M12 2l9 10-9 10-9-10z"/><path d="M3 12h18M12 2v20" opacity=".45"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/><path d="M8 14h3v3H8z"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.4A8 8 0 1 1 21 12z"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  flow: '<rect x="3" y="3" width="7" height="6" rx="2"/><rect x="14" y="15" width="7" height="6" rx="2"/><path d="M6.5 9v4a2 2 0 0 0 2 2H14"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 3 2.5 15 0 18M12 3c-2.5 3-2.5 15 0 18"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  phone: '<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/>',
  plug: '<path d="M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0zM12 18v4"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  mega: '<path d="M3 11v3a1 1 0 0 0 1 1h3l6 4V6L7 10H4a1 1 0 0 0-1 1z"/><path d="M17 8a5 5 0 0 1 0 8"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  gauge: '<path d="M4 18a9 9 0 1 1 16 0"/><path d="M12 13l4-4"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>',
  bot: '<rect x="4" y="8" width="16" height="12" rx="4"/><path d="M12 4v4M9 14h.01M15 14h.01"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 7l9 6 9-6"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="3"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/>',
  send: '<path d="M21 3L10 14M21 3l-7 18-4-7-7-4z"/>',
  trigger: '<path d="M4 4h16v12H8l-4 4z"/>',
  ai: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  db: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  act: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  human: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  notify: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  log: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
};
export const svg = (name, w = 18) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.spark}</svg>`;

/** Minimal hyperscript. Barn som är strängar blir textnoder (säkert). */
export function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v; // endast för egna, statiska SVG-ikoner
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'style') e.style.cssText = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(3)) if (k != null && k !== false) e.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return e;
}
const orbEl = (cls = 'kai-av') => h('span', { class: cls, 'aria-hidden': 'true' }, h('span', { class: 'kai-o' }, h('i'), h('i')));
export { orbEl };
const checkSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DAYS = ['sön', 'mån', 'tis', 'ons', 'tors', 'fre', 'lör'];
const MONTHS = ['jan', 'feb', 'mars', 'apr', 'maj', 'juni', 'juli', 'aug', 'sep', 'okt', 'nov', 'dec'];
const fmtDay = (d) => `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
function nextWeekdays(n, from = new Date()) {
  const out = []; const d = new Date(from); d.setHours(12, 0, 0, 0);
  while (out.length < n) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0 && d.getDay() !== 6) out.push(new Date(d)); }
  return out;
}
// Deterministisk "slump" så att demotider ser naturliga ut men är stabila.
const seeded = (s) => { let x = 7; for (const c of s) x = (Math.imul(x, 31) + c.charCodeAt(0)) >>> 0; return () => ((x = (Math.imul(x, 1103515245) + 12345) >>> 0) / 4294967296); };

// ---------- Tjänstekort ----------
const CARDS = {
  hemsida: ['globe', 'Hemsidor & e-handel', 'Snabba, handkodade sajter som syns på Google och säljer.', '/bygga-hemsida'],
  system: ['grid', 'System & portaler', 'Affärssystem, CRM och portaler byggda kring hur ni jobbar.', '/bygga-system'],
  bokning: ['calendar', 'Bokningssystem', 'Bokning i realtid, påminnelser och självservice.', '/bokningssystem'],
  automation: ['bolt', 'Automationer', 'Offerter, fakturor och uppföljning som sköter sig själva.', '/bygga-automationer'],
  ai: ['bot', 'AI-agenter & chatt', 'AI som svarar, bokar och agerar – kopplad till era system.', '/ai-agenter'],
  app: ['phone', 'Appar för iOS & Android', 'Native appar i App Store och Google Play.', '/bygga-app'],
  integration: ['plug', 'Integrationer', 'Fortnox, Visma, Timewave, Shopify – allt med API.', '/integrationer'],
  seo_geo: ['search', 'SEO & GEO', 'Syns på Google – och citeras av ChatGPT och AI-sök.', '/geo-optimering'],
  marknad: ['mega', 'Marknadsföring', 'Meta-annonser, Google Ads, content och nyhetsbrev.', '/marknadsforing'],
  bokis: ['calendar', 'Bokis', 'Bokningssystemet för städbolag – pris, restid, schema.', '/produkter/bokis'],
  chattis: ['chat', 'Chattis', 'AI-chatten som bokar om, avbokar och svarar på fakturafrågor.', '/produkter/chattis'],
  feedis: ['star', 'Feedis', 'Sms-betyg efter varje uppdrag – och fler recensioner.', '/produkter/feedis'],
  paminnis: ['bell', 'Påminnis', 'Automatiska påminnelser om obetalda fakturor.', '/produkter/paminnis'],
  headof: ['gauge', 'Headof', 'Hela verksamheten live i en dashboard.', '/produkter/headof'],
  personalapp: ['users', 'Personalapp', 'GPS-incheck, kvalitet och en AI-arbetsledare.', '/produkter/personalapp'],
  kundapp: ['phone', 'Kundapp', 'Kunden ser, ändrar och avbokar själv.', '/produkter/kundapp'],
  rekrytering: ['users', 'Rekryteringsverktyg', 'Från ansökan till första dagen.', '/produkter/rekryteringsverktyg'],
};
export function cards(p, ctx) {
  const items = (p.items || []).filter((k) => CARDS[k] || k === 'case_stodona').slice(0, 3);
  return h('div', { class: 'kai-cards' }, items.map((k) => {
    if (k === 'case_stodona') return h('a', { class: 'kai-svc case', href: '/case', onclick: () => ctx.event('demo_start', 'case') },
      h('span', { class: 'kai-ic', html: svg('star', 17) }), h('b', null, 'Kundcase: Stodona'), h('span', null, 'Städbolaget som kör hela verksamheten på Kelas system.'),
      h('div', { class: 'kai-stats' }, h('div', null, h('b', null, '≈ 565 000 kr'), 'lägre kostnad/år'), h('div', null, h('b', null, '4 → 1'), 'i administrationen'), h('div', null, h('b', null, '3'), 'heltidstjänster frigjorda')),
      h('em', null, 'Läs caset →'));
    const [ic, t, d, href] = CARDS[k];
    return h('a', { class: 'kai-svc', href }, h('span', { class: 'kai-ic', html: svg(ic, 17) }), h('b', null, t), h('span', null, d), h('em', null, 'Läs mer →'));
  }));
}

// ---------- Bokningsdemo ----------
const BOOK = {
  skonhet: { name: 'Demo-salongen', what: 'Behandling', list: [['Ansiktsbehandling', '60 min', '✨'], ['Fransförlängning', '90 min', '👁'], ['Manikyr', '45 min', '💅'], ['Brynlyft', '45 min', '🌿']], staff: ['Ella', 'Noor', 'Sam'], role: 'behandlare' },
  frisor: { name: 'Demo-frisören', what: 'Behandling', list: [['Klippning', '45 min', '✂️'], ['Färgning', '2 h', '🎨'], ['Slingor', '2,5 h', '🌟'], ['Skägg', '30 min', '🪒']], staff: ['Ali', 'Mira', 'Jon'], role: 'stylist' },
  stad: { name: 'Demo-städ (Bokis)', what: 'Tjänst', list: [['Hemstädning', '3 h · varannan vecka', '🏠'], ['Storstädning', '6 h', '🧽'], ['Fönsterputs', '2 h', '🪟'], ['Flyttstädning', 'räknas på m²', '📦']], staff: ['Team Söder', 'Team City', 'Team Väst'], role: 'team', extra: 'Tillval: ugn & kyl' },
  halsa: { name: 'Demo-kliniken', what: 'Behandling', list: [['Massage', '60 min', '💆'], ['Naprapati', '45 min', '🦴'], ['Personlig träning', '60 min', '🏋️'], ['Uppföljning', '30 min', '📋']], staff: ['Lina', 'Omar', 'Vera'], role: 'behandlare' },
  restaurang: { name: 'Demo-bistron', what: 'Sällskap', list: [['Bord för 2', 'middag', '🍷'], ['Bord för 4', 'middag', '🍽'], ['Bord för 6+', 'förfrågan', '🎉'], ['Avsmakningsmeny', '2,5 h', '⭐']], staff: ['Matsalen', 'Terrassen', 'Chambre séparée'], role: 'plats' },
  konsult: { name: 'Demo-byrån', what: 'Möte', list: [['Rådgivning', '30 min', '💬'], ['Strategimöte', '60 min', '🎯'], ['Workshop', '2 h', '🧠'], ['Uppföljning', '30 min', '📈']], staff: ['Maja', 'Erik', 'Första lediga'], role: 'konsult' },
  generell: { name: 'Demo-företaget', what: 'Tjänst', list: [['Konsultation', '30 min', '💬'], ['Möte', '60 min', '🤝'], ['Uppföljning', '30 min', '📈'], ['Service', '90 min', '🛠']], staff: ['Alex', 'Sam', 'Första lediga'], role: 'person' },
};
export function bookingDemo(p, ctx) {
  const d = BOOK[p.industry] || BOOK.generell;
  const biz = p.business_name || d.name;
  const st = { step: 0, svc: null, who: null, day: null, time: null };
  const bd = h('div', { class: 'kai-card-bd' });
  const steps = h('div', { class: 'kai-steps', 'aria-hidden': 'true' }, [0, 1, 2, 3].map(() => h('i')));
  const root = h('div', { class: 'kai-card' },
    h('div', { class: 'kai-card-hd' }, h('span', { class: 'kai-av', style: 'width:30px;height:30px', html: '' }), h('div', null, h('b', null, biz), h('small', null, 'Onlinebokning – byggd av Kela')), h('span', { class: 'kai-badge' }, 'Demo')),
    bd);
  root.querySelector('.kai-av').replaceWith(orbEl());
  const days = nextWeekdays(6);
  const rnd = seeded(p.industry + biz);
  const taken = new Set(days.flatMap((dd, i) => ['08:00', '09:30', '11:00', '13:00', '14:30', '16:00', '17:30', '19:00'].filter(() => rnd() < 0.3).slice(0, 3).map((t) => `${i}-${t}`)));
  ctx.event('demo_start', 'booking_demo');

  function paint() {
    [...steps.children].forEach((x, i) => x.classList.toggle('kai-on', i <= st.step));
    bd.replaceChildren(steps);
    if (st.step === 0) {
      bd.append(h('p', { class: 'kai-q' }, `Välj ${d.what.toLowerCase()}`), h('div', { class: 'kai-opts' }, d.list.map(([n, dur, em], i) =>
        h('button', { type: 'button', class: 'kai-opt', style: `animation-delay:${i * 50}ms`, onclick: () => { st.svc = n; st.step = 1; paint(); } }, h('span', { class: 'em', 'aria-hidden': 'true' }, em), h('span', { class: 'kai-ot' }, h('b', null, n), h('span', null, dur))))));
    } else if (st.step === 1) {
      bd.append(h('p', { class: 'kai-q' }, `Välj ${d.role}`), h('div', { class: 'kai-opts' }, d.staff.map((n, i) =>
        h('button', { type: 'button', class: 'kai-opt', style: `animation-delay:${i * 50}ms`, onclick: () => { st.who = n; st.step = 2; paint(); } }, h('span', { class: 'ini' }, n.split(' ').map((x) => x[0]).join('').slice(0, 2)), h('span', { class: 'kai-ot' }, h('b', null, n), h('span', null, i === 0 ? 'Mest ledig den här veckan' : i === 1 ? 'Populär hos stamkunder' : 'Ledig tid snart'))))),
      h('button', { type: 'button', class: 'kai-btn', style: 'margin-top:10px', onclick: () => { st.step = 0; paint(); } }, '← Tillbaka'));
    } else if (st.step === 2) {
      const di = st.day ?? 0;
      bd.append(h('p', { class: 'kai-q' }, 'Välj en ledig tid'),
        h('div', { class: 'kai-days', role: 'group', 'aria-label': 'Dag' }, days.map((dd, i) => h('button', { type: 'button', 'aria-pressed': String(i === di), onclick: () => { st.day = i; paint(); } }, h('small', null, DAYS[dd.getDay()]), h('b', null, dd.getDate())))),
        h('div', { class: 'kai-slots' }, ['08:00', '09:30', '11:00', '13:00', '14:30', '16:00', '17:30', '19:00'].map((t) => h('button', { type: 'button', disabled: taken.has(`${di}-${t}`) || null, 'aria-label': taken.has(`${di}-${t}`) ? `${t} upptagen` : t, onclick: () => { st.day = di; st.time = t; st.step = 3; paint(); } }, t))),
        h('button', { type: 'button', class: 'kai-btn', style: 'margin-top:10px', onclick: () => { st.step = 1; paint(); } }, '← Tillbaka'));
    } else if (st.step === 3) {
      bd.append(h('p', { class: 'kai-q' }, 'Bekräfta bokningen'),
        h('dl', { class: 'kai-summary' }, h('dt', null, d.what), h('dd', null, st.svc), h('dt', null, d.role[0].toUpperCase() + d.role.slice(1)), h('dd', null, st.who), h('dt', null, 'Tid'), h('dd', null, `${fmtDay(days[st.day])} kl ${st.time}`), d.extra ? [h('dt', null, 'Tillval'), h('dd', null, d.extra)] : null),
        h('div', { class: 'kai-btnrow' }, h('button', { type: 'button', class: 'kai-btn pri', onclick: () => { st.step = 4; paint(); ctx.event('demo_complete', 'booking_demo'); } }, 'Bekräfta demobokning'), h('button', { type: 'button', class: 'kai-btn', onclick: () => { st.step = 2; paint(); } }, 'Ändra tid')),
        h('p', { class: 'kai-note' }, 'Det här är en demo – ingen riktig bokning görs och inga uppgifter sparas.'));
    } else {
      const when = `${fmtDay(days[st.day])} kl ${st.time}`;
      const screen = h('div', { class: 'kai-screen' }, h('div', { class: 'from' }, biz));
      bd.append(h('div', { class: 'kai-success' },
        h('div', null, h('div', { class: 'kai-check', html: checkSvg }), h('p', { class: 'kai-q', style: 'margin:12px 0 4px' }, 'Bokad! (demo)'),
          h('ul', { class: 'kai-tl' },
            h('li', { style: 'animation-delay:.3s' }, h('i', null, '✓'), h('div', null, 'Bekräftelse skickad', h('span', null, 'Sms + mejl direkt'))),
            h('li', { style: 'animation-delay:.6s' }, h('i', null, '⏰'), h('div', null, 'Påminnelse 24 h innan', h('span', null, 'Färre uteblivna besök'))))),
        h('div', { class: 'kai-phone', 'aria-label': 'Exempel på bekräftelse-sms' }, screen)));
      (async () => {
        await sleep(500); screen.append(h('div', { class: 'kai-sms' }, `Hej! Din bokning är bekräftad: ${st.svc} med ${st.who}, ${when}. Avboka/ändra: länk i mejlet. /${biz}`));
        await sleep(1300); screen.append(h('div', { class: 'kai-sms me' }, 'Toppen, tack! 🙌'));
        await sleep(1300); screen.append(h('div', { class: 'kai-sms' }, `Påminnelse: imorgon kl ${st.time}. Svara NEJ för att avboka.`));
      })();
      bd.append(h('div', { class: 'kai-btnrow' },
        h('button', { type: 'button', class: 'kai-btn pri', onclick: () => ctx.send('Det här vill vi ha! Hur skulle det fungera hos oss?') }, 'Bygg det här för oss'),
        h('button', { type: 'button', class: 'kai-btn', onclick: () => { st.step = 0; st.day = null; paint(); } }, 'Testa igen')));
    }
    ctx.scroll();
  }
  paint();
  return root;
}

// ---------- Besparingskalkylator ----------
const TASK_LABEL = { mejl_kundtjanst: 'Mejl & kundtjänst', bokningar: 'Bokningar & ombokningar', fakturering: 'Fakturering & påminnelser', offerter: 'Offerter', schema_personal: 'Schema & personal', rapporter: 'Rapporter', dataregistrering: 'Dubbelregistrering', uppfoljning: 'Uppföljning' };
const TASK_SHARE = { mejl_kundtjanst: 50, bokningar: 60, fakturering: 55, offerter: 40, schema_personal: 35, rapporter: 65, dataregistrering: 70, uppfoljning: 50 };
export function savings(p, ctx) {
  const st = { emp: p.employees ?? '', hrs: p.admin_hours_week ?? '', tasks: new Set(p.tasks || []), share: {}, rate: 450, weeks: 46 };
  for (const k in TASK_SHARE) st.share[k] = TASK_SHARE[k];
  const bd = h('div', { class: 'kai-card-bd' });
  const root = h('div', { class: 'kai-card' }, h('div', { class: 'kai-card-hd' }, h('span', { html: svg('chart', 20), style: 'color:var(--k-wine)' }), h('div', null, h('b', null, 'Er potentiella tidsbesparing'), h('small', null, 'Baserat på era svar och redovisade antaganden'))), bd);
  const num = (v) => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };
  const fmt = (n, dec = 0) => n.toLocaleString('sv-SE', { maximumFractionDigits: dec, minimumFractionDigits: 0 });
  let resultEl = null; let counted = false; let shown = false;

  function share() {
    const ks = [...st.tasks]; if (!ks.length) return 40;
    return ks.reduce((a, k) => a + st.share[k], 0) / ks.length;
  }
  function calc() {
    const hrs = num(st.hrs) || 0; const s = share() / 100;
    const week = hrs * s; return { hrs, s, week, month: week * 4.33, year: week * st.weeks, value: week * st.weeks * st.rate };
  }
  function form() {
    const emp = h('input', { id: 'kai-emp', type: 'number', min: '1', inputmode: 'numeric', value: st.emp, placeholder: 't.ex. 8' });
    const hrs = h('input', { id: 'kai-hrs', type: 'number', min: '0', step: '0.5', inputmode: 'decimal', value: st.hrs, placeholder: 't.ex. 20' });
    const err = h('span', { class: 'err', role: 'alert' });
    return [
      h('div', { class: 'kai-form-grid' }, h('div', { class: 'kai-field' }, h('label', { for: 'kai-emp' }, 'Antal anställda'), emp), h('div', { class: 'kai-field' }, h('label', { for: 'kai-hrs' }, 'Timmar admin / vecka (totalt)'), hrs, err)),
      h('span', { class: 'kai-lbl' }, 'Vad tar mest tid?'),
      h('div', { class: 'kai-pills', role: 'group', 'aria-label': 'Arbetsuppgifter' }, Object.entries(TASK_LABEL).map(([k, l]) => h('button', { type: 'button', class: 'kai-pill', 'aria-pressed': String(st.tasks.has(k)), onclick: (e) => { st.tasks.has(k) ? st.tasks.delete(k) : st.tasks.add(k); e.currentTarget.setAttribute('aria-pressed', String(st.tasks.has(k))); if (resultEl) update(); } }, l))),
      h('button', { type: 'button', class: 'kai-btn pri', onclick: () => {
        st.emp = emp.value; st.hrs = hrs.value;
        if (!num(st.hrs) || num(st.hrs) <= 0) { err.textContent = 'Fyll i ungefär hur många timmar ni lägger.'; hrs.focus(); return; }
        err.textContent = ''; show(); ctx.event('savings_calc', 'calc');
      } }, shown ? 'Räkna om' : 'Räkna på det'),
    ];
  }
  function show() {
    shown = true;
    bd.replaceChildren(...form());
    const r = calc();
    const big = h('b', null, '0');
    const wk = h('b', null, '0'), mo = h('b', null, '0'), yr = h('b', null, '0');
    const barA = h('i'), barB = h('i');
    resultEl = h('div', { class: 'kai-result', 'aria-live': 'polite' },
      h('span', { class: 'kai-kick' }, 'Potentiell tidsbesparing'),
      h('div', { class: 'kai-big' }, big, h('span', null, 'timmar per vecka')),
      h('p', { style: 'margin:2px 0 10px;font-size:13px;color:rgba(255,255,255,.8)' }, '≈ ', mo, ' tim/månad · ', yr, ' tim/år'),
      h('div', { class: 'kai-bars' },
        h('div', { class: 'kai-bar' }, h('span', null, 'Admin i dag'), h('span', { class: 'tr' }, barA), h('span', null, `${fmt(r.hrs, 1)} h`)),
        h('div', { class: 'kai-bar after' }, h('span', null, 'Med automation'), h('span', { class: 'tr' }, barB), h('span', { class: 'after-v' }, `${fmt(r.hrs - r.week, 1)} h`))),
      h('p', { style: 'margin:10px 0 0;font-size:13px;color:rgba(255,255,255,.85)' }, `≈ ${fmt(Math.round(r.value / 1000) * 1000)} kr i frigjord arbetstid per år`),
    );
    const assume = h('details', { class: 'kai-assume' }, h('summary', null, 'Antaganden – ändra dem gärna'),
      h('ul', null,
        h('li', null, 'Tiden antas fördelas jämnt över de uppgifter ni valt.'),
        h('li', null, `Andel som realistiskt kan automatiseras per uppgift (försiktigt räknat):`)),
      ...(st.tasks.size ? [...st.tasks] : []).map((k) => {
        const out = h('output', null, `${st.share[k]}%`);
        return h('div', { class: 'kai-row' }, h('label', { for: `kai-s-${k}` }, TASK_LABEL[k]), h('input', { id: `kai-s-${k}`, type: 'range', min: '0', max: '90', step: '5', value: st.share[k], oninput: (e) => { st.share[k] = +e.target.value; out.textContent = `${st.share[k]}%`; update(); } }), out);
      }),
      st.tasks.size ? null : h('p', { style: 'margin:6px 0' }, 'Inga uppgifter valda – räknar med 40 % som försiktigt snitt.'),
      h('div', { class: 'kai-row' }, h('label', { for: 'kai-rate' }, 'Timkostnad inkl. sociala avgifter (kr)'), h('input', { id: 'kai-rate', type: 'number', min: '100', max: '3000', value: st.rate, oninput: (e) => { st.rate = Math.max(0, +e.target.value || 0); update(); } })),
      h('div', { class: 'kai-row' }, h('label', { for: 'kai-weeks' }, 'Arbetsveckor per år'), h('input', { id: 'kai-weeks', type: 'number', min: '30', max: '52', value: st.weeks, oninput: (e) => { st.weeks = Math.min(52, Math.max(1, +e.target.value || 46)); update(); } })),
      h('p', { style: 'margin:6px 0 0' }, '1 månad ≈ 4,33 veckor. Uppskattning – inget löfte. Exakta siffror tar vi fram i en kostnadsfri kartläggning.'));
    bd.append(resultEl, assume, h('div', { class: 'kai-btnrow' },
      h('button', { type: 'button', class: 'kai-btn pri', onclick: () => ctx.send('Visa hur det skulle kunna fungera i just vårt företag.') }, 'Visa hur det skulle fungera hos oss'),
      h('button', { type: 'button', class: 'kai-btn', onclick: () => ctx.send('Boka ett möte om det här.') }, 'Boka möte')));
    function paintNums(r, animate) {
      const set = () => { big.textContent = fmt(r.week, 1); wk.textContent = fmt(r.week, 1); mo.textContent = fmt(r.month); yr.textContent = fmt(r.year); };
      if (!animate || matchMedia('(prefers-reduced-motion: reduce)').matches) { set(); }
      else {
        const t0 = performance.now();
        const tick = (t) => { const k = Math.min(1, (t - t0) / 1100); const e = 1 - Math.pow(1 - k, 3);
          big.textContent = fmt(r.week * e, 1); wk.textContent = fmt(r.week * e, 1); mo.textContent = fmt(r.month * e); yr.textContent = fmt(r.year * e);
          if (k < 1) requestAnimationFrame(tick); else set(); };
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(() => { barA.style.width = '100%'; barB.style.width = r.hrs ? `${Math.max(2, ((r.hrs - r.week) / r.hrs) * 100)}%` : '0'; });
    }
    paintNums(r, !counted); counted = true;
    setTimeout(() => resultEl.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }), 60);
    update = () => { const r2 = calc(); paintNums(r2, false); resultEl.querySelector('.after-v').textContent = `${fmt(r2.hrs - r2.week, 1)} h`; resultEl.lastChild.textContent = `≈ ${fmt(Math.round(r2.value / 1000) * 1000)} kr i frigjord arbetstid per år`; };
    ctx.scroll();
  }
  let update = () => {};
  if (num(st.hrs) > 0) show(); else bd.replaceChildren(h('p', { class: 'kai-q' }, 'Tre snabba uppgifter, så räknar jag:'), ...form());
  ctx.event('demo_start', 'savings');
  return root;
}

// ---------- Integrationsdemo: AI kopplad till affärssystemet ----------
export function integrationDemo(p, ctx) {
  const stad = p.industry === 'stad' || p.industry === 'generell';
  const sys = stad ? 'Timewave' : 'bokningssystemet';
  const svc = { stad: 'Hemstädning 3 h', skonhet: 'Ansiktsbehandling 60 min', frisor: 'Klippning 45 min', halsa: 'Massage 60 min', restaurang: 'Bord för 4', konsult: 'Strategimöte 60 min', generell: 'Hemstädning 3 h' }[p.industry] || 'Hemstädning 3 h';
  const who = stad ? 'Sara' : 'Ella';
  const days = nextWeekdays(10); const fri = days.find((d) => d.getDay() === 5) || days[4]; const tue = days.find((d) => d.getDay() === 2) || days[1];
  const chat = h('div', { class: 'kai-chatmock', 'aria-live': 'polite' });
  const STEPS = [
    ['Identifierar kunden säkert', 'Engångskod via sms till registrerat nummer'],
    ['Hämtar bokningen', `GET ${sys}/bookings?customer=…`],
    ['Kontrollerar tillgänglighet', `Fredag ${fri.getDate()} ${MONTHS[fri.getMonth()]} · ${who} + restid`],
    ['Föreslår ny tid', 'Två lediga tider med samma person'],
    ['Begär bekräftelse', 'Ingen ändring utan kundens ja'],
    ['Genomför ändringen', `PATCH ${sys}/bookings/… · schema uppdaterat`],
    ['Skickar bekräftelse', 'Sms + mejl till kunden · notis till personalen'],
  ];
  const log = h('div', { class: 'kai-log' }, h('div', { class: 'ttl' }, h('i'), 'Bakom kulisserna'), STEPS.map(([t, c]) => h('div', { class: 'kai-lstep' }, h('span', { class: 'st' }), h('div', null, h('b', null, t), h('code', null, c)))));
  const L = [...log.querySelectorAll('.kai-lstep')];
  const setStep = (i, s) => { L[i].className = 'kai-lstep ' + s; L[i].querySelector('.st').textContent = s === 'ok' ? '✓' : s === 'wait' ? '…' : ''; };
  const say = (who2, text) => { const r = h('div', { class: 'kai-row ' + who2 }); if (Array.isArray(text)) r.append(...text); else r.textContent = text; chat.append(r); ctx.scroll(); return r; };
  const root = h('div', { class: 'kai-card' },
    h('div', { class: 'kai-card-hd' }, h('span', { html: svg('plug', 20), style: 'color:var(--k-wine)' }), h('div', null, h('b', null, 'AI kopplad till affärssystemet'), h('small', null, stad ? 'Så fungerar Chattis hos ett städbolag' : 'Så fungerar en integrerad AI-assistent')), h('span', { class: 'kai-badge' }, 'Simulering')),
    h('div', { class: 'kai-card-bd' }, h('div', { class: 'kai-int' }, chat, log), h('p', { class: 'kai-note' }, 'Simulerad demo med fiktiva data (”Anna Exempel”). I skarp drift körs samma flöde mot ert riktiga system – med behörigheter och loggning.')));
  ctx.event('demo_start', 'integration_demo');
  ctx.wide(true);
  const fast = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.3 : 1;
  const w = (ms) => sleep(ms * fast);
  (async () => {
    await w(500); say('kai-cu', 'Hej! Kan du flytta min bokning till fredag? 🙏');
    await w(700); setStep(0, 'run'); await w(900);
    say('kai-as', 'Absolut! För säkerhets skull har jag skickat en kod till numret som slutar på ••12.'); setStep(0, 'wait');
    await w(1200); say('kai-cu', '4829'); await w(600); setStep(0, 'ok');
    setStep(1, 'run'); await w(1100); setStep(1, 'ok');
    say('kai-as', [`Tack Anna! Jag hittar `, h('b', null, `${svc}`), ` ${DAYS[tue.getDay()]} ${tue.getDate()} ${MONTHS[tue.getMonth()]} kl 09:00 med ${who}.`]);
    setStep(2, 'run'); await w(1300); setStep(2, 'ok');
    setStep(3, 'run'); await w(600);
    say('kai-as', `${who} är ledig på fredag. Vilken tid passar?`); setStep(3, 'wait');
    const pick = h('div', { class: 'pick' });
    const choice = await new Promise((res) => { ['08:00', '13:00'].forEach((t) => pick.append(h('button', { type: 'button', onclick: () => res(t) }, `Fredag ${t}`))); chat.append(pick); ctx.scroll(); });
    pick.remove(); say('kai-cu', `Fredag ${choice} blir perfekt`); setStep(3, 'ok');
    setStep(4, 'run'); await w(600);
    say('kai-as', [`Ska jag flytta till `, h('b', null, `fredag ${fri.getDate()} ${MONTHS[fri.getMonth()]} kl ${choice}`), ` med ${who}?`]); setStep(4, 'wait');
    const yes = h('div', { class: 'pick' });
    await new Promise((res) => { yes.append(h('button', { type: 'button', onclick: res }, 'Ja, flytta')); chat.append(yes); ctx.scroll(); });
    yes.remove(); say('kai-cu', 'Ja tack!'); setStep(4, 'ok');
    setStep(5, 'run'); await w(1200); setStep(5, 'ok');
    setStep(6, 'run'); await w(900); setStep(6, 'ok');
    say('kai-as', `Klart! ✨ Din bokning är flyttad till fredag kl ${choice}. Bekräftelse kommer via sms och mejl, och ${who} har fått en notis.`);
    await w(500);
    root.querySelector('.kai-card-bd').append(h('div', { class: 'kai-done-bar' }, h('span', { html: svg('check', 18) }), 'Ärendet löst från början till slut – utan att någon på kontoret behövde lyfta ett finger.'),
      h('div', { class: 'kai-btnrow' }, h('button', { type: 'button', class: 'kai-btn pri', onclick: () => ctx.send('Kan ni koppla en sådan AI till vårt system?') }, 'Kan ni koppla det till vårt system?'), h('button', { type: 'button', class: 'kai-btn', onclick: () => ctx.send('Visa vad mer AI kan göra i vår verksamhet.') }, 'Visa mer')));
    ctx.event('demo_complete', 'integration_demo'); ctx.done(); ctx.scroll();
  })();
  return root;
}

// ---------- Lösningsflöde ("Utmana Kela AI") ----------
const KIND = { trigger: ['trigger', 'Start'], ai: ['ai', 'AI'], check: ['shield', 'Kontroll'], system: ['db', 'System'], action: ['act', 'Åtgärd'], human: ['human', 'Människa'], notify: ['notify', 'Avisering'], log: ['log', 'Logg'] };
export function solutionFlow(p, ctx) {
  const list = h('ol', { class: 'kai-flow' }, (p.steps || []).map((s, i) => {
    const [ic, lab] = KIND[s.kind] || KIND.action;
    const li = h('li', { class: `kai-node k-${s.kind}`, style: `animation-delay:${0.15 + i * 0.22}s` },
      h('span', { class: 'kai-ndot', html: svg(ic, 16) }),
      h('button', { type: 'button', 'aria-expanded': 'false', onclick: (e) => { const o = li.classList.toggle('open'); e.currentTarget.setAttribute('aria-expanded', String(o)); if (o) ctx.event('flow_step', s.kind); } }, h('b', null, s.title)),
      h('div', { class: 'det' }, h('div', null, h('p', null, s.detail))));
    return li;
  }));
  ctx.event('demo_start', 'solution_flow');
  setTimeout(() => list.firstChild?.querySelector('button')?.click(), 900 + (p.steps || []).length * 220);
  return h('div', { class: 'kai-card' },
    h('div', { class: 'kai-flow-hd' }, h('small', null, 'Lösningsskiss · Kela AI'), h('h4', null, p.title), p.problem ? h('q', null, p.problem) : null),
    list,
    h('div', { class: 'kai-flow-ft' },
      p.gains?.length ? h('ul', { class: 'kai-gains' }, p.gains.map((g) => h('li', null, g))) : null,
      h('p', { class: 'kai-q', style: 'margin:6px 0 10px' }, 'Vill du att vi bygger något liknande åt er?'),
      h('div', { class: 'kai-btnrow' }, h('button', { type: 'button', class: 'kai-btn pri', onclick: () => { ctx.event('demo_complete', 'solution_flow'); ctx.send('Ja, vi vill att ni bygger något liknande. Gör en projektbrief.'); } }, 'Ja – gör en projektbrief'), h('button', { type: 'button', class: 'kai-btn', onclick: () => ctx.send('Jag vill boka ett möte om det här.') }, 'Boka möte'))));
}

// ---------- Leadformulär (återanvänds av projektkort, möte och människa) ----------
export function leadForm(ctx, { kind, brief, extra, submitLabel = 'Skicka', needPhone = false, onDone, intro }) {
  const pre = ctx.profile() || {};
  const f = {
    name: h('input', { id: `kai-n-${kind}`, autocomplete: 'name', value: pre.name || '' }),
    email: h('input', { id: `kai-e-${kind}`, type: 'email', autocomplete: 'email', inputmode: 'email' }),
    phone: h('input', { id: `kai-p-${kind}`, type: 'tel', autocomplete: 'tel', inputmode: 'tel' }),
    company: h('input', { id: `kai-c-${kind}`, autocomplete: 'organization', value: brief?.company || pre.company || '' }),
    consent: h('input', { type: 'checkbox', id: `kai-ok-${kind}` }),
    marketing: h('input', { type: 'checkbox', id: `kai-mk-${kind}` }),
    hp: h('input', { class: 'kai-hp', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true', name: 'website' }),
  };
  const errs = {};
  const field = (k, label, full) => { errs[k] = h('span', { class: 'err', role: 'alert' }); return h('div', { class: 'kai-field' + (full ? ' full' : '') }, h('label', { for: f[k].id }, label), f[k], errs[k]); };
  const consentWrap = h('label', { class: 'kai-consent', for: f.consent.id }, f.consent, h('span', null, 'Jag godkänner att Kela kontaktar mig om min förfrågan och sparar uppgifterna för det. ', h('a', { href: ctx.cfg.privacy_url || '/integritetspolicy', target: '_blank', rel: 'noopener' }, 'Så hanterar vi personuppgifter'), '.'));
  const btn = h('button', { type: 'submit', class: 'kai-btn pri' }, submitLabel);
  const formEl = h('form', { class: 'kai-leadform', novalidate: true },
    intro ? h('p', { class: 'kai-q', style: 'margin-bottom:10px' }, intro) : null,
    h('div', { class: 'kai-form-grid' }, field('name', 'Namn *'), field('email', 'E-post *'), field('phone', needPhone ? 'Telefon *' : 'Telefon'), field('company', 'Företag')),
    consentWrap,
    h('label', { class: 'kai-consent', for: f.marketing.id }, f.marketing, h('span', null, 'Ja, skicka gärna nyheter och tips från Kela (valfritt, kan avslutas när som helst).')),
    f.hp, h('div', { class: 'kai-btnrow' }, btn));
  formEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    for (const k in errs) errs[k].textContent = '';
    consentWrap.classList.remove('err');
    const payload = { kind, name: f.name.value.trim(), email: f.email.value.trim(), phone: f.phone.value.trim(), company: f.company.value.trim(), consent: f.consent.checked, marketing: f.marketing.checked, website: f.hp.value, brief: brief || null, ...(extra ? extra() : {}) };
    const local = {};
    if (!payload.name) local.name = 'Skriv ditt namn.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(payload.email)) local.email = 'Skriv en giltig e-postadress.';
    if (needPhone && !payload.phone) local.phone = 'Skriv ett telefonnummer.';
    if (!payload.consent) local.consent = 1;
    if (Object.keys(local).length) { for (const k in local) if (errs[k]) errs[k].textContent = local[k]; if (local.consent) consentWrap.classList.add('err'); (f[Object.keys(local)[0]] || f.consent).focus(); return; }
    btn.disabled = true; btn.textContent = 'Skickar…';
    try {
      const r = await ctx.lead(payload);
      formEl.replaceWith(onDone(r));
      ctx.scroll();
    } catch (err) {
      btn.disabled = false; btn.textContent = submitLabel;
      if (err.details) { for (const k in err.details) if (errs[k]) errs[k].textContent = err.details[k]; if (err.details.consent) consentWrap.classList.add('err'); }
      else formEl.append(h('p', { class: 'kai-note', style: 'color:#A3302D' }, err.message || `Det gick inte att skicka just nu. Mejla oss gärna på ${ctx.cfg.contact_email || 'hej@kelagroup.se'}.`));
    }
  });
  return formEl;
}
const okBox = (title, text) => h('div', { class: 'kai-ok' }, h('div', { class: 'kai-check', html: checkSvg }), h('div', null, h('b', null, title), h('p', null, text)));

// ---------- Projektkort ----------
const ROWS = [['company', 'Företag'], ['industry', 'Bransch'], ['needs', 'Behov'], ['current_systems', 'Nuvarande system'], ['problem', 'Problem'], ['scope', 'Omfattning'], ['timeline', 'Tidsram'], ['budget', 'Budget']];
export function projectBrief(p, ctx) {
  const data = { ...p, needs: [...(p.needs || [])] };
  const card = h('div', { class: 'kai-brief' });
  let editing = false;
  const asText = () => [`ERT FRAMTIDA SYSTEM – projektbrief från Kela AI`, '', ...ROWS.map(([k, l]) => { const v = Array.isArray(data[k]) ? data[k].join(', ') : data[k]; return v ? `${l}: ${v}` : null; }).filter(Boolean), '', `Rekommenderad lösning: ${data.recommendation}`, '', 'kelagroup.se · hej@kelagroup.se'].join('\n');
  function paint() {
    const dl = h('dl');
    for (const [k, l] of ROWS) {
      const v = data[k];
      if (!editing && (!v || (Array.isArray(v) && !v.length))) continue;
      dl.append(h('dt', null, l));
      if (editing) {
        const inp = h(k === 'problem' ? 'textarea' : 'input', { 'aria-label': l, value: Array.isArray(v) ? v.join(', ') : (v || ''), rows: k === 'problem' ? '2' : null });
        if (k === 'problem') inp.value = v || '';
        inp.addEventListener('input', () => { data[k] = k === 'needs' ? inp.value.split(',').map((x) => x.trim()).filter(Boolean) : inp.value; });
        dl.append(h('dd', null, inp));
      } else dl.append(h('dd', null, k === 'needs' ? h('div', { class: 'kai-tags' }, v.map((x) => h('span', null, x))) : v));
    }
    const rec = editing ? h('textarea', { 'aria-label': 'Rekommenderad lösning', rows: '3', oninput: (e) => { data.recommendation = e.target.value; } }) : null;
    if (rec) rec.value = data.recommendation || '';
    const ft = h('div', { class: 'kai-brief-ft' },
      h('button', { type: 'button', class: 'kai-btn pri', onclick: () => sendReq() }, h('span', { html: svg('send', 15) }), 'Skicka förfrågan'),
      h('button', { type: 'button', class: 'kai-btn', onclick: () => ctx.append({ type: 'meeting', id: 'm' + Date.now(), props: { reason: (data.needs || []).join(', ') } }) }, h('span', { html: svg('calendar', 15) }), 'Boka möte'),
      h('button', { type: 'button', class: 'kai-btn', onclick: () => { editing = !editing; paint(); if (!editing) ctx.event('brief_edit', 'saved'); } }, h('span', { html: svg('edit', 15) }), editing ? 'Klar' : 'Redigera'),
      h('a', { class: 'kai-btn', href: `mailto:?subject=${encodeURIComponent('Projektbrief från Kela AI')}&body=${encodeURIComponent(asText())}` }, h('span', { html: svg('mail', 15) }), 'Mejla till mig'),
      h('button', { type: 'button', class: 'kai-btn', onclick: (e) => { navigator.clipboard?.writeText(asText()); e.currentTarget.lastChild.textContent = 'Kopierat!'; ctx.event('copy', 'brief'); } }, h('span', { html: svg('copy', 15) }), 'Kopiera'));
    card.replaceChildren(
      h('div', { class: 'kai-brief-hd' }, h('div', null, h('small', null, 'Projektbrief · Kela AI'), h('h4', null, 'Ert framtida system')), h('span', { class: 'wm' }, ctx.cfg.brand?.wordmark || 'KELA')),
      dl,
      h('div', { class: 'kai-rec' }, h('small', null, 'Rekommenderad lösning'), editing ? rec : data.recommendation),
      ft);
  }
  function sendReq() {
    if (card.querySelector('.kai-leadform')) return;
    const fm = leadForm(ctx, { kind: 'brief', brief: data, submitLabel: 'Skicka förfrågan', intro: 'Vart ska vi skicka svaret?', onDone: () => okBox('Förfrågan skickad!', 'Vi återkommer inom 24 timmar på vardagar – med förslag på upplägg och nästa steg.') });
    card.append(fm); fm.querySelector('input').focus(); ctx.scroll();
  }
  paint();
  ctx.event('demo_start', 'brief');
  return card;
}

// ---------- Mötesbokning ----------
export function meeting(p, ctx) {
  const bd = h('div', { class: 'kai-card-bd' });
  const root = h('div', { class: 'kai-card' }, h('div', { class: 'kai-card-hd' }, h('span', { html: svg('calendar', 20), style: 'color:var(--k-wine)' }), h('div', null, h('b', null, 'Boka ett möte med Kela'), h('small', null, 'Kostnadsfritt · utan förpliktelse · 30 min'))), bd);
  ctx.event('demo_start', 'meeting');
  if (ctx.cfg.cal_link) {
    // Riktig kalenderintegration: tider och bekräftelse sköts av Cal.com.
    bd.append(h('iframe', { class: 'kai-cal', src: `https://cal.com/${ctx.cfg.cal_link}?embed=true&layout=column_view&theme=light`, title: 'Boka möte', loading: 'lazy' }), h('p', { class: 'kai-note' }, 'Bokningen sköts av Cal.com. Du får en bekräftelse via e-post när tiden är bokad.'));
    ctx.wide(true);
    return root;
  }
  const st = { type: 'Videomöte', days: new Set(), time: 'Spelar ingen roll' };
  const types = [['Videomöte', '🎥'], ['Fysiskt möte (Stockholm)', '☕'], ['Telefon', '📞']];
  const days = nextWeekdays(8);
  const typeRow = h('div', { class: 'kai-pills', role: 'group', 'aria-label': 'Mötesform' }, types.map(([t, em]) => h('button', { type: 'button', class: 'kai-pill', 'aria-pressed': String(st.type === t), onclick: (e) => { st.type = t; [...typeRow.children].forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); } }, `${em} ${t}`)));
  const dayRow = h('div', { class: 'kai-days', role: 'group', 'aria-label': 'Önskade dagar (välj gärna flera)' }, days.map((d) => h('button', { type: 'button', 'aria-pressed': 'false', onclick: (e) => { const k = fmtDay(d); st.days.has(k) ? st.days.delete(k) : st.days.add(k); e.currentTarget.setAttribute('aria-pressed', String(st.days.has(k))); } }, h('small', null, DAYS[d.getDay()]), h('b', null, d.getDate()))));
  const timeRow = h('div', { class: 'kai-pills', role: 'group', 'aria-label': 'Tid på dagen' }, ['Förmiddag', 'Eftermiddag', 'Spelar ingen roll'].map((t) => h('button', { type: 'button', class: 'kai-pill', 'aria-pressed': String(st.time === t), onclick: (e) => { st.time = t; [...timeRow.children].forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); } }, t)));
  bd.append(h('span', { class: 'kai-lbl' }, 'Hur vill du ses?'), typeRow, h('span', { class: 'kai-lbl' }, 'Vilka dagar passar?'), dayRow, h('span', { class: 'kai-lbl' }, 'Tid på dagen'), timeRow,
    leadForm(ctx, { kind: 'meeting', brief: ctx.profile(), submitLabel: 'Skicka mötesförfrågan', extra: () => ({ meeting: { type: st.type, days: [...st.days], time: st.time }, message: p.reason || '' }),
      onDone: () => { ctx.done(); return okBox('Mötesförfrågan skickad!', `Ingen tid är bokad ännu – vi bekräftar en tid${st.days.size ? ' bland dina önskade dagar' : ''} via e-post inom 24 timmar (vardagar).`); } }));
  return root;
}

// ---------- Prata med en människa ----------
export function handoff(p, ctx) {
  const bd = h('div', { class: 'kai-card-bd' });
  const root = h('div', { class: 'kai-card' }, h('div', { class: 'kai-card-hd' }, h('span', { html: svg('human', 20), style: 'color:#2E6BE6' }), h('div', null, h('b', null, 'Prata med en människa'), h('small', null, 'Kela-teamet i Stockholm'))), bd);
  const wait = h('button', { type: 'button', class: 'kai-btn', onclick: async () => {
    wait.disabled = true; wait.textContent = 'Väntar på Kela-teamet…';
    try { await ctx.requestHuman(); wait.textContent = 'Teamet har fått en notis ✓'; } catch { wait.disabled = false; wait.textContent = 'Försök igen'; }
  } }, 'Vänta kvar i chatten');
  bd.append(h('p', { style: 'margin:0 0 10px;font-size:13.5px;color:var(--k-muted)' }, 'Vi är inte online dygnet runt. Lämna dina uppgifter så hör en person av sig inom 24 timmar på vardagar – eller vänta kvar: är någon i teamet ledig kan hen ta över chatten direkt. Du kan fortsätta prata med mig under tiden.'),
    ctx.canHuman() ? h('div', { class: 'kai-btnrow', style: 'margin:0 0 12px' }, wait) : null,
    leadForm(ctx, { kind: 'handoff', brief: ctx.profile(), submitLabel: 'Be någon kontakta mig', extra: () => ({ message: p.reason || '' }), onDone: () => okBox('Tack – vi hör av oss!', 'En person från Kela kontaktar dig inom 24 timmar på vardagar.') }));
  return root;
}

export const RENDERERS = { cards, booking_demo: bookingDemo, savings, integration_demo: integrationDemo, solution_flow: solutionFlow, project_brief: projectBrief, meeting, handoff };
export const UI_LABEL = { cards: 'Tjänster', booking_demo: 'Bokningsdemo', savings: 'Besparing', integration_demo: 'AI + affärssystem', solution_flow: 'Lösningsskiss', project_brief: 'Projektbrief', meeting: 'Möte', handoff: 'Människa' };
