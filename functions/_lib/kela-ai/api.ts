// KELA AI – publikt API för widgeten: /api/ai/*
// Säkerhet: ursprungskontroll (samma ursprung eller tenantens tillåtna ursprung), egen header på alla POST,
// rate limiting per IP, storleksgränser, historiken byggs på servern (klienten kan inte smyga in falska AI-svar),
// besökarens samtal skyddas av en hemlig nyckel som bara lagras som hash, och felmeddelanden från AI-leverantören
// visas aldrig för besökaren.
import Anthropic from '@anthropic-ai/sdk';
import { Env, HttpError, json, newId, now, randomToken, sha256hex, clientIp, rateLimit, readJson, parseJson } from '../core';
import { Tenant, loadTenant, publicConfig } from './config';
import { buildSystem, IMAGE_SYSTEM } from './prompt';
import { toolsFor, runTool, UiComponent } from './tools';

const MODEL_DEFAULT = 'claude-opus-5-5';
// USD per miljon token: [input, output, cache-läsning, cache-skrivning]. Används för kostnadsuppskattning i adminpanelen.
const PRICES: Record<string, [number, number, number, number]> = {
  'claude-opus-5-5': [4, 20, 0.2, 5],
  'claude-sonnet-5-5': [2, 10, 0.2, 2.5],
  'claude-haiku-5-5': [0.1, 0.5, 0.01, 0.125],
};
const EVENT_TYPES = new Set(['open', 'close', 'starter', 'demo_start', 'demo_complete', 'savings_calc', 'flow_step', 'brief_edit', 'copy', 'voice', 'image', 'fallback', 'error', 'tip_click', 'select_ask']);
const MAX_MSG = 2000;
const MAX_TURNS = 60;
const MAX_IMAGE_B64 = 2_000_000; // ≈ 1,5 MB bild

