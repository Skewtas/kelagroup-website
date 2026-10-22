// Publik åtkomst till en offert via personlig länk. Länken ger bara åtkomst till just den offerten.
import { Env, HttpError, json, errorResponse, sha256hex, newId, now, today, clientIp, userAgent, rateLimit, readJson, parseJson, escapeHtml } from './core';
import { v, validate } from './validate';
import { calcQuote } from '../../os/lib/calc.js';
import { renderQuoteDocument } from './quote-doc';
import { acceptanceAutomationStmts } from './quotes';

const TOKEN_RE = /^[A-Za-z0-9_-]{40,60}$/;

export async function findByToken(env: Env, token: string) {
  if (!TOKEN_RE.test(token)) return null;
  const q = await env.DB.prepare('SELECT * FROM quotes WHERE share_token_hash = ?').bind(await sha256hex(token)).first<any>();
  if (!q || !q.sent_version_id) return null;
  return q;
}

function notFoundPage() {
  return new Response(`<!doctype html><html lang="sv"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Offerten hittades inte | KELA</title><style>body{font:17px/1.6 -apple-system,system-ui,sans-serif;background:#FBF0F1;color:#5C1A26;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px;text-align:center}h1{font-size:28px;margin:0 0 8px}</style>
<div><h1>Offerten hittades inte</h1><p>Länken är ogiltig eller har ersatts av en ny.<br>Hör av dig till <a href="mailto:hej@kelagroup.se">hej@kelagroup.se</a> så hjälper vi dig.</p></div></html>`,
    { status: 404, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex', 'referrer-policy': 'no-referrer' } });
}

export async function renderPublicQuote(env: Env, req: Request, token: string): Promise<Response> {
  try {
    const ip = clientIp(req);
    if (!(await rateLimit(env.DB, `qview:${ip}`, 120, 3600))) return new Response('För många förfrågningar.', { status: 429 });
    const q = await findByToken(env, token);
    if (!q) return notFoundPage();
    const ver = await env.DB.prepare('SELECT snapshot_json, snapshot_hash FROM quote_versions WHERE id = ? AND org_id = ? AND locked = 1').bind(q.sent_version_id, q.org_id).first<any>();
    if (!ver?.snapshot_json) return notFoundPage();
    const acc = await env.DB.prepare('SELECT * FROM quote_acceptances WHERE quote_id = ?').bind(q.id).first<any>();
    const expired = !acc && (q.status === 'expired' || (!!q.valid_until && q.valid_until < today() && ['sent', 'viewed'].includes(q.status)));
    const html = renderQuoteDocument(JSON.parse(ver.snapshot_json), {
      mode: 'public', token, hash: ver.snapshot_hash, status: q.status, acceptance: acc, expired,
    });
    return new Response(html.body, {
      headers: {
        'content-type': 'text/html; charset=utf-8', 'content-security-policy': html.csp, 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow',
        'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY',
      },
    });
  } catch (e) {
    console.error(e);
    return new Response('Något gick fel. Försök igen om en stund.', { status: 500 });
  }
}

export async function handlePublicQuoteApi(env: Env, req: Request, parts: string[]): Promise<Response> {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed', 'Metoden stöds inte.');
    const url = new URL(req.url);
    const origin = req.headers.get('origin');
    if (origin && origin !== url.origin) throw new HttpError(403, 'bad_origin', 'Otillåtet ursprung.');
    const [token, action] = parts;
    const ip = clientIp(req); const ua = userAgent(req);
    if (!(await rateLimit(env.DB, `qapi:${ip}`, 60, 3600))) throw new HttpError(429, 'rate_limited', 'För många förfrågningar. Försök igen senare.');
    const q = await findByToken(env, token || '');
    if (!q) throw new HttpError(404, 'not_found', 'Offerten hittades inte.');
    const ev = (type: string, data: unknown = {}) => env.DB.prepare("INSERT INTO quote_events (id, org_id, quote_id, version_id, type, actor_kind, data_json, ip, ua, created_at) VALUES (?,?,?,?,?,'customer',?,?,?,?)")
      .bind(newId('qev'), q.org_id, q.id, q.sent_version_id, type, JSON.stringify(data), ip, ua, now());
    const isOpen = ['sent', 'viewed'].includes(q.status) && !(q.valid_until && q.valid_until < today());

    if (action === 'viewed') {
      // Visning registreras när sidan faktiskt visats i en webbläsare (skript körs efter 2 s synlighet).
      // Samma besökare inom 30 min räknas inte igen.
      const recent = await env.DB.prepare("SELECT 1 FROM quote_events WHERE quote_id = ? AND type = 'viewed' AND ip = ? AND created_at > ? LIMIT 1")
        .bind(q.id, ip, new Date(Date.now() - 30 * 60_000).toISOString()).first();
      if (recent) return json({ ok: true });
      const t = now();
      await env.DB.batch([
        ev('viewed'),
        env.DB.prepare(`UPDATE quotes SET first_viewed_at = COALESCE(first_viewed_at, ?), last_viewed_at = ?, status = CASE WHEN status = 'sent' THEN 'viewed' ELSE status END WHERE id = ?`).bind(t, t, q.id),
        ...(q.first_viewed_at ? [] : [env.DB.prepare("INSERT INTO activities (id, org_id, customer_id, deal_id, quote_id, type, title, created_at) VALUES (?,?,?,?,?,'system',?,?)")
          .bind(newId('act'), q.org_id, q.customer_id, q.deal_id, q.id, `Offert #${q.number} har öppnats`, t)]),
      ]);
      return json({ ok: true });
    }

    if (action === 'accept') {
      if (!(await rateLimit(env.DB, `qaccept:${q.id}`, 10, 3600))) throw new HttpError(429, 'rate_limited', 'För många försök.');
      const existing = await env.DB.prepare('SELECT id FROM quote_acceptances WHERE quote_id = ?').bind(q.id).first();
      if (existing) return json({ ok: true, already: true });
      if (!isOpen) throw new HttpError(409, 'not_open', q.status === 'declined' ? 'Offerten är avböjd.' : 'Offerten går inte längre att godkänna.');
      const d = validate({
        name: v.str({ min: 2, max: 120 }), email: v.email(), title: v.str({ optional: true, max: 120 }), confirm: v.bool(),
        snapshot_hash: v.str({ max: 64, pattern: /^[0-9a-f]{64}$/ }), selected_optional: v.list(v.str({ max: 40 }), { max: 80, optional: true }),
      }, await readJson(req, 20_000));
      if (!d.confirm) throw new HttpError(422, 'validation', 'Bekräfta att du har behörighet att godkänna offerten.');
      const ver = await env.DB.prepare('SELECT id, snapshot_json, snapshot_hash FROM quote_versions WHERE id = ? AND locked = 1').bind(q.sent_version_id).first<any>();
      // Kunden måste ha godkänt exakt den version som är aktuell.
      if (!ver || ver.snapshot_hash !== d.snapshot_hash) throw new HttpError(409, 'version_changed', 'Offerten har uppdaterats. Ladda om sidan och granska den nya versionen.');
      const snap = JSON.parse(ver.snapshot_json);
      const optIds = new Set(snap.items.filter((i: any) => i.optional).map((i: any) => i.id));
      const selected = (d.selected_optional || []).filter((x): x is string => !!x && optIds.has(x));
      const totals = calcQuote({ items: snap.items, discount_bp: snap.discount_bp, currency: snap.quote.currency }, selected);
      const t = now();
      const accStmt = env.DB.prepare(`INSERT OR IGNORE INTO quote_acceptances (id, org_id, quote_id, version_id, snapshot_hash, method, signer_name, signer_email, signer_title, selected_optional_json, totals_json, ip, ua, created_at)
        VALUES (?,?,?,?,?,'click_accept',?,?,?,?,?,?,?,?)`).bind(newId('qacc'), q.org_id, q.id, ver.id, ver.snapshot_hash, d.name, d.email, d.title, JSON.stringify(selected), JSON.stringify(totals), ip, ua, t);
      const first = await env.DB.batch([
        accStmt,
        env.DB.prepare("UPDATE quotes SET status = 'accepted', accepted_at = ?, updated_at = ? WHERE id = ? AND status IN ('sent','viewed')").bind(t, t, q.id),
      ]);
      if (!first[0].meta.changes) return json({ ok: true, already: true }); // samtidig dubbelklick – redan registrerat
      await env.DB.batch([
        ev('accepted', { signer_name: d.name, signer_email: d.email, selected_optional: selected, snapshot_hash: ver.snapshot_hash }),
        ...acceptanceAutomationStmts(env, { ...q, status: 'accepted' }, { ip }, snap.items),
      ]);
      return json({ ok: true });
    }

    if (action === 'decline') {
      if (!isOpen) throw new HttpError(409, 'not_open', 'Offerten kan inte avböjas.');
      const d = validate({ reason: v.str({ optional: true, max: 1000 }) }, await readJson(req, 10_000));
      const t = now();
      await env.DB.batch([
        env.DB.prepare("UPDATE quotes SET status = 'declined', declined_at = ?, decline_reason = ?, updated_at = ? WHERE id = ? AND status IN ('sent','viewed')").bind(t, d.reason, t, q.id),
        ev('declined', { reason: d.reason }),
        env.DB.prepare("INSERT INTO activities (id, org_id, customer_id, deal_id, quote_id, type, title, body, created_at) VALUES (?,?,?,?,?,'system',?,?,?)")
          .bind(newId('act'), q.org_id, q.customer_id, q.deal_id, q.id, `Offert #${q.number} avböjdes av kunden`, d.reason, t),
      ]);
      return json({ ok: true });
    }
    throw new HttpError(404, 'not_found', 'Hittades inte.');
  } catch (e) {
    return errorResponse(e);
  }
}

void parseJson; void escapeHtml;
