// KELA OS – liten router för /api/os/*. Varje route kräver inloggning + MFA om inte annat anges.
import { Env, HttpError, json, errorResponse, readJson, newId, now, clientIp, SECURITY_HEADERS } from './core';
import { Session, loadSession, Permission, requirePerm } from './auth';

export interface Ctx {
  env: Env;
  req: Request;
  url: URL;
  params: Record<string, string>;
  /** Satt för alla routes utom public: true. */
  s: Session;
  body: () => Promise<any>;
  ip: string;
}

type Handler = (c: Ctx) => Promise<unknown>;
interface RouteOpts {
  /** Ingen inloggning krävs. */
  public?: boolean;
  /** Inloggning krävs men MFA-steget behöver inte vara klart (används i inloggningsflödet). */
  preMfa?: boolean;
  perm?: Permission | Permission[];
}
interface Route { method: string; parts: string[]; handler: Handler; opts: RouteOpts }

export class Router {
  routes: Route[] = [];
  add(method: string, path: string, handler: Handler, opts: RouteOpts = {}) {
    this.routes.push({ method, parts: path.split('/').filter(Boolean), handler, opts });
    return this;
  }
  get(p: string, h: Handler, o?: RouteOpts) { return this.add('GET', p, h, o); }
  post(p: string, h: Handler, o?: RouteOpts) { return this.add('POST', p, h, o); }
  patch(p: string, h: Handler, o?: RouteOpts) { return this.add('PATCH', p, h, o); }
  del(p: string, h: Handler, o?: RouteOpts) { return this.add('DELETE', p, h, o); }

  match(method: string, path: string) {
    const segs = path.split('/').filter(Boolean);
    let methodMismatch = false;
    for (const r of this.routes) {
      if (r.parts.length !== segs.length) continue;
      const params: Record<string, string> = {};
      let ok = true;
      for (let i = 0; i < segs.length; i++) {
        const p = r.parts[i];
        if (p.startsWith(':')) params[p.slice(1)] = decodeURIComponent(segs[i]);
        else if (p !== segs[i]) { ok = false; break; }
      }
      if (!ok) continue;
      if (r.method !== method) { methodMismatch = true; continue; }
      return { route: r, params };
    }
    return methodMismatch ? 'method' : null;
  }

  async handle(req: Request, env: Env, prefix: string): Promise<Response> {
    try {
      const url = new URL(req.url);
      const path = url.pathname.slice(prefix.length) || '/';
      const m = this.match(req.method, path);
      if (m === 'method') throw new HttpError(405, 'method_not_allowed', 'Metoden stöds inte.');
      if (!m) throw new HttpError(404, 'not_found', 'Hittades inte.');

      // CSRF-skydd: ändrande anrop måste komma från samma ursprung och bära vår egen header
      // (kan inte sättas av en främmande sida utan CORS, som vi inte tillåter). Kakan är dessutom SameSite=Strict.
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        const origin = req.headers.get('origin');
        if (origin && origin !== url.origin) throw new HttpError(403, 'bad_origin', 'Otillåtet ursprung.');
        if (req.headers.get('x-kela-os') !== '1') throw new HttpError(403, 'csrf', 'Saknar säkerhetsheader.');
      }

      let s: Session | null = null;
      if (!m.route.opts.public) {
        s = await loadSession(env, req);
        if (!s) throw new HttpError(401, 'unauthenticated', 'Logga in för att fortsätta.');
        if (s.role === 'customer') throw new HttpError(403, 'forbidden', 'Kundkonton har inte åtkomst till adminpanelen.');
        if (!m.route.opts.preMfa && !s.mfaOk) throw new HttpError(401, 'mfa_required', 'Verifiera med din autentiseringsapp.');
        const perm = m.route.opts.perm;
        if (perm) requirePerm(s, ...(Array.isArray(perm) ? perm : [perm]));
      }
      let cached: any;
      const ctx: Ctx = {
        env, req, url, params: m.params, s: s as Session, ip: clientIp(req),
        body: async () => (cached ??= await readJson(req)),
      };
      const out = await m.route.handler(ctx);
      if (out instanceof Response) {
        for (const [k, v] of Object.entries(SECURITY_HEADERS)) if (!out.headers.has(k)) out.headers.set(k, v);
        return out;
      }
      return json(out ?? { ok: true });
    } catch (e) {
      return errorResponse(e);
    }
  }
}

// ---------- Revisionslogg och aktiviteter ----------
export async function audit(c: Pick<Ctx, 'env' | 'ip'> & { s?: Session | null }, action: string, entityType: string | null, entityId: string | null, summary: string, data: unknown = {}, orgId?: string) {
  await c.env.DB.prepare('INSERT INTO audit_logs (id, org_id, actor_user_id, action, entity_type, entity_id, summary, data_json, ip, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .bind(newId('aud'), orgId ?? c.s?.orgId ?? null, c.s?.userId ?? null, action, entityType, entityId, summary.slice(0, 300), JSON.stringify(data).slice(0, 4000), c.ip, now())
    .run();
}

export function auditStmt(env: Env, orgId: string | null, userId: string | null, ip: string | null, action: string, entityType: string | null, entityId: string | null, summary: string, data: unknown = {}) {
  return env.DB.prepare('INSERT INTO audit_logs (id, org_id, actor_user_id, action, entity_type, entity_id, summary, data_json, ip, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .bind(newId('aud'), orgId, userId, action, entityType, entityId, summary.slice(0, 300), JSON.stringify(data).slice(0, 4000), ip, now());
}

export function activityStmt(env: Env, orgId: string, a: { customer_id?: string | null; deal_id?: string | null; lead_id?: string | null; quote_id?: string | null; type: string; title: string; body?: string | null; actor?: string | null }) {
  return env.DB.prepare('INSERT INTO activities (id, org_id, customer_id, deal_id, lead_id, quote_id, type, title, body, actor_user_id, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .bind(newId('act'), orgId, a.customer_id ?? null, a.deal_id ?? null, a.lead_id ?? null, a.quote_id ?? null, a.type, a.title.slice(0, 300), a.body ?? null, a.actor ?? null, now());
}

/** Bygger UPDATE ... SET för de fält som faktiskt skickats. Endast vitlistade kolumner. */
export function updateSet(fields: Record<string, unknown>, allowed: readonly string[]) {
  const cols: string[] = []; const vals: unknown[] = [];
  for (const k of allowed) if (k in fields) { cols.push(`${k} = ?`); vals.push(fields[k]); }
  return { sql: cols.join(', '), vals };
}
