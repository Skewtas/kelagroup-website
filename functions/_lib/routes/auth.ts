// /api/os/auth/* – installation, inloggning, MFA, utloggning, inbjudningar.
import { Router, audit, auditStmt } from '../router';
import { HttpError, newId, now, rateLimit, safeEqual, sha256hex, addDays, userAgent } from '../core';
import { v, validate } from '../validate';
import {
  hashPassword, verifyPassword, DUMMY_HASH, passwordProblem, createSession, destroySession, clearCookie,
  encryptSecret, decryptSecret, newTotpSecret, verifyTotp, totpUri, MFA_REQUIRED, ROLE_LABELS, ROLE_PERMISSIONS, Role, STAFF_ROLES,
} from '../auth';

// Startkatalog: tjänstenamn utan priser. Priser sätts av KELA i tjänstekatalogen.
const STARTER_SERVICES: [string, string][] = [
  ['Hemsida – Basic', 'Hemsidor'], ['Hemsida – Premium', 'Hemsidor'],
  ['AI Chat – Standard', 'AI'], ['AI Chat – Advanced', 'AI'],
  ['Bokningssystem', 'System'], ['CRM-system', 'System'], ['Personalapp', 'Appar'], ['Kundportal', 'System'],
  ['SEO-paket', 'Marknadsföring'], ['Google Ads', 'Marknadsföring'], ['Meta Ads', 'Marknadsföring'],
  ['Automatisering', 'Automation'], ['Supportavtal', 'Drift'], ['Drift och hosting', 'Drift'],
];

export function mfaNeeded(role: Role, totpEnabled: boolean) {
  return totpEnabled || MFA_REQUIRED.includes(role);
}

function meView(s: { userId: string; orgId: string; email: string; name: string; role: Role; mfaOk: boolean; totpEnabled: boolean }, org: any) {
  return {
    user: { id: s.userId, email: s.email, name: s.name, role: s.role, role_label: ROLE_LABELS[s.role], totp_enabled: s.totpEnabled },
    org: org ? { id: org.id, name: org.name, currency: org.currency, default_vat_bp: org.default_vat_bp } : null,
    permissions: ROLE_PERMISSIONS[s.role],
    mfa: s.mfaOk ? 'ok' : s.totpEnabled ? 'verify' : 'enroll',
  };
}

