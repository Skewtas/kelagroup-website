// KELA OS – grundverktyg för servern (svar, fel, ID:n, hashning, tid).

export interface Env {
  DB: D1Database;
  /** Krävs för första installationen (/os/#/setup). Ta bort efter att superadmin skapats. */
  OS_SETUP_TOKEN?: string;
  /** 32 slumpmässiga byte i base64. Krypterar MFA-hemligheter. Krävs i produktion. */
  OS_SECRET_KEY?: string;
  /** "development" tillåter en lokal reservnyckel för OS_SECRET_KEY. */
  OS_ENV?: string;
}

export class HttpError extends Error {
  constructor(public status: number, public code: string, message?: string, public details?: unknown) {
    super(message || code);
  }
}

export const SECURITY_HEADERS: Record<string, string> = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  'cache-control': 'no-store',
};

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...SECURITY_HEADERS, ...headers },
  });
}

export function errorResponse(e: unknown): Response {
  if (e instanceof HttpError) {
    return json({ error: e.code, message: e.message, details: e.details }, e.status);
  }
  console.error('KELA OS internt fel', e);
  return json({ error: 'server_error', message: 'Något gick fel på servern.' }, 500);
}

export const now = () => new Date().toISOString();
export const today = () => new Date().toISOString().slice(0, 10);
export function addDays(iso: string, days: number) {
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00Z' : iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz'; // base32 (Crockford-liknande, gemener)
export function newId(prefix: string, len = 20): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let s = '';
  for (const b of bytes) s += ALPHABET[b & 31];
  return `${prefix}_${s}`;
}

export function randomToken(bytes = 32): string {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export function b64url(buf: ArrayBuffer | Uint8Array): string {
  const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const b of u) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function fromB64(s: string): Uint8Array {
  const n = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(n + '==='.slice((n.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export async function sha256hex(input: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Jämförelse i konstant tid (för hashar/token av samma längd). */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export function clientIp(req: Request): string {
  return req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'okänd';
}
export function userAgent(req: Request): string {
  return (req.headers.get('user-agent') || '').slice(0, 300);
}

export async function readJson(req: Request, maxBytes = 200_000): Promise<any> {
  const len = Number(req.headers.get('content-length') || 0);
  if (len > maxBytes) throw new HttpError(413, 'too_large', 'För stor förfrågan.');
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, 'too_large', 'För stor förfrågan.');
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'bad_json', 'Ogiltig JSON.');
  }
}

/** Enkel glidande-fönster-begränsning i D1. Returnerar false om gränsen nåtts. */
export async function rateLimit(db: D1Database, key: string, limit: number, windowSec: number): Promise<boolean> {
  const since = new Date(Date.now() - windowSec * 1000).toISOString();
  const row = await db.prepare('SELECT COUNT(*) AS n FROM rate_limits WHERE key = ? AND created_at > ?').bind(key, since).first<{ n: number }>();
  if ((row?.n || 0) >= limit) return false;
  await db.prepare('INSERT INTO rate_limits (key, created_at) VALUES (?, ?)').bind(key, now()).run();
  // Städa bort gamla rader ibland.
  if (Math.random() < 0.02) {
    await db.prepare('DELETE FROM rate_limits WHERE created_at < ?').bind(new Date(Date.now() - 86400_000).toISOString()).run();
  }
  return true;
}

export function escapeHtml(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

/** Escapar % och _ för LIKE-sökning (används med ESCAPE '\'). */
export function likeTerm(q: string): string {
  return '%' + q.replace(/[\\%_]/g, (c) => '\\' + c) + '%';
}

export function parseJson<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
}
