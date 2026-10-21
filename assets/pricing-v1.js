/* ============================================================
   KELA – priser för priskalkylatorn (ändra priser här).
   Används både av kalkylatorn i webbläsaren och av servern
   (functions/api/checkout.js) – så att handpenningen alltid
   räknas på samma pris som kunden ser.
   Alla priser är exkl. moms.
   ============================================================ */
export const PRICING = {
  rangeLow: 0.90, rangeHigh: 1.15,
  depositRate: 0.20,   /* handpenning som betalas online vid beställning */
  vat: 0.25,
  solutions: [
    {k:'hemsida',     em:'🌐', t:'Hemsida',            d:'För företag som behöver en ny, modern hemsida.',            from:9900,  type:'web'},
    {k:'webbshop',    em:'🛒', t:'Webbshop',           d:'Sälj produkter eller tjänster online.',                     from:19900, type:'web'},
    {k:'system',      em:'⚙️', t:'Eget system',        d:'System anpassade efter hur ditt företag arbetar.',          from:29900, type:'system'},
    {k:'rekrytering', em:'👥', t:'Rekryteringssystem', d:'Hantera jobb, kandidater, processer och kunder.',           from:39900, type:'system'},
    {k:'crm',         em:'📊', t:'CRM',                d:'Samla kunder, leads, uppföljning och försäljning.',         from:29900, type:'system'},
    {k:'ai',          em:'✨', t:'AI & Automation',    d:'Automatisera administration, kundservice och arbetsflöden.', from:4900,  type:'system'},
    {k:'annat',       em:'➕', t:'Något annat',        d:'Har du en idé? Vi kan förmodligen bygga den.',               type:'custom'}
  ],
  packages: {
    hemsida: [
      {k:'start',    t:'Start',    d:'För det mindre företaget. Upp till 5 sidor.',           base:9900},
      {k:'business', t:'Business', d:'En mer komplett webbplats. Upp till 10 sidor.',         base:19900, popular:true},
      {k:'premium',  t:'Premium',  d:'Större skräddarsydd webbplats med avancerad design.',   base:29900}
    ],
    webbshop: [
      {k:'start',    t:'Start',    d:'Kom igång och sälj online. Mindre sortiment.',          base:19900},
      {k:'business', t:'Business', d:'Komplett webbshop med fler funktioner.',                base:34900, popular:true},
      {k:'premium',  t:'Premium',  d:'Skräddarsydd e-handel med avancerad funktionalitet.',   base:49900}
    ]
  },
  addons: [
    {k:'bokning',  t:'Bokningssystem',             price:4900},
    {k:'inlogg',   t:'Kundinloggning / kundportal',price:7900},
    {k:'betalning',t:'Betalning online',           price:3900},
    {k:'swish',    t:'Swish',                       price:2900},
    {k:'fortnox',  t:'Fortnox-integration',         price:4900},
    {k:'crmint',   t:'CRM-integration',             price:4900},
    {k:'aichatt',  t:'AI-chatt / AI-kundservice',   price:4900, from:true},
    {k:'sms',      t:'Automatiska SMS',             price:2900, from:true},
    {k:'mejl',     t:'Automatiska mejl',            price:2900, from:true},
    {k:'sprak',    t:'Flera språk',                 price:2900, from:true},
    {k:'blogg',    t:'Blogg / nyheter',             price:2900},
    {k:'karriar',  t:'Karriärsida',                 price:2900},
    {k:'offert',   t:'Offertformulär',              price:2900},
    {k:'special',  t:'Specialbyggd funktion',       custom:true}
  ],
  features: [
    {k:'inlogg',     t:'Användarinloggning',   price:4900},
    {k:'roller',     t:'Olika användarroller',  price:4900},
    {k:'admin',      t:'Adminpanel',            price:9900},
    {k:'kundreg',    t:'Kundregister',          price:4900},
    {k:'kandidatreg',t:'Kandidatregister',      price:4900},
    {k:'crm',        t:'CRM',                   price:7900},
    {k:'dashboard',  t:'Dashboard',             price:6900},
    {k:'dokument',   t:'Dokumenthantering',     price:4900},
    {k:'esign',      t:'E-signering',           price:4900},
    {k:'bokningar',  t:'Bokningar',             price:4900},
    {k:'kalender',   t:'Kalender',              price:3900},
    {k:'fakturering',t:'Fakturering',           price:6900},
    {k:'betalningar',t:'Betalningar',           price:4900},
    {k:'mejl',       t:'Automatiska mejl',      price:2900},
    {k:'sms',        t:'Automatiska SMS',       price:2900},
    {k:'ai',         t:'AI-funktioner',         price:7900, from:true},
    {k:'api',        t:'API / integrationer',   price:6900},
    {k:'fortnox',    t:'Fortnox',               price:4900},
    {k:'bankid',     t:'BankID',                price:6900},
    {k:'statistik',  t:'Statistik & rapporter', price:4900},
    {k:'annat',      t:'Annat',                 custom:true}
  ],
  design: [
    {k:'has',   t:'Vi har redan design/brandbook', d:'KELA bygger utifrån befintligt material.', add:0},
    {k:'kela',  t:'KELA skapar designen',          d:'Vi tar fram hela designen.',               add:9900},
    {k:'brand', t:'Hjälp med varumärket',          d:'Design, färger, typografi & identitet.',   add:19900}
  ]
};