const model = (env: Env) => env.KELA_AI_MODEL || MODEL_DEFAULT;
const pagePath = (p: unknown) => (typeof p === 'string' && /^\/[a-z0-9/_.#-]{0,120}$/i.test(p) ? p.split('#')[0] : '/');

function costMicro(m: string, u: { input_tokens?: number | null; output_tokens?: number | null; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }) {
  const p = PRICES[m] || PRICES[MODEL_DEFAULT];
  return Math.round((u.input_tokens || 0) * p[0] + (u.output_tokens || 0) * p[1] + (u.cache_read_input_tokens || 0) * p[2] + (u.cache_creation_input_tokens || 0) * p[3]);
}

// ---------- CORS och ursprung ----------
function corsHeaders(req: Request, tenant: Tenant | null): Record<string, string> {
  const origin = req.headers.get('origin');
  const self = new URL(req.url).origin;
  if (!origin || origin === self) return {};
  if (tenant && tenant.allowed_origins.includes(origin)) {
    return { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'false', vary: 'Origin', 'access-control-allow-headers': 'content-type, x-kela-ai, x-kela-ai-token', 'access-control-allow-methods': 'GET, POST, DELETE' };
  }
  throw new HttpError(403, 'bad_origin', 'Otillåtet ursprung.');
}

interface Conv { id: string; org_id: string; tenant_id: string; token_hash: string; status: string; profile_json: string; turns: number; last_page: string | null }

async function loadConv(env: Env, tenant: Tenant, id: unknown, token: unknown): Promise<Conv> {
  if (typeof id !== 'string' || !/^aic_[0-9a-z]{20}$/.test(id) || typeof token !== 'string' || token.length < 20 || token.length > 100) throw new HttpError(404, 'no_conversation', 'Samtalet finns inte.');
  const row = await env.DB.prepare('SELECT * FROM ai_conversations WHERE id = ? AND tenant_id = ? AND org_id = ?').bind(id, tenant.id, tenant.org_id).first<Conv>();
  if (!row || row.token_hash !== (await sha256hex(token))) throw new HttpError(404, 'no_conversation', 'Samtalet finns inte.');
  return row;
}

async function nextSeq(env: Env, convId: string) {
  const r = await env.DB.prepare('SELECT COALESCE(MAX(seq), 0) + 1 AS n FROM ai_messages WHERE conversation_id = ?').bind(convId).first<{ n: number }>();
  return r?.n || 1;
}

async function event(env: Env, t: Tenant, type: string, o: { conv?: string | null; session?: string | null; name?: string | null; page?: string | null } = {}) {
  await env.DB.prepare('INSERT INTO ai_events (id, org_id, tenant_id, conversation_id, session_hash, type, name, page, created_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .bind(newId('aie'), t.org_id, t.id, o.conv ?? null, o.session ?? null, type, o.name?.slice(0, 60) ?? null, o.page ?? null, now()).run();
}

async function sessionHash(t: Tenant, s: unknown) {
  return typeof s === 'string' && /^[a-z0-9-]{8,64}$/i.test(s) ? (await sha256hex(`${t.id}:${s}`)).slice(0, 24) : null;
}

/** Gallring enligt tenantens lagringstid. Körs ibland i samband med nya samtal. */
async function purge(env: Env, t: Tenant) {
  const cutoff = new Date(Date.now() - t.config.retention_days * 86400_000).toISOString();
  const old = await env.DB.prepare('SELECT id FROM ai_conversations WHERE tenant_id = ? AND org_id = ? AND updated_at < ? LIMIT 200').bind(t.id, t.org_id, cutoff).all<{ id: string }>();
  for (const r of old.results) {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM ai_messages WHERE conversation_id = ?').bind(r.id),
      env.DB.prepare('UPDATE ai_events SET conversation_id = NULL WHERE conversation_id = ?').bind(r.id),
      env.DB.prepare('DELETE FROM ai_conversations WHERE id = ?').bind(r.id),
    ]);
  }
}

// ---------- SSE ----------
function sse() {
  const ts = new TransformStream<Uint8Array, Uint8Array>();
  const w = ts.writable.getWriter();
  const enc = new TextEncoder();
  let closed = false;
  return {
    readable: ts.readable,
    send(ev: string, data: unknown) {
      if (closed) return;
      w.write(enc.encode(`event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`)).catch(() => { closed = true; });
    },
    close() { if (!closed) { closed = true; w.close().catch(() => {}); } },
  };
}

// ---------- Chatt ----------
async function chat(req: Request, env: Env, tenant: Tenant, b: any, cors: Record<string, string>, waitUntil?: (p: Promise<unknown>) => void): Promise<Response> {
  const ip = clientIp(req);
  if (!(await rateLimit(env.DB, `ai:m:${ip}`, 24, 300)) || !(await rateLimit(env.DB, `ai:d:${ip}`, 200, 86400))) {
    throw new HttpError(429, 'rate_limited', 'Lugnt i båten! Du har skickat många meddelanden på kort tid. Vänta en stund och försök igen.');
  }
  const message = typeof b.message === 'string' ? b.message.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, MAX_MSG) : '';
  const image = b.image && typeof b.image === 'object' && tenant.config.features.images ? b.image : null;
  if (!message && !image) throw new HttpError(400, 'empty', 'Skriv ett meddelande.');
  if (image && (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(image.media_type) || typeof image.data !== 'string' || image.data.length > MAX_IMAGE_B64 || !/^[A-Za-z0-9+/=]+$/.test(image.data))) {
    throw new HttpError(400, 'bad_image', 'Bilden kunde inte läsas. Använd JPG, PNG eller WebP under 1,5 MB.');
  }
  const page = pagePath(b.page);
  const sess = await sessionHash(tenant, b.session);
  const t = now();

  // Utan AI-nyckel (och utan pågående samtal som personal kan ta över) skapas inget samtal – widgeten går till demoläge.
  if (!env.ANTHROPIC_API_KEY && !b.conversation_id) {
    await event(env, tenant, 'fallback', { session: sess, name: 'no_key', page });
    const body = `event: error\ndata: ${JSON.stringify({ code: 'ai_not_configured', message: 'AI:n är inte ansluten just nu.' })}\n\nevent: done\ndata: {}\n\n`;
    return new Response(body, { headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', ...cors } });
  }
  let conv: Conv; let token: string | null = null;
  if (b.conversation_id) conv = await loadConv(env, tenant, b.conversation_id, b.token);
  else {
    token = randomToken(24);
    const id = newId('aic');
    await env.DB.prepare('INSERT INTO ai_conversations (id, org_id, tenant_id, token_hash, session_hash, lang, first_page, last_page, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .bind(id, tenant.org_id, tenant.id, await sha256hex(token), sess, b.lang === 'en' ? 'en' : 'sv', page, page, t, t).run();
    conv = (await env.DB.prepare('SELECT * FROM ai_conversations WHERE id = ?').bind(id).first<Conv>())!;
    if (Math.random() < 0.05) await purge(env, tenant).catch(() => {});
  }
  if (conv.turns >= MAX_TURNS) throw new HttpError(429, 'too_long', 'Det här samtalet har blivit långt. Starta ett nytt samtal eller boka ett möte så tar vi det vidare.');

  const stream = sse();
  const headers = { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...cors };
  const work = (async () => {
    const send = stream.send;
    send('meta', { conversation_id: conv.id, ...(token ? { token } : {}) });
    const displayUser = (image ? '🖼 [Bild] ' : '') + message;

    // Personal har tagit över: spara meddelandet och låt en människa svara.
    if (conv.status === 'human') {
      const seq = await nextSeq(env, conv.id);
      await env.DB.batch([
        env.DB.prepare('INSERT INTO ai_messages (id, org_id, conversation_id, seq, role, api_json, display_text, created_at) VALUES (?,?,?,?,?,NULL,?,?)').bind(newId('aim'), tenant.org_id, conv.id, seq, 'user', displayUser.slice(0, 4000), t),
        env.DB.prepare('UPDATE ai_conversations SET staff_unread = staff_unread + 1, last_page = ?, updated_at = ? WHERE id = ?').bind(page, t, conv.id),
      ]);
      send('human', { seq });
      send('done', {});
      return;
    }
    if (!env.ANTHROPIC_API_KEY) {
      await event(env, tenant, 'fallback', { conv: conv.id, session: sess, name: 'no_key', page });
      send('error', { code: 'ai_not_configured', message: 'AI:n är inte ansluten just nu.' });
      send('done', {});
      return;
    }

    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, ...(env.ANTHROPIC_BASE_URL ? { baseURL: env.ANTHROPIC_BASE_URL } : {}), maxRetries: 1, timeout: 90_000 });
    const m = model(env);
    let usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
    let cost = 0;
    const addUsage = (u: any) => {
      usage = { input_tokens: usage.input_tokens + (u?.input_tokens || 0), output_tokens: usage.output_tokens + (u?.output_tokens || 0), cache_read_input_tokens: usage.cache_read_input_tokens + (u?.cache_read_input_tokens || 0), cache_creation_input_tokens: usage.cache_creation_input_tokens + (u?.cache_creation_input_tokens || 0) };
      cost += costMicro(m, u || {});
    };

    // Bildanalys i ett separat anrop. Själva bilden sparas aldrig – bara analysen (dataminimering, append-only historik).
    let imageNote = '';
    if (image) {
      send('state', { phase: 'image' });
      try {
        const r = await client.messages.create({
          model: m, max_tokens: 2000, system: IMAGE_SYSTEM, output_config: { effort: 'low' },
          messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: image.media_type, data: image.data } }, { type: 'text', text: message ? `Besökarens fråga: ${message}` : 'Analysera bilden.' }] }],
        } as any, { signal: req.signal });
        addUsage(r.usage);
        const txt = r.stop_reason === 'refusal' ? 'Bilden kunde inte analyseras.' : r.content.map((c: any) => (c.type === 'text' ? c.text : '')).join('').slice(0, 3000);
        imageNote = `\n<bildanalys>\n${txt.replace(/<\/?bildanalys>/g, '')}\n</bildanalys>`;
        await event(env, tenant, 'image', { conv: conv.id, session: sess, page });
      } catch {
        imageNote = '\n<bildanalys>Bilden kunde inte analyseras just nu.</bildanalys>';
      }
    }

    // Historik från servern. Meddelanden som skrevs medan personal hade samtalet läggs in som ett citat (append-only).
    const rows = await env.DB.prepare('SELECT role, api_json, display_text FROM ai_messages WHERE conversation_id = ? ORDER BY seq').bind(conv.id).all<any>();
    const history: Anthropic.Messages.MessageParam[] = [];
    let pendingHuman: string[] = [];
    for (const r of rows.results) {
      if (r.api_json) {
        history.push(parseJson(r.api_json, { role: 'user', content: '' }));
        pendingHuman = [];
      } else if (r.role === 'staff' || r.role === 'user') pendingHuman.push(`${r.role === 'staff' ? 'Personal' : 'Besökare'}: ${r.display_text}`);
    }
    const safe = (s: string) => s.replace(/<\/?(sida|bildanalys|tidigare_samtal|personal)[^>]*>/gi, '');
    const prefix = pendingHuman.length ? `<tidigare_samtal>\n<personal>\n${safe(pendingHuman.join('\n')).slice(0, 4000)}\n</personal>\n</tidigare_samtal>\n` : '';
    const userText = `<sida path="${page}"/>\n${prefix}${safe(message) || '(Besökaren skickade en bild.)'}${imageNote}`;
    const userMsg: Anthropic.Messages.MessageParam = { role: 'user', content: userText };
    history.push(userMsg);
    let seq = await nextSeq(env, conv.id);
    await env.DB.prepare('INSERT INTO ai_messages (id, org_id, conversation_id, seq, role, api_json, display_text, created_at) VALUES (?,?,?,?,?,?,?,?)')
      .bind(newId('aim'), tenant.org_id, conv.id, seq++, 'user', JSON.stringify(userMsg), displayUser.slice(0, 4000), t).run();

    const system = buildSystem(tenant.config, tenant.name.split(' – ')[0]);
    const tools = toolsFor(tenant.config);
    let profile = parseJson<Record<string, unknown>>(conv.profile_json, {});
    const uis: UiComponent[] = [];
    let text = '';
    let assistantId = '';

    for (let iter = 0; iter < 3; iter++) {
      send('state', { phase: 'thinking' });
      const s = client.beta.messages.stream({
        model: m, max_tokens: 4096, system, tools, messages: history,
        output_config: { effort: 'low' },
        betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
      } as any, { signal: req.signal });
      let streamedText = false;
      for await (const ev of s as any) {
        if (ev.type === 'content_block_start') {
          if (ev.content_block.type === 'tool_use' && ev.content_block.name !== 'remember_visitor') send('state', { phase: 'building', tool: ev.content_block.name });
          if (ev.content_block.type === 'text' && text) { text += '\n\n'; send('text', { t: '\n\n' }); }
        } else if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') {
          if (!streamedText) send('state', { phase: 'writing' });
          streamedText = true; text += ev.delta.text; send('text', { t: ev.delta.text });
        }
      }
      const msg: any = await s.finalMessage();
      addUsage(msg.usage);
      const assistantMsg = { role: 'assistant', content: msg.content } as Anthropic.Messages.MessageParam;
      history.push(assistantMsg);
      const toolUses = msg.content.filter((c: any) => c.type === 'tool_use');
      const results: Anthropic.Messages.ToolResultBlockParam[] = [];
      const turnUis: UiComponent[] = [];
      if (msg.stop_reason === 'refusal') {
        const sorry = '\n\nDet där kan jag tyvärr inte hjälpa till med. Men fråga gärna om något annat – eller boka ett möte så pratar vi vidare.';
        text += sorry; send('text', { t: sorry });
      } else if (msg.stop_reason === 'max_tokens' && toolUses.length) {
        throw new Error('tool_input_truncated');
      } else {
        for (const tu of toolUses) {
          const out = runTool(tu.name, tu.input, `ui_${tu.id.slice(-12)}`);
          if (out.profile) { profile = { ...profile, ...out.profile }; send('profile', profile); }
          if (out.ui) { turnUis.push(out.ui); uis.push(out.ui); send('ui', out.ui); }
          if (out.event) await event(env, tenant, 'tool', { conv: conv.id, session: sess, name: out.event, page });
          results.push({ type: 'tool_result', tool_use_id: tu.id, content: out.result, ...(out.isError ? { is_error: true } : {}) });
        }
      }
      assistantId = newId('aim');
      const stmts = [env.DB.prepare('INSERT INTO ai_messages (id, org_id, conversation_id, seq, role, api_json, display_text, ui_json, input_tokens, output_tokens, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
        .bind(assistantId, tenant.org_id, conv.id, seq++, 'assistant', JSON.stringify(assistantMsg), msg.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n\n').slice(0, 8000), turnUis.length ? JSON.stringify(turnUis) : null, msg.usage?.input_tokens || 0, msg.usage?.output_tokens || 0, now())];
      if (results.length) {
        const toolMsg: Anthropic.Messages.MessageParam = { role: 'user', content: results };
        history.push(toolMsg);
        stmts.push(env.DB.prepare('INSERT INTO ai_messages (id, org_id, conversation_id, seq, role, api_json, display_text, created_at) VALUES (?,?,?,?,?,?,?,?)')
          .bind(newId('aim'), tenant.org_id, conv.id, seq++, 'system', JSON.stringify(toolMsg), '', now()));
      }
      await env.DB.batch(stmts);
      // Ett nytt modellanrop behövs bara om verktyget anropades utan att något svar skrivits ännu.
      // (Två användarmeddelanden i rad är tillåtet, så historiken förblir giltig om vi stannar här.)
      if (msg.stop_reason !== 'tool_use' || !results.length || text.trim()) break;
      if (uis.length && iter >= 1) break;
    }

    await env.DB.prepare(`UPDATE ai_conversations SET turns = turns + 1, profile_json = ?, last_page = ?, input_tokens = input_tokens + ?, output_tokens = output_tokens + ?,
      cache_read_tokens = cache_read_tokens + ?, cache_write_tokens = cache_write_tokens + ?, cost_micro_usd = cost_micro_usd + ?, lang = COALESCE(?, lang),
      staff_unread = CASE WHEN status = 'handoff' THEN staff_unread + 1 ELSE staff_unread END, updated_at = ? WHERE id = ?`)
      .bind(JSON.stringify(profile).slice(0, 4000), page, usage.input_tokens, usage.output_tokens, usage.cache_read_input_tokens, usage.cache_creation_input_tokens, cost, typeof profile.language === 'string' ? profile.language : null, now(), conv.id).run();
    send('done', { message_id: assistantId });
  })().catch(async (e) => {
    const aborted = req.signal?.aborted;
    if (!aborted) {
      console.error('KELA AI chattfel', e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : e);
      const code = e instanceof Anthropic.RateLimitError ? 'ai_busy' : e instanceof Anthropic.AuthenticationError ? 'ai_not_configured' : 'ai_error';
      stream.send('error', { code, message: code === 'ai_busy' ? 'Jag har lite mycket just nu – prova igen om en liten stund.' : 'Något gick fel när jag skulle svara.' });
      await event(env, tenant, 'error', { conv: conv.id, session: sess, name: code, page }).catch(() => {});
    }
  }).finally(() => stream.close());

  // Håll funktionen vid liv tills arbetet (och sparningen) är klart även om besökaren stänger fliken.
  waitUntil?.(work);
  return new Response(stream.readable, { headers });
}

