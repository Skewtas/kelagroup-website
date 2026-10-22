// KELA OS – autentisering, sessioner, MFA (TOTP, RFC 6238) och behörigheter.
// Endast standardprimitiver från WebCrypto används (PBKDF2, HMAC, AES-GCM, SHA-256) – ingen egen kryptografi.
import { Env, HttpError, now, randomToken, sha256hex, safeEqual, b64url, fromB64, clientIp, userAgent } from './core';

// ---------- Lösenord ----------
const PBKDF2_ITER = 100_000; // Max som Workers-plattformen stödjer för PBKDF2.

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const h = await pbkdf2(password, salt, PBKDF2_ITER);
  return `pbkdf2-sha256$${PBKDF2_ITER}$${b64url(salt)}$${b64url(h)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, iter, salt, hash] = stored.split('$');
  if (alg !== 'pbkdf2-sha256' || !iter || !salt || !hash) return false;
  const h = await pbkdf2(password, fromB64(salt), Number(iter));
  return safeEqual(b64url(h), hash);
}

/** Hash som används när användaren inte finns, så att svarstiden inte avslöjar vilka konton som finns. */
export const DUMMY_HASH = 'pbkdf2-sha256$100000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

export function passwordProblem(pw: unknown): string | null {
  if (typeof pw !== 'string') return 'Ange ett lösenord.';
  if (pw.length < 12) return 'Lösenordet måste ha minst 12 tecken.';
  if (pw.length > 200) return 'Lösenordet är för långt.';
  if (/^(.)\1+$/.test(pw)) return 'Välj ett mindre förutsägbart lösenord.';
  return null;
}

// ---------- Kryptering av MFA-hemligheter (AES-GCM) ----------
async function aesKey(env: Env): Promise<CryptoKey> {
  let raw: Uint8Array;
  if (env.OS_SECRET_KEY) {
    raw = fromB64(env.OS_SECRET_KEY);
  } else if (env.OS_ENV === 'development') {
    raw = new TextEncoder().encode('kela-os-lokal-utvecklingsnyckel!').slice(0, 32); // ENDAST lokalt
  } else {
    throw new HttpError(500, 'missing_secret', 'OS_SECRET_KEY saknas i miljövariablerna.');
  }
  if (raw.length !== 32) throw new HttpError(500, 'bad_secret', 'OS_SECRET_KEY måste vara 32 byte (base64).');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptSecret(env: Env, plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(env), new TextEncoder().encode(plain));
  return `v1.${b64url(iv)}.${b64url(ct)}`;
}

export async function decryptSecret(env: Env, enc: string): Promise<string> {
  const [ver, iv, ct] = enc.split('.');
  if (ver !== 'v1') throw new Error('okänt format');
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(iv) }, await aesKey(env), fromB64(ct));
  return new TextDecoder().decode(pt);
}

// ---------- TOTP ----------
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32Encode(bytes: Uint8Array): string {
  let bits = 0, value = 0, out = '';
  for (const b of bytes) {
    value = (value << 8) | b; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
function base32Decode(s: string): Uint8Array {
  const clean = s.replace(/=+$/, '').toUpperCase().replace(/\s/g, '');
  let bits = 0, value = 0; const out: number[] = [];
  for (const c of clean) {
    const i = B32.indexOf(c); if (i < 0) continue;
    value = (value << 5) | i; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return new Uint8Array(out);
}

async function hotp(secretB32: string, counter: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', base32Decode(secretB32), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const msg = new ArrayBuffer(8);
  const view = new DataView(msg);
  view.setUint32(0, Math.floor(counter / 2 ** 32));
  view.setUint32(4, counter >>> 0);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg));
  const off = sig[sig.length - 1] & 15;
  const bin = ((sig[off] & 127) << 24) | (sig[off + 1] << 16) | (sig[off + 2] << 8) | sig[off + 3];
  return String(bin % 1_000_000).padStart(6, '0');
}

export function newTotpSecret(): string {
  return base32Encode(crypto.getRandomValues(new Uint8Array(20)));
}

/** Returnerar tidssteget som matchade (±1 steg = 30 s tolerans), annars null. */
export async function verifyTotp(secretB32: string, code: string, lastStep: number | null): Promise<number | null> {
  if (!/^\d{6}$/.test(code)) return null;
  const step = Math.floor(Date.now() / 1000 / 30);
  for (const s of [step, step - 1, step + 1]) {
    if (lastStep != null && s <= lastStep) continue; // förhindra återanvändning av kod
    if (safeEqual(await hotp(secretB32, s), code)) return s;
  }
  return null;
}

export function totpUri(secret: string, email: string) {
  const label = encodeURIComponent(`KELA OS:${email}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent('KELA OS')}&algorithm=SHA1&digits=6&period=30`;
}

// ---------- Roller och behörigheter ----------
export const ROLES = ['superadmin', 'admin', 'sales', 'pm', 'finance', 'customer'] as const;
export type Role = (typeof ROLES)[number];
export const STAFF_ROLES: Role[] = ['superadmin', 'admin', 'sales', 'pm', 'finance'];
export const MFA_REQUIRED: Role[] = ['superadmin', 'admin'];

export const PERMISSIONS = [
  'dashboard:read',
  'customers:read', 'customers:write', 'customers:export',
  'leads:read', 'leads:write',
  'deals:read', 'deals:write',
  'quotes:read', 'quotes:write', 'quotes:send',
  'services:read', 'services:write', 'services:costs',
  'tasks:read', 'tasks:write',
  'projects:read', 'projects:write',
  'users:read', 'users:manage',
  'audit:read',
  'settings:write',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ALL = [...PERMISSIONS];
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  superadmin: ALL,
  admin: ALL,
  sales: ['dashboard:read', 'customers:read', 'customers:write', 'leads:read', 'leads:write', 'deals:read', 'deals:write',
    'quotes:read', 'quotes:write', 'quotes:send', 'services:read', 'tasks:read', 'tasks:write', 'projects:read', 'users:read'],
  pm: ['dashboard:read', 'customers:read', 'deals:read', 'quotes:read', 'services:read', 'tasks:read', 'tasks:write', 'projects:read', 'projects:write', 'users:read'],
  finance: ['dashboard:read', 'customers:read', 'customers:export', 'deals:read', 'quotes:read', 'services:read', 'services:costs',
    'tasks:read', 'tasks:write', 'projects:read', 'users:read'],
  customer: [],
};

export const ROLE_LABELS: Record<Role, string> = {
  superadmin: 'Superadmin', admin: 'Administratör', sales: 'Säljare', pm: 'Projektledare', finance: 'Ekonomi', customer: 'Kund',
};

// ---------- Sessioner ----------
const SESSION_ABSOLUTE_H = 12;
const SESSION_IDLE_H = 4;

export interface Session {
  idHash: string;
  userId: string;
  orgId: string;
  mfaOk: boolean;
  role: Role;
  email: string;
  name: string;
  totpEnabled: boolean;
  perms: Set<Permission>;
}

export function cookieName(req: Request) {
  return new URL(req.url).protocol === 'https:' ? '__Host-kela_os' : 'kela_os_dev';
}

export function sessionCookie(req: Request, token: string, maxAgeSec: number) {
  const secure = new URL(req.url).protocol === 'https:';
  return `${cookieName(req)}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSec}${secure ? '; Secure' : ''}`;
}

export function readCookie(req: Request, name: string): string | null {
  const c = req.headers.get('cookie') || '';
  for (const part of c.split(/;\s*/)) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i) === name) return part.slice(i + 1);
  }
  return null;
}

export async function createSession(env: Env, req: Request, userId: string, orgId: string, mfaOk: boolean) {
  const token = randomToken(32);
  const idHash = await sha256hex(token);
  const t = now();
  const exp = new Date(Date.now() + SESSION_ABSOLUTE_H * 3600_000).toISOString();
  await env.DB.prepare('INSERT INTO sessions (id_hash, user_id, org_id, mfa_ok, ip, ua, created_at, last_seen_at, expires_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .bind(idHash, userId, orgId, mfaOk ? 1 : 0, clientIp(req), userAgent(req), t, t, exp).run();
  return { token, cookie: sessionCookie(req, token, SESSION_ABSOLUTE_H * 3600) };
}

export async function destroySession(env: Env, idHash: string) {
  await env.DB.prepare('DELETE FROM sessions WHERE id_hash = ?').bind(idHash).run();
}

export function clearCookie(req: Request) {
  return sessionCookie(req, '', 0);
}

export async function loadSession(env: Env, req: Request): Promise<Session | null> {
  const token = readCookie(req, cookieName(req));
  if (!token || token.length < 20 || token.length > 100) return null;
  const idHash = await sha256hex(token);
  const row = await env.DB.prepare(
    `SELECT s.id_hash, s.user_id, s.org_id, s.mfa_ok, s.last_seen_at, s.expires_at, u.email, u.name, u.status, u.totp_enabled, m.role
       FROM sessions s JOIN users u ON u.id = s.user_id
       JOIN memberships m ON m.user_id = s.user_id AND m.org_id = s.org_id
      WHERE s.id_hash = ?`).bind(idHash).first<any>();
  if (!row) return null;
  const t = Date.now();
  const idleExpired = t - Date.parse(row.last_seen_at) > SESSION_IDLE_H * 3600_000;
  if (row.status !== 'active' || Date.parse(row.expires_at) < t || idleExpired) {
    await destroySession(env, idHash);
    return null;
  }
  if (t - Date.parse(row.last_seen_at) > 5 * 60_000) {
    await env.DB.prepare('UPDATE sessions SET last_seen_at = ? WHERE id_hash = ?').bind(now(), idHash).run();
  }
  const role = row.role as Role;
  return {
    idHash, userId: row.user_id, orgId: row.org_id, mfaOk: !!row.mfa_ok, role, email: row.email, name: row.name,
    totpEnabled: !!row.totp_enabled, perms: new Set(ROLE_PERMISSIONS[role] || []),
  };
}

/** Kastar 403 om sessionen saknar behörigheten. Verkställs alltid på servern. */
export function requirePerm(s: Session, ...perms: Permission[]) {
  for (const p of perms) if (!s.perms.has(p)) throw new HttpError(403, 'forbidden', 'Du saknar behörighet för detta.');
}

export function can(s: Session, p: Permission) {
  return s.perms.has(p);
}
