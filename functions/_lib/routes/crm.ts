// /api/os – kunder, kontakter, aktiviteter, leads, affärer (pipeline), uppgifter.
import { Router, Ctx, audit, auditStmt, activityStmt, updateSet } from '../router';
import { HttpError, newId, now, likeTerm, parseJson, today } from '../core';
import { v, validate } from '../validate';
import { can } from '../auth';

export const CUSTOMER_STATUS = ['prospect', 'active', 'paused', 'former'] as const;
export const DEAL_STAGES = ['new', 'contacted', 'meeting', 'analysis', 'quote_sent', 'negotiation', 'won', 'lost'] as const;
export const LEAD_STATUS = ['new', 'contacted', 'qualified', 'disqualified', 'converted'] as const;
export const LOST_REASONS = ['price', 'timing', 'competitor', 'no_need', 'no_response', 'scope', 'other'] as const;
const STAGE_PROB: Record<string, number> = { new: 10, contacted: 20, meeting: 30, analysis: 40, quote_sent: 60, negotiation: 75, won: 100, lost: 0 };

const customerShape = {
  name: v.str({ max: 160 }),
  org_number: v.str({ optional: true, max: 20, pattern: /^[0-9A-Za-z\- ]{6,20}$/, msg: 'Ogiltigt organisationsnummer.' }),
  status: v.enum(CUSTOMER_STATUS, { optional: true }),
  industry: v.str({ optional: true, max: 80 }),
  website: v.url({ optional: true }),
  email: v.email({ optional: true }),
  phone: v.str({ optional: true, max: 40 }),
  billing_address: v.str({ optional: true, max: 400 }),
  visiting_address: v.str({ optional: true, max: 400 }),
  owner_user_id: v.id('usr', { optional: true }),
  expected_value_minor: v.int({ optional: true, min: 0, max: 1e12 }),
  notes: v.str({ optional: true, max: 5000 }),
};
const CUSTOMER_COLS = Object.keys(customerShape);

const contactShape = {
  name: v.str({ max: 120 }), title: v.str({ optional: true, max: 120 }),
  email: v.email({ optional: true }), phone: v.str({ optional: true, max: 40 }), is_primary: v.bool({ optional: true }),
};

const dealShape = {
  title: v.str({ max: 160 }),
  customer_id: v.id('cus', { optional: true }),
  stage: v.enum(DEAL_STAGES, { optional: true }),
  value_minor: v.int({ optional: true, min: 0, max: 1e12 }),
  monthly_value_minor: v.int({ optional: true, min: 0, max: 1e12 }),
  probability: v.int({ optional: true, min: 0, max: 100 }),
  owner_user_id: v.id('usr', { optional: true }),
  expected_close_date: v.date({ optional: true }),
  next_step: v.str({ optional: true, max: 300 }),
  next_step_date: v.date({ optional: true }),
  lost_reason: v.enum(LOST_REASONS, { optional: true }),
  lost_note: v.str({ optional: true, max: 1000 }),
};

const leadShape = {
  name: v.str({ max: 120 }), company: v.str({ optional: true, max: 160 }), email: v.email({ optional: true }),
  phone: v.str({ optional: true, max: 40 }), source: v.str({ optional: true, max: 60 }), message: v.str({ optional: true, max: 5000 }),
  status: v.enum(LEAD_STATUS, { optional: true }), owner_user_id: v.id('usr', { optional: true }),
};

async function ownerInOrg(c: Ctx, userId: string | null | undefined) {
  if (!userId) return;
  const m = await c.env.DB.prepare('SELECT 1 FROM memberships WHERE org_id = ? AND user_id = ?').bind(c.s.orgId, userId).first();
  if (!m) throw new HttpError(422, 'validation', 'Okänd ansvarig.', { owner_user_id: 'Okänd användare.' });
}

export async function getCustomer(c: Ctx, id: string) {
  const row = await c.env.DB.prepare('SELECT * FROM customers WHERE id = ? AND org_id = ?').bind(id, c.s.orgId).first<any>();
  if (!row) throw new HttpError(404, 'not_found', 'Kunden finns inte.');
  return row;
}

async function getDeal(c: Ctx, id: string) {
  const row = await c.env.DB.prepare('SELECT * FROM deals WHERE id = ? AND org_id = ?').bind(id, c.s.orgId).first<any>();
  if (!row) throw new HttpError(404, 'not_found', 'Affären finns inte.');
  return row;
}