// ---------- Leads (projektbrief, mötesförfrågan, kontakt med människa) ----------
const KINDS: Record<string, string> = { brief: 'Projektbrief från Kela AI', meeting: 'Mötesförfrågan via Kela AI', handoff: 'Vill prata med en människa (Kela AI)', callback: 'Ring upp (Kela AI)' };
const cleanStr = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max) : '');

async function lead(req: Request, env: Env, tenant: Tenant, b: any) {
  const ip = clientIp(req);
  if (!(await rateLimit(env.DB, `ai:lead:${ip}`, 6, 3600))) throw new HttpError(429, 'rate_limited', 'För många förfrågningar. Mejla oss gärna direkt.');
  if (b.website) return { ok: true }; // honungsfälla
  const conv = b.conversation_id ? await loadConv(env, tenant, b.conversation_id, b.token) : null;
  const kind = KINDS[b.kind] ? b.kind : 'brief';
  const name = cleanStr(b.name, 120); const email = cleanStr(b.email, 254).toLowerCase(); const phone = cleanStr(b.phone, 40); const company = cleanStr(b.company, 160);
  const errs: Record<string, string> = {};
  if (!name) errs.name = 'Skriv ditt namn.';
  if (!/^[^\s@<>()]+@[^\s@<>()]+\.[^\s@<>()]{2,}$/.test(email)) errs.email = 'Skriv en giltig e-postadress.';
  if (kind === 'callback' && !phone) errs.phone = 'Skriv ett telefonnummer.';
  if (b.consent !== true) errs.consent = 'Vi behöver ditt godkännande för att kunna kontakta dig.';
  if (Object.keys(errs).length) throw new HttpError(422, 'validation', 'Kontrollera fälten.', errs);

  const brief = b.brief && typeof b.brief === 'object' ? b.brief : {};
  const lines = [KINDS[kind]];
  const add = (label: string, v: unknown, max = 600) => { const s = Array.isArray(v) ? v.map((x) => cleanStr(x, 80)).filter(Boolean).join(', ') : cleanStr(v, max); if (s) lines.push(`${label}: ${s}`); };
  add('Bransch', brief.industry); add('Behov', brief.needs); add('Nuvarande system', brief.current_systems); add('Problem', brief.problem); add('Omfattning', brief.scope);
  add('Tidsram', brief.timeline); add('Budget', brief.budget); add('Rekommendation', brief.recommendation, 1000);
  if (kind === 'meeting' && b.meeting && typeof b.meeting === 'object') {
    add('Mötesform', b.meeting.type, 40); add('Önskade dagar', b.meeting.days); add('Tid på dagen', b.meeting.time, 40);
  }
  add('Meddelande', b.message, 2000);
  lines.push(`Marknadsföring: ${b.marketing === true ? 'ja, vill få nyheter' : 'nej'}`);
  if (conv) lines.push(`Samtal: Kela AI → ${conv.id}`);
  const body = lines.join('\n');

  const t = now();
  // Återkommande kund: koppla till befintlig kund om e-posten redan finns (inom samma företag).
  const existing = await env.DB.prepare(`SELECT c.id FROM customers c LEFT JOIN contacts k ON k.customer_id = c.id AND k.org_id = c.org_id
    WHERE c.org_id = ? AND (LOWER(c.email) = ? OR LOWER(k.email) = ?) LIMIT 1`).bind(tenant.org_id, email, email).first<{ id: string }>().catch(() => null);
  const leadId = newId('lead');
  const stmts = [
    env.DB.prepare("INSERT INTO leads (id, org_id, name, company, email, phone, source, message, status, customer_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,'new',?,?,?)")
      .bind(leadId, tenant.org_id, name, company || cleanStr(brief.company, 160) || null, email, phone || null, 'kela-ai', body, existing?.id ?? null, t, t),
    env.DB.prepare("INSERT INTO activities (id, org_id, lead_id, customer_id, type, title, body, created_at) VALUES (?,?,?,?,'system',?,?,?)")
      .bind(newId('act'), tenant.org_id, leadId, existing?.id ?? null, `${KINDS[kind]}: ${company || name}`, body, t),
    env.DB.prepare('INSERT INTO ai_events (id, org_id, tenant_id, conversation_id, type, name, created_at) VALUES (?,?,?,?,?,?,?)').bind(newId('aie'), tenant.org_id, tenant.id, conv?.id ?? null, kind === 'meeting' ? 'meeting_request' : 'lead', kind, t),
  ];
  if (conv) stmts.push(env.DB.prepare(`UPDATE ai_conversations SET lead_id = ?, customer_id = COALESCE(?, customer_id), status = CASE WHEN ? = 'handoff' AND status = 'ai' THEN 'handoff' ELSE status END, updated_at = ? WHERE id = ?`).bind(leadId, existing?.id ?? null, kind, t, conv.id));
  await env.DB.batch(stmts);
  return { ok: true, lead_id: leadId, returning_customer: !!existing };
}