export function authRoutes(r: Router) {
  r.get('/auth/setup-status', async ({ env }) => {
    const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>();
    return { needs_setup: (row?.n || 0) === 0, setup_enabled: !!env.OS_SETUP_TOKEN };
  }, { public: true });

  r.post('/auth/setup', async (c) => {
    const { env, ip } = c;
    if (!(await rateLimit(env.DB, `setup:${ip}`, 10, 3600))) throw new HttpError(429, 'rate_limited', 'För många försök. Vänta en stund.');
    if (!env.OS_SETUP_TOKEN) throw new HttpError(403, 'setup_disabled', 'Installation är inte aktiverad (OS_SETUP_TOKEN saknas).');
    const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>();
    if ((row?.n || 0) > 0) throw new HttpError(409, 'already_setup', 'KELA OS är redan installerat.');
    const b = await c.body();
    const d = validate({
      setup_token: v.str({ max: 200 }), org_name: v.str({ max: 120 }), org_number: v.str({ optional: true, max: 20 }),
      name: v.str({ max: 120 }), email: v.email(),
    }, b);
    if (!safeEqual(await sha256hex(d.setup_token!), await sha256hex(env.OS_SETUP_TOKEN))) {
      await audit(c, 'setup.failed', null, null, 'Fel installationsnyckel');
      throw new HttpError(403, 'bad_setup_token', 'Fel installationsnyckel.');
    }
    const pwErr = passwordProblem(b.password);
    if (pwErr) throw new HttpError(422, 'validation', pwErr, { password: pwErr });

    const t = now(); const orgId = newId('org'); const userId = newId('usr');
    const stmts = [
      env.DB.prepare('INSERT INTO organizations (id, name, org_number, created_at, updated_at) VALUES (?,?,?,?,?)').bind(orgId, d.org_name, d.org_number, t, t),
      env.DB.prepare('INSERT INTO users (id, email, name, password_hash, created_at, updated_at) VALUES (?,?,?,?,?,?)').bind(userId, d.email, d.name, await hashPassword(b.password), t, t),
      env.DB.prepare('INSERT INTO memberships (id, org_id, user_id, role, created_at) VALUES (?,?,?,?,?)').bind(newId('mem'), orgId, userId, 'superadmin', t),
      env.DB.prepare('INSERT INTO counters (org_id, key, value) VALUES (?,?,?)').bind(orgId, 'quote_number', 1000),
      ...STARTER_SERVICES.map(([name, cat], i) =>
        env.DB.prepare('INSERT INTO services (id, org_id, name, category, sort, created_at, updated_at) VALUES (?,?,?,?,?,?,?)').bind(newId('svc'), orgId, name, cat, i, t, t)),
      auditStmt(env, orgId, userId, ip, 'setup.completed', 'organization', orgId, `KELA OS installerat för ${d.org_name}`),
    ];
    await env.DB.batch(stmts);
    const sess = await createSession(env, c.req, userId, orgId, false);
    return new Response(JSON.stringify({ ok: true, mfa: 'enroll' }), { headers: { 'content-type': 'application/json', 'set-cookie': sess.cookie } });
  }, { public: true });

  r.post('/auth/login', async (c) => {
    const { env, ip } = c;
    const b = await c.body();
    const d = validate({ email: v.email(), password: v.str({ max: 200, trim: false }) }, b);
    const email = d.email!.toLowerCase();
    if (!(await rateLimit(env.DB, `login:ip:${ip}`, 30, 900)) || !(await rateLimit(env.DB, `login:em:${email}`, 6, 900))) {
      const ru = await env.DB.prepare('SELECT m.org_id FROM users u JOIN memberships m ON m.user_id = u.id WHERE u.email = ? LIMIT 1').bind(email).first<any>();
      await audit(c, 'auth.rate_limited', 'user', null, `Inloggning spärrad tillfälligt för ${email}`, {}, ru?.org_id ?? undefined);
      throw new HttpError(429, 'rate_limited', 'För många inloggningsförsök. Vänta 15 minuter.');
    }
    const user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<any>();
    const ok = await verifyPassword(d.password!, user?.password_hash || DUMMY_HASH);
    if (!user || !ok || user.status !== 'active') {
      // Koppla händelsen till användarens företag om kontot finns, annars loggas den som systemhändelse.
      const m = user ? await env.DB.prepare('SELECT org_id FROM memberships WHERE user_id = ? ORDER BY created_at LIMIT 1').bind(user.id).first<any>() : null;
      await audit(c, 'auth.login_failed', 'user', user?.id ?? null, `Misslyckad inloggning för ${email}${user && user.status !== 'active' ? ' (inaktiverat konto)' : ''}`, {}, m?.org_id ?? undefined);
      throw new HttpError(401, 'bad_credentials', 'Fel e-post eller lösenord.');
    }
    const mem = await env.DB.prepare(`SELECT m.org_id, m.role FROM memberships m WHERE m.user_id = ? AND m.role IN (${STAFF_ROLES.map(() => '?').join(',')}) ORDER BY m.created_at LIMIT 1`)
      .bind(user.id, ...STAFF_ROLES).first<any>();
    if (!mem) throw new HttpError(403, 'no_access', 'Kontot har inte åtkomst till KELA OS.');
    const needMfa = mfaNeeded(mem.role, !!user.totp_enabled);
    const sess = await createSession(env, c.req, user.id, mem.org_id, !needMfa);
    await env.DB.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').bind(now(), user.id).run();
    await audit({ env, ip, s: { userId: user.id, orgId: mem.org_id } as any }, 'auth.login', 'user', user.id, needMfa ? 'Lösenord godkänt, väntar på MFA' : 'Inloggad');
    return new Response(JSON.stringify({ ok: true, mfa: needMfa ? (user.totp_enabled ? 'verify' : 'enroll') : 'ok' }),
      { headers: { 'content-type': 'application/json', 'set-cookie': sess.cookie, 'cache-control': 'no-store' } });
  }, { public: true });

  r.post('/auth/logout', async (c) => {
    await destroySession(c.env, c.s.idHash);
    await audit(c, 'auth.logout', 'user', c.s.userId, 'Utloggad');
    return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json', 'set-cookie': clearCookie(c.req) } });
  }, { preMfa: true });

  r.get('/auth/me', async ({ env, s }) => {
    const org = await env.DB.prepare('SELECT id, name, currency, default_vat_bp FROM organizations WHERE id = ?').bind(s.orgId).first();
    return meView(s, org);
  }, { preMfa: true });

  // Påbörja MFA-registrering: skapar en väntande hemlighet.
  r.post('/auth/mfa/setup', async (c) => {
    const { env, s } = c;
    if (s.totpEnabled && !s.mfaOk) throw new HttpError(409, 'mfa_enabled', 'MFA är redan aktiverat. Ange koden från din app.');
    if (s.totpEnabled) throw new HttpError(409, 'mfa_enabled', 'MFA är redan aktiverat.');
    const secret = newTotpSecret();
    await env.DB.prepare('UPDATE users SET totp_pending_enc = ?, updated_at = ? WHERE id = ?').bind(await encryptSecret(env, secret), now(), s.userId).run();
    return { secret, uri: totpUri(secret, s.email) };
  }, { preMfa: true });

  r.post('/auth/mfa/verify', async (c) => {
    const { env, s, ip } = c;
    const { code } = validate({ code: v.str({ max: 10, pattern: /^\d{6}$/, msg: 'Ange sex siffror.' }) }, await c.body());
    if (!(await rateLimit(env.DB, `mfa:${s.userId}`, 8, 900))) throw new HttpError(429, 'rate_limited', 'För många försök. Vänta 15 minuter.');
    const u = await env.DB.prepare('SELECT totp_secret_enc, totp_pending_enc, totp_enabled, totp_last_step FROM users WHERE id = ?').bind(s.userId).first<any>();
    const enrolling = !u.totp_enabled;
    const enc = enrolling ? u.totp_pending_enc : u.totp_secret_enc;
    if (!enc) throw new HttpError(409, 'mfa_not_started', 'Starta MFA-registreringen först.');
    const secret = await decryptSecret(env, enc);
    const step = await verifyTotp(secret, code!, u.totp_last_step);
    if (step == null) {
      await audit(c, 'auth.mfa_failed', 'user', s.userId, 'Fel MFA-kod');
      throw new HttpError(401, 'bad_code', 'Fel kod. Kontrollera att klockan i telefonen stämmer.');
    }
    if (enrolling) {
      await env.DB.prepare('UPDATE users SET totp_secret_enc = ?, totp_pending_enc = NULL, totp_enabled = 1, totp_last_step = ?, updated_at = ? WHERE id = ?')
        .bind(enc, step, now(), s.userId).run();
    } else {
      await env.DB.prepare('UPDATE users SET totp_last_step = ? WHERE id = ?').bind(step, s.userId).run();
    }
    // Ny session efter höjd säkerhetsnivå (förhindrar sessionsfixering).
    await destroySession(env, s.idHash);
    const sess = await createSession(env, c.req, s.userId, s.orgId, true);
    await audit(c, enrolling ? 'auth.mfa_enrolled' : 'auth.mfa_verified', 'user', s.userId, enrolling ? 'MFA aktiverat' : 'MFA verifierat');
    return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json', 'set-cookie': sess.cookie } });
  }, { preMfa: true });

  r.post('/auth/password', async (c) => {
    const { env, s } = c;
    const b = await c.body();
    const u = await env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(s.userId).first<any>();
    if (!(await verifyPassword(String(b.current_password || ''), u.password_hash))) throw new HttpError(401, 'bad_credentials', 'Nuvarande lösenord stämmer inte.');
    const pwErr = passwordProblem(b.new_password);
    if (pwErr) throw new HttpError(422, 'validation', pwErr, { new_password: pwErr });
    await env.DB.batch([
      env.DB.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').bind(await hashPassword(b.new_password), now(), s.userId),
      env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND id_hash != ?').bind(s.userId, s.idHash),
    ]);
    await audit(c, 'auth.password_changed', 'user', s.userId, 'Lösenord ändrat, övriga sessioner utloggade');
    return { ok: true };
  });

  // Inbjudningar: användaren sätter eget lösenord via engångslänk.
  r.get('/auth/invite/:token', async ({ env, params }) => {
    const inv = await env.DB.prepare('SELECT i.email, i.name, i.role, i.expires_at, i.used_at, i.revoked_at, o.name AS org_name FROM invites i JOIN organizations o ON o.id = i.org_id WHERE i.token_hash = ?')
      .bind(await sha256hex(params.token)).first<any>();
    if (!inv || inv.used_at || inv.revoked_at || Date.parse(inv.expires_at) < Date.now()) throw new HttpError(404, 'invite_invalid', 'Inbjudan är ogiltig eller har gått ut.');
    return { email: inv.email, name: inv.name, role_label: ROLE_LABELS[inv.role as Role], org_name: inv.org_name };
  }, { public: true });

  r.post('/auth/invite/:token', async (c) => {
    const { env, params, ip } = c;
    if (!(await rateLimit(env.DB, `invite:${ip}`, 10, 3600))) throw new HttpError(429, 'rate_limited', 'För många försök.');
    const inv = await env.DB.prepare('SELECT * FROM invites WHERE token_hash = ?').bind(await sha256hex(params.token)).first<any>();
    if (!inv || inv.used_at || inv.revoked_at || Date.parse(inv.expires_at) < Date.now()) throw new HttpError(404, 'invite_invalid', 'Inbjudan är ogiltig eller har gått ut.');
    const b = await c.body();
    const pwErr = passwordProblem(b.password);
    if (pwErr) throw new HttpError(422, 'validation', pwErr, { password: pwErr });
    const t = now();
    let user = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(inv.email).first<any>();
    const stmts: D1PreparedStatement[] = [];
    if (user) throw new HttpError(409, 'user_exists', 'Det finns redan ett konto med den e-postadressen. Be en administratör lägga till behörighet.');
    const userId = newId('usr');
    stmts.push(env.DB.prepare('INSERT INTO users (id, email, name, password_hash, created_at, updated_at) VALUES (?,?,?,?,?,?)').bind(userId, inv.email, inv.name, await hashPassword(b.password), t, t));
    stmts.push(env.DB.prepare('INSERT INTO memberships (id, org_id, user_id, role, created_at) VALUES (?,?,?,?,?)').bind(newId('mem'), inv.org_id, userId, inv.role, t));
    // Villkoret used_at IS NULL gör att inbjudan bara kan användas en gång även vid samtidiga anrop.
    stmts.unshift(env.DB.prepare('UPDATE invites SET used_at = ? WHERE id = ? AND used_at IS NULL').bind(t, inv.id));
    stmts.push(auditStmt(env, inv.org_id, userId, ip, 'user.invite_accepted', 'user', userId, `${inv.email} accepterade inbjudan`));
    const res = await env.DB.batch(stmts);
    if (!res[0].meta.changes) throw new HttpError(409, 'invite_used', 'Inbjudan har redan använts.');
    const sess = await createSession(env, c.req, userId, inv.org_id, !MFA_REQUIRED.includes(inv.role));
    return new Response(JSON.stringify({ ok: true, mfa: MFA_REQUIRED.includes(inv.role) ? 'enroll' : 'ok' }), { headers: { 'content-type': 'application/json', 'set-cookie': sess.cookie } });
  }, { public: true });

  void userAgent; void addDays;
}
