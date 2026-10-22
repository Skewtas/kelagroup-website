// KELA OS – offertlogik som delas mellan admin-API och den publika offertsidan.
import { Env, HttpError, newId, now, today, sha256hex, parseJson, addDays } from './core';
import { v } from './validate';
import { calcQuote } from '../../os/lib/calc.js';
import { activityStmt, auditStmt } from './router';
import { pickTemplate, projectFromTemplateStmts, PROJECT_TEMPLATES } from './projects';

export const QUOTE_STATUS = ['draft', 'review', 'sent', 'viewed', 'accepted', 'declined', 'expired'] as const;
export const VAT_RATES = [2500, 1200, 600, 0];

export const itemShape = v.obj({
  id: v.str({ optional: true, max: 40, pattern: /^qi_[0-9a-z]{8,32}$/ }),
  service_id: v.id('svc', { optional: true }),
  name: v.str({ max: 160 }),
  description: v.str({ optional: true, max: 3000 }),
  billing: v.enum(['once', 'monthly'] as const),
  unit: v.str({ optional: true, max: 20 }),
  qty_milli: v.int({ min: 1, max: 1_000_000_000 }),
  unit_price_minor: v.int({ min: 0, max: 1e12 }),
  discount_bp: v.int({ optional: true, min: 0, max: 10000 }),
  vat_bp: v.int({ optional: true, min: 0, max: 2500 }),
  optional: v.bool({ optional: true }),
});

// Digitaliseringsplan – ligger i versionens innehåll och fryses därför med offerten.
export const digitalPlanShape = v.obj({
  enabled: v.bool({ optional: true }),
  ai_draft: v.bool({ optional: true }),           // true = AI-utkast som inte granskats ännu (blockerar utskick)
  summary: v.str({ optional: true, max: 4000 }),
  current: v.list(v.obj({
    process: v.str({ max: 160 }), today: v.str({ optional: true, max: 1000 }), problem: v.str({ optional: true, max: 1000 }),
    hours_month: v.num({ optional: true, min: 0, max: 100000 }), automation_pct: v.int({ optional: true, min: 0, max: 100 }),
  }), { max: 30, optional: true }),
  hourly_cost_minor: v.int({ optional: true, min: 0, max: 1e8 }),
  removed_costs: v.list(v.obj({ label: v.str({ max: 160 }), monthly_minor: v.int({ optional: true, min: 0, max: 1e10 }) }), { max: 20, optional: true }),
  goals: v.list(v.obj({ goal: v.str({ max: 200 }), metric: v.str({ optional: true, max: 200 }), today: v.str({ optional: true, max: 100 }), target: v.str({ optional: true, max: 100 }) }), { max: 20, optional: true }),
  phases: v.list(v.obj({ title: v.str({ max: 160 }), period: v.str({ optional: true, max: 80 }), actions: v.str({ optional: true, max: 3000 }), effect: v.str({ optional: true, max: 600 }) }), { max: 10, optional: true }),
  assumptions: v.list(v.str({ max: 400 }), { max: 20, optional: true }),
}, { optional: true });

const planStep = v.obj({ title: v.str({ max: 160 }), text: v.str({ optional: true, max: 2000 }), duration: v.str({ optional: true, max: 60 }) });
export const contentShape = v.obj({
  cover_title: v.str({ optional: true, max: 160 }),
  cover_subtitle: v.str({ optional: true, max: 300 }),
  intro: v.str({ optional: true, max: 6000 }),
  needs: v.str({ optional: true, max: 6000 }),
  solution: v.str({ optional: true, max: 8000 }),
  includes: v.list(v.str({ max: 300 }), { max: 60, optional: true }),
  plan: v.list(planStep, { max: 30, optional: true }),
  delivery_estimate: v.str({ optional: true, max: 200 }),
  payment_terms: v.str({ optional: true, max: 2000 }),
  terms: v.str({ optional: true, max: 8000 }),
  special_terms: v.str({ optional: true, max: 4000 }),
  digital_plan: digitalPlanShape,
}, { optional: true });

