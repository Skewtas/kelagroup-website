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


// KELA:s egna färdiga produkter med bekräftade från-priser per månad (Mikaela 2026-10-14/17).
// Uppstartskostnad offereras per kund och lämnas därför tom. Importen är idempotent: finns namnet redan hoppas det över.
const KELA_PRODUCTS: { name: string; category: string; monthly: number; description: string; includes: string[] }[] = [
  { name: 'Bokis – bokningssystem', category: 'KELA-produkter', monthly: 699900, description: 'Bokningssystem som pratar direkt med schemasystemet.', includes: ['Pris och restid räknas automatiskt', 'Automatisk schemaläggning med rätt kompetens', 'Tilläggstjänster och abonnemang', 'Orderbekräftelse, välkomstmejl/sms och påminnelser', 'Skräddarsys efter verksamheten'] },
  { name: 'Chattis – AI-chattbot', category: 'KELA-produkter', monthly: 1500000, description: 'AI-chattbot kopplad till affärssystemet som sköter bokning, ombokning och kundfrågor.', includes: ['Bokning, ombokning och avbokning', 'Föreslår nya tider och samma städare', 'Svarar på fakturafrågor', 'Tar emot beställningar'] },
  { name: 'Feedis – feedbacksystem', category: 'KELA-produkter', monthly: 150000, description: 'Sms-betyg efter utfört uppdrag med automatisk uppföljning.', includes: ['Sms-betyg efter uppdraget', 'Bra feedback skickas till personalen', 'Dålig feedback till kontoret med åtgärdsförslag', 'Nöjda kunder får länk till Google/Trustpilot/Reco'] },
  { name: 'Påminnis – betalningspåminnelser', category: 'KELA-produkter', monthly: 150000, description: 'Automatiska påminnelser om obetalda fakturor via mejl och sms.', includes: ['Automatiska mejl och sms', 'Ökad likviditet'] },
  { name: 'Headof – live-dashboard', category: 'KELA-produkter', monthly: 99900, description: 'Dashboard live mot affärssystemet.', includes: ['Försäljning, timmar och bokningar', 'Nyckeltal', 'Skräddarsys'] },
  { name: 'Personalapp', category: 'KELA-produkter', monthly: 199900, description: 'App för personalen med in-/utcheckning och AI-arbetsledare.', includes: ['In- och utcheckning med GPS', 'Kvalitetskontroller', 'AI-arbetsledare som besvarar de flesta frågor', 'Tid- och materialrapportering'] },
  { name: 'Kundapp', category: 'KELA-produkter', monthly: 99900, description: 'App där kunden ser och ändrar sina bokningar.', includes: ['Se och ändra bokningar', 'Uppgifter och feedback', 'Fakturor'] },
  { name: 'Rekryteringsverktyg', category: 'KELA-produkter', monthly: 150000, description: 'Rekrytering med kandidatbank och onboarding.', includes: ['Kandidatbank', 'Automatisk återkoppling', 'Onboarding'] },
  { name: 'Sökmotoroptimering (SEO)', category: 'Marknadsföring', monthly: 350000, description: 'Löpande sökmotoroptimering.', includes: [] },
  { name: 'Meta Ads', category: 'Marknadsföring', monthly: 150000, description: 'Annonsering på Facebook och Instagram.', includes: [] },
  { name: 'Nyhetsbrev (mejl och sms)', category: 'Marknadsföring', monthly: 100000, description: 'Segmentering, kundbrev, kampanjer och grattis-sms.', includes: ['Segmentering', 'Kundbrev och kampanjer', 'Grattis-sms till kunder och personal'] },
  { name: 'Content för Instagram', category: 'Marknadsföring', monthly: 100000, description: 'Innehåll för Instagram.', includes: [] },
];

export function serviceRoutes(r: Router) {
  r.get('/services', async (c) => {
    const all = c.url.searchParams.get('all') === '1';
    const rows = await c.env.DB.prepare(`${SELECT} WHERE s.org_id = ? ${all ? '' : 'AND s.active = 1'} ORDER BY s.sort, s.name`).bind(c.s.orgId).all();
    return { services: rows.results.map((x) => view(c, x)), costs_visible: can(c.s, 'services:costs'), vat_rates: VAT_RATES };
  }, { perm: 'services:read' });


  r.post('/services/import-kela', async (c) => {
    const existing = await c.env.DB.prepare('SELECT id, name, description, includes_json, current_price_version_id FROM services WHERE org_id = ?').bind(c.s.orgId).all<any>();
    const byName = new Map(existing.results.map((x) => [x.name.toLowerCase(), x]));
    const t = now(); const stmts: D1PreparedStatement[] = []; const added: string[] = []; const priced: string[] = [];
    KELA_PRODUCTS.forEach((p, i) => {
      const ex = byName.get(p.name.toLowerCase());
      if (ex && ex.current_price_version_id) return; // har redan pris – rörs aldrig
      const id = ex ? ex.id : newId('svc'); const pv = newId('prc');
      if (ex) {
        // Befintlig tjänst utan pris (t.ex. från startkatalogen): sätt pris och fyll bara i tomma fält.
        stmts.push(c.env.DB.prepare(`UPDATE services SET current_price_version_id = ?, description = COALESCE(description, ?),
          includes_json = CASE WHEN includes_json = '[]' THEN ? ELSE includes_json END, updated_at = ? WHERE id = ? AND org_id = ?`)
          .bind(pv, p.description, JSON.stringify(p.includes), t, id, c.s.orgId));
        priced.push(p.name);
      } else {
        stmts.push(c.env.DB.prepare('INSERT INTO services (id, org_id, name, category, description, includes_json, current_price_version_id, sort, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
          .bind(id, c.s.orgId, p.name, p.category, p.description, JSON.stringify(p.includes), pv, 100 + i, t, t));
        added.push(p.name);
      }
      stmts.push(c.env.DB.prepare('INSERT INTO service_price_versions (id, org_id, service_id, once_price_minor, monthly_price_minor, vat_bp, created_by, created_at) VALUES (?,?,?,NULL,?,2500,?,?)')
        .bind(pv, c.s.orgId, id, p.monthly, c.s.userId, t));
    });
    if (stmts.length) {
      stmts.push(auditStmt(c.env, c.s.orgId, c.s.userId, c.ip, 'service.imported', 'service', null, `KELA-produkter importerade: ${added.length} nya, ${priced.length} prissatta`, { added, priced }));
      await c.env.DB.batch(stmts);
    }
    return { added, priced, skipped: KELA_PRODUCTS.length - added.length - priced.length };
  }, { perm: 'services:write' });

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
