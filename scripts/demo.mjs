#!/usr/bin/env node
// KELA OS – demoläge på din egen dator. Startar en lokal server med en EGEN, tom databas och fyller den med
// påhittad exempeldata (kunder, leads, affärer, offerter, projekt, uppgifter och offertspårning).
// Ingen riktig data, inga riktiga mejl, inget når kelagroup.se. Ingen autentiseringsapp behövs för demokontot.
//
// Starta:   npm run demo          (KELA:s egen vardag)
//           npm run demo:rozen    (Rozen Cleans vardag – städkunder, städofferter)
// Stäng:    Ctrl+C
import { spawn, execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { rmSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROZEN = process.argv.includes('--rozen'); // Rozen Clean-versionen: städföretagets egen vardag i systemet
const PORT = Number(process.env.DEMO_PORT || 8789);
const BASE = `http://localhost:${PORT}`;
const STATE = join(ROOT, '.wrangler', 'demo-state');
const DB_ID = '00000000-0000-4000-8000-00000000c0de';
const SETUP = randomBytes(18).toString('hex');
const EMAIL = 'demo@kela.demo';
const PASSWORD = 'kela-demo-2026'; // Bara för demon på din egen dator – påhittad data, ingen koppling till kelagroup.se.
const WR = existsSync(join(ROOT, 'node_modules', '.bin', 'wrangler')) ? [join(ROOT, 'node_modules', '.bin', 'wrangler'), []] : ['npx', ['--yes', 'wrangler@4']];
const wr = (args, opts = {}) => execFileSync(WR[0], [...WR[1], ...args], { cwd: ROOT, stdio: 'pipe', encoding: 'utf8', ...opts });
const step = (s) => process.stdout.write(`  • ${s}\n`);

console.log(ROZEN ? '\nKELA OS – demo för Rozen Clean\n' : '\nKELA OS – demo\n');
step('Skapar en tom demodatabas (din riktiga data rörs inte)');
rmSync(STATE, { recursive: true, force: true });
mkdirSync(STATE, { recursive: true });
wr(['d1', 'migrations', 'apply', 'kela-os', '--local', '--config', 'db/wrangler.toml', '--persist-to', STATE]);

// Rensa exempelsidor från tidigare körningar.
for (const d of (await import('node:fs')).readdirSync(join(ROOT, 's'))) if (d.startsWith('demo-')) rmSync(join(ROOT, 's', d), { recursive: true, force: true });
// Exempeloffert för spårningen: kopia av offertsidan med påhittad kund (filen committas inte – se .gitignore).
const SLUG = 'demo-glansstad-Exempel' + randomBytes(9).toString('base64url');
const SRC = join(ROOT, 's', 'rozen-clean-uW6qK8R7nUi9Pw4D69L2tkvt', 'index.html');
if (!ROZEN && existsSync(SRC)) {
  let page = readFileSync(SRC, 'utf8')
    .replace(/<img class="rozen"[^>]*>/g, '<span class="demo-logo" style="font-weight:800;font-size:1.1rem">Glans Städ</span>')
    .replaceAll('Rozen Clean AB', 'Glans Städ AB (exempel)').replaceAll('Rozen Clean', 'Glans Städ').replaceAll('559084-0467', '556677-8899');
  mkdirSync(join(ROOT, 's', SLUG), { recursive: true });
  writeFileSync(join(ROOT, 's', SLUG, 'index.html'), page);
}

step('Startar servern');
const server = spawn(WR[0], [...WR[1], 'pages', 'dev', '.', '--port', String(PORT), '--d1', `DB=${DB_ID}`, '--persist-to', STATE,
  '--binding', 'OS_ENV=development', '--binding', 'OS_DEMO=1', '--binding', `OS_SETUP_TOKEN=${SETUP}`,
  '--binding', `OS_SECRET_KEY=${randomBytes(32).toString('base64')}`, '--binding', 'OFFER_NOTIFY_URL='], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
let log = ''; server.stdout.on('data', (d) => { log += d; }); server.stderr.on('data', (d) => { log += d; });
const stop = () => { try { server.kill('SIGINT'); } catch { /* */ } try { rmSync(join(ROOT, 's', SLUG), { recursive: true, force: true }); } catch { /* */ } };
process.on('SIGINT', () => { console.log('\nDemon är stängd.'); stop(); process.exit(0); });
process.on('exit', stop);

for (let i = 0; ; i++) {
  try { const r = await fetch(`${BASE}/api/os/auth/setup-status`); if (r.ok) break; } catch { /* startar */ }
  if (i > 120) { console.error('Servern startade inte. Är port ' + PORT + ' upptagen? Prova: DEMO_PORT=8790 npm run demo\n' + log.slice(-1500)); process.exit(1); }
  await new Promise((r) => setTimeout(r, 500));
}

// ---------- Hjälpare ----------
let cookie = '';
async function api(method, path, body, extra = {}) {
  const res = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', 'x-kela-os': '1', ...(cookie ? { cookie } : {}), ...extra }, body: body ? JSON.stringify(body) : undefined });
  const sc = res.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${JSON.stringify(json)}`);
  return json;
}
const post = (p, b) => api('POST', p, b); const patch = (p, b) => api('PATCH', p, b);
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const kr = (n) => Math.round(n * 100);

step('Skapar demoföretaget och demokontot');
await post('/api/os/auth/setup', { setup_token: SETUP, org_name: ROZEN ? 'Rozen Clean AB (demo)' : 'KELA Group AB (demo)', name: ROZEN ? 'Kontoret Rozen Clean' : 'Mikaela Wigert', email: EMAIL, password: PASSWORD });
cookie = '';
await post('/api/os/auth/login', { email: EMAIL, password: PASSWORD });
const me = await api('GET', '/api/os/auth/me');
if (me.mfa !== 'ok') throw new Error('Demoläget slogs inte på.');

step('Fyller med påhittad exempeldata');
if (ROZEN) await seedRozen(); else await seedKela();

async function seedKela() {
await post('/api/os/services/import-kela').catch(() => null);
  
  const CUSTOMERS = [
    { name: 'Glans Städ AB', org_number: '556677-8899', industry: 'Städ', website: 'glansstad.example', contact: { name: 'Sara Lind', email: 'sara@glansstad.example' } },
    { name: 'Nordljus Fönsterputs', industry: 'Fönsterputs', website: 'nordljus.example', contact: { name: 'Ali Berg', email: 'ali@nordljus.example' } },
    { name: 'Salong Blom', industry: 'Skönhet', website: 'salongblom.example', contact: { name: 'Nora Blom', email: 'nora@salongblom.example' } },
    { name: 'Bergqvist Bygg & Måleri', industry: 'Bygg', website: 'bergqvistbygg.example', contact: { name: 'Johan Bergqvist', email: 'johan@bergqvistbygg.example' } },
    { name: 'Fri Form Rekrytering', industry: 'Rekrytering', website: 'friform.example', contact: { name: 'Lea Holm', email: 'lea@friform.example' } },
  ];
  const cus = [];
  for (const c of CUSTOMERS) cus.push(await post('/api/os/customers', c));
  const custDetail = await Promise.all(cus.map((c) => api('GET', `/api/os/customers/${c.id}`)));
  const contactOf = (i) => custDetail[i]?.contacts?.[0]?.id;
  
  for (const l of [
    { name: 'Emma Ek', company: 'Ek Hemservice', email: 'emma@ekhemservice.example', message: 'Vill ha bokningssystem och AI-chatt till hemsidan.' },
    { name: 'Omar Sund', company: 'Sund Flyttstäd', email: 'omar@sundflytt.example', message: 'Behöver offerter som följs upp automatiskt.' },
    { name: 'Klara Viklund', company: 'Viklunds Trädgård', email: 'klara@viklund.example', message: 'Ny hemsida + SEO inför våren.' },
    { name: 'Hugo Ström', company: 'Ström El & Larm', email: 'hugo@stromel.example', message: 'Intresserad av personalapp och avtalshantering.' },
  ]) await post('/api/os/leads', l);
  
  const deals = [];
  for (const [i, title, value, stage] of [
    [0, 'Bokis + Chattis', 9500 * 12, 'quote_sent'], [1, 'Hemsida + SEO', 45000, 'meeting'], [2, 'Bokningssystem för salong', 38000, 'analysis'],
    [3, 'Personalapp och avtal', 52000, 'negotiation'], [4, 'Rekryteringsverktyg', 18000, 'contacted'], [0, 'Kundportal (tillägg)', 6000, 'new'],
  ]) deals.push(await post('/api/os/deals', { title, customer_id: cus[i].id, value_minor: kr(value), stage }));
  
  const ITEMS = [
    { name: 'Bokis – bokning och offerter', billing: 'monthly', qty_milli: 1000, unit_price_minor: kr(3500), vat_bp: 2500 },
    { name: 'Chattis – AI-kundservice', billing: 'monthly', qty_milli: 1000, unit_price_minor: kr(6000), vat_bp: 2500 },
    { name: 'Installation Bokis', billing: 'once', qty_milli: 1000, unit_price_minor: kr(12900), vat_bp: 2500 },
    { name: 'Installation Chattis', billing: 'once', qty_milli: 1000, unit_price_minor: kr(7900), vat_bp: 2500 },
    { name: 'Kundportal (tillval)', billing: 'monthly', qty_milli: 1000, unit_price_minor: kr(499), vat_bp: 2500, optional: true },
  ];
  const CONTENT = { intro: 'Hej!\n\nTack för ett bra möte. Här är vår offert.', needs: 'Färre samtal om bokningar och snabbare offerter.', solution: '- Bokis för bokning och offerter\n- Chattis för kundservice dygnet runt', includes: ['Installation', 'Utbildning', 'Support'], plan: [{ title: 'Kartläggning', duration: 'Dag 1' }, { title: 'Live', duration: '7–10 dagar' }], payment_terms: '30 dagar netto', terms: 'Exempelvillkor för demo.' };
  async function quote(ci, di, title, items) {
    const q = await post('/api/os/quotes', { customer_id: cus[ci].id, contact_id: contactOf(ci), deal_id: deals[di]?.id, title });
    await patch(`/api/os/quotes/${q.id}`, { items, content: CONTENT });
    return q;
  }
  await quote(2, 2, 'Bokningssystem för salongen', [ITEMS[0], ITEMS[2]]);
  const qSent = await quote(1, 1, 'Ny hemsida och SEO', [{ name: 'Hemsida', billing: 'once', qty_milli: 1000, unit_price_minor: kr(24900), vat_bp: 2500 }, { name: 'SEO och GEO', billing: 'monthly', qty_milli: 1000, unit_price_minor: kr(2999), vat_bp: 2500 }]);
  const s1 = await post(`/api/os/quotes/${qSent.id}/send`);
  await fetch(`${BASE}/api/offert/${s1.share_url.split('/').pop()}/viewed`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  const qAcc = await quote(0, 0, 'Bokis och Chattis – referenskund', ITEMS);
  const s2 = await post(`/api/os/quotes/${qAcc.id}/send`);
  await fetch(`${BASE}/api/offert/${s2.share_url.split('/').pop()}/accept`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Sara Lind', email: 'sara@glansstad.example', title: 'VD', confirm: true, snapshot_hash: s2.snapshot_hash, selected_optional: [] }) });
  
  await post('/api/os/projects', { name: 'Ny hemsida – Bergqvist', customer_id: cus[3].id, template_key: 'website', start_date: day(-14), due_date: day(42), budget_minor: kr(45000) }).catch(() => null);
  for (const [title, due, ci] of [['Ring Ali om hemsidesmötet', 1, 1], ['Skicka avtal till Bergqvist', 2, 3], ['Boka kartläggning med Glans Städ', 0, 0], ['Följ upp lead från Ek Hemservice', 3, null]]) {
    await post('/api/os/tasks', { title, due_date: day(due), ...(ci !== null ? { customer_id: cus[ci].id } : {}) });
  }
  for (const [ci, type, title, body] of [[0, 'meeting', 'Möte: genomgång av Bokis och Chattis', 'Positiva till referenskundserbjudandet. Vill börja med Bokis.'], [1, 'call', 'Samtal med Ali', 'Vill se exempel på hemsidor innan beslut.'], [3, 'note', 'Anteckning', 'Använder i dag Excel för scheman.']]) {
    await post('/api/os/activities', { customer_id: cus[ci].id, type, title, body });
  }
  
  // Offertspårning: påhittade besök på exempeloffertens sida.
  if (existsSync(join(ROOT, 's', SLUG))) {
    const orgId = me.org.id;
    wr(['d1', 'execute', 'kela-os', '--local', '--config', 'db/wrangler.toml', '--persist-to', STATE, '--command',
      `INSERT INTO tracked_pages (id, org_id, slug, title, customer_name, created_at) VALUES ('tpg_demoglansstad00001','${orgId}','${SLUG}','Offert – referenskundserbjudande','Glans Städ AB (exempel)','${new Date(Date.now() - 3 * 86400000).toISOString()}');`]);
    const S = (a, b) => fetch(`${BASE}/api/s/${SLUG}/${a}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-kela-s': '1' }, body: JSON.stringify(b) });
    const visits = [];
    for (const [device, secs, scroll, sections, choices] of [
      ['mobil', 48, 35, ['offert', 'erbjudande'], null],
      ['dator', 412, 100, ['offert', 'erbjudande', 'moduler', 'villkor', 'nasta-steg'], { bokis: 'ja', chattis: 'ja', headof: 'kanske', kundportal: 'kanske', seo: 'nej', adminpanel: 'ja' }],
      ['dator', 156, 80, ['moduler', 'villkor'], { bokis: 'ja', chattis: 'ja', headof: 'ja', kundportal: 'kanske', seo: 'nej', adminpanel: 'ja', personalapp: 'kanske' }],
    ]) {
      const v = randomBytes(12).toString('base64url'); visits.push(v);
      await S('open', { visit_id: v, device });
      await S('ping', { visit_id: v, active_seconds: secs, max_scroll: scroll, sections });
      if (choices) await S('choices', { visit_id: v, choices });
    }
    await S('event', { visit_id: visits[2], type: 'copy' });
    // Sprid ut besöken över de senaste dagarna så att tidslinjen ser verklig ut.
    const sql = visits.map((v, i) => { const t = new Date(Date.now() - [50, 26, 3][i] * 3600000).toISOString();
      return `UPDATE tracked_visits SET started_at='${t}', last_seen_at='${t}' WHERE id='${v}'; UPDATE tracked_events SET created_at='${t}' WHERE visit_id='${v}';`; }).join('\n');
    wr(['d1', 'execute', 'kela-os', '--local', '--config', 'db/wrangler.toml', '--persist-to', STATE, '--command', sql]);
  }
  
  }

// ---------- Rozen Clean: städföretagets vardag (påhittad data) ----------
async function seedRozen() {
  const svc = await api('GET', '/api/os/services');
  for (const s of svc.services) await patch(`/api/os/services/${s.id}`, { active: false }).catch(() => null);
  for (const [name, category, description, includes] of [
    ['Hemstädning', 'Privat', 'Återkommande städning varje, varannan eller var fjärde vecka.', ['Samma städare', 'Eget material', 'RUT-avdrag']],
    ['Storstädning', 'Privat', 'Grundlig städning av hela hemmet.', ['Kök och badrum på djupet', 'Fönsterkarmar och lister']],
    ['Flyttstädning', 'Privat', 'Besiktningsgodkänd flyttstädning med garanti.', ['Garanti vid besiktning', 'Fönsterputs ingår']],
    ['Fönsterputs', 'Privat', 'In- och utsida, karmar.', ['Stegar och verktyg']],
    ['Kontorsstädning', 'Företag', 'Avtal för kontor och lokaler.', ['Fast schema', 'Kvalitetskontroller']],
    ['Trappstädning', 'BRF', 'Trapphus, entréer och tvättstuga.', ['Kvittens i trapphuset']],
  ]) await post('/api/os/services', { name, category, description, includes, addons: [] });

  const CUSTOMERS = [
    { name: 'Familjen Lind (privat)', industry: 'Privatkund', contact: { name: 'Anna Lind', email: 'anna.lind@exempel.se' } },
    { name: 'BRF Solgläntan', industry: 'Bostadsrättsförening', contact: { name: 'Per Holm (ordförande)', email: 'styrelsen@solglantan.exempel.se' } },
    { name: 'Kontorshuset Väst AB', org_number: '556600-1122', industry: 'Kontor', contact: { name: 'Lina Ek', email: 'lina@kontorshusetvast.exempel.se' } },
    { name: 'Familjen Ahmadi (privat)', industry: 'Privatkund', contact: { name: 'Reza Ahmadi', email: 'reza.ahmadi@exempel.se' } },
    { name: 'Tandvården Centrum AB', industry: 'Vård', contact: { name: 'Maja Berg', email: 'maja@tandvardencentrum.exempel.se' } },
  ];
  const cus = [];
  for (const c of CUSTOMERS) cus.push(await post('/api/os/customers', c));
  const det = await Promise.all(cus.map((c) => api('GET', `/api/os/customers/${c.id}`)));
  const contactOf = (i) => det[i]?.contacts?.[0]?.id;

  for (const l of [
    { name: 'Sofia Nyberg', email: 'sofia.nyberg@exempel.se', message: 'Offert på hemstädning varannan vecka, 4 rok i Bromma. Gärna fredagar.' },
    { name: 'Erik Sandell', email: 'erik.sandell@exempel.se', message: 'Flyttstädning 3 rok den 28 november. Behöver besiktningsgaranti.' },
    { name: 'Karin Åberg', email: 'karin.aberg@exempel.se', message: 'Storstädning inför jul, villa 160 kvm.' },
    { name: 'Daniel Ström', company: 'Ström Revision AB', email: 'daniel@stromrevision.exempel.se', message: 'Kontorsstädning två gånger i veckan, 300 kvm.' },
  ]) await post('/api/os/leads', l);

  const deals = [];
  for (const [i, title, value, stage] of [
    [0, 'Hemstädning varannan vecka', 1590 * 12, 'won'], [1, 'Trappstädning – avtal 2027', 4800 * 12, 'negotiation'],
    [2, 'Kontorsstädning 2 ggr/vecka', 9800 * 12, 'quote_sent'], [3, 'Flyttstädning 3 rok', 4900, 'meeting'],
    [4, 'Städning av klinik – kvällar', 7600 * 12, 'analysis'], [0, 'Storstädning inför jul (tillägg)', 3200, 'new'],
  ]) deals.push(await post('/api/os/deals', { title, customer_id: cus[i].id, value_minor: kr(value), stage }));

  const CONTENT = { intro: 'Hej!\n\nTack för att vi fick komma på besök. Här är vår offert.', needs: 'Ett städbolag som kommer på utsatt tid, med samma städare.', solution: '- Fast schema\n- Samma städare\n- Kvalitetskontroll efter varje besök', includes: ['Eget material', 'Kvalitetskontroll', 'Kundportal'], plan: [{ title: 'Uppstart', duration: 'Vecka 1' }], payment_terms: '30 dagar netto', terms: 'Exempelvillkor för demo.' };
  async function quote(ci, di, title, items) {
    const q = await post('/api/os/quotes', { customer_id: cus[ci].id, contact_id: contactOf(ci), deal_id: deals[di]?.id, title });
    await patch(`/api/os/quotes/${q.id}`, { items, content: CONTENT });
    return q;
  }
  const line = (name, billing, price, optional) => ({ name, billing, qty_milli: 1000, unit_price_minor: kr(price), vat_bp: 2500, ...(optional ? { optional: true } : {}) });
  await quote(3, 3, 'Flyttstädning 3 rok', [line('Flyttstädning 3 rok', 'once', 4900), line('Fönsterputs (tillval)', 'once', 890, true)]);
  const q1 = await quote(2, 2, 'Kontorsstädning 2 ggr/vecka', [line('Kontorsstädning 300 kvm, 2 ggr/vecka', 'monthly', 9800), line('Uppstart och nyckelhantering', 'once', 1500)]);
  const s1 = await post(`/api/os/quotes/${q1.id}/send`);
  await fetch(`${BASE}/api/offert/${s1.share_url.split('/').pop()}/viewed`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  const q2 = await quote(0, 0, 'Hemstädning varannan vecka', [line('Hemstädning varannan vecka, 4 rok', 'monthly', 1590), line('Storstädning vid start', 'once', 2900)]);
  const s2 = await post(`/api/os/quotes/${q2.id}/send`);
  await fetch(`${BASE}/api/offert/${s2.share_url.split('/').pop()}/accept`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Anna Lind', email: 'anna.lind@exempel.se', confirm: true, snapshot_hash: s2.snapshot_hash, selected_optional: [] }) });

  for (const [title, due, ci] of [['Ring Familjen Lind om nyckelhantering', 0, 0], ['Kvalitetskontroll trapphus BRF Solgläntan', 1, 1],
    ['Följ upp offerten till Kontorshuset Väst', 2, 2], ['Boka besök för flyttstädning – Ahmadi', 1, 3], ['Be om kundomdöme efter storstädning', 3, null]]) {
    await post('/api/os/tasks', { title, due_date: day(due), ...(ci !== null ? { customer_id: cus[ci].id } : {}) });
  }
  for (const [ci, type, title, body] of [
    [0, 'call', 'Samtal med Anna', 'Vill ha samma städare som förra gången. Nyckel lämnas i boxen.'],
    [1, 'meeting', 'Styrelsemöte BRF Solgläntan', 'Vill ha kvittens i trapphuset efter varje städning.'],
    [2, 'email', 'Mejl från Lina', 'Frågar om vi kan börja den 1 december.'],
    [4, 'note', 'Anteckning', 'Kvällsstädning efter 18. Sterilrum städas av egen personal.'],
  ]) await post('/api/os/activities', { customer_id: cus[ci].id, type, title, body });
}

const url = `${BASE}/os/`;
console.log(`
✓ Demon är igång!

  Öppna:     ${url}
  E-post:    ${EMAIL}
  Lösenord:  ${PASSWORD}
  (ingen autentiseringsapp behövs i demon)

  Allt är påhittad exempeldata i en egen databas på din dator.
  ${ROZEN ? 'Tips: visa Dashboard, CRM / Kunder, Leads, Affärsmöjligheter och Offerter – så här ser Rozen Cleans vardag ut samlad.' : 'Tips: "Offertsidor – spårning" i menyn visar hur du ser när kunden läser offerten.'}

  Stäng demon med Ctrl+C.
`);
if (!process.env.DEMO_NO_OPEN) { try { execFileSync('open', [url]); } catch { /* öppna själv */ } }
// Håll demon igång tills Ctrl+C. Om servern stängs av någon anledning säger vi det tydligt.
setInterval(() => {}, 1 << 30);
server.on('exit', (code) => { console.log(`\nDemoservern stängdes (kod ${code}). Starta igen med: npm run ${ROZEN ? 'demo:rozen' : 'demo'}`); process.exit(code || 0); });
