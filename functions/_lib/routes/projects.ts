// /api/os/projects – projekthantering (fas 2).
import { Router, Ctx, auditStmt, activityStmt, updateSet } from '../router';
import { HttpError, newId, now, likeTerm } from '../core';
import { v, validate } from '../validate';
import { PROJECT_TEMPLATES, PROJECT_STATUS, projectFromTemplateStmts } from '../projects';
import { getCustomer } from './crm';

const projectShape = {
  name: v.str({ max: 160 }),
  customer_id: v.id('cus'),
  quote_id: v.id('quo', { optional: true }),
  owner_user_id: v.id('usr', { optional: true }),
  status: v.enum(PROJECT_STATUS, { optional: true }),
  description: v.str({ optional: true, max: 5000 }),
  start_date: v.date({ optional: true }),
  due_date: v.date({ optional: true }),
  budget_minor: v.int({ optional: true, min: 0, max: 1e12 }),
  estimated_hours: v.int({ optional: true, min: 0, max: 100000 }),
  actual_hours: v.num({ optional: true, min: 0, max: 100000 }),
};

async function getProject(c: Ctx, id: string) {
  const p = await c.env.DB.prepare('SELECT * FROM projects WHERE id = ? AND org_id = ?').bind(id, c.s.orgId).first<any>();
  if (!p) throw new HttpError(404, 'not_found', 'Projektet finns inte.');
  return p;
}

async function memberCheck(c: Ctx, userId?: string | null) {
  if (userId && !(await c.env.DB.prepare('SELECT 1 FROM memberships WHERE org_id = ? AND user_id = ?').bind(c.s.orgId, userId).first()))
    throw new HttpError(422, 'validation', 'Okänd användare.', { owner_user_id: 'Okänd användare.' });
}