export const DEFAULT_CONTENT = {
  cover_title: '',
  cover_subtitle: '',
  intro: '',
  needs: '',
  solution: '',
  includes: [] as string[],
  plan: [] as { title: string; text?: string; duration?: string }[],
  delivery_estimate: '',
  payment_terms: '',
  terms: '',
  special_terms: '',
  digital_plan: null as any,
};

/** Låter statusen spegla verkligheten: skickade offerter vars giltighetstid passerat blir "Utgången". */
export async function expireQuotes(env: Env, orgId: string) {
  const due = await env.DB.prepare("SELECT id, sent_version_id FROM quotes WHERE org_id = ? AND status IN ('sent','viewed') AND valid_until IS NOT NULL AND valid_until < ?")
    .bind(orgId, today()).all<any>();
  if (!due.results.length) return;
  const t = now();
  const stmts: D1PreparedStatement[] = [];
  for (const q of due.results) {
    stmts.push(env.DB.prepare("UPDATE quotes SET status = 'expired', updated_at = ? WHERE id = ? AND status IN ('sent','viewed')").bind(t, q.id));
    stmts.push(env.DB.prepare("INSERT INTO quote_events (id, org_id, quote_id, version_id, type, actor_kind, created_at) VALUES (?,?,?,?,'expired','system',?)")
      .bind(newId('qev'), orgId, q.id, q.sent_version_id, t));
  }
  await env.DB.batch(stmts);
}

export async function loadVersion(env: Env, orgId: string, versionId: string) {
  const ver = await env.DB.prepare('SELECT * FROM quote_versions WHERE id = ? AND org_id = ?').bind(versionId, orgId).first<any>();
  if (!ver) throw new HttpError(404, 'not_found', 'Versionen finns inte.');
  const items = await env.DB.prepare('SELECT * FROM quote_items WHERE quote_version_id = ? AND org_id = ? ORDER BY sort').bind(versionId, orgId).all<any>();
  return {
    ...ver,
    locked: !!ver.locked,
    content: { ...DEFAULT_CONTENT, ...parseJson(ver.content_json, {}) },
    totals: parseJson(ver.totals_json, null),
    items: items.results.map((i) => ({ ...i, optional: !!i.optional })),
  };
}

/** Bygger den fullständiga bilden av en offertversion som visas för kunden och fryses vid utskick. */
export async function buildSnapshot(env: Env, orgId: string, quote: any, version: any) {
  const [org, customer, contact, owner] = await Promise.all([
    env.DB.prepare('SELECT name, org_number FROM organizations WHERE id = ?').bind(orgId).first<any>(),
    env.DB.prepare('SELECT name, org_number, billing_address, visiting_address FROM customers WHERE id = ? AND org_id = ?').bind(quote.customer_id, orgId).first<any>(),
    quote.contact_id ? env.DB.prepare('SELECT name, title, email, phone FROM contacts WHERE id = ? AND org_id = ?').bind(quote.contact_id, orgId).first<any>() : null,
    quote.owner_user_id ? env.DB.prepare('SELECT name, email FROM users WHERE id = ?').bind(quote.owner_user_id).first<any>() : null,
  ]);
  const items = version.items.map((i: any) => ({
    id: i.id, name: i.name, description: i.description, billing: i.billing, unit: i.unit, qty_milli: i.qty_milli,
    unit_price_minor: i.unit_price_minor, discount_bp: i.discount_bp, vat_bp: i.vat_bp, optional: !!i.optional,
  }));
  return {
    schema: 1,
    quote: { id: quote.id, number: quote.number, title: quote.title, valid_until: quote.valid_until, currency: version.currency, version_no: version.version_no },
    org, customer, contact, owner,
    content: version.content,
    items,
    discount_bp: version.discount_bp,
    totals: calcQuote({ items, discount_bp: version.discount_bp, currency: version.currency }),
    issued_at: now(),
  };
}

/** Fryser en version. Returnerar snapshot + hash. Kan inte ångras. */
export async function lockVersionStmts(env: Env, orgId: string, quote: any, version: any) {
  const snap = await buildSnapshot(env, orgId, quote, version);
  const json = JSON.stringify(snap);
  const hash = await sha256hex(json);
  const t = now();
  return {
    snap, hash,
    stmt: env.DB.prepare('UPDATE quote_versions SET locked = 1, locked_at = ?, snapshot_json = ?, snapshot_hash = ?, totals_json = ?, updated_at = ? WHERE id = ? AND org_id = ? AND locked = 0')
      .bind(t, json, hash, JSON.stringify(snap.totals), t, version.id, orgId),
  };
}

