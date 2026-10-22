// /api/os/services – tjänstekatalog med versionshanterade priser.
import { Router, Ctx, auditStmt, updateSet } from '../router';
import { HttpError, newId, now, parseJson } from '../core';
import { v, validate } from '../validate';
import { can } from '../auth';
import { margin } from '../../../os/lib/calc.js';

export const VAT_RATES = [2500, 1200, 600, 0] as const;

const serviceShape = {
  name: v.str({ max: 160 }), category: v.str({ optional: true, max: 60 }), description: v.str({ optional: true, max: 4000 }),
  delivery_time: v.str({ optional: true, max: 120 }),
  includes: v.list(v.str({ max: 300 }), { max: 50 }),
  addons: v.list(v.str({ max: 300 }), { max: 50 }),
  active: v.bool({ optional: true }), sort: v.int({ optional: true, min: 0, max: 100000 }),
};
const priceShape = {
  once_price_minor: v.int({ optional: true, min: 0, max: 1e12 }),
  monthly_price_minor: v.int({ optional: true, min: 0, max: 1e12 }),
  internal_once_cost_minor: v.int({ optional: true, min: 0, max: 1e12 }),
  internal_monthly_cost_minor: v.int({ optional: true, min: 0, max: 1e12 }),
  vat_bp: v.int({ optional: true, min: 0, max: 2500 }),
};
const PRICE_COLS = Object.keys(priceShape) as (keyof typeof priceShape)[];

function view(c: Ctx, row: any) {
  const costs = can(c.s, 'services:costs');
  const p = row.pv_id ? {
    id: row.pv_id, once_price_minor: row.once_price_minor, monthly_price_minor: row.monthly_price_minor, vat_bp: row.vat_bp,
    currency: row.currency, created_at: row.pv_created_at,
    ...(costs ? {
      internal_once_cost_minor: row.internal_once_cost_minor, internal_monthly_cost_minor: row.internal_monthly_cost_minor,
      once_margin: margin(row.once_price_minor, row.internal_once_cost_minor),
      monthly_margin: margin(row.monthly_price_minor, row.internal_monthly_cost_minor),
    } : {}),
  } : null;
  return {
    id: row.id, name: row.name, category: row.category, description: row.description, delivery_time: row.delivery_time,
    includes: parseJson(row.includes_json, []), addons: parseJson(row.addons_json, []), active: !!row.active, sort: row.sort,
    updated_at: row.updated_at, price: p,
  };
}

const SELECT = `SELECT s.*, p.id AS pv_id, p.once_price_minor, p.monthly_price_minor, p.internal_once_cost_minor, p.internal_monthly_cost_minor,
  p.vat_bp, p.currency, p.created_at AS pv_created_at
  FROM services s LEFT JOIN service_price_versions p ON p.id = s.current_price_version_id`;

async function getService(c: Ctx, id: string) {
  const row = await c.env.DB.prepare(`${SELECT} WHERE s.id = ? AND s.org_id = ?`).bind(id, c.s.orgId).first<any>();
  if (!row) throw new HttpError(404, 'not_found', 'Tjänsten finns inte.');
  return row;
}

function priceChanged(old: any, d: Record<string, unknown>) {
  return PRICE_COLS.some((k) => k in d && (d[k] ?? null) !== (old?.[k] ?? null));
}

