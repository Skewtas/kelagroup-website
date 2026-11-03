// Offertsidor med spårning – publikt API som sidan under /s/<slug>/ anropar.
// Ingen inloggning: åtkomst styrs av den hemliga sluggen. Inga kakor sätts.
import { Env, HttpError, json, errorResponse, newId, now, clientIp, userAgent, rateLimit, readJson } from './core';

const SLUG_RE = /^[a-z0-9-]{1,40}-[A-Za-z0-9_-]{20,60}$/;
const VISIT_RE = /^[A-Za-z0-9_-]{16,40}$/;
const KEY_RE = /^[a-z0-9_-]{1,40}$/;
const CHOICES = new Set(['ja', 'kanske', 'nej']);
const SECTIONS = new Set(['offert', 'erbjudande', 'moduler', 'villkor', 'nasta-steg']);
const EVENT_TYPES = new Set(['all_yes', 'clear', 'copy']);
const DEVICES = new Set(['mobil', 'dator', 'surfplatta']);

export async function findPage(env: Env, slug: string) {
  if (!SLUG_RE.test(slug)) return null;
  return env.DB.prepare('SELECT * FROM tracked_pages WHERE slug = ? AND active = 1').bind(slug).first<any>();
}

function cleanChoices(input: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
  for (const [k, v] of Object.entries(input as Record<string, unknown>).slice(0, 60)) {
    if (KEY_RE.test(k) && typeof v === 'string' && CHOICES.has(v)) out[k] = v;
  }
  return out;
}

export async function handleTrackingApi(env: Env, req: Request, parts: string[]): Promise<Response> {
  try {
    const url = new URL(req.url);
    const [slug, action] = parts;
    if (parts.length !== 2) throw new HttpError(404, 'not_found', 'Hittades inte.');
    const ip = clientIp(req);

    if (req.method === 'GET' && action === 'choices') {
      if (!(await rateLimit(env.DB, `tpget:${ip}`, 300, 3600))) throw new HttpError(429, 'rate_limited', 'För många förfrågningar.');
      const p = await findPage(env, slug);
      if (!p) throw new HttpError(404, 'not_found', 'Hittades inte.');
      return json({ choices: JSON.parse(p.choices_json || '{}') }, 200, { 'cache-control': 'no-store' });
    }
    if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed', 'Metoden stöds inte.');
    const origin = req.headers.get('origin');
    if (origin && origin !== url.origin) throw new HttpError(403, 'bad_origin', 'Otillåtet ursprung.');
    if (req.headers.get('x-kela-s') !== '1') throw new HttpError(403, 'csrf', 'Saknar säkerhetsheader.');
    if (!(await rateLimit(env.DB, `tppost:${ip}`, 600, 3600))) throw new HttpError(429, 'rate_limited', 'För många förfrågningar.');

    const p = await findPage(env, slug);
    if (!p) throw new HttpError(404, 'not_found', 'Hittades inte.');
    const body = await readJson(req, 8_000);
    const visitId = typeof body?.visit_id === 'string' && VISIT_RE.test(body.visit_id) ? body.visit_id : null;
    if (!visitId) throw new HttpError(422, 'validation', 'Ogiltigt besök.');
    const t = now();
    const event = (type: string, data: unknown = {}) => env.DB.prepare('INSERT INTO tracked_events (id, org_id, page_id, visit_id, type, data_json, created_at) VALUES (?,?,?,?,?,?,?)')
      .bind(newId('tev'), p.org_id, p.id, visitId, type, JSON.stringify(data).slice(0, 2000), t);

    if (action === 'open') {
      const device = typeof body.device === 'string' && DEVICES.has(body.device) ? body.device : null;
      const ins = await env.DB.prepare('INSERT OR IGNORE INTO tracked_visits (id, org_id, page_id, started_at, last_seen_at, device, ip, ua) VALUES (?,?,?,?,?,?,?,?)')
        .bind(visitId, p.org_id, p.id, t, t, device, ip, userAgent(req)).run();
      if (ins.meta.changes) await event('open', { device }).run();
      return json({ ok: true });
    }

    const visit = await env.DB.prepare('SELECT * FROM tracked_visits WHERE id = ? AND page_id = ?').bind(visitId, p.id).first<any>();
    if (!visit) throw new HttpError(404, 'not_found', 'Okänt besök.');

    if (action === 'ping') {
      const secs = Math.max(0, Math.min(Number(body.active_seconds) || 0, 6 * 3600));
      const scroll = Math.max(0, Math.min(Math.round(Number(body.max_scroll) || 0), 100));
      const seen: string[] = JSON.parse(visit.sections_json || '[]');
      const fresh: string[] = [];
      for (const s of Array.isArray(body.sections) ? body.sections.slice(0, 10) : []) {
        if (typeof s === 'string' && SECTIONS.has(s) && !seen.includes(s)) { seen.push(s); fresh.push(s); }
      }
      await env.DB.batch([
        env.DB.prepare('UPDATE tracked_visits SET last_seen_at = ?, active_seconds = MAX(active_seconds, ?), max_scroll = MAX(max_scroll, ?), sections_json = ? WHERE id = ?')
          .bind(t, Math.round(secs), scroll, JSON.stringify(seen), visitId),
        ...fresh.map((s) => event('section', { section: s })),
      ]);
      return json({ ok: true });
    }

    if (action === 'choices') {
      const choices = cleanChoices(body.choices);
      const before = cleanChoices(JSON.parse(p.choices_json || '{}'));
      const changed: Record<string, string | null> = {};
      for (const k of new Set([...Object.keys(before), ...Object.keys(choices)])) {
        if (before[k] !== choices[k]) changed[k] = choices[k] ?? null;
      }
      if (!Object.keys(changed).length) return json({ ok: true, choices });
      await env.DB.batch([
        env.DB.prepare('UPDATE tracked_pages SET choices_json = ?, choices_updated_at = ? WHERE id = ?').bind(JSON.stringify(choices), t, p.id),
        env.DB.prepare('UPDATE tracked_visits SET last_seen_at = ? WHERE id = ?').bind(t, visitId),
        event('choice', { changed }),
      ]);
      return json({ ok: true, choices });
    }

    if (action === 'event') {
      const type = typeof body.type === 'string' && EVENT_TYPES.has(body.type) ? body.type : null;
      if (!type) throw new HttpError(422, 'validation', 'Okänd händelse.');
      await event(type).run();
      return json({ ok: true });
    }
    throw new HttpError(404, 'not_found', 'Hittades inte.');
  } catch (e) {
    return errorResponse(e);
  }
}