export function crmRoutes(r: Router) {
  // ---------- Kunder ----------
  r.get('/customers', async ({ env, s, url }) => {
    const q = (url.searchParams.get('q') || '').trim().slice(0, 100);
    const status = url.searchParams.get('status');
    const archived = url.searchParams.get('archived') === '1';
    const where = ['c.org_id = ?', archived ? 'c.archived_at IS NOT NULL' : 'c.archived_at IS NULL'];
    const binds: unknown[] = [s.orgId];
    if (q) {
      where.push(`(c.name LIKE ? ESCAPE '\\' OR c.org_number LIKE ? ESCAPE '\\' OR c.email LIKE ? ESCAPE '\\' OR c.industry LIKE ? ESCAPE '\\'
        OR EXISTS (SELECT 1 FROM contacts k WHERE k.customer_id = c.id AND k.org_id = c.org_id AND (k.name LIKE ? ESCAPE '\\' OR k.email LIKE ? ESCAPE '\\')))`);
      const t = likeTerm(q); binds.push(t, t, t, t, t, t);
    }
    if (status && (CUSTOMER_STATUS as readonly string[]).includes(status)) { where.push('c.status = ?'); binds.push(status); }
    const rows = await env.DB.prepare(
      `SELECT c.id, c.name, c.org_number, c.status, c.industry, c.email, c.phone, c.website, c.owner_user_id, c.expected_value_minor, c.updated_at, c.created_at,
              u.name AS owner_name,
              (SELECT COUNT(*) FROM deals d WHERE d.customer_id = c.id AND d.org_id = c.org_id AND d.stage NOT IN ('won','lost')) AS open_deals,
              (SELECT COUNT(*) FROM quotes x WHERE x.customer_id = c.id AND x.org_id = c.org_id) AS quote_count,
              (SELECT k.name FROM contacts k WHERE k.customer_id = c.id AND k.org_id = c.org_id ORDER BY k.is_primary DESC, k.created_at LIMIT 1) AS primary_contact
         FROM customers c LEFT JOIN users u ON u.id = c.owner_user_id
        WHERE ${where.join(' AND ')} ORDER BY c.name COLLATE NOCASE LIMIT 500`).bind(...binds).all();
    return { customers: rows.results };
  }, { perm: 'customers:read' });

  r.post('/customers', async (c) => {
    const d = validate(customerShape, await c.body());
    await ownerInOrg(c, d.owner_user_id);
    const id = newId('cus'); const t = now();
    const b = await c.body();
    const stmts = [
      c.env.DB.prepare(`INSERT INTO customers (id, org_id, ${CUSTOMER_COLS.join(', ')}, created_at, updated_at) VALUES (?, ?, ${CUSTOMER_COLS.map(() => '?').join(', ')}, ?, ?)`)
        .bind(id, c.s.orgId, ...CUSTOMER_COLS.map((k) => (k === 'status' ? d.status || 'prospect' : k === 'owner_user_id' ? d.owner_user_id || c.s.userId : (d as any)[k] ?? null)), t, t),
      activityStmt(c.env, c.s.orgId, { customer_id: id, type: 'system', title: 'Kund skapad', actor: c.s.userId }),
      auditStmt(c.env, c.s.orgId, c.s.userId, c.ip, 'customer.created', 'customer', id, `Kund skapad: ${d.name}`),
    ];
    // Valfri första kontaktperson.
    if (b.contact && b.contact.name) {
      const k = validate(contactShape, b.contact);
      stmts.push(c.env.DB.prepare('INSERT INTO contacts (id, org_id, customer_id, name, title, email, phone, is_primary, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
        .bind(newId('con'), c.s.orgId, id, k.name, k.title, k.email, k.phone, 1, t, t));
    }
    await c.env.DB.batch(stmts);
    return { id };
  }, { perm: 'customers:write' });

  r.get('/customers/:id', async (c) => {
    const { env, s, params } = c;
    const cust = await getCustomer(c, params.id);
    const [contacts, deals, quotes, activities, tasks, owner] = await Promise.all([
      env.DB.prepare('SELECT * FROM contacts WHERE customer_id = ? AND org_id = ? ORDER BY is_primary DESC, name').bind(cust.id, s.orgId).all(),
      env.DB.prepare('SELECT d.*, u.name AS owner_name FROM deals d LEFT JOIN users u ON u.id = d.owner_user_id WHERE d.customer_id = ? AND d.org_id = ? ORDER BY d.updated_at DESC').bind(cust.id, s.orgId).all(),
      can(s, 'quotes:read')
        ? env.DB.prepare(`SELECT q.id, q.number, q.title, q.status, q.valid_until, q.sent_at, q.accepted_at, q.updated_at, v.totals_json
            FROM quotes q LEFT JOIN quote_versions v ON v.id = COALESCE(q.sent_version_id, q.current_version_id)
            WHERE q.customer_id = ? AND q.org_id = ? ORDER BY q.number DESC`).bind(cust.id, s.orgId).all()
        : Promise.resolve({ results: [] }),
      env.DB.prepare(`SELECT a.*, u.name AS actor_name FROM activities a LEFT JOIN users u ON u.id = a.actor_user_id
            WHERE a.customer_id = ? AND a.org_id = ? ORDER BY a.created_at DESC LIMIT 100`).bind(cust.id, s.orgId).all(),
      env.DB.prepare('SELECT * FROM tasks WHERE customer_id = ? AND org_id = ? ORDER BY status, due_date').bind(cust.id, s.orgId).all(),
      cust.owner_user_id ? env.DB.prepare('SELECT id, name FROM users WHERE id = ?').bind(cust.owner_user_id).first() : Promise.resolve(null),
    ]);
    return {
      customer: { ...cust, owner },
      contacts: contacts.results,
      deals: deals.results,
      quotes: (quotes.results as any[]).map((q) => ({ ...q, totals: parseJson(q.totals_json, null), totals_json: undefined })),
      activities: activities.results,
      tasks: tasks.results,
    };
  }, { perm: 'customers:read' });

  r.patch('/customers/:id', async (c) => {
    const cust = await getCustomer(c, c.params.id);
    const d = validate(customerShape, await c.body(), true);
    await ownerInOrg(c, d.owner_user_id);
    const { sql, vals } = updateSet(d, CUSTOMER_COLS);
    if (!sql) return { ok: true };
    const changed = Object.keys(d).filter((k) => (d as any)[k] !== cust[k]);
    await c.env.DB.batch([
      c.env.DB.prepare(`UPDATE customers SET ${sql}, updated_at = ? WHERE id = ? AND org_id = ?`).bind(...vals, now(), cust.id, c.s.orgId),
      auditStmt(c.env, c.s.orgId, c.s.userId, c.ip, 'customer.updated', 'customer', cust.id, `Kund uppdaterad: ${cust.name}`, { fields: changed }),
    ]);
    return { ok: true };
  }, { perm: 'customers:write' });

  r.post('/customers/:id/archive', async (c) => {
    const cust = await getCustomer(c, c.params.id);
    const archive = (await c.body()).archived !== false;
    await c.env.DB.batch([
      c.env.DB.prepare('UPDATE customers SET archived_at = ?, updated_at = ? WHERE id = ? AND org_id = ?').bind(archive ? now() : null, now(), cust.id, c.s.orgId),
      auditStmt(c.env, c.s.orgId, c.s.userId, c.ip, archive ? 'customer.archived' : 'customer.restored', 'customer', cust.id, `${archive ? 'Arkiverad' : 'Återställd'}: ${cust.name}`),
    ]);
    return { ok: true };
  }, { perm: 'customers:write' });

  // GDPR: export av allt som rör kunden och dess kontaktpersoner.
  r.get('/customers/:id/export', async (c) => {
    const { env, s } = c;
    const cust = await getCustomer(c, c.params.id);
    const q = (sql: string) => env.DB.prepare(sql).bind(cust.id, s.orgId).all().then((r) => r.results);
    const data = {
      exported_at: now(), exported_by: s.email, customer: cust,
      contacts: await q('SELECT * FROM contacts WHERE customer_id = ? AND org_id = ?'),
      deals: await q('SELECT * FROM deals WHERE customer_id = ? AND org_id = ?'),
      leads: await q('SELECT * FROM leads WHERE customer_id = ? AND org_id = ?'),
      activities: await q('SELECT * FROM activities WHERE customer_id = ? AND org_id = ?'),
      tasks: await q('SELECT * FROM tasks WHERE customer_id = ? AND org_id = ?'),
      quotes: await q('SELECT id, number, title, status, valid_until, sent_at, accepted_at, declined_at, created_at FROM quotes WHERE customer_id = ? AND org_id = ?'),
      quote_acceptances: await q('SELECT a.* FROM quote_acceptances a JOIN quotes x ON x.id = a.quote_id WHERE x.customer_id = ? AND a.org_id = ?'),
    };
    await audit(c, 'customer.exported', 'customer', cust.id, `Personuppgifter exporterade: ${cust.name}`);
    return new Response(JSON.stringify(data, null, 2), {
      headers: { 'content-type': 'application/json; charset=utf-8', 'content-disposition': `attachment; filename="kela-export-${cust.id}.json"` },
    });
  }, { perm: 'customers:export' });

  // ---------- Kontakter ----------
  r.post('/customers/:id/contacts', async (c) => {
    const cust = await getCustomer(c, c.params.id);
    const d = validate(contactShape, await c.body());
    const id = newId('con'); const t = now();
    const stmts: D1PreparedStatement[] = [];
    if (d.is_primary) stmts.push(c.env.DB.prepare('UPDATE contacts SET is_primary = 0 WHERE customer_id = ? AND org_id = ?').bind(cust.id, c.s.orgId));
    stmts.push(
      c.env.DB.prepare('INSERT INTO contacts (id, org_id, customer_id, name, title, email, phone, is_primary, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
        .bind(id, c.s.orgId, cust.id, d.name, d.title, d.email, d.phone, d.is_primary ? 1 : 0, t, t),
      auditStmt(c.env, c.s.orgId, c.s.userId, c.ip, 'contact.created', 'contact', id, `Kontakt ${d.name} tillagd hos ${cust.name}`),
    );
    await c.env.DB.batch(stmts);
    return { id };
  }, { perm: 'customers:write' });

  r.patch('/contacts/:id', async (c) => {
    const k = await c.env.DB.prepare('SELECT * FROM contacts WHERE id = ? AND org_id = ?').bind(c.params.id, c.s.orgId).first<any>();
    if (!k) throw new HttpError(404, 'not_found', 'Kontakten finns inte.');
    const d = validate(contactShape, await c.body(), true);
    const { sql, vals } = updateSet({ ...d, is_primary: d.is_primary == null ? undefined : d.is_primary ? 1 : 0 }, ['name', 'title', 'email', 'phone', ...(d.is_primary != null ? ['is_primary'] : [])]);
    const stmts: D1PreparedStatement[] = [];
    if (d.is_primary) stmts.push(c.env.DB.prepare('UPDATE contacts SET is_primary = 0 WHERE customer_id = ? AND org_id = ?').bind(k.customer_id, c.s.orgId));
    if (sql) stmts.push(c.env.DB.prepare(`UPDATE contacts SET ${sql}, updated_at = ? WHERE id = ? AND org_id = ?`).bind(...vals, now(), k.id, c.s.orgId));
    stmts.push(auditStmt(c.env, c.s.orgId, c.s.userId, c.ip, 'contact.updated', 'contact', k.id, `Kontakt uppdaterad: ${k.name}`));
    await c.env.DB.batch(stmts);
    return { ok: true };
  }, { perm: 'customers:write' });

  r.del('/contacts/:id', async (c) => {
    const k = await c.env.DB.prepare('SELECT * FROM contacts WHERE id = ? AND org_id = ?').bind(c.params.id, c.s.orgId).first<any>();
    if (!k) throw new HttpError(404, 'not_found', 'Kontakten finns inte.');
    const used = await c.env.DB.prepare('SELECT 1 FROM quotes WHERE contact_id = ? AND org_id = ? LIMIT 1').bind(k.id, c.s.orgId).first();
    if (used) throw new HttpError(409, 'in_use', 'Kontakten används på en offert och kan inte tas bort.');
    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM contacts WHERE id = ? AND org_id = ?').bind(k.id, c.s.orgId),
      auditStmt(c.env, c.s.orgId, c.s.userId, c.ip, 'contact.deleted', 'contact', k.id, `Kontakt borttagen: ${k.name}`),
    ]);
    return { ok: true };
  }, { perm: 'customers:write' });

  // ---------- Aktiviteter / anteckningar ----------
  r.post('/activities', async (c) => {
    const d = validate({
      type: v.enum(['note', 'call', 'meeting', 'email'] as const), title: v.str({ max: 200 }), body: v.str({ optional: true, max: 10000 }),
      customer_id: v.id('cus', { optional: true }), deal_id: v.id('deal', { optional: true }), lead_id: v.id('lead', { optional: true }),
    }, await c.body());
    if (!d.customer_id && !d.deal_id && !d.lead_id) throw new HttpError(422, 'validation', 'Koppla anteckningen till kund, affär eller lead.');
    if (d.customer_id) await getCustomer(c, d.customer_id);
    if (d.deal_id) await getDeal(c, d.deal_id);
    if (d.lead_id && !(await c.env.DB.prepare('SELECT 1 FROM leads WHERE id = ? AND org_id = ?').bind(d.lead_id, c.s.orgId).first())) throw new HttpError(404, 'not_found', 'Lead finns inte.');
    await activityStmt(c.env, c.s.orgId, { ...d, type: d.type!, title: d.title!, actor: c.s.userId }).run();
    return { ok: true };
  }, { perm: 'customers:write' });

  // ---------- Leads ----------
  r.get('/leads', async ({ env, s, url }) => {
    const status = url.searchParams.get('status');
    const q = (url.searchParams.get('q') || '').trim().slice(0, 100);
    const where = ['l.org_id = ?']; const binds: unknown[] = [s.orgId];
    if (status === 'open') where.push("l.status IN ('new','contacted','qualified')");
    else if (status && (LEAD_STATUS as readonly string[]).includes(status)) { where.push('l.status = ?'); binds.push(status); }
    if (q) { const t = likeTerm(q); where.push("(l.name LIKE ? ESCAPE '\\' OR l.company LIKE ? ESCAPE '\\' OR l.email LIKE ? ESCAPE '\\')"); binds.push(t, t, t); }
    const rows = await env.DB.prepare(`SELECT l.*, u.name AS owner_name FROM leads l LEFT JOIN users u ON u.id = l.owner_user_id WHERE ${where.join(' AND ')} ORDER BY l.created_at DESC LIMIT 500`).bind(...binds).all();
    return { leads: rows.results };
  }, { perm: 'leads:read' });

  r.post('/leads', async (c) => {
    const d = validate(leadShape, await c.body());
    await ownerInOrg(c, d.owner_user_id);
    const id = newId('lead'); const t = now();
    await c.env.DB.batch([
      c.env.DB.prepare('INSERT INTO leads (id, org_id, name, company, email, phone, source, message, status, owner_user_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
        .bind(id, c.s.orgId, d.name, d.company, d.email, d.phone, d.source || 'manual', d.message, 'new', d.owner_user_id || c.s.userId, t, t),
      activityStmt(c.env, c.s.orgId, { lead_id: id, type: 'system', title: `Ny förfrågan från ${d.company || d.name}`, actor: c.s.userId }),
      auditStmt(c.env, c.s.orgId, c.s.userId, c.ip, 'lead.created', 'lead', id, `Lead skapad: ${d.company || d.name}`),
    ]);
    return { id };
  }, { perm: 'leads:write' });

  r.get('/leads/:id', async (c) => {
    const lead = await c.env.DB.prepare('SELECT l.*, u.name AS owner_name FROM leads l LEFT JOIN users u ON u.id = l.owner_user_id WHERE l.id = ? AND l.org_id = ?').bind(c.params.id, c.s.orgId).first();
    if (!lead) throw new HttpError(404, 'not_found', 'Lead finns inte.');
    const acts = await c.env.DB.prepare('SELECT a.*, u.name AS actor_name FROM activities a LEFT JOIN users u ON u.id = a.actor_user_id WHERE a.lead_id = ? AND a.org_id = ? ORDER BY a.created_at DESC').bind(c.params.id, c.s.orgId).all();
    return { lead, activities: acts.results };
  }, { perm: 'leads:read' });

  r.patch('/leads/:id', async (c) => {
    const lead = await c.env.DB.prepare('SELECT * FROM leads WHERE id = ? AND org_id = ?').bind(c.params.id, c.s.orgId).first<any>();
    if (!lead) throw new HttpError(404, 'not_found', 'Lead finns inte.');
    const d = validate(leadShape, await c.body(), true);
    if (d.status === 'converted') throw new HttpError(422, 'validation', 'Använd "Konvertera" för att göra lead till kund.');
    await ownerInOrg(c, d.owner_user_id);
    const extra: Record<string, unknown> = {};
    if (d.status === 'contacted' && !lead.contacted_at) extra.contacted_at = now();
    const { sql, vals } = updateSet({ ...d, ...extra }, ['name', 'company', 'email', 'phone', 'source', 'message', 'status', 'owner_user_id', 'contacted_at']);
    if (!sql) return { ok: true };
    const stmts = [
      c.env.DB.prepare(`UPDATE leads SET ${sql}, updated_at = ? WHERE id = ? AND org_id = ?`).bind(...vals, now(), lead.id, c.s.orgId),
      auditStmt(c.env, c.s.orgId, c.s.userId, c.ip, 'lead.updated', 'lead', lead.id, `Lead uppdaterad: ${lead.company || lead.name}`, { fields: Object.keys(d) }),
    ];
    if (d.status && d.status !== lead.status) stmts.push(activityStmt(c.env, c.s.orgId, { lead_id: lead.id, type: 'system', title: `Status: ${d.status}`, actor: c.s.userId }));
    await c.env.DB.batch(stmts);
    return { ok: true };
  }, { perm: 'leads:write' });

  // Lead → kund (+ kontakt) + affär. Idempotent: en redan konverterad lead returnerar befintliga id:n.
  r.post('/leads/:id/convert', async (c) => {
    const { env, s } = c;
    const lead = await env.DB.prepare('SELECT * FROM leads WHERE id = ? AND org_id = ?').bind(c.params.id, s.orgId).first<any>();
    if (!lead) throw new HttpError(404, 'not_found', 'Lead finns inte.');
    if (lead.status === 'converted') return { customer_id: lead.customer_id, deal_id: lead.deal_id, already: true };
    const b = await c.body();
    const opts = validate({ customer_id: v.id('cus', { optional: true }), deal_title: v.str({ optional: true, max: 160 }), value_minor: v.int({ optional: true, min: 0, max: 1e12 }) }, b);
    const t = now();
    const stmts: D1PreparedStatement[] = [];
    let customerId = opts.customer_id;
    if (customerId) await getCustomer(c, customerId);
    else {
      customerId = newId('cus');
      stmts.push(env.DB.prepare('INSERT INTO customers (id, org_id, name, status, email, phone, owner_user_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)')
        .bind(customerId, s.orgId, lead.company || lead.name, 'prospect', lead.email, lead.phone, lead.owner_user_id || s.userId, t, t));
      stmts.push(env.DB.prepare('INSERT INTO contacts (id, org_id, customer_id, name, email, phone, is_primary, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)')
        .bind(newId('con'), s.orgId, customerId, lead.name, lead.email, lead.phone, 1, t, t));
    }
    const dealId = newId('deal');
    stmts.push(env.DB.prepare('INSERT INTO deals (id, org_id, customer_id, title, stage, value_minor, probability, owner_user_id, position, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
      .bind(dealId, s.orgId, customerId, opts.deal_title || `Affär – ${lead.company || lead.name}`, lead.status === 'new' ? 'new' : 'contacted', opts.value_minor || 0,
        lead.status === 'new' ? 10 : 20, lead.owner_user_id || s.userId, Date.now(), t, t));
    // WHERE status != 'converted' skyddar mot dubbel konvertering vid samtidiga anrop.
    stmts.push(env.DB.prepare("UPDATE leads SET status = 'converted', customer_id = ?, deal_id = ?, updated_at = ? WHERE id = ? AND org_id = ? AND status != 'converted'")
      .bind(customerId, dealId, t, lead.id, s.orgId));
    stmts.push(activityStmt(env, s.orgId, { customer_id: customerId, deal_id: dealId, lead_id: lead.id, type: 'system', title: 'Lead konverterad till kund och affär', body: lead.message, actor: s.userId }));
    stmts.push(auditStmt(env, s.orgId, s.userId, c.ip, 'lead.converted', 'lead', lead.id, `Lead konverterad: ${lead.company || lead.name}`, { customer_id: customerId, deal_id: dealId }));
    await env.DB.batch(stmts);
    return { customer_id: customerId, deal_id: dealId };
  }, { perm: ['leads:write', 'customers:write', 'deals:write'] });

  // ---------- Affärer / pipeline ----------
  r.get('/deals', async ({ env, s, url }) => {
    const where = ['d.org_id = ?']; const binds: unknown[] = [s.orgId];
    const owner = url.searchParams.get('owner'); if (owner) { where.push('d.owner_user_id = ?'); binds.push(owner); }
    const customer = url.searchParams.get('customer'); if (customer) { where.push('d.customer_id = ?'); binds.push(customer); }
    const minValue = Number(url.searchParams.get('min_value')); if (minValue > 0) { where.push('d.value_minor >= ?'); binds.push(minValue); }
    const minProb = Number(url.searchParams.get('min_prob')); if (minProb > 0) { where.push('d.probability >= ?'); binds.push(minProb); }
    const from = url.searchParams.get('from'); if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) { where.push('d.created_at >= ?'); binds.push(from); }
    const to = url.searchParams.get('to'); if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) { where.push('d.created_at <= ?'); binds.push(to + 'T23:59:59Z'); }
    const q = (url.searchParams.get('q') || '').trim().slice(0, 100);
    if (q) { const t = likeTerm(q); where.push("(d.title LIKE ? ESCAPE '\\' OR c.name LIKE ? ESCAPE '\\')"); binds.push(t, t); }
    const rows = await env.DB.prepare(`SELECT d.*, c.name AS customer_name, u.name AS owner_name,
        (SELECT COUNT(*) FROM quotes x WHERE x.deal_id = d.id AND x.org_id = d.org_id) AS quote_count
      FROM deals d LEFT JOIN customers c ON c.id = d.customer_id LEFT JOIN users u ON u.id = d.owner_user_id
      WHERE ${where.join(' AND ')} ORDER BY d.position, d.created_at LIMIT 1000`).bind(...binds).all();
    return { deals: rows.results, stages: DEAL_STAGES, lost_reasons: LOST_REASONS };
  }, { perm: 'deals:read' });

  r.post('/deals', async (c) => {
    const d = validate(dealShape, await c.body());
    if (d.customer_id) await getCustomer(c, d.customer_id);
    await ownerInOrg(c, d.owner_user_id);
    const stage = d.stage || 'new';
    if (stage === 'lost' && !d.lost_reason) throw new HttpError(422, 'validation', 'Ange varför affären förlorades.', { lost_reason: 'Obligatoriskt vid förlust.' });
    const id = newId('deal'); const t = now();
    await c.env.DB.batch([
      c.env.DB.prepare(`INSERT INTO deals (id, org_id, customer_id, title, stage, value_minor, monthly_value_minor, probability, owner_user_id, expected_close_date, next_step, next_step_date, lost_reason, lost_note, won_at, lost_at, position, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id, c.s.orgId, d.customer_id, d.title, stage, d.value_minor || 0, d.monthly_value_minor || 0,
        d.probability ?? STAGE_PROB[stage], d.owner_user_id || c.s.userId, d.expected_close_date, d.next_step, d.next_step_date, d.lost_reason, d.lost_note,
        stage === 'won' ? t : null, stage === 'lost' ? t : null, Date.now(), t, t),
      activityStmt(c.env, c.s.orgId, { customer_id: d.customer_id, deal_id: id, type: 'system', title: `Affär skapad: ${d.title}`, actor: c.s.userId }),
      auditStmt(c.env, c.s.orgId, c.s.userId, c.ip, 'deal.created', 'deal', id, `Affär skapad: ${d.title}`),
    ]);
    return { id };
  }, { perm: 'deals:write' });

  r.get('/deals/:id', async (c) => {
    const deal = await getDeal(c, c.params.id);
    const [cust, acts, quotes] = await Promise.all([
      deal.customer_id ? c.env.DB.prepare('SELECT id, name FROM customers WHERE id = ? AND org_id = ?').bind(deal.customer_id, c.s.orgId).first() : null,
      c.env.DB.prepare('SELECT a.*, u.name AS actor_name FROM activities a LEFT JOIN users u ON u.id = a.actor_user_id WHERE a.deal_id = ? AND a.org_id = ? ORDER BY a.created_at DESC LIMIT 100').bind(deal.id, c.s.orgId).all(),
      c.env.DB.prepare('SELECT id, number, title, status FROM quotes WHERE deal_id = ? AND org_id = ? ORDER BY number DESC').bind(deal.id, c.s.orgId).all(),
    ]);
    return { deal, customer: cust, activities: acts.results, quotes: quotes.results };
  }, { perm: 'deals:read' });

  r.patch('/deals/:id', async (c) => {
    const deal = await getDeal(c, c.params.id);
    const b = await c.body();
    const d = validate({ ...dealShape, position: v.num({ optional: true }) }, b, true);
    if (d.customer_id) await getCustomer(c, d.customer_id);
    await ownerInOrg(c, d.owner_user_id);
    const extra: Record<string, unknown> = {};
    if (d.stage && d.stage !== deal.stage) {
      if (d.stage === 'lost' && !(d.lost_reason || deal.lost_reason)) throw new HttpError(422, 'validation', 'Ange varför affären förlorades.', { lost_reason: 'Obligatoriskt vid förlust.' });
      extra.won_at = d.stage === 'won' ? now() : null;
      extra.lost_at = d.stage === 'lost' ? now() : null;
      if (d.stage !== 'lost') { extra.lost_reason = null; extra.lost_note = null; }
      if (d.probability == null) extra.probability = STAGE_PROB[d.stage];
    }
    const { sql, vals } = updateSet({ ...d, ...extra }, [...Object.keys(dealShape), 'position', 'won_at', 'lost_at']);
    if (!sql) return { ok: true };
    const stmts = [c.env.DB.prepare(`UPDATE deals SET ${sql}, updated_at = ? WHERE id = ? AND org_id = ?`).bind(...vals, now(), deal.id, c.s.orgId)];
    if (d.stage && d.stage !== deal.stage) {
      stmts.push(activityStmt(c.env, c.s.orgId, { customer_id: deal.customer_id, deal_id: deal.id, type: 'system', title: `Affär flyttad till ${d.stage}`, body: d.stage === 'lost' ? `${d.lost_reason || deal.lost_reason}${d.lost_note ? ': ' + d.lost_note : ''}` : null, actor: c.s.userId }));
      stmts.push(auditStmt(c.env, c.s.orgId, c.s.userId, c.ip, 'deal.stage_changed', 'deal', deal.id, `${deal.title}: ${deal.stage} → ${d.stage}`));
    } else if (Object.keys(d).some((k) => k !== 'position')) {
      stmts.push(auditStmt(c.env, c.s.orgId, c.s.userId, c.ip, 'deal.updated', 'deal', deal.id, `Affär uppdaterad: ${deal.title}`, { fields: Object.keys(d) }));
    }
    await c.env.DB.batch(stmts);
    return { ok: true };
  }, { perm: 'deals:write' });

  // ---------- Uppgifter ----------
  r.get('/tasks', async ({ env, s, url }) => {
    const mine = url.searchParams.get('mine') === '1';
    const status = url.searchParams.get('status') === 'done' ? 'done' : 'open';
    const rows = await env.DB.prepare(`SELECT t.*, c.name AS customer_name, u.name AS assignee_name, q.number AS quote_number
        FROM tasks t LEFT JOIN customers c ON c.id = t.customer_id LEFT JOIN users u ON u.id = t.assignee_user_id LEFT JOIN quotes q ON q.id = t.quote_id
       WHERE t.org_id = ? AND t.status = ? ${mine ? 'AND t.assignee_user_id = ?' : ''} ORDER BY t.due_date IS NULL, t.due_date, t.created_at LIMIT 500`)
      .bind(...[s.orgId, status, ...(mine ? [s.userId] : [])]).all();
    return { tasks: rows.results };
  }, { perm: 'tasks:read' });

  r.post('/tasks', async (c) => {
    const d = validate({
      title: v.str({ max: 200 }), due_date: v.date({ optional: true }), assignee_user_id: v.id('usr', { optional: true }),
      customer_id: v.id('cus', { optional: true }), deal_id: v.id('deal', { optional: true }), quote_id: v.id('quo', { optional: true }),
    }, await c.body());
    await ownerInOrg(c, d.assignee_user_id);
    if (d.customer_id) await getCustomer(c, d.customer_id);
    if (d.deal_id) await getDeal(c, d.deal_id);
    if (d.quote_id && !(await c.env.DB.prepare('SELECT 1 FROM quotes WHERE id = ? AND org_id = ?').bind(d.quote_id, c.s.orgId).first())) throw new HttpError(404, 'not_found', 'Offerten finns inte.');
    const id = newId('tsk');
    await c.env.DB.prepare('INSERT INTO tasks (id, org_id, title, due_date, assignee_user_id, customer_id, deal_id, quote_id, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .bind(id, c.s.orgId, d.title, d.due_date, d.assignee_user_id || c.s.userId, d.customer_id, d.deal_id, d.quote_id, c.s.userId, now()).run();
    return { id };
  }, { perm: 'tasks:write' });

  r.patch('/tasks/:id', async (c) => {
    const t = await c.env.DB.prepare('SELECT * FROM tasks WHERE id = ? AND org_id = ?').bind(c.params.id, c.s.orgId).first<any>();
    if (!t) throw new HttpError(404, 'not_found', 'Uppgiften finns inte.');
    const d = validate({ title: v.str({ max: 200 }), due_date: v.date({ optional: true }), status: v.enum(['open', 'done'] as const), assignee_user_id: v.id('usr', { optional: true }) }, await c.body(), true);
    await ownerInOrg(c, d.assignee_user_id);
    const extra = d.status ? { done_at: d.status === 'done' ? now() : null } : {};
    const { sql, vals } = updateSet({ ...d, ...extra }, ['title', 'due_date', 'status', 'assignee_user_id', 'done_at']);
    if (sql) await c.env.DB.prepare(`UPDATE tasks SET ${sql} WHERE id = ? AND org_id = ?`).bind(...vals, t.id, c.s.orgId).run();
    return { ok: true };
  }, { perm: 'tasks:write' });

  void today;
}
