// /api/os – dashboard, global sökning, användare & behörigheter, revisionslogg, inkommande leads.
import { Router, Ctx, audit, auditStmt } from '../router';
import { HttpError, newId, now, today, addDays, likeTerm, parseJson, randomToken, sha256hex, rateLimit } from '../core';
import { v, validate } from '../validate';
import { can, ROLES, ROLE_LABELS, ROLE_PERMISSIONS, STAFF_ROLES, Role, PERMISSIONS } from '../auth';
import { expireQuotes } from '../quotes';

const DAY = 86400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString();
const valueBoost = (minor: number) => (minor > 0 ? Math.min(30, Math.log10(minor / 100 + 1) * 5) : 0);
const ageDays = (iso: string) => Math.floor((Date.now() - Date.parse(iso)) / DAY);

async function dashboard(c: Ctx) {
  const { env, s } = c;
  const org = s.orgId;
  await expireQuotes(env, org);
  const monthStart = today().slice(0, 8) + '01';
  const out: any = { generated_at: now(), kpis: {}, feed: [], todo: [] };
  const one = <T = any>(sql: string, ...b: unknown[]) => env.DB.prepare(sql).bind(...b).first<T>();
  const all = <T = any>(sql: string, ...b: unknown[]) => env.DB.prepare(sql).bind(...b).all<T>().then((r) => r.results);

  if (can(s, 'leads:read')) {
    const r = await one(`SELECT
      SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS new_30d,
      SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) AS uncontacted
      FROM leads WHERE org_id = ?`, daysAgo(30), org);
    out.kpis.leads = { new_30d: r?.new_30d || 0, uncontacted: r?.uncontacted || 0 };
  }
  if (can(s, 'deals:read')) {
    const r = await one(`SELECT COUNT(*) AS n, COALESCE(SUM(value_minor),0) AS value, COALESCE(SUM(value_minor * probability / 100),0) AS weighted,
      COALESCE(SUM(monthly_value_minor),0) AS monthly FROM deals WHERE org_id = ? AND stage NOT IN ('won','lost')`, org);
    out.kpis.deals = { active: r?.n || 0, pipeline_value: r?.value || 0, weighted_value: Math.round(r?.weighted || 0), pipeline_monthly: r?.monthly || 0 };
  }
  if (can(s, 'quotes:read')) {
    const open = await all(`SELECT v.totals_json FROM quotes q JOIN quote_versions v ON v.id = q.sent_version_id WHERE q.org_id = ? AND q.status IN ('sent','viewed')`, org);
    const sum = (rows: any[], k: 'once' | 'monthly') => rows.reduce((a, r) => a + (parseJson<any>(r.totals_json, null)?.[k]?.net || 0), 0);
    const acc30 = await all(`SELECT totals_json FROM quote_acceptances WHERE org_id = ? AND created_at >= ?`, org, daysAgo(30));
    const accMonth = await all(`SELECT totals_json FROM quote_acceptances WHERE org_id = ? AND created_at >= ?`, org, monthStart);
    const accAll = await all(`SELECT totals_json FROM quote_acceptances WHERE org_id = ?`, org);
    const decided = await one(`SELECT
      SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END) AS won,
      SUM(CASE WHEN status IN ('declined','expired') THEN 1 ELSE 0 END) AS lost
      FROM quotes WHERE org_id = ? AND updated_at >= ? AND status IN ('accepted','declined','expired')`, org, daysAgo(90));
    const drafts = await one(`SELECT COUNT(*) AS n FROM quotes WHERE org_id = ? AND status IN ('draft','review')`, org);
    const won = decided?.won || 0; const lost = decided?.lost || 0;
    out.kpis.quotes = {
      outstanding: open.length,
      outstanding_once_net: sum(open, 'once'),
      outstanding_monthly_net: sum(open, 'monthly'),
      accepted_30d: acc30.length,
      accepted_30d_once_net: sum(acc30, 'once'),
      won_this_month_once_net: sum(accMonth, 'once'),
      won_this_month_monthly_net: sum(accMonth, 'monthly'),
      // Avtalad MRR = summan av månadsbelopp i accepterade offerter. Uppsägningar spåras först med abonnemangsmodulen (fas 2).
      contracted_mrr_net: sum(accAll, 'monthly'),
      conversion_90d: won + lost > 0 ? Math.round((won / (won + lost)) * 1000) / 10 : null,
      decided_90d: won + lost,
      drafts: drafts?.n || 0,
    };
  }
  if (can(s, 'tasks:read')) {
    const r = await one(`SELECT SUM(CASE WHEN due_date < ? THEN 1 ELSE 0 END) AS overdue, COUNT(*) AS open FROM tasks WHERE org_id = ? AND status = 'open'`, today(), org);
    out.kpis.tasks = { overdue: r?.overdue || 0, open: r?.open || 0 };
  }
  if (can(s, 'projects:read')) {
    const r = await one(`SELECT SUM(CASE WHEN status IN ('planned','active','waiting_customer','paused') THEN 1 ELSE 0 END) AS open,
      SUM(CASE WHEN status = 'waiting_customer' THEN 1 ELSE 0 END) AS waiting,
      SUM(CASE WHEN status IN ('planned','active','waiting_customer') AND due_date < ? THEN 1 ELSE 0 END) AS late FROM projects WHERE org_id = ?`, today(), org);
    out.kpis.projects = { open: r?.open || 0, waiting_customer: r?.waiting || 0, late: r?.late || 0 };
  }
  // Moduler som inte är byggda ännu. Visas som "ej kopplat" i stället för påhittade siffror.
  out.kpis.phase2 = ['invoicing', 'support'];

  // Aktivitetsflöde
  out.feed = await all(`SELECT a.id, a.type, a.title, a.created_at, a.customer_id, a.deal_id, a.lead_id, a.quote_id, c.name AS customer_name, u.name AS actor_name
    FROM activities a LEFT JOIN customers c ON c.id = a.customer_id LEFT JOIN users u ON u.id = a.actor_user_id
    WHERE a.org_id = ? ORDER BY a.created_at DESC LIMIT 25`, org);

  // Smart att-göra-lista: prioriteras efter försening, affärsvärde och status.
  const todo: any[] = [];
  if (can(s, 'tasks:read')) {
    const tasks = await all(`SELECT t.*, COALESCE(p.name, c.name) AS customer_name FROM tasks t LEFT JOIN customers c ON c.id = t.customer_id LEFT JOIN projects p ON p.id = t.project_id
      WHERE t.org_id = ? AND t.status = 'open' AND (t.assignee_user_id = ? OR t.assignee_user_id IS NULL) ORDER BY t.due_date LIMIT 50`, org, s.userId);
    for (const t of tasks) {
      const overdue = t.due_date ? Math.floor((Date.parse(today()) - Date.parse(t.due_date)) / DAY) : -99;
      if (overdue < -7) continue;
      todo.push({ kind: 'task', id: t.id, title: t.title, sub: t.customer_name || '', due: t.due_date,
        link: t.project_id ? `#/projekt/${t.project_id}` : t.quote_id ? `#/offerter/${t.quote_id}` : t.customer_id ? `#/kunder/${t.customer_id}` : '#/uppgifter',
        score: 40 + (overdue >= 0 ? 15 + overdue * 6 : overdue * 3), overdue: overdue > 0 });
    }
  }
  if (can(s, 'leads:read')) {
    const leads = await all(`SELECT id, name, company, created_at FROM leads WHERE org_id = ? AND status = 'new' AND created_at < ? ORDER BY created_at LIMIT 20`, org, daysAgo(1));
    for (const l of leads) todo.push({ kind: 'lead', id: l.id, title: `Kontakta ${l.company || l.name}`, sub: `Ny förfrågan för ${ageDays(l.created_at)} dagar sedan – ej kontaktad`,
      link: `#/leads/${l.id}`, score: 55 + Math.min(30, ageDays(l.created_at) * 4) });
  }
  if (can(s, 'quotes:read')) {
    const qs = await all(`SELECT q.id, q.number, q.title, q.status, q.sent_at, q.first_viewed_at, q.valid_until, c.name AS customer_name, v.totals_json
      FROM quotes q JOIN customers c ON c.id = q.customer_id LEFT JOIN quote_versions v ON v.id = COALESCE(q.sent_version_id, q.current_version_id)
      WHERE q.org_id = ? AND q.status IN ('review','sent','viewed')`, org);
    for (const q of qs) {
      const val = (parseJson<any>(q.totals_json, null)?.once?.net || 0) + (parseJson<any>(q.totals_json, null)?.monthly?.net || 0) * 12;
      const link = `#/offerter/${q.id}`;
      const followUp = await one(`SELECT 1 FROM tasks WHERE org_id = ? AND quote_id = ? AND status = 'open' LIMIT 1`, org, q.id);
      if (q.status === 'review') todo.push({ kind: 'quote', id: q.id, title: `Granska offert #${q.number}`, sub: `${q.customer_name} · klar för granskning`, link, score: 38 + valueBoost(val) });
      else if (q.valid_until && q.valid_until <= addDays(today(), 5).slice(0, 10)) todo.push({ kind: 'quote', id: q.id, title: `Offert #${q.number} går snart ut`, sub: `${q.customer_name} · giltig till ${q.valid_until}`, link, score: 52 + valueBoost(val) });
      else if (followUp) continue; // en uppföljningsuppgift finns redan i listan
      else if (q.status === 'viewed' && q.first_viewed_at && ageDays(q.first_viewed_at) >= 3) todo.push({ kind: 'quote', id: q.id, title: `Följ upp offert #${q.number}`, sub: `${q.customer_name} · öppnad för ${ageDays(q.first_viewed_at)} dagar sedan, inget svar`, link, score: 50 + valueBoost(val) });
      else if (q.status === 'sent' && q.sent_at && ageDays(q.sent_at) >= 3) todo.push({ kind: 'quote', id: q.id, title: `Påminn om offert #${q.number}`, sub: `${q.customer_name} · skickad för ${ageDays(q.sent_at)} dagar sedan, inte öppnad ännu`, link, score: 44 + valueBoost(val) });
    }
  }
  if (can(s, 'deals:read')) {
    const ds = await all(`SELECT d.id, d.title, d.next_step, d.next_step_date, d.value_minor, c.name AS customer_name FROM deals d LEFT JOIN customers c ON c.id = d.customer_id
      WHERE d.org_id = ? AND d.stage NOT IN ('won','lost') AND d.next_step_date IS NOT NULL AND d.next_step_date <= ? AND (d.owner_user_id = ? OR d.owner_user_id IS NULL)`, org, today(), s.userId);
    for (const d of ds) todo.push({ kind: 'deal', id: d.id, title: d.next_step || `Nästa steg: ${d.title}`, sub: `${d.customer_name || d.title} · planerat ${d.next_step_date}`, link: `#/affarer/${d.id}`,
      score: 48 + Math.min(25, ageDays(d.next_step_date) * 4) + valueBoost(d.value_minor), overdue: d.next_step_date < today() });
    const stale = await all(`SELECT d.id, d.title, d.updated_at, d.value_minor, c.name AS customer_name FROM deals d LEFT JOIN customers c ON c.id = d.customer_id
      WHERE d.org_id = ? AND d.stage IN ('new','contacted','meeting','analysis','negotiation') AND d.updated_at < ? AND d.next_step_date IS NULL ORDER BY d.value_minor DESC LIMIT 5`, org, daysAgo(14));
    for (const d of stale) todo.push({ kind: 'deal', id: d.id, title: `Väck liv i affären: ${d.title}`, sub: `${d.customer_name || ''} · ingen aktivitet på ${ageDays(d.updated_at)} dagar`, link: `#/affarer/${d.id}`, score: 30 + valueBoost(d.value_minor) });
  }
  if (can(s, 'customers:read')) {
    const quiet = await all(`SELECT c.id, c.name FROM customers c WHERE c.org_id = ? AND c.status = 'active' AND c.archived_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM activities a WHERE a.customer_id = c.id AND a.org_id = c.org_id AND a.created_at > ?) LIMIT 3`, org, daysAgo(90));
    for (const k of quiet) todo.push({ kind: 'customer', id: k.id, title: `Hör av dig till ${k.name}`, sub: 'Aktiv kund utan kontakt på 90 dagar – möjlig merförsäljning', link: `#/kunder/${k.id}`, score: 22 });
  }
  out.todo = todo.sort((a, b) => b.score - a.score).slice(0, 12).map((t) => ({ ...t, score: Math.round(t.score) }));
  return out;
}

