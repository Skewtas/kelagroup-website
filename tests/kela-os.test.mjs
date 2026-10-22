// KELA OS – integrationstester mot en riktig lokal server (Cloudflare Pages Functions + D1 i en tom, temporär databas).
// Kör: npm test   (kräver inget konto – allt körs lokalt)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync, readFileSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, pbkdf2Sync, createHash } from 'node:crypto';
import { totp } from './totp.mjs';
import { calcQuote } from '../os/lib/calc.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DB_ID = '00000000-0000-4000-8000-00000000c0de';
const PORT = 8790 + Math.floor(Math.random() * 100);
const BASE = `http://localhost:${PORT}`;
const SETUP_TOKEN = randomBytes(18).toString('hex');
const PW = 'Test-' + randomBytes(9).toString('base64url');
let STATE, server, mock;
// Låtsas-Claude: tar emot SDK-anropet och svarar med ett fast, giltigt Messages-svar.
const MOCK_PORT = PORT + 200;
const mockCalls = [];
const MOCK_PLAN = {
  summary: 'Vi rekommenderar att automatisera bokningen först.',
  current: [{ process: 'Bokning via telefon', today: 'Kontoret svarar i telefon', problem: 'Missade samtal', hours_month: 40, automation_pct: 150 },
    { process: 'Schemaläggning', today: 'Excel varje söndag', problem: 'Tar tid', hours_month: 12, automation_pct: 50 }],
  hourly_cost_sek: 450, removed_costs: [{ label: 'Gammalt bokningsverktyg', monthly_sek: 990 }],
  goals: [{ goal: 'Fler bokningar online', metric: 'Andel onlinebokningar', today: '10 %', target: '70 %' }],
  phases: [{ title: 'Onlinebokning', period: 'Månad 1–2', actions: '- Bokningssystem\n- Ny hemsida', effect: 'Färre samtal' }],
  assumptions: ['Timkostnad 450 kr inkl. sociala avgifter (uppskattning)'],
};

const WRANGLER = join(ROOT, 'node_modules', '.bin', 'wrangler');
const wranglerCmd = existsSync(WRANGLER) ? [WRANGLER, []] : ['npx', ['-y', 'wrangler@4']];

