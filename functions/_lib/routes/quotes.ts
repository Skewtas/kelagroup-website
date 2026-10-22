// /api/os/quotes – offerter, versioner, utskick, mallar, förhandsgranskning.
import { Router, Ctx, audit, auditStmt, activityStmt, updateSet } from '../router';
import { HttpError, newId, now, today, addDays, likeTerm, parseJson, randomToken, sha256hex, rateLimit } from '../core';
import { draftDigitalPlan } from '../ai';
import { v, validate } from '../validate';
import { encryptSecret, decryptSecret, can } from '../auth';
import { calcQuote } from '../../../os/lib/calc.js';
import {
  QUOTE_STATUS, VAT_RATES, itemShape, contentShape, DEFAULT_CONTENT, expireQuotes, loadVersion, buildSnapshot, lockVersionStmts,
  acceptanceAutomationStmts,
} from '../quotes';
import { renderQuoteDocument } from '../quote-doc';
import { getCustomer } from './crm';

async function getQuote(c: Ctx, id: string) {
  const q = await c.env.DB.prepare('SELECT * FROM quotes WHERE id = ? AND org_id = ?').bind(id, c.s.orgId).first<any>();
  if (!q) throw new HttpError(404, 'not_found', 'Offerten finns inte.');
  return q;
}

function event(c: Ctx, quoteId: string, versionId: string | null, type: string, data: unknown = {}) {
  return c.env.DB.prepare("INSERT INTO quote_events (id, org_id, quote_id, version_id, type, actor_kind, actor_user_id, data_json, ip, created_at) VALUES (?,?,?,?,?,'user',?,?,?,?)")
    .bind(newId('qev'), c.s.orgId, quoteId, versionId, type, c.s.userId, JSON.stringify(data), c.ip, now());
}

function itemInsert(c: Ctx, versionId: string, it: any, sort: number, priceVersionId: string | null) {
  // INSERT ... SELECT ... WHERE: raden skrivs bara om versionen fortfarande är olåst (skydd mot samtidigt utskick).
  return c.env.DB.prepare(`INSERT INTO quote_items (id, org_id, quote_version_id, service_id, price_version_id, name, description, billing, unit, qty_milli, unit_price_minor, discount_bp, vat_bp, optional, sort)
    SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM quote_versions WHERE id = ? AND locked = 0)`).bind(it.id || newId('qi'), c.s.orgId, versionId, it.service_id ?? null, priceVersionId, it.name, it.description ?? null,
    it.billing, it.unit || 'st', it.qty_milli, it.unit_price_minor, it.discount_bp || 0, it.vat_bp ?? 2500, it.optional ? 1 : 0, sort, versionId);
}

/** Validerar rader och kopplar tjänstekatalogens aktuella prisversion (för spårbarhet). */
async function resolveItems(c: Ctx, items: any[]) {
  const svcIds = [...new Set(items.map((i) => i.service_id).filter(Boolean))];
  const map = new Map<string, string | null>();
  if (svcIds.length) {
    const rows = await c.env.DB.prepare(`SELECT id, current_price_version_id FROM services WHERE org_id = ? AND id IN (${svcIds.map(() => '?').join(',')})`)
      .bind(c.s.orgId, ...svcIds).all<any>();
    for (const r of rows.results) map.set(r.id, r.current_price_version_id);
    for (const id of svcIds) if (!map.has(id)) throw new HttpError(422, 'validation', 'Okänd tjänst i offerten.');
  }
  for (const it of items) {
    if (!VAT_RATES.includes(it.vat_bp ?? 2500)) throw new HttpError(422, 'validation', 'Ogiltig momssats.', { items: 'Välj 25, 12, 6 eller 0 % moms.' });
  }
  return items.map((it) => ({ it, pv: it.service_id ? map.get(it.service_id) ?? null : null }));
}

async function nextQuoteNumber(c: Ctx) {
  const row = await c.env.DB.prepare("UPDATE counters SET value = value + 1 WHERE org_id = ? AND key = 'quote_number' RETURNING value").bind(c.s.orgId).first<{ value: number }>();
  if (row) return row.value;
  await c.env.DB.prepare("INSERT OR IGNORE INTO counters (org_id, key, value) VALUES (?, 'quote_number', 1000)").bind(c.s.orgId).run();
  return nextQuoteNumber(c);
}

