// /api/os/documents – avtal, offerter, bilagor, presentationer och länkar per kund.
// Behörighet följer kundregistret: customers:read för att se/ladda ner, customers:write för att lägga till och ändra.
import { Router, Ctx, audit, auditStmt, activityStmt, updateSet } from '../router';
import { HttpError, newId, now, likeTerm } from '../core';
import { v, validate } from '../validate';
import { getCustomer } from './crm';

export const DOC_KINDS = ['avtal', 'offert', 'bilaga', 'presentation', 'checklista', 'ovrigt'] as const;
export const DOC_STATUS = ['draft', 'sent', 'signed', 'active', 'terminated', 'replaced', 'final'] as const;
const KIND_LABEL: Record<string, string> = { avtal: 'Avtal', offert: 'Offert', bilaga: 'Bilaga', presentation: 'Presentation', checklista: 'Checklista', ovrigt: 'Dokument' };

const CHUNK = 512 * 1024;
const MAX_FILE = 15 * 1024 * 1024;
// Tillåtna filtyper (ändelse → MIME). Körbara filer och HTML tillåts inte.
const TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', txt: 'text/plain', csv: 'text/csv',
};

const docShape = {
  customer_id: v.id('cus'),
  quote_id: v.id('quo', { optional: true }),
  project_id: v.id('prj', { optional: true }),
  kind: v.enum(DOC_KINDS),
  title: v.str({ max: 200 }),
  status: v.enum(DOC_STATUS, { optional: true }),
  url: v.url({ optional: true }),
  description: v.str({ optional: true, max: 4000 }),
  sent_at: v.date({ optional: true }),
  signed_at: v.date({ optional: true }),
  valid_from: v.date({ optional: true }),
  valid_to: v.date({ optional: true }),
  notice_months: v.int({ optional: true, min: 0, max: 120 }),
  sort: v.int({ optional: true, min: 0, max: 100000 }),
};
const COLS = ['quote_id', 'project_id', 'kind', 'title', 'status', 'url', 'description', 'sent_at', 'signed_at', 'valid_from', 'valid_to', 'notice_months', 'sort'];

async function getDoc(c: Ctx, id: string) {
  const d = await c.env.DB.prepare('SELECT * FROM documents WHERE id = ? AND org_id = ?').bind(id, c.s.orgId).first<any>();
  if (!d) throw new HttpError(404, 'not_found', 'Dokumentet finns inte.');
  return d;
}

