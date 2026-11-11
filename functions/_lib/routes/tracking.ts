// /api/os/sparning – översikt över offertsidor med spårning (besök, lästid, scroll, val) och checklistornas svar.
import { Router, Ctx } from '../router';
import { HttpError } from '../core';

const ID_RE = /^tpg_[0-9a-z]+$/;

async function getPage(c: Ctx, id: string) {
  if (!ID_RE.test(id)) throw new HttpError(404, 'not_found', 'Sidan finns inte.');
  const p = await c.env.DB.prepare('SELECT * FROM tracked_pages WHERE id = ? AND org_id = ?').bind(id, c.s.orgId).first<any>();
  if (!p) throw new HttpError(404, 'not_found', 'Sidan finns inte.');
  return p;
}

export function trackingRoutes(r: Router) {
  r.get('/sparning', async (c) => {
    const { results } = await c.env.DB.prepare(`
      SELECT p.id, p.slug, p.title, p.customer_name, p.active, p.kind, p.choices_json, p.choices_updated_at, p.created_at,
        (SELECT COUNT(*) FROM checklist_answers a WHERE a.page_id = p.id AND (a.text <> '' OR a.done = 1)) AS answers,
        (SELECT MAX(updated_at) FROM checklist_answers a WHERE a.page_id = p.id) AS answers_updated_at,
        (SELECT COUNT(*) FROM tracked_visits v WHERE v.page_id = p.id) AS visits,
        (SELECT COALESCE(SUM(active_seconds), 0) FROM tracked_visits v WHERE v.page_id = p.id) AS total_seconds,
        (SELECT MAX(last_seen_at) FROM tracked_visits v WHERE v.page_id = p.id) AS last_seen_at,
        (SELECT MIN(started_at) FROM tracked_visits v WHERE v.page_id = p.id) AS first_seen_at
      FROM tracked_pages p WHERE p.org_id = ? ORDER BY p.created_at DESC`).bind(c.s.orgId).all();
    return { pages: results.map((p: any) => ({ ...p, choices: JSON.parse(p.choices_json || '{}'), choices_json: undefined })) };
  }, { perm: 'quotes:read' });

  r.get('/sparning/:id', async (c) => {
    const p = await getPage(c, c.params.id);
    const [visits, events, answers, history] = await Promise.all([
      c.env.DB.prepare('SELECT id, started_at, last_seen_at, active_seconds, max_scroll, sections_json, device, ua FROM tracked_visits WHERE page_id = ? AND org_id = ? ORDER BY started_at DESC LIMIT 200')
        .bind(p.id, c.s.orgId).all(),
      c.env.DB.prepare('SELECT id, visit_id, type, data_json, created_at FROM tracked_events WHERE page_id = ? AND org_id = ? ORDER BY created_at DESC LIMIT 500')
        .bind(p.id, c.s.orgId).all(),
      c.env.DB.prepare('SELECT item_key, label, section, text, done, updated_by, updated_at FROM checklist_answers WHERE page_id = ? AND org_id = ? ORDER BY section, item_key')
        .bind(p.id, c.s.orgId).all(),
      c.env.DB.prepare('SELECT item_key, text, done, updated_by, created_at, updated_at FROM checklist_history WHERE page_id = ? AND org_id = ? ORDER BY updated_at DESC LIMIT 1000')
        .bind(p.id, c.s.orgId).all(),
    ]);
    return {
      page: { id: p.id, slug: p.slug, title: p.title, customer_name: p.customer_name, active: p.active, kind: p.kind, created_at: p.created_at, choices: JSON.parse(p.choices_json || '{}'), choices_updated_at: p.choices_updated_at },
      answers: answers.results.map((a: any) => ({ ...a, done: !!a.done })),
      history: history.results.map((h: any) => ({ ...h, done: !!h.done })),
      visits: visits.results.map((v: any) => ({ ...v, sections: JSON.parse(v.sections_json || '[]'), sections_json: undefined })),
      events: events.results.map((e: any) => ({ ...e, data: JSON.parse(e.data_json || '{}'), data_json: undefined })),
    };
  }, { perm: 'quotes:read' });
}