export function projectRoutes(r: Router) {
  r.get('/project-templates', async () => ({
    templates: Object.entries(PROJECT_TEMPLATES).map(([key, t]) => ({ key, name: t.name, days: t.days, steps: t.steps.map(([title, , m]) => ({ title, milestone: !!m })) })),
  }), { perm: 'projects:read' });

  r.get('/projects', async ({ env, s, url }) => {
    const where = ['p.org_id = ?']; const b: unknown[] = [s.orgId];
    const st = url.searchParams.get('status');
    if (st === 'open') where.push("p.status IN ('planned','active','waiting_customer','paused')");
    else if (st && (PROJECT_STATUS as readonly string[]).includes(st)) { where.push('p.status = ?'); b.push(st); }
    const cust = url.searchParams.get('customer'); if (cust) { where.push('p.customer_id = ?'); b.push(cust); }
    const q = (url.searchParams.get('q') || '').trim().slice(0, 100);
    if (q) { const t = likeTerm(q); where.push("(p.name LIKE ? ESCAPE '\\' OR c.name LIKE ? ESCAPE '\\')"); b.push(t, t); }
    const rows = await env.DB.prepare(`SELECT p.*, c.name AS customer_name, u.name AS owner_name,
        (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.org_id = p.org_id) AS task_count,
        (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.org_id = p.org_id AND t.status = 'done') AS task_done,
        (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.org_id = p.org_id AND t.status = 'open' AND t.due_date < date('now')) AS task_overdue,
        (SELECT t.title FROM tasks t WHERE t.project_id = p.id AND t.org_id = p.org_id AND t.status = 'open' ORDER BY t.sort LIMIT 1) AS next_task
      FROM projects p JOIN customers c ON c.id = p.customer_id LEFT JOIN users u ON u.id = p.owner_user_id
      WHERE ${where.join(' AND ')} ORDER BY CASE p.status WHEN 'done' THEN 2 WHEN 'cancelled' THEN 3 ELSE 1 END, p.due_date IS NULL, p.due_date LIMIT 500`).bind(...b).all();
    return { projects: rows.results };
  }, { perm: 'projects:read' });

  r.post('/projects', async (c) => {
    const b = await c.body();
    const d = validate({ ...projectShape, template_key: v.enum(Object.keys(PROJECT_TEMPLATES), { optional: true }) }, b);
    const cust = await getCustomer(c, d.customer_id!);
    await memberCheck(c, d.owner_user_id);
    if (d.quote_id && !(await c.env.DB.prepare('SELECT 1 FROM quotes WHERE id = ? AND org_id = ? AND customer_id = ?').bind(d.quote_id, c.s.orgId, cust.id).first()))
      throw new HttpError(422, 'validation', 'Offerten hör inte till kunden.');
    if (d.quote_id && (await c.env.DB.prepare('SELECT 1 FROM projects WHERE quote_id = ? AND org_id = ?').bind(d.quote_id, c.s.orgId).first()))
      throw new HttpError(409, 'exists', 'Det finns redan ett projekt för den offerten.');
    const id = newId('prj');
    const stmts = d.template_key
      ? projectFromTemplateStmts(c.env, c.s.orgId, { id, name: d.name!, customerId: cust.id, quoteId: d.quote_id, ownerId: d.owner_user_id || c.s.userId, templateKey: d.template_key,
          startDate: d.start_date, dueDate: d.due_date, budgetMinor: d.budget_minor, estimatedHours: d.estimated_hours, description: d.description, status: d.status || 'planned' })
      : [c.env.DB.prepare(`INSERT INTO projects (id, org_id, number, name, customer_id, quote_id, owner_user_id, status, description, start_date, due_date, budget_minor, estimated_hours, created_at, updated_at)
          VALUES (?, ?, (SELECT COALESCE(MAX(number), 100) + 1 FROM projects WHERE org_id = ?), ?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id, c.s.orgId, c.s.orgId, d.name, cust.id, d.quote_id, d.owner_user_id || c.s.userId,
          d.status || 'planned', d.description, d.start_date, d.due_date, d.budget_minor, d.estimated_hours, now(), now())];
    stmts.push(activityStmt(c.env, c.s.orgId, { customer_id: cust.id, quote_id: d.quote_id, type: 'system', title: `Projekt startat: ${d.name}`, actor: c.s.userId }));
    stmts.push(auditStmt(c.env, c.s.orgId, c.s.userId, c.ip, 'project.created', 'project', id, `Projekt skapat: ${d.name}${d.template_key ? ` (mall: ${PROJECT_TEMPLATES[d.template_key].name})` : ''}`));
    await c.env.DB.batch(stmts);
    return { id };
  }, { perm: 'projects:write' });

  r.get('/projects/:id', async (c) => {
    const { env, s } = c;
    const p = await getProject(c, c.params.id);
    const [tasks, cust, quote, owner, acts] = await Promise.all([
      env.DB.prepare(`SELECT t.*, u.name AS assignee_name FROM tasks t LEFT JOIN users u ON u.id = t.assignee_user_id WHERE t.project_id = ? AND t.org_id = ? ORDER BY t.sort, t.due_date`).bind(p.id, s.orgId).all(),
      env.DB.prepare('SELECT id, name FROM customers WHERE id = ? AND org_id = ?').bind(p.customer_id, s.orgId).first(),
      p.quote_id ? env.DB.prepare('SELECT id, number, title, status FROM quotes WHERE id = ? AND org_id = ?').bind(p.quote_id, s.orgId).first() : null,
      p.owner_user_id ? env.DB.prepare('SELECT id, name FROM users WHERE id = ?').bind(p.owner_user_id).first() : null,
      env.DB.prepare(`SELECT a.*, u.name AS actor_name FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_user_id WHERE a.org_id = ? AND a.entity_type IN ('project','task') AND (a.entity_id = ? OR a.data_json LIKE ?) ORDER BY a.created_at DESC LIMIT 50`)
        .bind(s.orgId, p.id, `%${p.id}%`).all(),
    ]);
    return { project: { ...p, owner }, tasks: tasks.results, customer: cust, quote, history: acts.results, templates: Object.fromEntries(Object.entries(PROJECT_TEMPLATES).map(([k, t]) => [k, t.name])) };
  }, { perm: 'projects:read' });

  r.patch('/projects/:id', async (c) => {
    const p = await getProject(c, c.params.id);
    const d = validate(projectShape, await c.body(), true);
    delete (d as any).customer_id; delete (d as any).quote_id;
    await memberCheck(c, d.owner_user_id);
    const extra: Record<string, unknown> = {};
    if (d.status && d.status !== p.status) extra.completed_at = d.status === 'done' ? now() : null;
    const { sql, vals } = updateSet({ ...d, ...extra }, ['name', 'owner_user_id', 'status', 'description', 'start_date', 'due_date', 'budget_minor', 'estimated_hours', 'actual_hours', 'completed_at']);
    if (!sql) return { ok: true };
    const stmts = [c.env.DB.prepare(`UPDATE projects SET ${sql}, updated_at = ? WHERE id = ? AND org_id = ?`).bind(...vals, now(), p.id, c.s.orgId),
      auditStmt(c.env, c.s.orgId, c.s.userId, c.ip, d.status && d.status !== p.status ? 'project.status_changed' : 'project.updated', 'project', p.id,
        d.status && d.status !== p.status ? `${p.name}: ${p.status} → ${d.status}` : `Projekt uppdaterat: ${p.name}`, { fields: Object.keys(d) })];
    if (d.status === 'done' && p.status !== 'done') stmts.push(activityStmt(c.env, c.s.orgId, { customer_id: p.customer_id, quote_id: p.quote_id, type: 'system', title: `Projekt klart: ${p.name}`, actor: c.s.userId }));
    await c.env.DB.batch(stmts);
    return { ok: true };
  }, { perm: 'projects:write' });

  r.post('/projects/:id/tasks', async (c) => {
    const p = await getProject(c, c.params.id);
    const d = validate({ title: v.str({ max: 200 }), due_date: v.date({ optional: true }), assignee_user_id: v.id('usr', { optional: true }), milestone: v.bool({ optional: true }),
      description: v.str({ optional: true, max: 4000 }), estimated_hours: v.num({ optional: true, min: 0, max: 10000 }) }, await c.body());
    await memberCheck(c, d.assignee_user_id);
    const id = newId('tsk');
    await c.env.DB.batch([
      c.env.DB.prepare(`INSERT INTO tasks (id, org_id, title, due_date, assignee_user_id, customer_id, quote_id, project_id, stage, milestone, sort, description, estimated_hours, created_by, created_at)
        VALUES (?,?,?,?,?,?,?,?,'todo',?,(SELECT COALESCE(MAX(sort), 0) + 1 FROM tasks WHERE project_id = ?),?,?,?,?)`).bind(id, c.s.orgId, d.title, d.due_date, d.assignee_user_id || c.s.userId,
        p.customer_id, p.quote_id, p.id, d.milestone ? 1 : 0, p.id, d.description, d.estimated_hours, c.s.userId, now()),
      auditStmt(c.env, c.s.orgId, c.s.userId, c.ip, 'task.created', 'task', id, `Uppgift tillagd i ${p.name}: ${d.title}`, { project_id: p.id }),
    ]);
    return { id };
  }, { perm: 'projects:write' });
}