async function sha256(buf: ArrayBuffer) {
  const h = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Kontrollerar filens första byte mot den angivna typen, så att t.ex. ett program inte kan döpas om till .pdf. */
function magicOk(ext: string, b: Uint8Array) {
  const starts = (...sig: number[]) => sig.every((x, i) => b[i] === x);
  if (ext === 'pdf') return starts(0x25, 0x50, 0x44, 0x46);
  if (['docx', 'xlsx', 'pptx'].includes(ext)) return starts(0x50, 0x4b, 0x03, 0x04);
  if (ext === 'doc') return starts(0xd0, 0xcf, 0x11, 0xe0);
  if (ext === 'png') return starts(0x89, 0x50, 0x4e, 0x47);
  if (ext === 'jpg' || ext === 'jpeg') return starts(0xff, 0xd8, 0xff);
  return true; // txt/csv
}

export function fileStmts(c: { env: any }, orgId: string, docId: string, userId: string | null, f: { name: string; ext: string; bytes: Uint8Array; hash: string }) {
  const fileId = newId('fil');
  const count = Math.max(1, Math.ceil(f.bytes.length / CHUNK));
  const stmts = [c.env.DB.prepare('INSERT INTO document_files (id, org_id, document_id, file_name, mime, size, sha256, chunk_count, uploaded_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .bind(fileId, orgId, docId, f.name, TYPES[f.ext], f.bytes.length, f.hash, count, userId, now())];
  for (let i = 0; i < count; i++) {
    stmts.push(c.env.DB.prepare('INSERT INTO document_chunks (file_id, idx, data) VALUES (?,?,?)').bind(fileId, i, f.bytes.slice(i * CHUNK, (i + 1) * CHUNK)));
  }
  return { fileId, stmts };
}

export async function readUpload(file: File) {
  const name = file.name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').slice(0, 180) || 'fil';
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (!TYPES[ext]) throw new HttpError(422, 'validation', 'Filtypen stöds inte. Använd PDF, Word, Excel, PowerPoint, bild eller text.', { file: 'Filtypen stöds inte.' });
  if (file.size > MAX_FILE) throw new HttpError(413, 'too_large', 'Filen är större än 15 MB.');
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  if (!magicOk(ext, bytes)) throw new HttpError(422, 'validation', 'Filens innehåll stämmer inte med filtypen.', { file: 'Filen verkar inte vara en riktig ' + ext.toUpperCase() + '-fil.' });
  return { name, ext, bytes, hash: await sha256(buf) };
}

export function documentRoutes(r: Router) {
  r.get('/documents', async ({ env, s, url }) => {
    const where = ['d.org_id = ?', url.searchParams.get('archived') === '1' ? 'd.archived_at IS NOT NULL' : 'd.archived_at IS NULL'];
    const b: unknown[] = [s.orgId];
    const cust = url.searchParams.get('customer'); if (cust) { where.push('d.customer_id = ?'); b.push(cust); }
    const kind = url.searchParams.get('kind'); if (kind && (DOC_KINDS as readonly string[]).includes(kind)) { where.push('d.kind = ?'); b.push(kind); }
    const q = (url.searchParams.get('q') || '').trim().slice(0, 100);
    if (q) { const t = likeTerm(q); where.push("(d.title LIKE ? ESCAPE '\\' OR c.name LIKE ? ESCAPE '\\')"); b.push(t, t); }
    const rows = await env.DB.prepare(`SELECT d.*, c.name AS customer_name,
        (SELECT json_group_array(json_object('id', f.id, 'file_name', f.file_name, 'mime', f.mime, 'size', f.size, 'created_at', f.created_at))
           FROM document_files f WHERE f.document_id = d.id AND f.org_id = d.org_id) AS files_json
      FROM documents d JOIN customers c ON c.id = d.customer_id WHERE ${where.join(' AND ')}
      ORDER BY c.name COLLATE NOCASE, d.kind, d.sort, d.created_at LIMIT 1000`).bind(...b).all<any>();
    return { documents: rows.results.map((x) => ({ ...x, files: JSON.parse(x.files_json || '[]'), files_json: undefined })) };
  }, { perm: 'customers:read' });

  // Skapa dokument: JSON (länk/metadata) eller multipart med en eller flera filer + fältet "meta" (JSON).
  r.post('/documents', async (c) => {
    const ct = c.req.headers.get('content-type') || '';
    let meta: any; const files: File[] = [];
    if (ct.startsWith('multipart/form-data')) {
      const fd = await c.req.formData();
      try { meta = JSON.parse(String(fd.get('meta') || '{}')); } catch { throw new HttpError(400, 'bad_json', 'Ogiltig metadata.'); }
      for (const f of fd.getAll('file')) if (typeof f !== 'string') files.push(f as File);
    } else {
      meta = await c.body();
    }
    const d = validate(docShape, meta);
    const cust = await getCustomer(c, d.customer_id!);
    if (d.quote_id && !(await c.env.DB.prepare('SELECT 1 FROM quotes WHERE id = ? AND org_id = ? AND customer_id = ?').bind(d.quote_id, c.s.orgId, cust.id).first()))
      throw new HttpError(422, 'validation', 'Offerten hör inte till kunden.');
    if (!files.length && !d.url) throw new HttpError(422, 'validation', 'Ladda upp en fil eller ange en länk.', { file: 'Välj en fil eller ange en länk.' });
    if (files.length > 5) throw new HttpError(422, 'validation', 'Högst fem filer åt gången.');
    const parsed = await Promise.all(files.map(readUpload));
    const id = newId('doc'); const t = now();
    const stmts: D1PreparedStatement[] = [c.env.DB.prepare(`INSERT INTO documents (id, org_id, customer_id, ${COLS.join(', ')}, created_by, created_at, updated_at) VALUES (?,?,?,${COLS.map(() => '?').join(',')},?,?,?)`)
      .bind(id, c.s.orgId, cust.id, ...COLS.map((k) => (k === 'status' ? d.status || 'draft' : k === 'sort' ? d.sort ?? 0 : (d as any)[k] ?? null)), c.s.userId, t, t)];
    for (const f of parsed) stmts.push(...fileStmts(c, c.s.orgId, id, c.s.userId, f).stmts);
    stmts.push(activityStmt(c.env, c.s.orgId, { customer_id: cust.id, quote_id: d.quote_id, type: 'system', title: `${KIND_LABEL[d.kind!]} tillagt: ${d.title}`, actor: c.s.userId }));
    stmts.push(auditStmt(c.env, c.s.orgId, c.s.userId, c.ip, 'document.created', 'document', id, `${KIND_LABEL[d.kind!]} "${d.title}" tillagt för ${cust.name}`, { files: parsed.map((f) => ({ name: f.name, size: f.bytes.length, sha256: f.hash })) }));
    await c.env.DB.batch(stmts);
    return { id };
  }, { perm: 'customers:write' });

  r.post('/documents/:id/files', async (c) => {
    const doc = await getDoc(c, c.params.id);
    const fd = await c.req.formData();
    const files = fd.getAll('file').filter((f) => typeof f !== 'string') as File[];
    if (!files.length) throw new HttpError(422, 'validation', 'Välj en fil.', { file: 'Välj en fil.' });
    const parsed = await Promise.all(files.slice(0, 5).map(readUpload));
    const stmts: D1PreparedStatement[] = [];
    for (const f of parsed) stmts.push(...fileStmts(c, c.s.orgId, doc.id, c.s.userId, f).stmts);
    stmts.push(c.env.DB.prepare('UPDATE documents SET updated_at = ? WHERE id = ? AND org_id = ?').bind(now(), doc.id, c.s.orgId));
    stmts.push(auditStmt(c.env, c.s.orgId, c.s.userId, c.ip, 'document.file_added', 'document', doc.id, `Fil tillagd i "${doc.title}"`, { files: parsed.map((f) => ({ name: f.name, sha256: f.hash })) }));
    await c.env.DB.batch(stmts);
    return { ok: true };
  }, { perm: 'customers:write' });

  r.patch('/documents/:id', async (c) => {
    const doc = await getDoc(c, c.params.id);
    const d = validate(docShape, await c.body(), true);
    delete (d as any).customer_id;
    const { sql, vals } = updateSet(d, COLS);
    if (!sql) return { ok: true };
    const stmts = [c.env.DB.prepare(`UPDATE documents SET ${sql}, updated_at = ? WHERE id = ? AND org_id = ?`).bind(...vals, now(), doc.id, c.s.orgId),
      auditStmt(c.env, c.s.orgId, c.s.userId, c.ip, d.status && d.status !== doc.status ? 'document.status_changed' : 'document.updated', 'document', doc.id,
        d.status && d.status !== doc.status ? `"${doc.title}": ${doc.status} → ${d.status}` : `Dokument uppdaterat: ${doc.title}`, { fields: Object.keys(d) })];
    if (d.status && d.status !== doc.status && ['signed', 'active', 'terminated'].includes(d.status)) {
      stmts.push(activityStmt(c.env, c.s.orgId, { customer_id: doc.customer_id, type: 'system', title: `${KIND_LABEL[doc.kind]} ${{ signed: 'signerat', active: 'gäller nu', terminated: 'uppsagt' }[d.status]}: ${doc.title}`, actor: c.s.userId }));
    }
    await c.env.DB.batch(stmts);
    return { ok: true };
  }, { perm: 'customers:write' });

  r.post('/documents/:id/archive', async (c) => {
    const doc = await getDoc(c, c.params.id);
    const archive = (await c.body()).archived !== false;
    await c.env.DB.batch([
      c.env.DB.prepare('UPDATE documents SET archived_at = ?, updated_at = ? WHERE id = ? AND org_id = ?').bind(archive ? now() : null, now(), doc.id, c.s.orgId),
      auditStmt(c.env, c.s.orgId, c.s.userId, c.ip, archive ? 'document.archived' : 'document.restored', 'document', doc.id, `${archive ? 'Arkiverat' : 'Återställt'}: ${doc.title}`),
    ]);
    return { ok: true };
  }, { perm: 'customers:write' });

  // Nedladdning. Filen sätts ihop från delarna och kontrollsumman verifieras innan den skickas.
  r.get('/documents/:id/files/:fid', async (c) => {
    const doc = await getDoc(c, c.params.id);
    const f = await c.env.DB.prepare('SELECT * FROM document_files WHERE id = ? AND document_id = ? AND org_id = ?').bind(c.params.fid, doc.id, c.s.orgId).first<any>();
    if (!f) throw new HttpError(404, 'not_found', 'Filen finns inte.');
    const rows = await c.env.DB.prepare('SELECT idx, data FROM document_chunks WHERE file_id = ? ORDER BY idx').bind(f.id).all<any>();
    const out = new Uint8Array(f.size); let pos = 0;
    for (const row of rows.results) { const part = new Uint8Array(row.data); out.set(part, pos); pos += part.length; }
    if (pos !== f.size || (await sha256(out.buffer)) !== f.sha256) throw new HttpError(500, 'file_corrupt', 'Filen kunde inte läsas korrekt.');
    const inline = c.url.searchParams.get('visa') === '1' && f.mime === 'application/pdf';
    await audit(c, 'document.downloaded', 'document', doc.id, `${inline ? 'Visade' : 'Laddade ner'} ${f.file_name}`);
    return new Response(out, { headers: {
      'content-type': f.mime, 'content-length': String(f.size), 'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
      'content-disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(f.file_name)}`,
      'content-security-policy': "default-src 'none'; sandbox", 'x-frame-options': 'SAMEORIGIN',
    } });
  }, { perm: 'customers:read' });

  // Koppla en offertsida/checklista till en kund.
  r.post('/sparning/:id/customer', async (c) => {
    const { customer_id } = validate({ customer_id: v.id('cus', { optional: true }) }, await c.body());
    if (customer_id) await getCustomer(c, customer_id);
    const res = await c.env.DB.prepare('UPDATE tracked_pages SET customer_id = ? WHERE id = ? AND org_id = ?').bind(customer_id, c.params.id, c.s.orgId).run();
    if (!res.meta.changes) throw new HttpError(404, 'not_found', 'Sidan finns inte.');
    await audit(c, 'tracked_page.linked', 'tracked_page', c.params.id, customer_id ? 'Offertsida kopplad till kund' : 'Offertsida frikopplad');
    return { ok: true };
  }, { perm: 'customers:write' });
}