/**
 * Åtgärder när en offert accepteras. Idempotent: uppgifter har unika source_key och accept-raden är unik per offert,
 * så en dubbelbehandlad händelse skapar inga dubbletter.
 */
export function acceptanceAutomationStmts(env: Env, quote: any, actor: { userId?: string | null; ip?: string | null }, items: { name: string }[] = []) {
  const orgId = quote.org_id; const t = now();
  const stmts: D1PreparedStatement[] = [];
  const dealId = quote.deal_id;
  if (dealId) {
    stmts.push(env.DB.prepare("UPDATE deals SET stage = 'won', probability = 100, won_at = COALESCE(won_at, ?), lost_at = NULL, lost_reason = NULL, updated_at = ? WHERE id = ? AND org_id = ?")
      .bind(t, t, dealId, orgId));
  }
  stmts.push(env.DB.prepare("UPDATE customers SET status = 'active', updated_at = ? WHERE id = ? AND org_id = ? AND status IN ('prospect','paused','former')").bind(t, quote.customer_id, orgId));
  const task = (key: string, title: string, days: number) =>
    env.DB.prepare('INSERT OR IGNORE INTO tasks (id, org_id, title, due_date, assignee_user_id, customer_id, deal_id, quote_id, source_key, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .bind(newId('tsk'), orgId, title, addDays(t, days).slice(0, 10), quote.owner_user_id, quote.customer_id, dealId, quote.id, key, t);
  // Projekt skapas direkt från mall som passar offertens innehåll (unik per offert → inga dubbletter).
  const templateKey = pickTemplate(items);
  stmts.push(...projectFromTemplateStmts(env, orgId, {
    id: newId('prj'), name: quote.title, customerId: quote.customer_id, quoteId: quote.id, dealId, ownerId: quote.owner_user_id, templateKey,
    description: `Skapat automatiskt när offert #${quote.number} accepterades.`,
  }));
  stmts.push(task(`accept:${quote.id}:agreement`, `Förbered avtal för offert #${quote.number}`, 2));
  stmts.push(task(`accept:${quote.id}:invoice`, `Förbered fakturering för offert #${quote.number}`, 3));
  // Uppföljningsuppgifter för offerten stängs.
  stmts.push(env.DB.prepare("UPDATE tasks SET status = 'done', done_at = ? WHERE org_id = ? AND quote_id = ? AND status = 'open' AND source_key LIKE 'quote-followup:%'").bind(t, orgId, quote.id));
  stmts.push(env.DB.prepare("INSERT INTO quote_events (id, org_id, quote_id, version_id, type, actor_kind, data_json, created_at) VALUES (?,?,?,?,'automation','system',?,?)")
    .bind(newId('qev'), orgId, quote.id, quote.sent_version_id, JSON.stringify({
      done: [dealId ? 'Affären markerad som vunnen' : null, 'Kunden markerad som aktiv', `Projekt skapat från mallen "${PROJECT_TEMPLATES[templateKey].name}" med standarduppgifter`, 'Uppgifter skapade: avtal och fakturering'].filter(Boolean),
      skipped: ['Välkomstmejl skickades inte – e-postintegration är inte konfigurerad', 'Ansvarig projektledare meddelades inte via mejl – e-postintegration saknas (uppgiften syns i KELA OS)'],
    }), t));
  stmts.push(activityStmt(env, orgId, { customer_id: quote.customer_id, deal_id: dealId, quote_id: quote.id, type: 'system', title: `Offert #${quote.number} accepterad`, actor: actor.userId ?? null }));
  stmts.push(auditStmt(env, orgId, actor.userId ?? null, actor.ip ?? null, 'quote.accepted', 'quote', quote.id, `Offert #${quote.number} accepterad`));
  return stmts;
}

export const STATUS_LABEL: Record<string, string> = {
  draft: 'Utkast', review: 'Klar för granskning', sent: 'Skickad', viewed: 'Öppnad', accepted: 'Accepterad', declined: 'Avböjd', expired: 'Utgången',
};