async function shareUrl(c: Ctx, q: any) {
  if (!q.share_token_enc) return null;
  try {
    return `${c.url.origin}/offert/${await decryptSecret(c.env, q.share_token_enc)}`;
  } catch {
    return null;
  }
}

async function newShareToken(c: Ctx) {
  const token = randomToken(32);
  return { token, hash: await sha256hex(token), enc: await encryptSecret(c.env, token) };
}

export function quoteRoutes(r: Router) {
  r.get('/quotes', async (c) => {
    const { env, s, url } = c;
    await expireQuotes(env, s.orgId);
    const where = ['q.org_id = ?']; const binds: unknown[] = [s.orgId];
    const status = url.searchParams.get('status');
    if (status === 'open') where.push("q.status IN ('sent','viewed')");
    else if (status && (QUOTE_STATUS as readonly string[]).includes(status)) { where.push('q.status = ?'); binds.push(status); }
    const customer = url.searchParams.get('customer'); if (customer) { where.push('q.customer_id = ?'); binds.push(customer); }
    const q = (url.searchParams.get('q') || '').trim().slice(0, 100);
    if (q) {
      const t = likeTerm(q);
      const num = Number(q.replace('#', ''));
      where.push(`(q.title LIKE ? ESCAPE '\\' OR c.name LIKE ? ESCAPE '\\'${Number.isInteger(num) && num > 0 ? ' OR q.number = ?' : ''})`);
      binds.push(t, t); if (Number.isInteger(num) && num > 0) binds.push(num);
    }
    const rows = await env.DB.prepare(`SELECT q.id, q.number, q.title, q.status, q.valid_until, q.sent_at, q.first_viewed_at, q.accepted_at, q.declined_at, q.updated_at, q.created_at,
        c.name AS customer_name, c.id AS customer_id, u.name AS owner_name, v.totals_json, v.version_no
      FROM quotes q JOIN customers c ON c.id = q.customer_id LEFT JOIN users u ON u.id = q.owner_user_id
      LEFT JOIN quote_versions v ON v.id = COALESCE(q.sent_version_id, q.current_version_id)
      WHERE ${where.join(' AND ')} ORDER BY q.number DESC LIMIT 500`).bind(...binds).all<any>();
    return { quotes: rows.results.map((x) => ({ ...x, totals: parseJson(x.totals_json, null), totals_json: undefined })) };
  }, { perm: 'quotes:read' });

  r.post('/quotes', async (c) => {
    const { env, s } = c;
    const b = await c.body();
    const d = validate({
      customer_id: v.id('cus'), contact_id: v.id('con', { optional: true }), deal_id: v.id('deal', { optional: true }),
      title: v.str({ max: 160 }), template_id: v.id('qtp', { optional: true }), valid_days: v.int({ optional: true, min: 1, max: 365 }),
    }, b);
    const cust = await getCustomer(c, d.customer_id!);
    if (d.contact_id && !(await env.DB.prepare('SELECT 1 FROM contacts WHERE id = ? AND customer_id = ? AND org_id = ?').bind(d.contact_id, cust.id, s.orgId).first()))
      throw new HttpError(422, 'validation', 'Kontaktpersonen hör inte till kunden.');
    if (d.deal_id && !(await env.DB.prepare('SELECT 1 FROM deals WHERE id = ? AND org_id = ?').bind(d.deal_id, s.orgId).first()))
      throw new HttpError(422, 'validation', 'Okänd affär.');
    let content: any = { ...DEFAULT_CONTENT, cover_title: d.title };
    let items: any[] = []; let discount = 0;
    if (d.template_id) {
      const tpl = await env.DB.prepare('SELECT * FROM quote_templates WHERE id = ? AND org_id = ?').bind(d.template_id, s.orgId).first<any>();
      if (!tpl) throw new HttpError(404, 'not_found', 'Mallen finns inte.');
      content = { ...content, ...parseJson(tpl.content_json, {}), cover_title: d.title };
      items = parseJson(tpl.items_json, []);
      discount = tpl.discount_bp || 0;
    }
    const resolved = await resolveItems(c, items);
    const number = await nextQuoteNumber(c);
    const id = newId('quo'); const verId = newId('qv'); const t = now();
    const totals = calcQuote({ items, discount_bp: discount });
    const org = await env.DB.prepare('SELECT currency FROM organizations WHERE id = ?').bind(s.orgId).first<any>();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO quotes (id, org_id, number, customer_id, contact_id, deal_id, title, status, current_version_id, owner_user_id, valid_until, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,'draft',?,?,?,?,?)`).bind(id, s.orgId, number, cust.id, d.contact_id, d.deal_id, d.title, verId, s.userId, addDays(today(), d.valid_days || 30).slice(0, 10), t, t),
      env.DB.prepare('INSERT INTO quote_versions (id, org_id, quote_id, version_no, content_json, currency, discount_bp, totals_json, created_by, created_at, updated_at) VALUES (?,?,?,1,?,?,?,?,?,?,?)')
        .bind(verId, s.orgId, id, JSON.stringify(content), org?.currency || 'SEK', discount, JSON.stringify(totals), s.userId, t, t),
      ...resolved.map(({ it, pv }, i) => itemInsert(c, verId, { ...it, id: undefined }, i, pv)),
      event(c, id, verId, 'created', d.template_id ? { template_id: d.template_id } : {}),
      activityStmt(env, s.orgId, { customer_id: cust.id, deal_id: d.deal_id, quote_id: id, type: 'system', title: `Offert #${number} skapad`, actor: s.userId }),
      auditStmt(env, s.orgId, s.userId, c.ip, 'quote.created', 'quote', id, `Offert #${number} skapad för ${cust.name}`),
    ]);
    return { id, number };
  }, { perm: 'quotes:write' });

  r.get('/quotes/:id', async (c) => {
    const { env, s } = c;
    await expireQuotes(env, s.orgId);
    const q = await getQuote(c, c.params.id);
    const [version, versions, events, acceptance, customer, contacts, deal, owner] = await Promise.all([
      loadVersion(env, s.orgId, q.current_version_id),
      env.DB.prepare('SELECT id, version_no, locked, locked_at, created_at, snapshot_hash, totals_json FROM quote_versions WHERE quote_id = ? AND org_id = ? ORDER BY version_no DESC').bind(q.id, s.orgId).all<any>(),
      env.DB.prepare('SELECT e.*, u.name AS actor_name FROM quote_events e LEFT JOIN users u ON u.id = e.actor_user_id WHERE e.quote_id = ? AND e.org_id = ? ORDER BY e.created_at DESC LIMIT 200').bind(q.id, s.orgId).all<any>(),
      env.DB.prepare('SELECT * FROM quote_acceptances WHERE quote_id = ? AND org_id = ?').bind(q.id, s.orgId).first<any>(),
      env.DB.prepare('SELECT id, name, org_number, email FROM customers WHERE id = ? AND org_id = ?').bind(q.customer_id, s.orgId).first(),
      env.DB.prepare('SELECT id, name, email, title FROM contacts WHERE customer_id = ? AND org_id = ? ORDER BY is_primary DESC, name').bind(q.customer_id, s.orgId).all(),
      q.deal_id ? env.DB.prepare('SELECT id, title, stage FROM deals WHERE id = ? AND org_id = ?').bind(q.deal_id, s.orgId).first() : null,
      q.owner_user_id ? env.DB.prepare('SELECT id, name FROM users WHERE id = ?').bind(q.owner_user_id).first() : null,
    ]);
    const project = await env.DB.prepare('SELECT id, number, name, status FROM projects WHERE quote_id = ? AND org_id = ?').bind(q.id, s.orgId).first();
    const { share_token_hash, share_token_enc, ...safe } = q;
    void share_token_hash;
    return {
      quote: { ...safe, has_link: !!share_token_enc },
      share_url: can(s, 'quotes:send') ? await shareUrl(c, q) : null,
      version,
      totals: calcQuote({ items: version.items, discount_bp: version.discount_bp, currency: version.currency }),
      versions: versions.results.map((x) => ({ ...x, locked: !!x.locked, totals: parseJson(x.totals_json, null), totals_json: undefined })),
      events: events.results.map((e) => ({ ...e, data: parseJson(e.data_json, {}), data_json: undefined })),
      acceptance: acceptance ? { ...acceptance, selected_optional: parseJson(acceptance.selected_optional_json, []), totals: parseJson(acceptance.totals_json, null) } : null,
      customer, contacts: contacts.results, deal, owner, project,
    };
  }, { perm: 'quotes:read' });

  // Spara: rubrikfält + innehåll + rader. Rader ersätts helt (redigeraren skickar hela listan).
  r.patch('/quotes/:id', async (c) => {
    const { env, s } = c;
    const q = await getQuote(c, c.params.id);
    const b = await c.body();
    const head = validate({
      title: v.str({ max: 160 }), contact_id: v.id('con', { optional: true }), deal_id: v.id('deal', { optional: true }),
      valid_until: v.date({ optional: true }), owner_user_id: v.id('usr', { optional: true }),
    }, b, true);
    const body = validate({ content: contentShape, items: v.list(itemShape, { max: 80, optional: true }), discount_bp: v.int({ optional: true, min: 0, max: 10000 }) }, b, true);
    const touchesVersion = 'content' in b || 'items' in b || 'discount_bp' in b;
    const ver = await loadVersion(env, s.orgId, q.current_version_id);
    if (touchesVersion && ver.locked) throw new HttpError(409, 'version_locked', 'Versionen är skickad och låst. Skapa en ny version för att ändra.');
    if (q.status === 'accepted' && Object.keys(head).length) throw new HttpError(409, 'accepted', 'Accepterade offerter kan inte ändras.');
    if (head.contact_id && !(await env.DB.prepare('SELECT 1 FROM contacts WHERE id = ? AND customer_id = ? AND org_id = ?').bind(head.contact_id, q.customer_id, s.orgId).first()))
      throw new HttpError(422, 'validation', 'Kontaktpersonen hör inte till kunden.');
    if (head.deal_id && !(await env.DB.prepare('SELECT 1 FROM deals WHERE id = ? AND org_id = ?').bind(head.deal_id, s.orgId).first()))
      throw new HttpError(422, 'validation', 'Okänd affär.');
    if (head.owner_user_id && !(await env.DB.prepare('SELECT 1 FROM memberships WHERE user_id = ? AND org_id = ?').bind(head.owner_user_id, s.orgId).first()))
      throw new HttpError(422, 'validation', 'Okänd ansvarig.');
    const t = now();
    const stmts: D1PreparedStatement[] = [];
    const { sql, vals } = updateSet(head, ['title', 'contact_id', 'deal_id', 'valid_until', 'owner_user_id']);
    stmts.push(env.DB.prepare(`UPDATE quotes SET ${sql ? sql + ', ' : ''}updated_at = ? WHERE id = ? AND org_id = ?`).bind(...vals, t, q.id, s.orgId));
    let totals: any = null; let savedItems: any[] | null = null;
    if (touchesVersion) {
      const items = body.items ?? ver.items;
      const discount = body.discount_bp ?? ver.discount_bp;
      const content = body.content ? { ...DEFAULT_CONTENT, ...body.content } : ver.content;
      const resolved = 'items' in b ? await resolveItems(c, items) : null;
      // Ge nya rader id redan här så att totalsummorna kan referera dem.
      const own = new Set(ver.items.map((i: any) => i.id));
      const withIds = resolved ? resolved.map(({ it, pv }) => ({ it: { ...it, id: it.id && own.has(it.id) ? it.id : newId('qi') }, pv })) : null;
      savedItems = withIds ? withIds.map((x) => x.it) : null;
      totals = calcQuote({ items: withIds ? withIds.map((x) => x.it) : items, discount_bp: discount, currency: ver.currency });
      // Villkoret locked = 0 i UPDATE skyddar mot att en samtidigt skickad version ändras.
      stmts.push(env.DB.prepare('UPDATE quote_versions SET content_json = ?, discount_bp = ?, totals_json = ?, updated_at = ? WHERE id = ? AND org_id = ? AND locked = 0')
        .bind(JSON.stringify(content), discount, JSON.stringify(totals), t, ver.id, s.orgId));
      if (withIds) {
        stmts.push(env.DB.prepare('DELETE FROM quote_items WHERE quote_version_id = ? AND org_id = ? AND (SELECT locked FROM quote_versions WHERE id = ?) = 0').bind(ver.id, s.orgId, ver.id));
        withIds.forEach(({ it, pv }, i) => stmts.push(itemInsert(c, ver.id, it, i, pv)));
      }
    }
    const res = await env.DB.batch(stmts);
    if (touchesVersion && !res[1].meta.changes) throw new HttpError(409, 'version_locked', 'Versionen låstes precis. Ladda om sidan.');
    if (Object.keys(head).length) await audit(c, 'quote.updated', 'quote', q.id, `Offert #${q.number} uppdaterad`, { fields: Object.keys(head) });
    return { ok: true, totals, items: savedItems };
  }, { perm: 'quotes:write' });

  r.post('/quotes/:id/status', async (c) => {
    const q = await getQuote(c, c.params.id);
    const { status, reason } = validate({ status: v.enum(['draft', 'review', 'declined'] as const), reason: v.str({ optional: true, max: 1000 }) }, await c.body());
    const allowed: Record<string, string[]> = { draft: ['review'], review: ['draft'], sent: ['declined'], viewed: ['declined'], expired: ['declined'] };
    if (!(allowed[q.status] || []).includes(status!)) throw new HttpError(409, 'bad_transition', 'Statusbytet är inte tillåtet.');
    const t = now();
    await c.env.DB.batch([
      c.env.DB.prepare(`UPDATE quotes SET status = ?, ${status === 'declined' ? 'declined_at = ?, decline_reason = ?,' : ''} updated_at = ? WHERE id = ? AND org_id = ?`)
        .bind(...(status === 'declined' ? [status, t, reason] : [status]), t, q.id, c.s.orgId),
      event(c, q.id, q.current_version_id, 'status_changed', { from: q.status, to: status, reason }),
      auditStmt(c.env, c.s.orgId, c.s.userId, c.ip, 'quote.status_changed', 'quote', q.id, `Offert #${q.number}: ${q.status} → ${status}`),
    ]);
    return { ok: true };
  }, { perm: 'quotes:write' });

  // Skicka = lås aktuell version, skapa (eller behåll) säker länk, uppdatera status. Inga mejl skickas härifrån.
  r.post('/quotes/:id/send', async (c) => {
    const { env, s } = c;
    const q = await getQuote(c, c.params.id);
    if (!['draft', 'review'].includes(q.status)) throw new HttpError(409, 'bad_transition', 'Bara utkast kan skickas. Skapa en ny version först.');
    const ver = await loadVersion(env, s.orgId, q.current_version_id);
    if (!ver.items.length) throw new HttpError(422, 'validation', 'Lägg till minst en rad innan du skickar.');
    if (!q.valid_until || q.valid_until < today()) throw new HttpError(422, 'validation', 'Sätt ett giltighetsdatum framåt i tiden.');
    // AI-genererat innehåll måste granskas av en människa innan något skickas till kund.
    if (ver.content.digital_plan?.enabled && ver.content.digital_plan.ai_draft)
      throw new HttpError(409, 'ai_review_required', 'Digitaliseringsplanen är ett AI-utkast. Granska den och markera den som granskad innan du skickar.');
    const { hash, stmt } = await lockVersionStmts(env, s.orgId, q, ver);
    const t = now();
    const tok = q.share_token_enc ? null : await newShareToken(c);
    const stmts = [
      stmt,
      env.DB.prepare(`UPDATE quotes SET status = 'sent', sent_version_id = ?, sent_at = ?, first_viewed_at = NULL, last_viewed_at = NULL, declined_at = NULL, decline_reason = NULL,
        ${tok ? 'share_token_hash = ?, share_token_enc = ?, share_created_at = ?,' : ''} updated_at = ? WHERE id = ? AND org_id = ? AND status IN ('draft','review')`)
        .bind(ver.id, t, ...(tok ? [tok.hash, tok.enc, t] : []), t, q.id, s.orgId),
      event(c, q.id, ver.id, 'sent', { version_no: ver.version_no, snapshot_hash: hash }),
      activityStmt(env, s.orgId, { customer_id: q.customer_id, deal_id: q.deal_id, quote_id: q.id, type: 'system', title: `Offert #${q.number} skickad (v${ver.version_no})`, actor: s.userId }),
      auditStmt(env, s.orgId, s.userId, c.ip, 'quote.sent', 'quote', q.id, `Offert #${q.number} v${ver.version_no} låst och delad`),
      env.DB.prepare('INSERT OR IGNORE INTO tasks (id, org_id, title, due_date, assignee_user_id, customer_id, deal_id, quote_id, source_key, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
        .bind(newId('tsk'), s.orgId, `Följ upp offert #${q.number}`, addDays(t, 3).slice(0, 10), q.owner_user_id, q.customer_id, q.deal_id, q.id, `quote-followup:${q.id}:${ver.id}`, t),
    ];
    if (q.deal_id) {
      stmts.push(env.DB.prepare("UPDATE deals SET stage = 'quote_sent', probability = MAX(probability, 60), updated_at = ? WHERE id = ? AND org_id = ? AND stage IN ('new','contacted','meeting','analysis')")
        .bind(t, q.deal_id, s.orgId));
    }
    const res = await env.DB.batch(stmts);
    if (!res[0].meta.changes) throw new HttpError(409, 'version_locked', 'Versionen var redan låst.');
    const fresh = await getQuote(c, q.id);
    return { ok: true, share_url: await shareUrl(c, fresh), snapshot_hash: hash };
  }, { perm: 'quotes:send' });

  r.post('/quotes/:id/link', async (c) => {
    const q = await getQuote(c, c.params.id);
    if (!q.sent_version_id) throw new HttpError(409, 'not_sent', 'Offerten har inte skickats.');
    const tok = await newShareToken(c);
    const t = now();
    await c.env.DB.batch([
      c.env.DB.prepare('UPDATE quotes SET share_token_hash = ?, share_token_enc = ?, share_created_at = ?, updated_at = ? WHERE id = ? AND org_id = ?').bind(tok.hash, tok.enc, t, t, q.id, c.s.orgId),
      event(c, q.id, q.sent_version_id, 'link_regenerated'),
      auditStmt(c.env, c.s.orgId, c.s.userId, c.ip, 'quote.link_regenerated', 'quote', q.id, `Ny länk för offert #${q.number} – gamla länken slutade gälla`),
    ]);
    return { share_url: `${c.url.origin}/offert/${tok.token}` };
  }, { perm: 'quotes:send' });

  // Ny version: kopierar senaste versionen till ett nytt utkast. Tidigare versioner lämnas orörda.
  r.post('/quotes/:id/versions', async (c) => {
    const { env, s } = c;
    const q = await getQuote(c, c.params.id);
    if (q.status === 'accepted') throw new HttpError(409, 'accepted', 'Offerten är accepterad. Duplicera den i stället.');
    const cur = await loadVersion(env, s.orgId, q.current_version_id);
    if (!cur.locked) throw new HttpError(409, 'draft_exists', 'Det finns redan ett utkast att redigera.');
    const verId = newId('qv'); const t = now();
    await env.DB.batch([
      env.DB.prepare('INSERT INTO quote_versions (id, org_id, quote_id, version_no, content_json, currency, discount_bp, totals_json, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
        .bind(verId, s.orgId, q.id, cur.version_no + 1, JSON.stringify(cur.content), cur.currency, cur.discount_bp, cur.totals_json, s.userId, t, t),
      ...cur.items.map((it: any, i: number) => itemInsert(c, verId, { ...it, id: undefined }, i, it.price_version_id)),
      env.DB.prepare("UPDATE quotes SET current_version_id = ?, status = 'draft', updated_at = ? WHERE id = ? AND org_id = ?").bind(verId, t, q.id, s.orgId),
      event(c, q.id, verId, 'version_created', { version_no: cur.version_no + 1, from_status: q.status }),
      auditStmt(env, s.orgId, s.userId, c.ip, 'quote.version_created', 'quote', q.id, `Offert #${q.number}: version ${cur.version_no + 1} skapad`),
    ]);
    return { version_id: verId };
  }, { perm: 'quotes:write' });

  r.get('/quotes/:id/versions/:vid', async (c) => {
    const q = await getQuote(c, c.params.id);
    const ver = await loadVersion(c.env, c.s.orgId, c.params.vid);
    if (ver.quote_id !== q.id) throw new HttpError(404, 'not_found', 'Versionen finns inte.');
    return { version: { ...ver, snapshot: parseJson(ver.snapshot_json, null), snapshot_json: undefined } };
  }, { perm: 'quotes:read' });

  r.post('/quotes/:id/duplicate', async (c) => {
    const { env, s } = c;
    const q = await getQuote(c, c.params.id);
    const ver = await loadVersion(env, s.orgId, q.current_version_id);
    const b = await c.body();
    const custId = b.customer_id ? (await getCustomer(c, String(b.customer_id))).id : q.customer_id;
    const number = await nextQuoteNumber(c);
    const id = newId('quo'); const verId = newId('qv'); const t = now();
    const items = ver.items.map((it: any) => ({ ...it, id: undefined }));
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO quotes (id, org_id, number, customer_id, contact_id, deal_id, title, status, current_version_id, owner_user_id, valid_until, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,'draft',?,?,?,?,?)`).bind(id, s.orgId, number, custId, custId === q.customer_id ? q.contact_id : null, custId === q.customer_id ? q.deal_id : null,
        `${q.title} (kopia)`, verId, s.userId, addDays(today(), 30).slice(0, 10), t, t),
      env.DB.prepare('INSERT INTO quote_versions (id, org_id, quote_id, version_no, content_json, currency, discount_bp, totals_json, created_by, created_at, updated_at) VALUES (?,?,?,1,?,?,?,?,?,?,?)')
        .bind(verId, s.orgId, id, JSON.stringify(ver.content), ver.currency, ver.discount_bp, JSON.stringify(calcQuote({ items, discount_bp: ver.discount_bp })), s.userId, t, t),
      ...items.map((it: any, i: number) => itemInsert(c, verId, it, i, it.price_version_id)),
      event(c, id, verId, 'created', { duplicated_from: q.number }),
      auditStmt(env, s.orgId, s.userId, c.ip, 'quote.duplicated', 'quote', id, `Offert #${number} skapad som kopia av #${q.number}`),
    ]);
    return { id, number };
  }, { perm: 'quotes:write' });

  // Förhandsgranskning (HTML). Används i iframe och för PDF-utskrift.
  r.get('/quotes/:id/preview', async (c) => {
    const { env, s, url } = c;
    const q = await getQuote(c, c.params.id);
    const vid = url.searchParams.get('version') || q.current_version_id;
    const ver = await loadVersion(env, s.orgId, vid);
    if (ver.quote_id !== q.id) throw new HttpError(404, 'not_found', 'Versionen finns inte.');
    const snap = ver.locked && ver.snapshot_json ? JSON.parse(ver.snapshot_json) : await buildSnapshot(env, s.orgId, q, ver);
    const acc = await env.DB.prepare('SELECT * FROM quote_acceptances WHERE quote_id = ? AND version_id = ? AND org_id = ?').bind(q.id, ver.id, s.orgId).first<any>();
    const html = renderQuoteDocument(snap, {
      mode: 'preview', draft: !ver.locked, autoPrint: url.searchParams.get('print') === '1',
      status: q.status, hash: ver.snapshot_hash, acceptance: acc,
    });
    if (url.searchParams.get('print') === '1') {
      await env.DB.batch([event(c, q.id, ver.id, 'pdf_exported', { version_no: ver.version_no })]);
    }
    return new Response(html.body, { headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': html.csp, 'x-frame-options': 'SAMEORIGIN', 'cache-control': 'no-store' } });
  }, { perm: 'quotes:read' });


  // KELA Intelligence: AI-utkast till digitaliseringsplan. Sparas inte – redigeraren visar det som ett utkast att granska.
  r.post('/quotes/:id/plan-draft', async (c) => {
    const { env, s } = c;
    const q = await getQuote(c, c.params.id);
    const ver = await loadVersion(env, s.orgId, q.current_version_id);
    if (ver.locked) throw new HttpError(409, 'version_locked', 'Versionen är låst. Skapa en ny version först.');
    const { notes } = validate({ notes: v.str({ min: 20, max: 20000, msg: 'Skriv minst några meningar.' }) }, await c.body());
    if (!(await rateLimit(env.DB, `ai:${s.userId}`, 20, 3600))) throw new HttpError(429, 'rate_limited', 'Max 20 AI-utkast per timme.');
    const cust = await env.DB.prepare('SELECT name, industry FROM customers WHERE id = ? AND org_id = ?').bind(q.customer_id, s.orgId).first<any>();
    const draft = await draftDigitalPlan(env, { customer: cust.name, industry: cust.industry, title: q.title, items: ver.items.map((i: any) => ({ name: i.name, billing: i.billing })), notes: notes! });
    // Logga att AI använts – men inte innehållet (dataminimering).
    await audit(c, 'ai.plan_draft', 'quote', q.id, `AI-utkast till digitaliseringsplan för offert #${q.number}`, { model: draft.model, notes_chars: notes!.length });
    const { model, ...plan } = draft; void model;
    return { plan };
  }, { perm: 'quotes:write' });

  // ---------- Mallar ----------
  r.get('/quote-templates', async ({ env, s }) => {
    const rows = await env.DB.prepare('SELECT id, name, description, items_json, updated_at FROM quote_templates WHERE org_id = ? ORDER BY name').bind(s.orgId).all<any>();
    return { templates: rows.results.map((t) => ({ ...t, item_count: parseJson<any[]>(t.items_json, []).length, items_json: undefined })) };
  }, { perm: 'quotes:read' });

  r.post('/quote-templates', async (c) => {
    const d = validate({ quote_id: v.id('quo'), name: v.str({ max: 120 }), description: v.str({ optional: true, max: 500 }) }, await c.body());
    const q = await getQuote(c, d.quote_id!);
    const ver = await loadVersion(c.env, c.s.orgId, q.current_version_id);
    const items = ver.items.map((i: any) => ({ service_id: i.service_id, name: i.name, description: i.description, billing: i.billing, unit: i.unit, qty_milli: i.qty_milli,
      unit_price_minor: i.unit_price_minor, discount_bp: i.discount_bp, vat_bp: i.vat_bp, optional: !!i.optional }));
    const { cover_title, ...content } = ver.content; void cover_title;
    const id = newId('qtp'); const t = now();
    await c.env.DB.batch([
      c.env.DB.prepare('INSERT INTO quote_templates (id, org_id, name, description, content_json, items_json, discount_bp, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
        .bind(id, c.s.orgId, d.name, d.description, JSON.stringify(content), JSON.stringify(items), ver.discount_bp, c.s.userId, t, t),
      auditStmt(c.env, c.s.orgId, c.s.userId, c.ip, 'quote_template.created', 'quote_template', id, `Offertmall skapad: ${d.name}`),
    ]);
    return { id };
  }, { perm: 'quotes:write' });

  r.del('/quote-templates/:id', async (c) => {
    const tpl = await c.env.DB.prepare('SELECT * FROM quote_templates WHERE id = ? AND org_id = ?').bind(c.params.id, c.s.orgId).first<any>();
    if (!tpl) throw new HttpError(404, 'not_found', 'Mallen finns inte.');
    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM quote_templates WHERE id = ? AND org_id = ?').bind(tpl.id, c.s.orgId),
      auditStmt(c.env, c.s.orgId, c.s.userId, c.ip, 'quote_template.deleted', 'quote_template', tpl.id, `Offertmall borttagen: ${tpl.name}`),
    ]);
    return { ok: true };
  }, { perm: 'quotes:write' });

  void acceptanceAutomationStmts;
}
