// Checklistor på hemlig adress under /s/<slug>/ – kunden skriver in svar utan konto.
// GET  /api/s/<slug>/answers  → alla svar
// POST /api/s/<slug>/answers  → spara ett svar { key, label, section, text, done, owner, by }
// GET  /api/s/<slug>/files    → filer som laddats upp i checklistan (namn och storlek – aldrig innehållet)
// POST /api/s/<slug>/files    → ladda upp en fil (multipart: file, key, label, by). Hamnar som bilaga under
//                               Avtal och dokument på kunden som checklistan är kopplad till.
// Åtkomst styrs av den hemliga sluggen, precis som offertsidorna. Inga kakor sätts.
import { Env, HttpError, json, errorResponse, newId, now, clientIp, rateLimit, readJson } from './core';
import { findPage } from './tracking';
import { readUpload, fileStmts } from './routes/documents';

const KEY_RE = /^[a-z0-9-]{1,40}$/;
const MAX_TEXT = 20_000;
const COALESCE_MS = 10 * 60_000;

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\u0000/g, '').slice(0, max) : '');

export async function handleChecklistApi(env: Env, req: Request, slug: string): Promise<Response> {
  try {
    const url = new URL(req.url);
    const ip = clientIp(req);

    if (req.method === 'GET') {
      if (!(await rateLimit(env.DB, `clget:${ip}`, 1200, 3600))) throw new HttpError(429, 'rate_limited', 'För många förfrågningar.');
      const p = await findPage(env, slug);
      if (!p || p.kind !== 'checklista') throw new HttpError(404, 'not_found', 'Hittades inte.');
      const { results } = await env.DB.prepare('SELECT item_key, text, done, owner, updated_by, updated_at FROM checklist_answers WHERE page_id = ? AND org_id = ?')
        .bind(p.id, p.org_id).all<any>();
      return json({
        answers: results.map((a) => ({ key: a.item_key, text: a.text, done: !!a.done, owner: a.owner || '', by: a.updated_by || '', at: a.updated_at })),
      }, 200, { 'cache-control': 'no-store' });
    }

    if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed', 'Metoden stöds inte.');
    const origin = req.headers.get('origin');
    if (origin && origin !== url.origin) throw new HttpError(403, 'bad_origin', 'Otillåtet ursprung.');
    if (req.headers.get('x-kela-s') !== '1') throw new HttpError(403, 'csrf', 'Saknar säkerhetsheader.');
    if (!(await rateLimit(env.DB, `clpost:${ip}`, 2400, 3600))) throw new HttpError(429, 'rate_limited', 'För många sparningar. Vänta en stund och försök igen.');

    const p = await findPage(env, slug);
    if (!p || p.kind !== 'checklista') throw new HttpError(404, 'not_found', 'Hittades inte.');
    const body = await readJson(req, 64_000);
    const key = typeof body?.key === 'string' && KEY_RE.test(body.key) ? body.key : null;
    if (!key) throw new HttpError(422, 'validation', 'Okänd punkt.');
    if (typeof body.text !== 'string' || body.text.length > MAX_TEXT) throw new HttpError(422, 'validation', `Svaret får vara högst ${MAX_TEXT} tecken.`);
    const text = str(body.text, MAX_TEXT);
    const done = body.done === true ? 1 : 0;
    const by = str(body.by, 60).trim() || null;
    const owner = str(body.owner, 80).trim();
    const pos = Number.isInteger(body.pos) && body.pos >= 0 && body.pos < 1000 ? body.pos : 0;
    const label = str(body.label, 200);
    const section = str(body.section, 120);
    const t = now();

    const prev = await env.DB.prepare('SELECT text, done, owner FROM checklist_answers WHERE page_id = ? AND item_key = ?').bind(p.id, key).first<any>();
    if (prev && prev.text === text && prev.done === done && (prev.owner || '') === owner) return json({ ok: true, at: null });

    // Historik: samma person som skriver vidare på samma punkt inom 10 minuter uppdaterar sin senaste rad.
    const last = await env.DB.prepare('SELECT id, updated_by, updated_at FROM checklist_history WHERE page_id = ? AND item_key = ? ORDER BY updated_at DESC LIMIT 1')
      .bind(p.id, key).first<any>();
    const sameRun = last && (last.updated_by || null) === by && Date.now() - Date.parse(last.updated_at) < COALESCE_MS;
    const hist = sameRun
      ? env.DB.prepare('UPDATE checklist_history SET text = ?, done = ?, owner = ?, updated_at = ? WHERE id = ?').bind(text, done, owner, t, last.id)
      : env.DB.prepare('INSERT INTO checklist_history (id, org_id, page_id, item_key, text, done, owner, updated_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
        .bind(newId('clh'), p.org_id, p.id, key, text, done, owner, by, t, t);

    await env.DB.batch([
      env.DB.prepare(`INSERT INTO checklist_answers (page_id, org_id, item_key, label, section, pos, text, done, owner, updated_by, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(page_id, item_key) DO UPDATE SET label = excluded.label, section = excluded.section, pos = excluded.pos, text = excluded.text, done = excluded.done,
        owner = excluded.owner, updated_by = excluded.updated_by, updated_at = excluded.updated_at`)
        .bind(p.id, p.org_id, key, label, section, pos, text, done, owner, by, t),
      hist,
    ]);
    await notifyAnswers(env, url, p, by);
    return json({ ok: true, at: t });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Mejlnotis till KELA när kunden skriver i checklistan – högst en per timme och sida. Fel stoppar aldrig sparandet. */
async function notifyAnswers(env: Env, url: URL, p: any, by: string | null) {
  try {
    const target = env.OFFER_NOTIFY_URL || (env.OS_ENV === 'development' ? '' : 'https://formspree.io/f/xojkdewo');
    if (!target) return;
    const since = new Date(Date.now() - 60 * 60_000).toISOString();
    const recent = await env.DB.prepare("SELECT 1 FROM tracked_events WHERE page_id = ? AND type = 'notified_answers' AND created_at > ? LIMIT 1").bind(p.id, since).first();
    if (recent) return;
    await env.DB.prepare("INSERT INTO tracked_events (id, org_id, page_id, visit_id, type, data_json, created_at) VALUES (?,?,?,NULL,'notified_answers','{}',?)")
      .bind(newId('tev'), p.org_id, p.id, now()).run();
    const who = p.customer_name || p.title;
    const link = `${url.origin}/os/#/sparning/${p.id}`;
    const res = await fetch(target, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        _subject: `${who} skriver i checklistan`,
        meddelande: `${by ? by + ' på ' : ''}${who} har börjat fylla i "${p.title}".\n\nSe alla svar i KELA OS:\n${link}`,
        sida: p.title, kund: who, namn: by || 'okänt', kela_os: link,
      }),
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) console.error('Checklistnotis misslyckades', res.status);
  } catch (e) {
    console.error('Checklistnotis misslyckades', e);
  }
}

/** Filer från checklistan: kunden laddar upp t.ex. sin tjänstelista från TimeWave. Lagras i dokumentmodulen. */
export async function handleChecklistFiles(env: Env, req: Request, slug: string): Promise<Response> {
  try {
    const url = new URL(req.url);
    const ip = clientIp(req);
    if (req.method === 'GET') {
      if (!(await rateLimit(env.DB, `clget:${ip}`, 1200, 3600))) throw new HttpError(429, 'rate_limited', 'För många förfrågningar.');
      const p = await findPage(env, slug);
      if (!p || p.kind !== 'checklista') throw new HttpError(404, 'not_found', 'Hittades inte.');
      const { results } = await env.DB.prepare(`SELECT e.data_json, f.file_name, f.size, f.created_at FROM documents d
        JOIN document_files f ON f.document_id = d.id AND f.org_id = d.org_id
        LEFT JOIN tracked_events e ON e.page_id = d.tracked_page_id AND e.type = 'file_upload' AND json_extract(e.data_json, '$.document_id') = d.id
        WHERE d.org_id = ? AND d.tracked_page_id = ? AND d.created_by = 'checklista' AND d.archived_at IS NULL ORDER BY f.created_at DESC LIMIT 50`).bind(p.org_id, p.id).all<any>();
      return json({
        enabled: !!p.customer_id,
        files: results.map((r) => { let m: any = {}; try { m = JSON.parse(r.data_json || '{}'); } catch { /* */ }
          return { name: r.file_name, size: r.size, at: r.created_at, key: m.key || '', by: m.by || '' }; }),
      }, 200, { 'cache-control': 'no-store' });
    }
    if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed', 'Metoden stöds inte.');
    const origin = req.headers.get('origin');
    if (origin && origin !== url.origin) throw new HttpError(403, 'bad_origin', 'Otillåtet ursprung.');
    if (req.headers.get('x-kela-s') !== '1') throw new HttpError(403, 'csrf', 'Saknar säkerhetsheader.');
    if (!(await rateLimit(env.DB, `clfile:${ip}`, 60, 3600))) throw new HttpError(429, 'rate_limited', 'För många uppladdningar. Vänta en stund och försök igen.');
    const p = await findPage(env, slug);
    if (!p || p.kind !== 'checklista') throw new HttpError(404, 'not_found', 'Hittades inte.');
    if (!p.customer_id) throw new HttpError(409, 'not_enabled', 'Uppladdning är inte öppnad för den här checklistan än. Mejla filen till KELA så länge.');
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM documents WHERE org_id = ? AND tracked_page_id = ? AND created_by = 'checklista'").bind(p.org_id, p.id).first<{ n: number }>();
    if ((n?.n || 0) >= 200) throw new HttpError(409, 'too_many', 'Max 200 filer per checklista. Kontakta KELA.');

    let fd: FormData;
    try { fd = await req.formData(); } catch { throw new HttpError(400, 'bad_request', 'Kunde inte läsa uppladdningen.'); }
    const file = fd.get('file');
    if (!file || typeof file === 'string') throw new HttpError(422, 'validation', 'Välj en fil att ladda upp.');
    const key = String(fd.get('key') || '');
    if (!KEY_RE.test(key)) throw new HttpError(422, 'validation', 'Okänd punkt.');
    const label = str(fd.get('label'), 200) || 'Fil från checklistan';
    const by = str(fd.get('by'), 60).trim();
    const f = await readUpload(file as File);

    const id = newId('doc'); const t = now();
    const title = `${label} (uppladdad i checklistan)`.slice(0, 200);
    const description = `Uppladdad i checklistan av ${by || 'okänd'} – punkt: ${label}`.slice(0, 4000);
    const data = JSON.stringify({ document_id: id, key, label, by });
    const { stmts } = fileStmts({ env }, p.org_id, id, null, f);
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO documents (id, org_id, customer_id, kind, title, status, tracked_page_id, description, created_by, created_at, updated_at)
        VALUES (?,?,?,'bilaga',?,'draft',?,?,'checklista',?,?)`).bind(id, p.org_id, p.customer_id, title, p.id, description, t, t),
      ...stmts,
      env.DB.prepare("INSERT INTO tracked_events (id, org_id, page_id, visit_id, type, data_json, created_at) VALUES (?,?,?,NULL,'file_upload',?,?)")
        .bind(newId('tev'), p.org_id, p.id, data, t),
    ]);
    await notifyAnswers(env, url, p, by || null);
    return json({ ok: true, file: { name: f.name, size: f.bytes.length, at: t, key, by } });
  } catch (e) {
    return errorResponse(e);
  }
}
