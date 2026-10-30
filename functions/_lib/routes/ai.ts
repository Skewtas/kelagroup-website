// /api/os/ai – Kela AI i adminpanelen: statistik, samtal, ta över som människa, konfiguration per tenant.
import { Router, audit, auditStmt } from '../router';
import { HttpError, newId, now, parseJson, likeTerm } from '../core';
import { normalizeConfig, DEFAULT_CONFIG } from '../kela-ai/config';

const DAY = 86400_000;
const since = (days: number) => new Date(Date.now() - days * DAY).toISOString();
const csvCell = (v: unknown) => { const s = String(v ?? ''); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

export function aiRoutes(r: Router) {
  // ---------- Statistik ----------
  r.get('/ai/overview', async ({ env, s, url }) => {
    const days = Math.min(365, Math.max(1, Number(url.searchParams.get('days')) || 30));
    const from = since(days); const org = s.orgId;
    const one = <T = any>(sql: string, ...b: unknown[]) => env.DB.prepare(sql).bind(...b).first<T>();
    const all = <T = any>(sql: string, ...b: unknown[]) => env.DB.prepare(sql).bind(...b).all<T>().then((x) => x.results);
    const conv = await one(`SELECT COUNT(*) AS n, COUNT(DISTINCT session_hash) AS sessions, COALESCE(SUM(cost_micro_usd),0) AS cost, COALESCE(SUM(turns),0) AS turns,
      COALESCE(SUM(rating_up),0) AS up, COALESCE(SUM(rating_down),0) AS down, COALESCE(SUM(input_tokens),0) AS tin, COALESCE(SUM(output_tokens),0) AS tout,
      SUM(CASE WHEN lead_id IS NOT NULL THEN 1 ELSE 0 END) AS with_lead FROM ai_conversations WHERE org_id = ? AND created_at >= ?`, org, from);
    const ev = await all<{ type: string; name: string | null; n: number }>(`SELECT type, name, COUNT(*) AS n FROM ai_events WHERE org_id = ? AND created_at >= ? GROUP BY type, name`, org, from);
    const count = (type: string, name?: string) => ev.filter((e) => e.type === type && (name === undefined || e.name === name)).reduce((a, e) => a + e.n, 0);
    const demoNames = ['booking_demo', 'integration_demo', 'savings', 'solution_flow'];
    const demos = demoNames.map((n) => ({ name: n, started: count('tool', n), completed: count('demo_complete', n) }));
    const daily = await all(`SELECT substr(created_at,1,10) AS d, COUNT(*) AS n FROM ai_conversations WHERE org_id = ? AND created_at >= ? GROUP BY d ORDER BY d`, org, from);
    const firstQs = await all<{ t: string }>(`SELECT m.display_text AS t FROM ai_messages m JOIN ai_conversations c ON c.id = m.conversation_id
      WHERE c.org_id = ? AND c.created_at >= ? AND m.role = 'user' AND m.display_text != '' AND m.seq = (SELECT MIN(seq) FROM ai_messages x WHERE x.conversation_id = c.id AND x.role = 'user') ORDER BY c.created_at DESC LIMIT 400`, org, from);
    const qCount = new Map<string, number>();
    for (const q of firstQs) { const k = q.t.trim().replace(/\s+/g, ' ').slice(0, 120); qCount.set(k, (qCount.get(k) || 0) + 1); }
    const leads = count('lead'); const meetings = count('meeting_request'); const n = conv?.n || 0;
    return {
      days,
      kpis: {
        conversations: n, sessions: conv?.sessions || 0, leads, meetings, handoffs: count('handoff'),
        conversion_pct: n ? Math.round(((leads + meetings) / n) * 1000) / 10 : null,
        cost_usd: (conv?.cost || 0) / 1e6, cost_per_conv_usd: n ? (conv?.cost || 0) / 1e6 / n : null,
        tokens_in: conv?.tin || 0, tokens_out: conv?.tout || 0, turns: conv?.turns || 0,
        rating_up: conv?.up || 0, rating_down: conv?.down || 0,
        satisfaction_pct: (conv?.up || 0) + (conv?.down || 0) ? Math.round(((conv?.up || 0) / ((conv?.up || 0) + (conv?.down || 0))) * 100) : null,
        errors: count('error'), fallbacks: count('fallback'), opens: count('open'),
      },
      demos,
      errors: ev.filter((e) => e.type === 'error' || e.type === 'fallback').map((e) => ({ type: e.type, name: e.name, n: e.n })),
      starters: ev.filter((e) => e.type === 'starter').map((e) => ({ name: e.name, n: e.n })).sort((a, b) => b.n - a.n),
      services: ev.filter((e) => e.type === 'tool').map((e) => ({ name: e.name, n: e.n })).sort((a, b) => b.n - a.n),
      top_questions: [...qCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([q, c]) => ({ q, n: c })),
      daily,
    };
  }, { perm: 'ai:read' });

  // ---------- Samtal ----------
  r.get('/ai/conversations', async ({ env, s, url }) => {
    const where = ['c.org_id = ?']; const b: unknown[] = [s.orgId];
    const st = url.searchParams.get('status');
    if (st === 'attention') where.push("c.status IN ('handoff','human')");
    else if (st && ['ai', 'handoff', 'human', 'closed'].includes(st)) { where.push('c.status = ?'); b.push(st); }
    if (url.searchParams.get('lead') === '1') where.push('c.lead_id IS NOT NULL');
    const q = (url.searchParams.get('q') || '').trim().slice(0, 80);
    if (q) { where.push("EXISTS (SELECT 1 FROM ai_messages m WHERE m.conversation_id = c.id AND m.display_text LIKE ? ESCAPE '\\')"); b.push(likeTerm(q)); }
    const rows = await env.DB.prepare(`SELECT c.id, c.tenant_id, c.status, c.first_page, c.last_page, c.turns, c.profile_json, c.lead_id, c.staff_unread, c.cost_micro_usd, c.rating_up, c.rating_down, c.created_at, c.updated_at,
        l.name AS lead_name, l.company AS lead_company, u.name AS staff_name,
        (SELECT display_text FROM ai_messages m WHERE m.conversation_id = c.id AND m.role = 'user' AND m.display_text != '' ORDER BY seq LIMIT 1) AS first_message
      FROM ai_conversations c LEFT JOIN leads l ON l.id = c.lead_id LEFT JOIN users u ON u.id = c.staff_user_id
      WHERE ${where.join(' AND ')} ORDER BY c.updated_at DESC LIMIT 150`).bind(...b).all<any>();
    return { conversations: rows.results.map((x) => ({ ...x, profile: parseJson(x.profile_json, {}), profile_json: undefined })) };
  }, { perm: 'ai:read' });

  r.get('/ai/conversations/:id', async ({ env, s, params }) => {
    const c = await env.DB.prepare(`SELECT c.*, l.name AS lead_name, l.company AS lead_company, l.email AS lead_email, u.name AS staff_name FROM ai_conversations c
      LEFT JOIN leads l ON l.id = c.lead_id LEFT JOIN users u ON u.id = c.staff_user_id WHERE c.id = ? AND c.org_id = ?`).bind(params.id, s.orgId).first<any>();
    if (!c) throw new HttpError(404, 'not_found', 'Samtalet finns inte.');
    const msgs = await env.DB.prepare(`SELECT m.id, m.seq, m.role, m.display_text, m.ui_json, m.rating, m.created_at, u.name AS staff_name FROM ai_messages m LEFT JOIN users u ON u.id = m.staff_user_id
      WHERE m.conversation_id = ? AND m.role IN ('user','assistant','staff') ORDER BY m.seq`).bind(c.id).all<any>();
    const { token_hash, session_hash, ...safe } = c;
    return { conversation: { ...safe, profile: parseJson(c.profile_json, {}), profile_json: undefined }, messages: msgs.results.filter((m) => m.display_text || m.ui_json).map((m) => ({ ...m, ui: parseJson(m.ui_json, null), ui_json: undefined })) };
  }, { perm: 'ai:read' });

  const own = async (env: any, org: string, id: string) => {
    const c = await env.DB.prepare('SELECT id, status FROM ai_conversations WHERE id = ? AND org_id = ?').bind(id, org).first();
    if (!c) throw new HttpError(404, 'not_found', 'Samtalet finns inte.');
    return c as { id: string; status: string };
  };

  r.post('/ai/conversations/:id/takeover', async (c) => {
    const conv = await own(c.env, c.s.orgId, c.params.id);
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE ai_conversations SET status = 'human', staff_user_id = ?, staff_unread = 0, updated_at = ? WHERE id = ?").bind(c.s.userId, now(), conv.id),
      c.env.DB.prepare("INSERT INTO ai_messages (id, org_id, conversation_id, seq, role, display_text, staff_user_id, created_at) VALUES (?,?,?,(SELECT COALESCE(MAX(seq),0)+1 FROM ai_messages WHERE conversation_id = ?),'staff',?,?,?)")
        .bind(newId('aim'), c.s.orgId, conv.id, conv.id, `${c.s.name.split(' ')[0]} från Kela har anslutit till chatten.`, c.s.userId, now()),
      auditStmt(c.env, c.s.orgId, c.s.userId, c.ip, 'ai.takeover', 'ai_conversation', conv.id, 'Tog över ett Kela AI-samtal'),
    ]);
    return { ok: true };
  }, { perm: 'ai:write' });

  r.post('/ai/conversations/:id/release', async (c) => {
    const conv = await own(c.env, c.s.orgId, c.params.id);
    const close = (await c.body()).close === true;
    await c.env.DB.batch([
      c.env.DB.prepare('UPDATE ai_conversations SET status = ?, staff_unread = 0, updated_at = ? WHERE id = ?').bind(close ? 'closed' : 'ai', now(), conv.id),
      c.env.DB.prepare("INSERT INTO ai_messages (id, org_id, conversation_id, seq, role, display_text, staff_user_id, created_at) VALUES (?,?,?,(SELECT COALESCE(MAX(seq),0)+1 FROM ai_messages WHERE conversation_id = ?),'staff',?,?,?)")
        .bind(newId('aim'), c.s.orgId, conv.id, conv.id, close ? 'Samtalet är avslutat. Tack för att du hörde av dig!' : 'Du pratar nu med Kela AI igen. Skriv om du vill något mer!', c.s.userId, now()),
      auditStmt(c.env, c.s.orgId, c.s.userId, c.ip, close ? 'ai.close' : 'ai.release', 'ai_conversation', conv.id, close ? 'Avslutade ett Kela AI-samtal' : 'Lämnade tillbaka samtalet till Kela AI'),
    ]);
    return { ok: true };
  }, { perm: 'ai:write' });

  r.post('/ai/conversations/:id/message', async (c) => {
    const conv = await own(c.env, c.s.orgId, c.params.id);
    if (conv.status !== 'human') throw new HttpError(409, 'not_taken_over', 'Ta över samtalet innan du skriver.');
    const text = String((await c.body()).text || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, 2000);
    if (!text) throw new HttpError(422, 'validation', 'Skriv ett meddelande.', { text: 'Skriv ett meddelande.' });
    await c.env.DB.batch([
      c.env.DB.prepare("INSERT INTO ai_messages (id, org_id, conversation_id, seq, role, display_text, staff_user_id, created_at) VALUES (?,?,?,(SELECT COALESCE(MAX(seq),0)+1 FROM ai_messages WHERE conversation_id = ?),'staff',?,?,?)")
        .bind(newId('aim'), c.s.orgId, conv.id, conv.id, text, c.s.userId, now()),
      c.env.DB.prepare('UPDATE ai_conversations SET staff_unread = 0, updated_at = ? WHERE id = ?').bind(now(), conv.id),
    ]);
    return { ok: true };
  }, { perm: 'ai:write' });

  r.post('/ai/conversations/:id/seen', async (c) => {
    const conv = await own(c.env, c.s.orgId, c.params.id);
    await c.env.DB.prepare('UPDATE ai_conversations SET staff_unread = 0 WHERE id = ?').bind(conv.id).run();
    return { ok: true };
  }, { perm: 'ai:read' });

  r.del('/ai/conversations/:id', async (c) => {
    const conv = await own(c.env, c.s.orgId, c.params.id);
    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM ai_messages WHERE conversation_id = ?').bind(conv.id),
      c.env.DB.prepare('UPDATE ai_events SET conversation_id = NULL WHERE conversation_id = ?').bind(conv.id),
      c.env.DB.prepare('DELETE FROM ai_conversations WHERE id = ?').bind(conv.id),
      auditStmt(c.env, c.s.orgId, c.s.userId, c.ip, 'ai.delete', 'ai_conversation', conv.id, 'Raderade ett Kela AI-samtal (GDPR)'),
    ]);
    return { ok: true };
  }, { perm: 'ai:configure' });

  // ---------- Export (utan samtalsinnehåll – bara nyckeltal per samtal) ----------
  r.get('/ai/export', async (c) => {
    const rows = await c.env.DB.prepare(`SELECT c.id, c.created_at, c.status, c.first_page, c.turns, c.lead_id, c.rating_up, c.rating_down, c.cost_micro_usd, c.input_tokens, c.output_tokens
      FROM ai_conversations c WHERE c.org_id = ? ORDER BY c.created_at DESC LIMIT 5000`).bind(c.s.orgId).all<any>();
    const head = ['id', 'skapad', 'status', 'första sida', 'svar', 'lead', 'tumme upp', 'tumme ner', 'kostnad USD', 'input-token', 'output-token'];
    const lines = [head.join(';'), ...rows.results.map((x) => [x.id, x.created_at, x.status, x.first_page, x.turns, x.lead_id || '', x.rating_up, x.rating_down, (x.cost_micro_usd / 1e6).toFixed(4), x.input_tokens, x.output_tokens].map(csvCell).join(';'))];
    await audit(c, 'ai.export', 'ai_conversation', null, `Exporterade ${rows.results.length} Kela AI-samtal (nyckeltal)`);
    return new Response('﻿' + lines.join('\n'), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="kela-ai-samtal.csv"' } });
  }, { perm: 'ai:read' });

  // ---------- Tenants och konfiguration ----------
  r.get('/ai/tenants', async ({ env, s }) => {
    let rows = await env.DB.prepare('SELECT id, name, active, allowed_origins, updated_at FROM ai_tenants WHERE org_id = ? ORDER BY created_at').bind(s.orgId).all<any>();
    if (!rows.results.length) {
      // Skapa Kelas egen assistent om den saknas och företaget äger den (första företaget).
      const first = await env.DB.prepare('SELECT id FROM organizations ORDER BY created_at LIMIT 1').first<any>();
      if (first?.id === s.orgId) {
        await env.DB.prepare("INSERT OR IGNORE INTO ai_tenants (id, org_id, name, config_json, created_at, updated_at) VALUES ('kela', ?, 'Kela Group – kelagroup.se', '{}', ?, ?)").bind(s.orgId, now(), now()).run();
        rows = await env.DB.prepare('SELECT id, name, active, allowed_origins, updated_at FROM ai_tenants WHERE org_id = ? ORDER BY created_at').bind(s.orgId).all<any>();
      }
    }
    return { tenants: rows.results.map((t) => ({ ...t, allowed_origins: parseJson(t.allowed_origins, []) })) };
  }, { perm: 'ai:read' });

  // Ny assistent för en kund (multi-tenant). Data isoleras per företag (org_id) och tenant.
  r.post('/ai/tenants', async (c) => {
    const b = await c.body();
    const id = String(b.id || '').toLowerCase().trim();
    const name = String(b.name || '').replace(/[\u0000-\u001F]/g, '').trim().slice(0, 120);
    const errs: Record<string, string> = {};
    if (!/^[a-z0-9-]{2,40}$/.test(id)) errs.id = 'Använd 2–40 tecken: a–z, 0–9 och bindestreck.';
    if (!name) errs.name = 'Ange ett namn.';
    if (Object.keys(errs).length) throw new HttpError(422, 'validation', 'Kontrollera fälten.', errs);
    const exists = await c.env.DB.prepare('SELECT 1 FROM ai_tenants WHERE id = ?').bind(id).first();
    if (exists) throw new HttpError(409, 'exists', 'Nyckeln används redan.', { id: 'Nyckeln används redan.' });
    const cfg = normalizeConfig({ knowledge_base: `# ${name}\n(Fyll i kunskap om företaget här.)`, page_rules: [], brand: { ...DEFAULT_CONFIG.brand, name: `${name.split(' ')[0].toUpperCase()} AI`, wordmark: name.split(' ')[0].toUpperCase().slice(0, 16) } });
    await c.env.DB.batch([
      c.env.DB.prepare('INSERT INTO ai_tenants (id, org_id, name, config_json, created_at, updated_at) VALUES (?,?,?,?,?,?)').bind(id, c.s.orgId, name, JSON.stringify(cfg), now(), now()),
      auditStmt(c.env, c.s.orgId, c.s.userId, c.ip, 'ai.tenant_created', 'ai_tenant', id, `Skapade AI-assistenten ${name}`),
    ]);
    return { ok: true, id };
  }, { perm: 'ai:configure' });

  r.get('/ai/tenants/:id/config', async ({ env, s, params }) => {
    const t = await env.DB.prepare('SELECT * FROM ai_tenants WHERE id = ? AND org_id = ?').bind(params.id, s.orgId).first<any>();
    if (!t) throw new HttpError(404, 'not_found', 'Assistenten finns inte.');
    return { tenant: { id: t.id, name: t.name, active: !!t.active, allowed_origins: parseJson(t.allowed_origins, []), updated_at: t.updated_at }, config: normalizeConfig(parseJson(t.config_json, {})), defaults: DEFAULT_CONFIG, ai_ready: !!env.ANTHROPIC_API_KEY, model: env.KELA_AI_MODEL || 'claude-opus-5-5' };
  }, { perm: 'ai:read' });

  r.patch('/ai/tenants/:id/config', async (c) => {
    const t = await c.env.DB.prepare('SELECT * FROM ai_tenants WHERE id = ? AND org_id = ?').bind(c.params.id, c.s.orgId).first<any>();
    if (!t) throw new HttpError(404, 'not_found', 'Assistenten finns inte.');
    const b = await c.body();
    const before = normalizeConfig(parseJson(t.config_json, {}));
    const cfg = b.reset === true ? normalizeConfig({}) : normalizeConfig({ ...before, ...(b.config || {}) });
    const origins = Array.isArray(b.allowed_origins) ? b.allowed_origins.filter((o: unknown) => typeof o === 'string' && /^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(o)).slice(0, 20) : parseJson(t.allowed_origins, []);
    const changed = Object.keys(cfg).filter((k) => JSON.stringify((cfg as any)[k]) !== JSON.stringify((before as any)[k]));
    await c.env.DB.batch([
      c.env.DB.prepare('UPDATE ai_tenants SET config_json = ?, allowed_origins = ?, active = ?, updated_at = ? WHERE id = ?').bind(JSON.stringify(cfg), JSON.stringify(origins), b.active === false ? 0 : 1, now(), t.id),
      auditStmt(c.env, c.s.orgId, c.s.userId, c.ip, b.reset ? 'ai.config_reset' : 'ai.config', 'ai_tenant', t.id, b.reset ? 'Återställde Kela AI till standard' : `Ändrade Kela AI: ${changed.join(', ') || 'inga ändringar'}`, { changed }),
    ]);
    return { ok: true, config: cfg, changed };
  }, { perm: 'ai:configure' });
}