export const round100 = n => Math.round(n / 100) * 100;
export const kr = n => round100(n).toLocaleString('sv-SE');
/* exakt belopp i kronor (för det som faktiskt dras vid betalning) */
export const krExact = n => Math.round(n).toLocaleString('sv-SE');

/* Räknar ut priset för ett val. state = {solution, pkg, addons:{k:true}, features:{k:true}, design}
   discount = andel rabatt (0.10 = 10 %), redan kontrollerad av servern. */
export function compute(state, discount = 0) {
  const s = PRICING.solutions.find(x => x.k === state.solution);
  const lines = [];
  let custom = false;
  if (!s) return { mode: 'empty', lines };
  if (s.type === 'custom') return { mode: 'custom', lines: [{ lb: s.t, lp: 'Pris efter behov' }], sol: s };

  let base;
  if (s.type === 'web') {
    const pk = state.pkg && PRICING.packages[s.k].find(p => p.k === state.pkg);
    base = pk ? pk.base : s.from;
    lines.push({ lb: s.t + (pk ? ' · ' + pk.t : ''), sub: pk ? pk.d : 'Välj omfattning', lp: (pk ? '' : 'från ') + kr(base) + ' kr', base: true });
  } else {
    base = s.from;
    lines.push({ lb: s.t, sub: 'Grundsystem', lp: 'från ' + kr(base) + ' kr', base: true });
  }
  let total = base;

  const list = s.type === 'web' ? PRICING.addons : PRICING.features;
  const sel = (s.type === 'web' ? state.addons : state.features) || {};
  list.forEach(it => {
    if (!sel[it.k]) return;
    if (it.custom) { custom = true; lines.push({ lb: it.t, lp: 'efter behov' }); return; }
    total += it.price;
    lines.push({ lb: it.t, lp: (it.from ? 'från ' : '') + '+' + kr(it.price) + ' kr' });
  });

  const dz = PRICING.design.find(d => d.k === state.design);
  if (dz && dz.add > 0) { total += dz.add; lines.push({ lb: dz.t, lp: '+' + kr(dz.add) + ' kr' }); }

  const listTotal = total;
  const off = discount > 0 ? round100(total * discount) : 0;
  if (off) { total -= off; lines.push({ lb: 'Rabatt ' + Math.round(discount * 100) + ' %', lp: '−' + kr(off) + ' kr', disc: true }); }

  const deposit = round100(total * PRICING.depositRate);
  const out = { sol: s, lines, custom, total, listTotal, off, deposit, depositInclVat: Math.round(deposit * (1 + PRICING.vat)) };
  if (s.type === 'web') return Object.assign(out, { mode: 'exact' });
  return Object.assign(out, { mode: 'range', low: total * PRICING.rangeLow, high: total * PRICING.rangeHigh * (custom ? 1.1 : 1) });
}

export function priceText(p) {
  if (p.mode === 'exact') return kr(p.total) + ' kr';
  if (p.mode === 'range') return 'ca ' + kr(p.low) + ' – ' + kr(p.high) + ' kr';
  if (p.mode === 'custom') return 'Pris efter behov';
  return '–';
}

/* Sammanfattning i klartext (till mejl, Stripe och Formspree) */
export function summaryText(state, discountCode, discount = 0) {
  const p = compute(state, discount), s = p.sol, out = [];
  out.push('Lösning: ' + (s ? s.t : '-'));
  if (s && s.type === 'web' && state.pkg) { const pk = PRICING.packages[s.k].find(x => x.k === state.pkg); out.push('Omfattning: ' + (pk ? pk.t : '')); }
  const sel = s && s.type === 'web' ? PRICING.addons.filter(a => (state.addons || {})[a.k]) : (s && s.type === 'system' ? PRICING.features.filter(a => (state.features || {})[a.k]) : []);
  if (sel.length) out.push('Funktioner: ' + sel.map(a => a.t).join(', '));
  const dz = PRICING.design.find(d => d.k === state.design); if (dz && s && s.type !== 'custom') out.push('Design: ' + dz.t);
  if (state.customText) out.push('Idé: ' + String(state.customText).slice(0, 1500));
  if (discount > 0) out.push('Rabattkod: ' + discountCode + ' (−' + Math.round(discount * 100) + ' %)');
  out.push('Uppskattat pris: ' + priceText(p) + (p.mode === 'custom' ? '' : ' (exkl. moms)'));
  return out.join('\n');
}