// ---------- Router ----------
export async function handleAi(req: Request, env: Env, waitUntil?: (p: Promise<unknown>) => void): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/ai/, '') || '/';
  let tenant: Tenant | null = null;
  let cors: Record<string, string> = {};
  try {
    const tenantId = (url.searchParams.get('tenant') || 'kela').toLowerCase();
    if (req.method === 'OPTIONS') {
      tenant = await loadTenant(env, tenantId).catch(() => null);
      return new Response(null, { status: 204, headers: { ...corsHeaders(req, tenant), 'access-control-max-age': '600' } });
    }
    if (req.method === 'GET' && path === '/config') {
      try { tenant = await loadTenant(env, tenantId); } catch (e) {
        // Utan databas/installation fungerar widgeten i demoläge (lokala demos, ingen AI).
        if (e instanceof HttpError && (e.code === 'no_db' || e.code === 'not_setup') && tenantId === 'kela') return json({ tenant: 'kela', ai_ready: false, offline: true }, 200, { 'cache-control': 'no-store' });
        throw e;
      }
      cors = corsHeaders(req, tenant);
      return json(publicConfig(tenant, !!env.ANTHROPIC_API_KEY), 200, { ...cors, 'cache-control': 'public, max-age=60' });
    }
    tenant = await loadTenant(env, tenantId);
    cors = corsHeaders(req, tenant);
    if (req.method !== 'GET' && req.headers.get('x-kela-ai') !== '1') throw new HttpError(403, 'csrf', 'Saknar säkerhetsheader.');
    const b = req.method === 'POST' ? await readJson(req, 2_200_000) : {};
    const token = req.headers.get('x-kela-ai-token') || b.token;
    if (token && !b.token) b.token = token;

    if (req.method === 'POST' && path === '/chat') return await chat(req, env, tenant, b, cors, waitUntil);
    let out: unknown;
    if (req.method === 'POST' && path === '/lead') out = await lead(req, env, tenant, b);
    else if (req.method === 'POST' && path === '/event') {
      if (!(await rateLimit(env.DB, `ai:ev:${clientIp(req)}`, 120, 3600))) return json({ ok: true }, 200, cors);
      if (EVENT_TYPES.has(b.type)) {
        const conv = typeof b.conversation_id === 'string' && /^aic_[0-9a-z]{20}$/.test(b.conversation_id) ? b.conversation_id : null;
        await event(env, tenant, b.type, { conv, session: await sessionHash(tenant, b.session), name: typeof b.name === 'string' ? b.name.replace(/[^a-z0-9_:-]/gi, '').slice(0, 60) : null, page: pagePath(b.page) });
      }
      out = { ok: true };
    } else if (path === '/conversation' && req.method === 'GET') {
      const conv = await loadConv(env, tenant, url.searchParams.get('id'), token);
      const since = Math.max(0, Number(url.searchParams.get('since')) || 0);
      const rows = await env.DB.prepare("SELECT id, seq, role, display_text, ui_json, rating, created_at FROM ai_messages WHERE conversation_id = ? AND seq > ? AND role IN ('user','assistant','staff') ORDER BY seq LIMIT 400").bind(conv.id, since).all<any>();
      out = { id: conv.id, status: conv.status, profile: parseJson(conv.profile_json, {}), messages: rows.results.filter((r) => r.display_text || r.ui_json).map((r) => ({ id: r.id, seq: r.seq, role: r.role, text: r.display_text, ui: parseJson(r.ui_json, null), rating: r.rating, at: r.created_at })) };
    } else if (path === '/conversation' && req.method === 'DELETE') {
      const conv = await loadConv(env, tenant, url.searchParams.get('id'), token);
      await env.DB.batch([
        env.DB.prepare('DELETE FROM ai_messages WHERE conversation_id = ?').bind(conv.id),
        env.DB.prepare('UPDATE ai_events SET conversation_id = NULL WHERE conversation_id = ?').bind(conv.id),
        env.DB.prepare('DELETE FROM ai_conversations WHERE id = ?').bind(conv.id),
      ]);
      out = { ok: true, deleted: true };
    } else if (path === '/conversation/profile' && req.method === 'POST') {
      const conv = await loadConv(env, tenant, b.conversation_id, token);
      await env.DB.prepare("UPDATE ai_conversations SET profile_json = '{}', updated_at = ? WHERE id = ?").bind(now(), conv.id).run();
      out = { ok: true };
    } else if (path === '/conversation/handoff' && req.method === 'POST') {
      const conv = await loadConv(env, tenant, b.conversation_id, token);
      await env.DB.prepare("UPDATE ai_conversations SET status = CASE WHEN status = 'ai' THEN 'handoff' ELSE status END, staff_unread = staff_unread + 1, updated_at = ? WHERE id = ?").bind(now(), conv.id).run();
      await event(env, tenant, 'handoff', { conv: conv.id, name: 'requested' });
      out = { ok: true };
    } else if (path === '/rate' && req.method === 'POST') {
      const conv = await loadConv(env, tenant, b.conversation_id, token);
      const r = b.rating === 1 ? 1 : b.rating === -1 ? -1 : 0;
      const msg = await env.DB.prepare("SELECT rating FROM ai_messages WHERE id = ? AND conversation_id = ? AND role = 'assistant'").bind(String(b.message_id || ''), conv.id).first<{ rating: number | null }>();
      if (!msg) throw new HttpError(404, 'not_found', 'Meddelandet finns inte.');
      const prev = msg.rating || 0;
      await env.DB.batch([
        env.DB.prepare('UPDATE ai_messages SET rating = ? WHERE id = ?').bind(r || null, String(b.message_id)),
        env.DB.prepare('UPDATE ai_conversations SET rating_up = rating_up + ?, rating_down = rating_down + ? WHERE id = ?').bind((r === 1 ? 1 : 0) - (prev === 1 ? 1 : 0), (r === -1 ? 1 : 0) - (prev === -1 ? 1 : 0), conv.id),
      ]);
      out = { ok: true };
    } else throw new HttpError(404, 'not_found', 'Hittades inte.');
    return json(out, 200, cors);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.code, message: e.message, details: e.details }, e.status, cors);
    console.error('KELA AI internt fel', e);
    return json({ error: 'server_error', message: 'Något gick fel på servern.' }, 500, cors);
  }
}