export function adminRoutes(r: Router) {
  r.get('/dashboard', dashboard, { perm: 'dashboard:read' });

  r.get('/search', async ({ env, s, url }) => {
    const q = (url.searchParams.get('q') || '').trim().slice(0, 80);
    if (q.length < 2) return { results: [] };
    const t = likeTerm(q); const org = s.orgId;
    const res: any[] = [];
    const run = (sql: string, ...b: unknown[]) => env.DB.prepare(sql).bind(...b).all<any>().then((r) => r.results);
    if (can(s, 'customers:read')) {
      for (const x of await run(`SELECT id, name, org_number FROM customers WHERE org_id = ? AND archived_at IS NULL AND (name LIKE ? ESCAPE '\\' OR org_number LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\') ORDER BY name LIMIT 6`, org, t, t, t))
        res.push({ type: 'customer', id: x.id, title: x.name, sub: x.org_number || 'Kund', link: `#/kunder/${x.id}` });
      for (const x of await run(`SELECT k.id, k.name, k.email, k.customer_id, c.name AS cname FROM contacts k JOIN customers c ON c.id = k.customer_id WHERE k.org_id = ? AND (k.name LIKE ? ESCAPE '\\' OR k.email LIKE ? ESCAPE '\\') LIMIT 6`, org, t, t))
        res.push({ type: 'contact', id: x.id, title: x.name, sub: `Kontakt · ${x.cname}`, link: `#/kunder/${x.customer_id}` });
    }
    if (can(s, 'quotes:read')) {
      const num = Number(q.replace('#', ''));
      for (const x of await run(`SELECT q.id, q.number, q.title, c.name AS cname FROM quotes q JOIN customers c ON c.id = q.customer_id WHERE q.org_id = ? AND (q.title LIKE ? ESCAPE '\\' OR q.number = ?) ORDER BY q.number DESC LIMIT 6`, org, t, Number.isInteger(num) ? num : -1))
        res.push({ type: 'quote', id: x.id, title: `#${x.number} ${x.title}`, sub: `Offert · ${x.cname}`, link: `#/offerter/${x.id}` });
    }
    if (can(s, 'projects:read')) {
      for (const x of await run(`SELECT p.id, p.name, p.number, c.name AS cname FROM projects p JOIN customers c ON c.id = p.customer_id WHERE p.org_id = ? AND p.name LIKE ? ESCAPE '\\' LIMIT 6`, org, t))
        res.push({ type: 'project', id: x.id, title: x.name, sub: `Projekt P${x.number} · ${x.cname}`, link: `#/projekt/${x.id}` });
    }
    if (can(s, 'deals:read')) {
      for (const x of await run(`SELECT id, title FROM deals WHERE org_id = ? AND title LIKE ? ESCAPE '\\' LIMIT 6`, org, t))
        res.push({ type: 'deal', id: x.id, title: x.title, sub: 'Affär', link: `#/affarer/${x.id}` });
    }
    if (can(s, 'leads:read')) {
      for (const x of await run(`SELECT id, name, company FROM leads WHERE org_id = ? AND (name LIKE ? ESCAPE '\\' OR company LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\') LIMIT 6`, org, t, t, t))
        res.push({ type: 'lead', id: x.id, title: x.company || x.name, sub: `Lead · ${x.name}`, link: `#/leads/${x.id}` });
    }
    return { results: res };
  });

  // Kalender: uppgifter, offerters giltighet och affärers nästa steg/avslut inom ett datumintervall.
  r.get('/calendar', async ({ env, s, url }) => {
    const from = url.searchParams.get('from') || today().slice(0, 8) + '01';
    const to = url.searchParams.get('to') || addDays(from, 42).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) throw new HttpError(422, 'validation', 'Ogiltigt datum.');
    const ev: any[] = [];
    const run = (sql: string, ...b: unknown[]) => env.DB.prepare(sql).bind(...b).all<any>().then((r) => r.results);
    if (can(s, 'tasks:read')) for (const t of await run(`SELECT id, title, due_date, status, customer_id, quote_id, project_id, milestone FROM tasks WHERE org_id = ? AND due_date BETWEEN ? AND ?`, s.orgId, from, to))
      ev.push({ kind: t.milestone ? 'milestone' : 'task', date: t.due_date, title: (t.milestone ? '◆ ' : '') + t.title, done: t.status === 'done', link: t.project_id ? `#/projekt/${t.project_id}` : t.quote_id ? `#/offerter/${t.quote_id}` : t.customer_id ? `#/kunder/${t.customer_id}` : '#/uppgifter' });
    if (can(s, 'quotes:read')) for (const q of await run(`SELECT id, number, valid_until FROM quotes WHERE org_id = ? AND status IN ('sent','viewed') AND valid_until BETWEEN ? AND ?`, s.orgId, from, to))
      ev.push({ kind: 'quote', date: q.valid_until, title: `Offert #${q.number} går ut`, link: `#/offerter/${q.id}` });
    if (can(s, 'projects:read')) for (const p of await run(`SELECT id, name, due_date FROM projects WHERE org_id = ? AND status NOT IN ('done','cancelled') AND due_date BETWEEN ? AND ?`, s.orgId, from, to))
      ev.push({ kind: 'project', date: p.due_date, title: `Deadline: ${p.name}`, link: `#/projekt/${p.id}` });
    if (can(s, 'deals:read')) {
      for (const d of await run(`SELECT id, title, next_step, next_step_date FROM deals WHERE org_id = ? AND stage NOT IN ('won','lost') AND next_step_date BETWEEN ? AND ?`, s.orgId, from, to))
        ev.push({ kind: 'deal', date: d.next_step_date, title: d.next_step || d.title, link: `#/affarer/${d.id}` });
      for (const d of await run(`SELECT id, title, expected_close_date FROM deals WHERE org_id = ? AND stage NOT IN ('won','lost') AND expected_close_date BETWEEN ? AND ?`, s.orgId, from, to))
        ev.push({ kind: 'deal', date: d.expected_close_date, title: `Förv. avslut: ${d.title}`, link: `#/affarer/${d.id}` });
    }
    return { from, to, events: ev };
  });

  // Notiser: händelser som kommer utifrån (kunder, hemsidan) samt systemhändelser.
  r.get('/notifications', async ({ env, s }) => {
    const rows = await env.DB.prepare(`SELECT a.id, a.title, a.created_at, a.customer_id, a.deal_id, a.lead_id, a.quote_id, c.name AS customer_name
      FROM activities a LEFT JOIN customers c ON c.id = a.customer_id WHERE a.org_id = ? AND a.type = 'system' AND a.actor_user_id IS NULL ORDER BY a.created_at DESC LIMIT 100`).bind(s.orgId).all();
    return { notifications: rows.results };
  }, { perm: 'dashboard:read' });

  // ---------- Användare ----------
  r.get('/users', async ({ env, s }) => {
    const rows = await env.DB.prepare(`SELECT u.id, u.name, u.email, u.status, u.totp_enabled, u.last_login_at, m.role FROM memberships m JOIN users u ON u.id = m.user_id
      WHERE m.org_id = ? ORDER BY u.name`).bind(s.orgId).all<any>();
    const manage = can(s, 'users:manage');
    const invites = manage ? (await env.DB.prepare('SELECT id, email, name, role, expires_at, created_at FROM invites WHERE org_id = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ? ORDER BY created_at DESC').bind(s.orgId, now()).all()).results : [];
    return {
      users: rows.results.map((u) => ({ ...u, totp_enabled: !!u.totp_enabled, role_label: ROLE_LABELS[u.role as Role], ...(manage ? {} : { last_login_at: undefined }) })),
      invites, roles: STAFF_ROLES.map((r) => ({ id: r, label: ROLE_LABELS[r], permissions: ROLE_PERMISSIONS[r] })), permissions: PERMISSIONS,
    };
  }, { perm: 'users:read' });

  r.post('/users/invite', async (c) => {
    const d = validate({ email: v.email(), name: v.str({ max: 120 }), role: v.enum(STAFF_ROLES) }, await c.body());
    if (d.role === 'superadmin' && c.s.role !== 'superadmin') throw new HttpError(403, 'forbidden', 'Endast superadmin kan bjuda in superadmin.');
    const exists = await c.env.DB.prepare('SELECT 1 FROM users WHERE email = ?').bind(d.email).first();
    if (exists) throw new HttpError(409, 'user_exists', 'Det finns redan ett konto med den e-postadressen.');
    const token = randomToken(32); const id = newId('inv'); const t = now();
    await c.env.DB.batch([
      c.env.DB.prepare('UPDATE invites SET revoked_at = ? WHERE org_id = ? AND email = ? AND used_at IS NULL AND revoked_at IS NULL').bind(t, c.s.orgId, d.email),
      c.env.DB.prepare('INSERT INTO invites (id, org_id, email, name, role, token_hash, expires_at, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?)')
        .bind(id, c.s.orgId, d.email, d.name, d.role, await sha256hex(token), addDays(t, 2), c.s.userId, t),
      auditStmt(c.env, c.s.orgId, c.s.userId, c.ip, 'user.invited', 'invite', id, `${d.email} inbjuden som ${ROLE_LABELS[d.role!]}`),
    ]);
    // Inget mejl skickas automatiskt – länken delas manuellt tills e-postintegration finns.
    return { id, invite_url: `${c.url.origin}/os/#/inbjudan/${token}`, expires_at: addDays(t, 2) };
  }, { perm: 'users:manage' });

  r.del('/invites/:id', async (c) => {
    const res = await c.env.DB.prepare('UPDATE invites SET revoked_at = ? WHERE id = ? AND org_id = ? AND used_at IS NULL').bind(now(), c.params.id, c.s.orgId).run();
    if (!res.meta.changes) throw new HttpError(404, 'not_found', 'Inbjudan finns inte.');
    await audit(c, 'user.invite_revoked', 'invite', c.params.id, 'Inbjudan återkallad');
    return { ok: true };
  }, { perm: 'users:manage' });

  r.patch('/users/:id', async (c) => {
    const { env, s } = c;
    const target = await env.DB.prepare('SELECT u.id, u.name, u.email, u.status, m.role FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.org_id = ? AND u.id = ?').bind(s.orgId, c.params.id).first<any>();
    if (!target) throw new HttpError(404, 'not_found', 'Användaren finns inte.');
    const d = validate({ role: v.enum(STAFF_ROLES, { optional: true }), status: v.enum(['active', 'disabled'] as const, { optional: true }) }, await c.body(), true);
    if (target.id === s.userId) throw new HttpError(409, 'self', 'Du kan inte ändra din egen roll eller status.');
    if ((target.role === 'superadmin' || d.role === 'superadmin') && s.role !== 'superadmin') throw new HttpError(403, 'forbidden', 'Endast superadmin kan ändra superadmin-behörighet.');
    if (target.role === 'superadmin' && (d.role && d.role !== 'superadmin' || d.status === 'disabled')) {
      const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.org_id = ? AND m.role = 'superadmin' AND u.status = 'active'").bind(s.orgId).first<any>();
      if ((n?.n || 0) <= 1) throw new HttpError(409, 'last_superadmin', 'Det måste finnas minst en aktiv superadmin.');
    }
    const stmts: D1PreparedStatement[] = [];
    if (d.role && d.role !== target.role) {
      stmts.push(env.DB.prepare('UPDATE memberships SET role = ? WHERE org_id = ? AND user_id = ?').bind(d.role, s.orgId, target.id));
      stmts.push(auditStmt(env, s.orgId, s.userId, c.ip, 'user.role_changed', 'user', target.id, `${target.email}: ${ROLE_LABELS[target.role as Role]} → ${ROLE_LABELS[d.role]}`));
    }
    if (d.status && d.status !== target.status) {
      stmts.push(env.DB.prepare('UPDATE users SET status = ?, updated_at = ? WHERE id = ?').bind(d.status, now(), target.id));
      stmts.push(auditStmt(env, s.orgId, s.userId, c.ip, d.status === 'disabled' ? 'user.disabled' : 'user.enabled', 'user', target.id, `${target.email} ${d.status === 'disabled' ? 'inaktiverad' : 'aktiverad'}`));
    }
    // Ändrad behörighet gäller direkt: logga ut användarens sessioner.
    if (stmts.length) stmts.push(env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(target.id));
    if (stmts.length) await env.DB.batch(stmts);
    return { ok: true };
  }, { perm: 'users:manage' });

  r.post('/users/:id/reset-mfa', async (c) => {
    if (c.s.role !== 'superadmin') throw new HttpError(403, 'forbidden', 'Endast superadmin kan återställa MFA.');
    if (c.params.id === c.s.userId) throw new HttpError(409, 'self', 'Du kan inte återställa din egen MFA här.');
    const target = await c.env.DB.prepare('SELECT u.id, u.email FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.org_id = ? AND u.id = ?').bind(c.s.orgId, c.params.id).first<any>();
    if (!target) throw new HttpError(404, 'not_found', 'Användaren finns inte.');
    await c.env.DB.batch([
      c.env.DB.prepare('UPDATE users SET totp_enabled = 0, totp_secret_enc = NULL, totp_pending_enc = NULL, totp_last_step = NULL, updated_at = ? WHERE id = ?').bind(now(), target.id),
      c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(target.id),
      auditStmt(c.env, c.s.orgId, c.s.userId, c.ip, 'user.mfa_reset', 'user', target.id, `MFA återställd för ${target.email}`),
    ]);
    return { ok: true };
  }, { perm: 'users:manage' });

  // ---------- Revisionslogg ----------
  r.get('/audit', async ({ env, s, url }) => {
    // Superadmin ser även systemhändelser utan företagskoppling (t.ex. inloggningsförsök mot okända konton).
    // Vid flera företag (SaaS) ska dessa i stället bara visas för plattformsägaren.
    const where = [s.role === 'superadmin' ? '(a.org_id = ? OR a.org_id IS NULL)' : 'a.org_id = ?']; const b: unknown[] = [s.orgId];
    const type = url.searchParams.get('entity_type'); if (type) { where.push('a.entity_type = ?'); b.push(type); }
    const id = url.searchParams.get('entity_id'); if (id) { where.push('a.entity_id = ?'); b.push(id); }
    const before = url.searchParams.get('before'); if (before) { where.push('a.created_at < ?'); b.push(before); }
    const q = (url.searchParams.get('q') || '').trim().slice(0, 80);
    if (q) { const t = likeTerm(q); where.push("(a.summary LIKE ? ESCAPE '\\' OR a.action LIKE ? ESCAPE '\\')"); b.push(t, t); }
    const rows = await env.DB.prepare(`SELECT a.*, u.name AS actor_name FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_user_id WHERE ${where.join(' AND ')} ORDER BY a.created_at DESC LIMIT 100`).bind(...b).all<any>();
    return { entries: rows.results.map((x) => ({ ...x, data: parseJson(x.data_json, {}), data_json: undefined })) };
  }, { perm: 'audit:read' });

  // ---------- Inkommande förfrågan från hemsidan (förberedd, ej inkopplad i formulären ännu) ----------
  r.post('/public/lead', async (c) => {
    const { env, ip } = c;
    if (!(await rateLimit(env.DB, `leadin:${ip}`, 5, 3600))) throw new HttpError(429, 'rate_limited', 'För många förfrågningar.');
    const b = await c.body();
    if (b.website_hp) return { ok: true }; // honungsfälla för botar
    const d = validate({ name: v.str({ max: 120 }), company: v.str({ optional: true, max: 160 }), email: v.email(), phone: v.str({ optional: true, max: 40 }), message: v.str({ optional: true, max: 5000 }), source: v.str({ optional: true, max: 60 }) }, b);
    const org = await env.DB.prepare('SELECT id FROM organizations ORDER BY created_at LIMIT 1').first<any>();
    if (!org) throw new HttpError(503, 'not_setup', 'Inte installerat.');
    const id = newId('lead'); const t = now();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO leads (id, org_id, name, company, email, phone, source, message, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,'new',?,?)")
        .bind(id, org.id, d.name, d.company, d.email, d.phone, d.source || 'hemsida', d.message, t, t),
      env.DB.prepare("INSERT INTO activities (id, org_id, lead_id, type, title, created_at) VALUES (?,?,?,'system',?,?)").bind(newId('act'), org.id, id, `Ny förfrågan från ${d.company || d.name}`, t),
    ]);
    return { ok: true };
  }, { public: true });

  void ROLES;
}