export function serviceRoutes(r: Router) {
  r.get('/services', async (c) => {
    const all = c.url.searchParams.get('all') === '1';
    const rows = await c.env.DB.prepare(`${SELECT} WHERE s.org_id = ? ${all ? '' : 'AND s.active = 1'} ORDER BY s.sort, s.name`).bind(c.s.orgId).all();
    return { services: rows.results.map((x) => view(c, x)), costs_visible: can(c.s, 'services:costs'), vat_rates: VAT_RATES };
  }, { perm: 'services:read' });

  r.get('/services/:id', async (c) => {
    const row = await getService(c, c.params.id);
    const hist = await c.env.DB.prepare(`SELECT p.*, u.name AS created_by_name FROM service_price_versions p LEFT JOIN users u ON u.id = p.created_by
      WHERE p.service_id = ? AND p.org_id = ? ORDER BY p.created_at DESC`).bind(row.id, c.s.orgId).all();
    const costs = can(c.s, 'services:costs');
    return {
      service: view(c, row),
      price_history: hist.results.map((h: any) => costs ? h : { ...h, internal_once_cost_minor: undefined, internal_monthly_cost_minor: undefined }),
    };
  }, { perm: 'services:read' });

  r.post('/services', async (c) => {
    const b = await c.body();
    const d = validate(serviceShape, b);
    const p = validate(priceShape, b.price || {});
    const id = newId('svc'); const t = now();
    const stmts = [c.env.DB.prepare('INSERT INTO services (id, org_id, name, category, description, delivery_time, includes_json, addons_json, active, sort, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind(id, c.s.orgId, d.name, d.category, d.description, d.delivery_time, JSON.stringify(d.includes || []), JSON.stringify(d.addons || []), d.active === false ? 0 : 1, d.sort ?? 999, t, t)];
    if (PRICE_COLS.some((k) => p[k] != null)) {
      const pvId = newId('prc');
      stmts.push(c.env.DB.prepare(`INSERT INTO service_price_versions (id, org_id, service_id, ${PRICE_COLS.join(', ')}, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
        .bind(pvId, c.s.orgId, id, ...PRICE_COLS.map((k) => (k === 'vat_bp' ? p.vat_bp ?? 2500 : p[k] ?? null)), c.s.userId, t));
      stmts.push(c.env.DB.prepare('UPDATE services SET current_price_version_id = ? WHERE id = ?').bind(pvId, id));
    }
    stmts.push(auditStmt(c.env, c.s.orgId, c.s.userId, c.ip, 'service.created', 'service', id, `Tjänst skapad: ${d.name}`));
    await c.env.DB.batch(stmts);
    return { id };
  }, { perm: 'services:write' });

  r.patch('/services/:id', async (c) => {
    const row = await getService(c, c.params.id);
    const b = await c.body();
    const d = validate(serviceShape, b, true);
    const stmts: D1PreparedStatement[] = [];
    const fields: Record<string, unknown> = { ...d };
    if (d.includes) fields.includes_json = JSON.stringify(d.includes);
    if (d.addons) fields.addons_json = JSON.stringify(d.addons);
    if (d.active != null) fields.active = d.active ? 1 : 0;
    const { sql, vals } = updateSet(fields, ['name', 'category', 'description', 'delivery_time', 'includes_json', 'addons_json', 'active', 'sort']);
    const t = now();
    if (sql) stmts.push(c.env.DB.prepare(`UPDATE services SET ${sql}, updated_at = ? WHERE id = ? AND org_id = ?`).bind(...vals, t, row.id, c.s.orgId));
    if (b.price) {
      // Endast den som får se interna kostnader får ändra dem; övriga kostnader ärvs från nuvarande version.
      const p = validate(priceShape, b.price, true) as Record<string, number | null>;
      if (!can(c.s, 'services:costs')) { delete p.internal_once_cost_minor; delete p.internal_monthly_cost_minor; }
      if (priceChanged(row.pv_id ? row : null, p)) {
        const merged = Object.fromEntries(PRICE_COLS.map((k) => [k, k in p ? p[k] : row.pv_id ? row[k] : null]));
        if (merged.vat_bp == null) merged.vat_bp = 2500;
        if (!(VAT_RATES as readonly number[]).includes(merged.vat_bp as number)) throw new HttpError(422, 'validation', 'Ogiltig momssats.', { vat_bp: 'Välj 25, 12, 6 eller 0 %.' });
        const pvId = newId('prc');
        stmts.push(c.env.DB.prepare(`INSERT INTO service_price_versions (id, org_id, service_id, ${PRICE_COLS.join(', ')}, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
          .bind(pvId, c.s.orgId, row.id, ...PRICE_COLS.map((k) => merged[k] ?? null), c.s.userId, t));
        stmts.push(c.env.DB.prepare('UPDATE services SET current_price_version_id = ?, updated_at = ? WHERE id = ? AND org_id = ?').bind(pvId, t, row.id, c.s.orgId));
        stmts.push(auditStmt(c.env, c.s.orgId, c.s.userId, c.ip, 'service.price_changed', 'service', row.id, `Nytt pris för ${row.name}`, {
          from: row.pv_id ? { once: row.once_price_minor, monthly: row.monthly_price_minor } : null,
          to: { once: merged.once_price_minor, monthly: merged.monthly_price_minor },
        }));
      }
    }
    if (sql) stmts.push(auditStmt(c.env, c.s.orgId, c.s.userId, c.ip, 'service.updated', 'service', row.id, `Tjänst uppdaterad: ${row.name}`, { fields: Object.keys(d) }));
    if (stmts.length) await c.env.DB.batch(stmts);
    return { ok: true };
  }, { perm: 'services:write' });
}
