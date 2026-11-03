#!/usr/bin/env node
// Återställ lösenordet för ett KELA OS-konto (när man inte kan logga in alls).
// Sätter ett nytt lösenord, nollställer tvåstegsverifieringen (autentiseringsappen ställs in igen
// vid nästa inloggning) och loggar ut kontot överallt. Lösenordet skrivs dolt och lämnar aldrig datorn i klartext.
//
// Användning:  node scripts/reset-os-losenord.mjs           (produktion – kelagroup.se)
//              node scripts/reset-os-losenord.mjs --local   (lokal testdatabas)
import { execFileSync } from 'node:child_process';
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOCAL = process.argv.includes('--local');
const target = LOCAL
  ? ['--local', '--persist-to', process.env.KELA_D1_PERSIST || '.wrangler/state']
  : ['--remote', '--env', 'production'];

function d1(sql) {
  const out = execFileSync('npx', ['--yes', 'wrangler@4', 'd1', 'execute', 'kela-os', ...target, '--config', 'db/wrangler.toml', '--json', '--command', sql],
    { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return JSON.parse(out.slice(out.indexOf('[')));
}

const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: !!process.stdin.isTTY });
let muted = false;
const write = rl._writeToOutput.bind(rl);
rl._writeToOutput = (s) => { if (!muted) write(s); else if (!/[\r\n]/.test(s)) process.stdout.write('•'); };
const lines = [];
let waiting = null;
rl.on('line', (l) => { if (waiting) { const w = waiting; waiting = null; w(l); } else lines.push(l); });
function ask(question, hidden = false) {
  if (process.stdin.isTTY) { rl.setPrompt(question); rl.prompt(); } else process.stdout.write(question);
  muted = hidden;
  return new Promise((resolve) => {
    const done = (a) => { muted = false; if (hidden) process.stdout.write('\n'); resolve(a); };
    if (lines.length) done(lines.shift()); else waiting = done;
  });
}

const b64url = (b) => Buffer.from(b).toString('base64url');
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

console.log(`\nKELA OS – återställ lösenord (${LOCAL ? 'lokal testdatabas' : 'PRODUKTION, kelagroup.se'})\n`);
const users = d1("SELECT u.email, u.name, m.role FROM users u JOIN memberships m ON m.user_id = u.id WHERE m.role != 'customer' ORDER BY u.created_at")[0].results;
if (!users.length) { console.log('Det finns inga konton. Skapa det första på /os/ i stället.'); rl.close(); process.exit(1); }
console.log('Konton:');
users.forEach((u) => console.log(`  • ${u.email}  (${u.name}, ${u.role})`));
console.log('');

const argEmail = process.argv.slice(2).find((a) => a.includes('@'));
const fromClipboard = process.argv.includes('--urklipp');
const email = (argEmail || await ask('E-post för kontot som ska återställas: ')).trim().toLowerCase();
if (!users.some((u) => u.email.toLowerCase() === email)) { console.log('Det kontot finns inte. Inget ändrades.'); rl.close(); process.exit(1); }
const pw = fromClipboard ? execFileSync('pbpaste', { encoding: 'utf8' }).trim() : await ask('Nytt lösenord (minst 12 tecken): ', true);
if (pw.length < 12 || pw.length > 200 || /^(.)\1+$/.test(pw)) { console.log('Lösenordet måste ha 12–200 tecken och inte vara samma tecken upprepat. Inget ändrades.'); rl.close(); process.exit(1); }
const pw2 = fromClipboard ? pw : await ask('Skriv lösenordet igen: ', true);
if (fromClipboard) console.log('Använder lösenordet från urklippet.');
if (pw !== pw2) { console.log('Lösenorden matchar inte. Inget ändrades.'); rl.close(); process.exit(1); }

const salt = randomBytes(16);
const hash = `pbkdf2-sha256$100000$${b64url(salt)}$${b64url(pbkdf2Sync(pw, salt, 100000, 32, 'sha256'))}`;
const t = new Date().toISOString();
const id = 'aud_' + randomBytes(10).toString('hex');
d1(`UPDATE users SET password_hash = ${q(hash)}, totp_secret_enc = NULL, totp_enabled = 0, totp_pending_enc = NULL, totp_last_step = NULL, status = 'active', updated_at = ${q(t)} WHERE email = ${q(email)} COLLATE NOCASE;
DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE email = ${q(email)} COLLATE NOCASE);
DELETE FROM rate_limits WHERE key = ${q('login:em:' + email)};
INSERT INTO audit_logs (id, org_id, actor_user_id, action, entity_type, entity_id, summary, data_json, ip, created_at)
  SELECT ${q(id)}, m.org_id, u.id, 'auth.password_reset_cli', 'user', u.id, 'Lösenord och tvåstegsverifiering återställda via skript', '{}', 'skript', ${q(t)}
  FROM users u JOIN memberships m ON m.user_id = u.id WHERE u.email = ${q(email)} COLLATE NOCASE LIMIT 1;`);

rl.close();
console.log(`\n✓ Klart. Logga in på ${LOCAL ? 'http://localhost:8788/os/' : 'https://kelagroup.se/os/'} med ${email} och det nya lösenordet.`);
console.log('  Du får direkt ställa in autentiseringsappen igen (skanna QR-koden med t.ex. Google Authenticator).\n');