class Client {
  constructor() { this.cookie = ''; }
  async req(method, path, body, headers = {}) {
    const res = await fetch(BASE + path, {
      method, redirect: 'manual',
      headers: { ...(this.cookie ? { cookie: this.cookie } : {}), ...(method !== 'GET' ? { 'x-kela-os': '1' } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const sc = res.headers.get('set-cookie');
    if (sc) this.cookie = sc.split(';')[0].endsWith('=') ? '' : sc.split(';')[0];
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = null; }
    return { status: res.status, json, text, headers: res.headers };
  }
  get(p) { return this.req('GET', p); }
  post(p, b = {}) { return this.req('POST', p, b); }
  patch(p, b = {}) { return this.req('PATCH', p, b); }
}
const ok = (r, msg) => { assert.ok(r.status >= 200 && r.status < 300, `${msg || ''} → ${r.status} ${r.text.slice(0, 300)}`); return r.json; };

before(async () => {
  mock = createServer((req, res) => {
    let body = ''; req.on('data', (d) => { body += d; });
    req.on('end', () => {
      mockCalls.push({ url: req.url, headers: req.headers, body: JSON.parse(body || '{}') });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'end_turn', stop_sequence: null,
        content: [{ type: 'text', text: JSON.stringify(MOCK_PLAN) }], usage: { input_tokens: 10, output_tokens: 10 } }));
    });
  });
  await new Promise((r) => mock.listen(MOCK_PORT, r));
  STATE = mkdtempSync(join(tmpdir(), 'kela-os-test-'));
  const [cmd, pre] = wranglerCmd;
  execFileSync(cmd, [...pre, 'd1', 'migrations', 'apply', 'kela-os', '--local', '--config', 'db/wrangler.toml', '--persist-to', STATE], { cwd: ROOT, stdio: 'pipe' });
  server = spawn(cmd, [...pre, 'pages', 'dev', '.', '--port', String(PORT), '--d1', `DB=${DB_ID}`, '--persist-to', STATE,
    '--binding', 'OS_ENV=development', '--binding', 'ANTHROPIC_API_KEY=test-key', '--binding', `ANTHROPIC_BASE_URL=http://localhost:${MOCK_PORT}`, '--binding', `OS_SETUP_TOKEN=${SETUP_TOKEN}`, '--binding', `OS_SECRET_KEY=${randomBytes(32).toString('base64')}`,
    '--show-interactive-dev-session=false'], { cwd: ROOT, stdio: 'pipe', detached: true });
  let log = '';
  server.stdout.on('data', (d) => { log += d; }); server.stderr.on('data', (d) => { log += d; });
  for (let i = 0; i < 120; i++) {
    try { const r = await fetch(`${BASE}/api/os/auth/setup-status`); if (r.ok) return; } catch { /* startar */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('Servern startade inte:\n' + log.slice(-2000));
});

after(() => {
  try { mock.close(); } catch { /* */ }
  try { process.kill(-server.pid, 'SIGTERM'); } catch { /* */ }
  try { rmSync(STATE, { recursive: true, force: true }); } catch { /* */ }
});

const admin = new Client();
let adminSecret;
const ctx = {};

// ---------------------------------------------------------------- Säkerhet utan inloggning
test('obehöriga får inte läsa admininformation', async () => {
  const anon = new Client();
  for (const p of ['/api/os/customers', '/api/os/dashboard', '/api/os/quotes', '/api/os/audit', '/api/os/users', '/api/os/services']) {
    const r = await anon.get(p);
    assert.equal(r.status, 401, p);
    assert.ok(!/cus_|quo_/.test(r.text));
  }
});

test('CSRF: ändrande anrop kräver säkerhetsheader och samma ursprung', async () => {
  const r1 = await fetch(`${BASE}/api/os/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(r1.status, 403);
  const r2 = await fetch(`${BASE}/api/os/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-kela-os': '1', origin: 'https://evil.example' }, body: '{}' });
  assert.equal(r2.status, 403);
});

// ---------------------------------------------------------------- Installation och inloggning
test('installation kräver rätt nyckel och kan bara göras en gång', async () => {
  const bad = await new Client().post('/api/os/auth/setup', { setup_token: 'fel', org_name: 'KELA Group AB', name: 'Test Admin', email: 'admin@kela.test', password: PW });
  assert.equal(bad.status, 403);
  const weak = await new Client().post('/api/os/auth/setup', { setup_token: SETUP_TOKEN, org_name: 'KELA Group AB', name: 'Test Admin', email: 'admin@kela.test', password: 'kort' });
  assert.equal(weak.status, 422);
  const r = ok(await admin.post('/api/os/auth/setup', { setup_token: SETUP_TOKEN, org_name: 'KELA Group AB', org_number: '559578-1971', name: 'Test Admin', email: 'admin@kela.test', password: PW }), 'setup');
  assert.equal(r.mfa, 'enroll');
  const again = await new Client().post('/api/os/auth/setup', { setup_token: SETUP_TOKEN, org_name: 'X', name: 'X', email: 'x@kela.test', password: PW });
  assert.equal(again.status, 409);
});

test('admin måste aktivera MFA innan data kan läsas', async () => {
  assert.equal((await admin.get('/api/os/customers')).status, 401);
  const s = ok(await admin.post('/api/os/auth/mfa/setup'), 'mfa setup');
  adminSecret = s.secret;
  assert.match(s.uri, /^otpauth:\/\/totp\//);
  assert.equal((await admin.post('/api/os/auth/mfa/verify', { code: '000000' })).status, 401);
  ok(await admin.post('/api/os/auth/mfa/verify', { code: totp(adminSecret) }), 'mfa verify');
  const me = ok(await admin.get('/api/os/auth/me'));
  assert.equal(me.mfa, 'ok');
  assert.equal(me.user.role, 'superadmin');
  ok(await admin.get('/api/os/customers'));
});

test('inloggning: fel lösenord nekas, MFA-kod kan inte återanvändas, rate limiting slår till', async () => {
  const c = new Client();
  assert.equal((await c.post('/api/os/auth/login', { email: 'admin@kela.test', password: 'fel-lösenord-123' })).status, 401);
  const l = ok(await c.post('/api/os/auth/login', { email: 'ADMIN@kela.test', password: PW }), 'login');
  assert.equal(l.mfa, 'verify');
  assert.equal((await c.get('/api/os/dashboard')).status, 401, 'utan MFA ingen data');
  // Koden som användes vid registreringen får inte återanvändas (samma tidssteg).
  const reuse = await c.post('/api/os/auth/mfa/verify', { code: totp(adminSecret, Date.now() - 30000) });
  assert.equal(reuse.status, 401, 'återanvänd kod ska nekas');
  // Brute force mot ett konto spärras.
  const bf = new Client(); let last;
  for (let i = 0; i < 8; i++) last = await bf.post('/api/os/auth/login', { email: 'nobody@kela.test', password: 'x'.repeat(12) });
  assert.equal(last.status, 429);
});

test('sessionskakan är HttpOnly och SameSite=Strict', async () => {
  const r = await fetch(`${BASE}/api/os/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-kela-os': '1' }, body: JSON.stringify({ email: 'admin@kela.test', password: PW }) });
  const sc = r.headers.get('set-cookie') || '';
  assert.match(sc, /HttpOnly/); assert.match(sc, /SameSite=Strict/);
});

// ---------------------------------------------------------------- CRM
test('skapa, ändra och söka kunder (med validering)', async () => {
  const bad = await admin.post('/api/os/customers', { name: 'X', email: 'inte-en-epost' });
  assert.equal(bad.status, 422); assert.ok(bad.json.details.email);
  const c = ok(await admin.post('/api/os/customers', { name: 'Glans Städ AB', org_number: '556677-8899', industry: 'Städ', website: 'glansstad.se', contact: { name: 'Sara Lind', email: 'sara@glansstad.se' } }));
  ctx.customerId = c.id;
  ok(await admin.patch(`/api/os/customers/${c.id}`, { status: 'active', phone: '08-123 45 67', expected_value_minor: 9990000 }));
  const got = ok(await admin.get(`/api/os/customers/${c.id}`));
  assert.equal(got.customer.status, 'active');
  assert.equal(got.customer.website, 'https://glansstad.se');
  assert.equal(got.contacts[0].name, 'Sara Lind');
  ctx.contactId = got.contacts[0].id;
  // Sök på företagsnamn, org.nr och kontaktperson
  for (const q of ['glans', '556677', 'Sara']) {
    const s = ok(await admin.get('/api/os/customers?q=' + encodeURIComponent(q)));
    assert.equal(s.customers.length, 1, q);
  }
  // SQL-injektion och LIKE-jokertecken behandlas som text
  for (const q of ["' OR 1=1 --", '%', '_']) assert.equal(ok(await admin.get('/api/os/customers?q=' + encodeURIComponent(q))).customers.length, 0, q);
  // Global sökning
  const g = ok(await admin.get('/api/os/search?q=glans'));
  assert.ok(g.results.some((x) => x.type === 'customer'));
});

test('lead → kund + affär (idempotent) och förlorad affär kräver orsak', async () => {
  const l = ok(await admin.post('/api/os/leads', { name: 'Ali Berg', company: 'Berg Fönsterputs', email: 'ali@berg.se', message: 'Vill ha hemsida och bokning' }));
  const c1 = ok(await admin.post(`/api/os/leads/${l.id}/convert`, {}));
  const c2 = ok(await admin.post(`/api/os/leads/${l.id}/convert`, {}));
  assert.equal(c2.already, true); assert.equal(c2.customer_id, c1.customer_id);
  const deals = ok(await admin.get('/api/os/deals'));
  assert.equal(deals.deals.filter((d) => d.customer_id === c1.customer_id).length, 1);
  assert.equal((await admin.patch(`/api/os/deals/${c1.deal_id}`, { stage: 'lost' })).status, 422);
  ok(await admin.patch(`/api/os/deals/${c1.deal_id}`, { stage: 'lost', lost_reason: 'price', lost_note: 'För dyrt' }));
  const d = ok(await admin.get(`/api/os/deals/${c1.deal_id}`));
  assert.equal(d.deal.stage, 'lost'); assert.equal(d.deal.lost_reason, 'price'); assert.equal(d.deal.probability, 0);
  const deal = ok(await admin.post('/api/os/deals', { title: 'Hemsida + AI-chatt', customer_id: ctx.customerId, value_minor: 5000000, stage: 'meeting' }));
  ctx.dealId = deal.id;
});

// ---------------------------------------------------------------- Tjänster
test('tjänstepriser versionshanteras', async () => {
  const svc = ok(await admin.get('/api/os/services'));
  assert.ok(svc.services.length >= 14, 'startkatalog finns');
  assert.ok(svc.services.every((s) => s.price === null), 'inga hårdkodade exempelpriser');
  const premium = svc.services.find((s) => s.name === 'Hemsida – Premium');
  ctx.serviceId = premium.id;
  ok(await admin.patch(`/api/os/services/${premium.id}`, { price: { once_price_minor: 4990000, monthly_price_minor: 149500, internal_once_cost_minor: 1800000, vat_bp: 2500 } }));
  ok(await admin.patch(`/api/os/services/${premium.id}`, { price: { once_price_minor: 5490000 } }));
  const one = ok(await admin.get(`/api/os/services/${premium.id}`));
  assert.equal(one.price_history.length, 2);
  assert.equal(one.service.price.once_price_minor, 5490000);
  assert.equal(one.service.price.internal_once_cost_minor, 1800000, 'kostnad ärvs till ny version');
  assert.deepEqual(one.service.price.once_margin, { amount: 3690000, bp: 6721 });
});

// ---------------------------------------------------------------- Offerter
const ITEMS = [
  { name: 'Hemsida – Premium', billing: 'once', qty_milli: 1000, unit_price_minor: 4990000, vat_bp: 2500 },
  { name: 'Extra sidor', billing: 'once', qty_milli: 3000, unit_price_minor: 125050, discount_bp: 1000, vat_bp: 2500 },
  { name: 'Utbildning', billing: 'once', qty_milli: 1500, unit_price_minor: 99900, vat_bp: 1200 },
  { name: 'Drift och support', billing: 'monthly', qty_milli: 1000, unit_price_minor: 149500, vat_bp: 2500 },
  { name: 'AI-chatt (tillval)', billing: 'monthly', qty_milli: 1000, unit_price_minor: 150000, vat_bp: 2500, optional: true },
];

test('pris och moms räknas korrekt (exakt i öre)', () => {
  const t = calcQuote({ items: ITEMS, discount_bp: 500 });
  // Rad 2: 3 × 1 250,50 = 3 751,50, −10 % = 375,15 → 3 376,35. Rad 3: 1,5 × 999 = 1 498,50 (12 %).
  // 25 %-gruppen: 49 900 + 3 376,35 = 53 276,35, −5 % = 2 663,82 → 50 612,53, moms 12 653,13
  // 12 %-gruppen: 1 498,50, −5 % = 74,93 → 1 423,57, moms 170,83
  assert.equal(t.once.subtotal, 4990000 + 337635 + 149850);
  assert.equal(t.once.discount, 266382 + 7493);
  assert.equal(t.once.net, 5061253 + 142357);
  assert.equal(t.once.vat, 1265313 + 17083);
  assert.equal(t.once.total, 5061253 + 142357 + 1265313 + 17083);
  assert.equal(t.monthly.net, 149500); assert.equal(t.monthly.vat, 37375); assert.equal(t.monthly.total, 186875);
  assert.equal(t.optional_count, 1);
  const withOpt = calcQuote({ items: ITEMS.map((x, i) => ({ ...x, id: 'qi_' + i })), discount_bp: 500 }, ['qi_4']);
  assert.equal(withOpt.monthly.net, 299500);
});

test('skapa offert, spara, öppna igen – servern räknar om summorna', async () => {
  const q = ok(await admin.post('/api/os/quotes', { customer_id: ctx.customerId, contact_id: ctx.contactId, deal_id: ctx.dealId, title: 'Ny hemsida och drift' }));
  assert.ok(q.number >= 1001);
  ctx.quoteId = q.id; ctx.quoteNo = q.number;
  const items = ITEMS.map((x) => ({ ...x, service_id: x.name === 'Hemsida – Premium' ? ctx.serviceId : undefined }));
  const s = ok(await admin.patch(`/api/os/quotes/${q.id}`, {
    discount_bp: 500, items,
    content: { intro: 'Hej Sara!\n\nTack för mötet.', needs: 'Fler bokningar', solution: '- Ny hemsida\n- Drift', includes: ['Design', 'SEO'], plan: [{ title: 'Kickoff', duration: 'Vecka 1' }], payment_terms: '30 dagar netto', terms: 'Standardvillkor' },
  }));
  const expected = calcQuote({ items, discount_bp: 500 });
  assert.equal(s.totals.once.total, expected.once.total);
  // Manipulerade totals från klienten ignoreras
  ok(await admin.patch(`/api/os/quotes/${q.id}`, { totals_json: '{"once":{"total":1}}' }));
  const got = ok(await admin.get(`/api/os/quotes/${q.id}`));
  assert.equal(got.version.items.length, 5);
  assert.equal(got.version.content.intro, 'Hej Sara!\n\nTack för mötet.');
  assert.equal(got.totals.once.total, expected.once.total);
  assert.equal(got.version.items[0].price_version_id !== null, true, 'kopplad till prisversion');
  assert.equal(got.quote.status, 'draft');
  // Ogiltig moms nekas
  assert.equal((await admin.patch(`/api/os/quotes/${q.id}`, { items: [{ name: 'X', billing: 'once', qty_milli: 1000, unit_price_minor: 100, vat_bp: 1900 }] })).status, 422);
});

test('förhandsgranskning och utskrift renderas med säkerhetsheaders', async () => {
  const r = await admin.get(`/api/os/quotes/${ctx.quoteId}/preview`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/html/);
  assert.match(r.headers.get('content-security-policy'), /default-src 'none'/);
  assert.match(r.text, /Utkast – förhandsgranskning/);
  assert.match(r.text, /Ny hemsida och drift/);
  assert.equal((await new Client().get(`/api/os/quotes/${ctx.quoteId}/preview`)).status, 401);
});

test('skicka låser versionen och skapar en säker länk', async () => {
  const s = ok(await admin.post(`/api/os/quotes/${ctx.quoteId}/send`));
  assert.match(s.share_url, /\/offert\/[A-Za-z0-9_-]{40,}$/);
  ctx.shareUrl = s.share_url; ctx.token = s.share_url.split('/').pop(); ctx.hash1 = s.snapshot_hash;
  const locked = await admin.patch(`/api/os/quotes/${ctx.quoteId}`, { items: [] });
  assert.equal(locked.status, 409, 'låst version kan inte ändras');
  assert.equal((await admin.post(`/api/os/quotes/${ctx.quoteId}/send`)).status, 409, 'kan inte skickas två gånger');
  const q = ok(await admin.get(`/api/os/quotes/${ctx.quoteId}`));
  assert.equal(q.quote.status, 'sent');
  assert.equal(q.deal.stage, 'quote_sent', 'affären flyttas automatiskt');
  const tasks = ok(await admin.get('/api/os/tasks?mine=1'));
  assert.equal(tasks.tasks.filter((t) => t.title === `Följ upp offert #${ctx.quoteNo}`).length, 1);
});

test('kunden når bara sin egen offert via länken', async () => {
  const pub = await fetch(`${BASE}/offert/${ctx.token}`);
  const html = await pub.text();
  assert.equal(pub.status, 200);
  assert.match(html, /Ny hemsida och drift/);
  assert.match(pub.headers.get('x-robots-tag'), /noindex/);
  assert.equal(pub.headers.get('referrer-policy'), 'no-referrer');
  // Påhittad, ändrad eller kort token → 404
  for (const t of [ctx.token.slice(0, -1) + (ctx.token.endsWith('A') ? 'B' : 'A'), 'abc', randomBytes(32).toString('base64url')]) {
    assert.equal((await fetch(`${BASE}/offert/${t}`)).status, 404);
  }
  // Länken ger ingen åtkomst till admin-API:t
  assert.equal((await fetch(`${BASE}/api/os/quotes/${ctx.quoteId}`)).status, 401);
});

test('öppning registreras först när sidan visas (beacon), inte vid hämtning', async () => {
  let q = ok(await admin.get(`/api/os/quotes/${ctx.quoteId}`));
  assert.equal(q.quote.status, 'sent', 'GET av sidan räknas inte som öppning');
  const r = await fetch(`${BASE}/api/offert/${ctx.token}/viewed`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(r.status, 200);
  await fetch(`${BASE}/api/offert/${ctx.token}/viewed`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  q = ok(await admin.get(`/api/os/quotes/${ctx.quoteId}`));
  assert.equal(q.quote.status, 'viewed');
  assert.equal(q.events.filter((e) => e.type === 'viewed').length, 1, 'samma besökare räknas inte två gånger');
});

test('historiska versioner bevaras när katalog och offert ändras', async () => {
  ok(await admin.patch(`/api/os/services/${ctx.serviceId}`, { price: { once_price_minor: 6990000 } }));
  ok(await admin.patch(`/api/os/customers/${ctx.customerId}`, { name: 'Glans Städ & Fönster AB' }));
  let pub = await (await fetch(`${BASE}/offert/${ctx.token}`)).text();
  assert.match(pub, /49\s900/, 'kunden ser fortfarande priset som skickades');
  assert.match(pub, /Glans Städ AB/, 'kundnamnet i den skickade versionen är fryst');
  const v = ok(await admin.post(`/api/os/quotes/${ctx.quoteId}/versions`));
  const q = ok(await admin.get(`/api/os/quotes/${ctx.quoteId}`));
  assert.equal(q.version.version_no, 2); assert.equal(q.version.locked, false); assert.equal(q.quote.status, 'draft');
  const items = q.version.items.map((i) => ({ ...i, unit_price_minor: i.name === 'Hemsida – Premium' ? 4490000 : i.unit_price_minor }));
  ok(await admin.patch(`/api/os/quotes/${ctx.quoteId}`, { items }));
  pub = await (await fetch(`${BASE}/offert/${ctx.token}`)).text();
  assert.match(pub, /49\s900/, 'kunden ser v1 tills v2 skickas');
  const s = ok(await admin.post(`/api/os/quotes/${ctx.quoteId}/send`));
  ctx.hash2 = s.snapshot_hash;
  assert.equal(s.share_url, ctx.shareUrl, 'samma länk används för nya versionen');
  pub = await (await fetch(`${BASE}/offert/${ctx.token}`)).text();
  assert.match(pub, /44\s900/); assert.match(pub, /Glans Städ &amp; Fönster AB/);
  const v1 = ok(await admin.get(`/api/os/quotes/${ctx.quoteId}/versions/${q.versions.find((x) => x.version_no === 1).id}`));
  assert.equal(v1.version.locked, true);
  assert.equal(v1.version.snapshot_hash, ctx.hash1, 'v1 är oförändrad');
  assert.equal(createHash('sha256').update(JSON.stringify(v1.version.snapshot)).digest('hex'), ctx.hash1, 'kontrollsumman stämmer med innehållet');
  void v;
});

test('godkännande: kräver aktuell version, sparas en gång och startar automatiseringar', async () => {
  const post = (b) => fetch(`${BASE}/api/offert/${ctx.token}/accept`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
  const base = { name: 'Sara Lind', email: 'sara@glansstad.se', title: 'VD', confirm: true };
  assert.equal((await post({ ...base, snapshot_hash: ctx.hash1 })).status, 409, 'gammal version kan inte godkännas');
  assert.equal((await post({ ...base, confirm: false, snapshot_hash: ctx.hash2 })).status, 422);
  const pubHtml = await (await fetch(`${BASE}/offert/${ctx.token}`)).text();
  const optId = JSON.parse(pubHtml.match(/<script type="application\/json" id="qdata"[^>]*>(.*?)<\/script>/s)[1]).items.find((i) => i.optional).id;
  const [a, b] = await Promise.all([post({ ...base, snapshot_hash: ctx.hash2, selected_optional: [optId, 'qi_påhittad'] }), post({ ...base, snapshot_hash: ctx.hash2 })]);
  assert.equal(a.status, 200); assert.equal(b.status, 200);
  const q = ok(await admin.get(`/api/os/quotes/${ctx.quoteId}`));
  assert.equal(q.quote.status, 'accepted');
  assert.equal(q.acceptance.snapshot_hash, ctx.hash2);
  assert.equal(q.acceptance.method, 'click_accept');
  assert.equal(q.events.filter((e) => e.type === 'accepted').length, 1, 'bara ett godkännande');
  assert.equal(q.deal.stage, 'won');
  const tasks = ok(await admin.get('/api/os/tasks?mine=1'));
  for (const t of [`Förbered avtal för offert #${ctx.quoteNo}`, `Förbered fakturering för offert #${ctx.quoteNo}`]) assert.equal(tasks.tasks.filter((x) => x.title === t).length, 1, t);
  // Projekt skapas automatiskt från mallen "Ny hemsida" (offerten innehåller en hemsida) – exakt ett, även vid dubbelklick.
  const prj = ok(await admin.get('/api/os/projects?status=open'));
  const mine = prj.projects.filter((x) => x.quote_id === ctx.quoteId);
  assert.equal(mine.length, 1, 'ett projekt per offert');
  assert.equal(mine[0].template_key, 'website'); assert.equal(mine[0].task_count, 11);
  ctx.projectId = mine[0].id;
  assert.equal(q.project?.id, ctx.projectId, 'offerten länkar till projektet');
  assert.equal(tasks.tasks.filter((x) => x.title === `Följ upp offert #${ctx.quoteNo}`).length, 0, 'uppföljning stängd');
  const auto = q.events.find((e) => e.type === 'automation');
  assert.ok(auto.data.skipped.some((s) => /mejl/i.test(s)), 'inget mejl skickas utan integration');
  assert.equal((await (await post({ ...base, snapshot_hash: ctx.hash2 })).json()).already, true, 'idempotent');
  assert.equal((await admin.patch(`/api/os/quotes/${ctx.quoteId}`, { title: 'Ändrad' })).status, 409, 'accepterad offert är låst');
  const page = await (await fetch(`${BASE}/offert/${ctx.token}`)).text();
  assert.match(page, /Offerten är godkänd/); assert.match(page, /inte en kvalificerad elektronisk underskrift/);
  assert.match(page, /data-k="monthly.total">3\s743,75/, 'godkänd offert visar summan inklusive valt tillägg');
  assert.equal(q.acceptance.totals.monthly.net, 299500);
});

test('XSS: användardata escapas i offertdokumentet', async () => {
  const c = ok(await admin.post('/api/os/customers', { name: '<img src=x onerror=alert(1)>' }));
  const q = ok(await admin.post('/api/os/quotes', { customer_id: c.id, title: '<script>alert(1)</script>' }));
  ok(await admin.patch(`/api/os/quotes/${q.id}`, { items: [{ name: '"><svg onload=alert(1)>', billing: 'once', qty_milli: 1000, unit_price_minor: 100 }], content: { intro: '</script><script>alert(2)</script>' } }));
  const r = await admin.get(`/api/os/quotes/${q.id}/preview`);
  assert.ok(!r.text.includes('<img src=x'), 'img escapad'); assert.ok(!r.text.includes('<script>alert'), 'script escapad'); assert.ok(!r.text.includes('<svg onload'));
  assert.match(r.text, /&lt;img src=x/);
  ctx.xssQuote = q.id;
});

test('PDF-export: utskriftsversionen blir en riktig PDF', async (t) => {
  const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (!existsSync(chrome)) return t.skip('Chrome saknas');
  const out = join(STATE, 'offert.pdf');
  execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-pdf-header-footer', `--print-to-pdf=${out}`, '--virtual-time-budget=4000', `${BASE}/offert/${ctx.token}`], { stdio: 'pipe', timeout: 60000 });
  const buf = readFileSync(out);
  assert.equal(buf.subarray(0, 5).toString(), '%PDF-');
  assert.ok(statSync(out).size > 20000, 'PDF har innehåll');
  const pages = (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  assert.ok(pages >= 2, `omslag + innehåll (${pages} sidor)`);
});

// ---------------------------------------------------------------- Digitaliseringsplan + AI
test('digitaliseringsplan: AI-utkast via Claude, granskning krävs, planen först och lönsamhet räknas mot priset', async () => {
  const q = ok(await admin.post('/api/os/quotes', { customer_id: ctx.customerId, title: 'Digitalisering av bokning' }));
  ok(await admin.patch(`/api/os/quotes/${q.id}`, { items: [
    { name: 'Bokningssystem', billing: 'once', qty_milli: 1000, unit_price_minor: 2500000 },
    { name: 'Drift', billing: 'monthly', qty_milli: 1000, unit_price_minor: 300000 }] }));
  assert.equal((await admin.post(`/api/os/quotes/${q.id}/plan-draft`, { notes: 'kort' })).status, 422);
  const NOTES = 'Sex städare. All bokning via telefon och mejl, ca två timmar per dag. Schemat görs i Excel. HEMLIG-MARKÖR-123';
  const d = ok(await admin.post(`/api/os/quotes/${q.id}/plan-draft`, { notes: NOTES }));
  // Anropet till Claude
  const call = mockCalls.at(-1);
  assert.match(call.url, /^\/v1\/messages(\?|$)/);
  assert.equal(call.body.model, 'claude-opus-5-5');
  assert.equal(call.body.fallbacks, 'default');
  assert.match(String(call.headers['anthropic-beta']), /server-side-fallback-2026-07-01/);
  assert.equal(call.body.output_config.format.type, 'json_schema');
  assert.equal(call.headers.authorization || call.headers['x-api-key'], call.headers.authorization ? 'Bearer test-key' : 'test-key');
  assert.match(JSON.stringify(call.body.messages), /Bokningssystem/, 'tjänsterna i offerten skickas med');
  // Svaret normaliseras och markeras som AI-utkast
  assert.equal(d.plan.ai_draft, true); assert.equal(d.plan.enabled, true);
  assert.equal(d.plan.current[0].automation_pct, 100, 'orimliga värden begränsas');
  assert.equal(d.plan.hourly_cost_minor, 45000); assert.equal(d.plan.removed_costs[0].monthly_minor, 99000);
  // Inget sparas automatiskt
  assert.equal(ok(await admin.get(`/api/os/quotes/${q.id}`)).version.content.digital_plan, null);
  ok(await admin.patch(`/api/os/quotes/${q.id}`, { content: { digital_plan: d.plan } }));
  const blocked = await admin.post(`/api/os/quotes/${q.id}/send`);
  assert.equal(blocked.status, 409); assert.equal(blocked.json.error, 'ai_review_required');
  ok(await admin.patch(`/api/os/quotes/${q.id}`, { content: { digital_plan: { ...d.plan, ai_draft: false } } }));
  const sent = ok(await admin.post(`/api/os/quotes/${q.id}/send`));
  const page = await (await fetch(sent.share_url.replace(/^https?:\/\/[^/]+/, BASE))).text();
  assert.match(page, /Digitaliseringsplan och offert för/);
  const order = ['>Sammanfattning<', '>Nuläge<', '>Mål och nyckeltal<', '>Färdplan<', '>Investering<', '>Lönsamhet<', '>Godkännande<'].map((h) => page.indexOf(h));
  assert.ok(order.every((x) => x > 0), 'alla avsnitt finns: ' + order);
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'planen kommer först, priset sist följt av lönsamhet');
  // Lönsamhet: (40 h × 100 % + 12 h × 50 %) = 46 h × 450 = 20 700 + 990 = 21 690 − 3 000 = 18 690 kr/mån; 25 000 / 18 690 = 1,3 mån
  assert.match(page, /46 h/); assert.match(page, /18\s690\skr\/mån/); assert.match(page, /1,3 mån/);
  assert.match(page, /inte en garanti/);
  // Revisionsloggen visar att AI användes, men inte anteckningarna
  const a = ok(await admin.get('/api/os/audit?q=AI-utkast'));
  assert.ok(a.entries.some((x) => x.action === 'ai.plan_draft'));
  assert.ok(!JSON.stringify(a).includes('HEMLIG-MARKÖR'), 'mötesanteckningar loggas inte');
});

// ---------------------------------------------------------------- Projekt (fas 2) och produktimport
test('projekt: mallar, kanban-steg, status och idempotent automatisering', async () => {
  const tpl = ok(await admin.get('/api/os/project-templates'));
  assert.ok(tpl.templates.find((t) => t.key === 'website').steps.length === 11);
  const p = ok(await admin.post('/api/os/projects', { name: 'AI-chatt Glans', customer_id: ctx.customerId, template_key: 'ai_chat', start_date: '2026-11-02', due_date: '2026-12-07', budget_minor: 2000000 }));
  let d = ok(await admin.get(`/api/os/projects/${p.id}`));
  assert.equal(d.tasks.length, 7); assert.equal(d.project.status, 'planned');
  assert.ok(d.tasks.every((t) => t.due_date >= '2026-11-02'), 'deadlines utgår från startdatum');
  assert.ok(d.tasks.filter((t) => t.milestone).length >= 2, 'milstolpar finns');
  ok(await admin.patch(`/api/os/tasks/${d.tasks[0].id}`, { stage: 'doing' }));
  d = ok(await admin.get(`/api/os/projects/${p.id}`));
  assert.equal(d.project.status, 'active', 'projektet blir aktivt när arbete påbörjas');
  ok(await admin.patch(`/api/os/tasks/${d.tasks[0].id}`, { stage: 'done' }));
  d = ok(await admin.get(`/api/os/projects/${p.id}`));
  assert.equal(d.tasks[0].status, 'done', 'kanban-steg och status hålls i synk');
  ok(await admin.post(`/api/os/projects/${p.id}/tasks`, { title: 'Extra genomgång', milestone: true }));
  ok(await admin.patch(`/api/os/projects/${p.id}`, { status: 'done', actual_hours: 12.5 }));
  d = ok(await admin.get(`/api/os/projects/${p.id}`));
  assert.equal(d.tasks.length, 8); assert.equal(d.project.status, 'done'); assert.ok(d.project.completed_at); assert.equal(d.project.actual_hours, 12.5);
  assert.equal((await admin.post('/api/os/projects', { name: 'Dubblett', customer_id: ctx.customerId, quote_id: ctx.quoteId })).status, 409, 'max ett projekt per offert');
  const dash = ok(await admin.get('/api/os/dashboard'));
  assert.equal(dash.kpis.projects.open, 1);
  assert.ok(ok(await admin.get('/api/os/search?q=AI-chatt')).results.some((x) => x.type === 'project'));
});

test('import av KELA:s produktkatalog är idempotent och sätter riktiga månadspriser', async () => {
  const a = ok(await admin.post('/api/os/services/import-kela'));
  assert.equal(a.added.length + a.priced.length, 12);
  assert.ok(a.priced.includes('Personalapp'), 'befintlig tjänst utan pris får pris');
  const b = ok(await admin.post('/api/os/services/import-kela'));
  assert.equal(b.added.length + b.priced.length, 0); assert.equal(b.skipped, 12);
  // En tjänst med eget pris skrivs aldrig över.
  assert.equal(ok(await admin.get(`/api/os/services/${ctx.serviceId}`)).service.price.once_price_minor, 6990000);
  const svc = ok(await admin.get('/api/os/services'));
  const bokis = svc.services.find((x) => x.name.startsWith('Bokis'));
  assert.equal(bokis.price.monthly_price_minor, 699900); assert.equal(bokis.price.once_price_minor, null, 'uppstart offereras per kund');
});

// ---------------------------------------------------------------- Roller och behörigheter
async function invite(role, email) {
  const inv = ok(await admin.post('/api/os/users/invite', { email, name: role + ' Testsson', role }));
  const token = inv.invite_url.split('/').pop();
  const c = new Client();
  ok(await c.get(`/api/os/auth/invite/${token}`));
  ok(await c.post(`/api/os/auth/invite/${token}`, { password: PW }));
  assert.equal((await new Client().post(`/api/os/auth/invite/${token}`, { password: PW })).status, 404, 'inbjudan kan bara användas en gång');
  return c;
}

test('roller: säljare och projektledare får bara det rollen tillåter (verkställs på servern)', async () => {
  const sales = await invite('sales', 'saljare@kela.test');
  ok(await sales.get('/api/os/customers'));
  ok(await sales.post('/api/os/customers', { name: 'Säljarens kund' }));
  const svc = ok(await sales.get('/api/os/services'));
  assert.equal(svc.costs_visible, false);
  assert.ok(svc.services.every((s) => !s.price || s.price.internal_once_cost_minor === undefined), 'interna kostnader döljs');
  for (const [m, p, b] of [['GET', '/api/os/audit'], ['POST', '/api/os/services', { name: 'X' }], ['POST', '/api/os/users/invite', { email: 'a@b.se', name: 'A', role: 'admin' }], ['GET', '/api/os/customers/' + ctx.customerId + '/export']]) {
    assert.equal((await sales.req(m, p, b)).status, 403, `${m} ${p}`);
  }
  const pm = await invite('pm', 'pm@kela.test');
  ok(await pm.get('/api/os/quotes'));
  assert.equal((await pm.post('/api/os/quotes', { customer_id: ctx.customerId, title: 'x' })).status, 403);
  assert.equal((await pm.post('/api/os/customers', { name: 'x' })).status, 403);
  assert.equal((await pm.post(`/api/os/quotes/${ctx.xssQuote}/send`)).status, 403);
  ok(await pm.post(`/api/os/projects/${ctx.projectId}/tasks`, { title: 'PM-uppgift' }), 'projektledare får arbeta i projekt');
  assert.equal((await sales.post(`/api/os/projects/${ctx.projectId}/tasks`, { title: 'x' })).status, 403, 'säljare får bara läsa projekt');
  ok(await sales.get(`/api/os/projects/${ctx.projectId}`));
  ctx.sales = sales;
});

test('admin kan inte ta bort sista superadmin, och inaktiverad användare loggas ut direkt', async () => {
  const me = ok(await admin.get('/api/os/auth/me'));
  assert.equal((await admin.patch(`/api/os/users/${me.user.id}`, { role: 'sales' })).status, 409);
  const users = ok(await admin.get('/api/os/users'));
  const s = users.users.find((u) => u.email === 'saljare@kela.test');
  ok(await admin.patch(`/api/os/users/${s.id}`, { status: 'disabled' }));
  assert.equal((await ctx.sales.get('/api/os/customers')).status, 401);
  assert.equal((await new Client().post('/api/os/auth/login', { email: 'saljare@kela.test', password: PW })).status, 401);
});

// ---------------------------------------------------------------- Separation mellan företag (SaaS-förberedelse)
test('data är strikt separerad mellan företag', async () => {
  const salt = randomBytes(16);
  const b64 = (b) => b.toString('base64url');
  const hash = `pbkdf2-sha256$100000$${b64(salt)}$${b64(pbkdf2Sync(PW, salt, 100000, 32, 'sha256'))}`;
  const t = new Date().toISOString();
  const sql = `INSERT INTO organizations (id,name,created_at,updated_at) VALUES ('org_andraforetaget0001','Annat AB','${t}','${t}');
INSERT INTO users (id,email,name,password_hash,created_at,updated_at) VALUES ('usr_andraforetaget0001','b@annat.test','B','${hash}','${t}','${t}');
INSERT INTO memberships (id,org_id,user_id,role,created_at) VALUES ('mem_andraforetaget0001','org_andraforetaget0001','usr_andraforetaget0001','sales','${t}');`;
  const [cmd, pre] = wranglerCmd;
  execFileSync(cmd, [...pre, 'd1', 'execute', 'kela-os', '--local', '--config', 'db/wrangler.toml', '--persist-to', STATE, '--command', sql], { cwd: ROOT, stdio: 'pipe' });
  const b = new Client();
  ok(await b.post('/api/os/auth/login', { email: 'b@annat.test', password: PW }));
  assert.equal(ok(await b.get('/api/os/customers')).customers.length, 0);
  assert.equal(ok(await b.get('/api/os/quotes')).quotes.length, 0);
  assert.equal(ok(await b.get('/api/os/search?q=glans')).results.length, 0);
  assert.equal(ok(await b.get('/api/os/services')).services.length, 0);
  assert.equal(ok(await b.get('/api/os/projects')).projects.length, 0);
  for (const p of [`/api/os/customers/${ctx.customerId}`, `/api/os/quotes/${ctx.quoteId}`, `/api/os/deals/${ctx.dealId}`, `/api/os/quotes/${ctx.quoteId}/preview`, `/api/os/projects/${ctx.projectId}`]) {
    assert.equal((await b.get(p)).status, 404, p);
  }
  assert.equal((await b.patch(`/api/os/customers/${ctx.customerId}`, { name: 'Hackad' })).status, 404);
  assert.equal((await b.post('/api/os/quotes', { customer_id: ctx.customerId, title: 'x' })).status, 404);
  assert.equal((await b.post('/api/os/deals', { title: 'x', customer_id: ctx.customerId })).status, 404);
  const still = ok(await admin.get(`/api/os/customers/${ctx.customerId}`));
  assert.notEqual(still.customer.name, 'Hackad');
});

// ---------------------------------------------------------------- Dashboard, logg, export
test('dashboard visar riktiga siffror och håller isär begreppen', async () => {
  const d = ok(await admin.get('/api/os/dashboard'));
  assert.equal(d.kpis.quotes.accepted_30d, 1);
  assert.ok(d.kpis.quotes.contracted_mrr_net >= 149500 + 150000, 'avtalad MRR inkl. valt tillägg');
  assert.ok(d.kpis.quotes.won_this_month_once_net > 0);
  assert.deepEqual(d.kpis.phase2, ['invoicing', 'support'], 'fakturering visas inte som påhittade siffror');
  assert.ok(d.kpis.projects.open >= 1);
  assert.ok(d.feed.length > 0);
});

test('revisionsloggen fångar inloggningar och viktiga händelser; GDPR-export fungerar', async () => {
  const a = ok(await admin.get('/api/os/audit'));
  const actions = new Set(a.entries.map((e) => e.action));
  for (const x of ['auth.login', 'auth.login_failed', 'auth.mfa_enrolled', 'customer.created', 'quote.sent', 'quote.accepted', 'service.price_changed', 'user.invited', 'user.disabled']) assert.ok(actions.has(x), x);
  const exp = await admin.get(`/api/os/customers/${ctx.customerId}/export`);
  assert.equal(exp.status, 200); assert.match(exp.headers.get('content-disposition'), /attachment/);
  assert.equal(exp.json.contacts[0].email, 'sara@glansstad.se');
  assert.ok(ok(await admin.get('/api/os/audit')).entries.some((e) => e.action === 'customer.exported'));
});

// ---------------------------------------------------------------- Befintlig hemsida
test('befintliga publika sidor och chatten fungerar som förut', async () => {
  for (const p of ['/', '/kontakt.html', '/tjanster.html', '/priskalkylator.html', '/stadbolag.html', '/assets/pop-v6.css', '/sitemap.xml']) {
    const r = await fetch(BASE + p); assert.equal(r.status, 200, p);
    assert.equal(r.headers.get('content-security-policy'), null, `${p} ska inte få adminpanelens CSP`);
  }
  assert.match(await (await fetch(BASE + '/')).text(), /KELA/i);
  const chat = await fetch(BASE + '/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: 'Hej' }] }) });
  assert.ok([200, 501, 502].includes(chat.status), 'chatten svarar som tidigare (501 utan nyckel, 502 med testnyckeln)');
  assert.equal((await fetch(BASE + '/functions/_lib/auth.ts')).status, 404, 'serverkod exponeras inte');
  const robots = await (await fetch(BASE + '/robots.txt')).text();
  assert.match(robots, /Disallow: \/os\//); assert.match(robots, /Disallow: \/offert\//);
});
