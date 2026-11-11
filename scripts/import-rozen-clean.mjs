// Lägger in Rozen Clean AB i KELA OS: kund, avtal (PDF + Word), offertsida, checklista och presentationer.
// Skriptet skriver en SQL-fil; kör den med wrangler (se längst ner). Idempotent: fasta id:n + INSERT OR IGNORE,
// och om kunden redan finns (samma org.nr) används den befintliga.
//
//   node scripts/import-rozen-clean.mjs <ut.sql>
//   npx wrangler@4 d1 execute kela-os --remote --env production --config db/wrangler.toml --file <ut.sql>
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AVTAL = join(ROOT, 'docs/avtal/rozen-clean');
const OUT = process.argv[2];
if (!OUT) { console.error('Ange utfil: node scripts/import-rozen-clean.mjs <ut.sql>'); process.exit(1); }

const T = '2026-11-11T08:00:00.000Z';
const ORG = "(SELECT id FROM organizations ORDER BY created_at LIMIT 1)";
const OWNER = `(SELECT user_id FROM memberships WHERE org_id = ${ORG} AND role = 'superadmin' ORDER BY created_at LIMIT 1)`;
const CUST = `(SELECT id FROM customers WHERE org_id = ${ORG} AND org_number = '559084-0467' ORDER BY created_at LIMIT 1)`;
const q = (s) => (s == null ? 'NULL' : `'${String(s).replace(/'/g, "''")}'`);
const CHUNK = 40 * 1024; // håller varje SQL-sats under D1:s gräns på 100 kB

const MIME = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
const sql = [];

// ---------- Kund ----------
sql.push(`INSERT INTO customers (id, org_id, name, org_number, status, industry, website, owner_user_id, notes, created_at, updated_at)
SELECT 'cus_rozenclean00000001', ${ORG}, 'Rozen Clean AB', '559084-0467', 'prospect', 'Städ', 'https://rozenclean.se', ${OWNER},
  'Referenskund. Offertsida, checklista och avtalspaket finns under Avtal och dokument.', ${q(T)}, ${q(T)}
WHERE NOT EXISTS (SELECT 1 FROM customers WHERE org_id = ${ORG} AND org_number = '559084-0467');`);
sql.push(`INSERT INTO activities (id, org_id, customer_id, type, title, created_at)
SELECT 'act_rozenimport000001', ${ORG}, ${CUST}, 'system', 'Offert, checklista, avtal och presentationer samlade i KELA OS', ${q(T)}
WHERE NOT EXISTS (SELECT 1 FROM activities WHERE id = 'act_rozenimport000001');`);

// ---------- Dokument ----------
// [id, typ, status, rubrik, beskrivning, filer (utan ändelse, relativt AVTAL), extra]
const DOCS = [
  ['doc_rozen_offert01', 'offert', 'sent', 'Offert – referenskundserbjudande (offertsida)', 'Designad offertsida på hemlig adress. Besök, lästid och kundens val syns under Spårning.', [],
    { url: 'https://kelagroup.se/s/rozen-clean-uW6qK8R7nUi9Pw4D69L2tkvt/', tracked_page_id: 'tpg_rozenclean0000001', sent_at: '2026-11-03', sort: 1 }],
  ['doc_rozen_checkl01', 'checklista', 'sent', 'Checklista – chattbot och bokning', 'Rozen Clean fyller i utan konto. Svaren sparas i KELA OS.', [],
    { url: 'https://kelagroup.se/s/rozen-clean-checklista-vKiT4qIE-sznJg-dwr-mOm82-hTd/', tracked_page_id: 'tpg_rozenchecklista01', sort: 1 }],

  ['doc_rozen_av_enkel', 'avtal', 'draft', 'Sekretessavtal (kort version)', 'Enklare sekretessavtal framtaget 10 nov. Kontrollera vilken version som skickades.',
    ['0_Enkelt-ikvall/Sekretessavtal-Kela-Rozen-Clean'], { sort: 1 }],
  ['doc_rozen_av_fs1', 'avtal', 'draft', 'Före start: Sekretessavtal', 'Ska skrivas under innan KELA får tillgång till kunddata. Vite enligt avtalet betalas av KELA.',
    ['1_Skicka-ikvall/1_Sekretessavtal'], { sort: 2 }],
  ['doc_rozen_av_fs2', 'avtal', 'draft', 'Före start: Personligt sekretessåtagande', 'Skrivs under före åtkomst till kunddata.',
    ['1_Skicka-ikvall/2_Personligt-sekretessatagande'], { sort: 3 }],
  ['doc_rozen_av_fs3', 'avtal', 'draft', 'Före start: Personuppgiftsbiträdesavtal (införandet)', 'Gäller under införandet, före huvudavtalet.',
    ['1_Skicka-ikvall/3_Personuppgiftsbitradesavtal'], { sort: 4 }],

  ['doc_rozen_av_pkt0', 'avtal', 'draft', 'Avtalspaket – alla fem avtal i en PDF', 'Huvudpaketet som gås igenom senare. Samma innehåll som avtal 01–05 nedan.',
    ['2_Senare-hela-avtalspaketet/00_Avtalspaket'], { sort: 10 }],
  ['doc_rozen_av_pkt1', 'avtal', 'draft', 'Avtalspaket 01: SaaS- och leveransavtal', 'Pristak 16 000 kr/mån mån 1–12, 18 000 kr/mån mån 13–24, därefter högst KPI + 1 %-enhet per år. Tills vidare, ingen bindning. 30 dagar netto.',
    ['2_Senare-hela-avtalspaketet/01_SaaS-och-leveransavtal'], { sort: 11, notice_months: 3 }],
  ['doc_rozen_av_pkt2', 'avtal', 'draft', 'Avtalspaket 02: Sekretess och konkurrensskydd', null, ['2_Senare-hela-avtalspaketet/02_Sekretess-och-konkurrensskydd'], { sort: 12 }],
  ['doc_rozen_av_pkt3', 'avtal', 'draft', 'Avtalspaket 03: Personuppgiftsbiträdesavtal', null, ['2_Senare-hela-avtalspaketet/03_Personuppgiftsbitradesavtal'], { sort: 13 }],
  ['doc_rozen_av_pkt4', 'avtal', 'draft', 'Avtalspaket 04: Personligt sekretessåtagande', null, ['2_Senare-hela-avtalspaketet/04_Personligt-sekretessatagande'], { sort: 14 }],
  ['doc_rozen_av_pkt5', 'avtal', 'draft', 'Avtalspaket 05: Informationssäkerhet och kundisolering', null, ['2_Senare-hela-avtalspaketet/05_Informationssakerhet-och-kundisolering'], { sort: 15 }],

  ['doc_rozen_pres_sal', 'presentation', 'final', 'Säljpresentation – KELA × Rozen Clean', 'Claude-artifact (kräver inloggning på claude.ai).', [], { url: 'https://claude.ai/artifact/MghNT5uefgLK7zU7BxizVY', sort: 1 }],
  ['doc_rozen_pres_tid', 'presentation', 'final', 'Tidsplan och demo', 'Hemsida, intranät, Headof, Customer Hub, Bokis och tidsplan. Claude-artifact.', [], { url: 'https://claude.ai/artifact/MfXzbnYesNb7SkwJL3p9bv', sort: 2 }],
  ['doc_rozen_pres_int', 'presentation', 'final', 'Introduktion till kartläggningen', 'Claude-artifact, 10 bilder.', [], { url: 'https://claude.ai/artifact/V16UejdfkN8uYjGRCDMZjb', sort: 3 }],
];

let fileCount = 0, bytesTotal = 0;
for (const [id, kind, status, title, desc, files, x] of DOCS) {
  sql.push(`INSERT OR IGNORE INTO documents (id, org_id, customer_id, kind, title, status, url, tracked_page_id, description, sent_at, notice_months, sort, created_by, created_at, updated_at)
VALUES (${q(id)}, ${ORG}, ${CUST}, ${q(kind)}, ${q(title)}, ${q(status)}, ${q(x.url)}, ${q(x.tracked_page_id)}, ${q(desc)}, ${q(x.sent_at)}, ${x.notice_months ?? 'NULL'}, ${x.sort ?? 0}, ${OWNER}, ${q(T)}, ${q(T)});`);
  for (const base of files) {
    for (const ext of ['pdf', 'docx']) {
      const path = join(AVTAL, `${base}.${ext}`);
      if (!existsSync(path)) continue;
      const buf = readFileSync(path);
      const sha = createHash('sha256').update(buf).digest('hex');
      const fid = `fil_${createHash('sha1').update(id + base + ext).digest('hex').slice(0, 20)}`;
      const chunks = Math.ceil(buf.length / CHUNK);
      const name = base.split('/').pop().replace(/^\d+_/, '') + '.' + ext;
      sql.push(`INSERT OR IGNORE INTO document_files (id, org_id, document_id, file_name, mime, size, sha256, chunk_count, uploaded_by, created_at)
VALUES (${q(fid)}, ${ORG}, ${q(id)}, ${q('Rozen-Clean_' + name)}, ${q(MIME[ext])}, ${buf.length}, ${q(sha)}, ${chunks}, ${OWNER}, ${q(T)});`);
      for (let i = 0; i < chunks; i++) {
        sql.push(`INSERT OR IGNORE INTO document_chunks (file_id, idx, data) VALUES (${q(fid)}, ${i}, X'${buf.subarray(i * CHUNK, (i + 1) * CHUNK).toString('hex')}');`);
      }
      fileCount++; bytesTotal += buf.length;
    }
  }
}

// ---------- Kunduppgifter (fylls bara i där fältet är tomt – inget skrivs över) ----------
const NOTES = `Potentiell referenskund. Städbolag med kunder i Stockholm, Uppsala och Nyköping (områden att bekräfta i kartläggningen). Använder TimeWave.
Kontor: Labradorgatan 24. Kundtjänst vardagar 07.30–16.15.
På mötet: båda delägarna, kundservicechefen och personalchefen (namn saknas i KELA OS – lägg in dem som kontakter).

Prishistorik:
- 28 okt (säljpresentation): Chattis 6 000 + Bokis 3 500 = 9 500 kr/mån, installation 20 800 kr.
- 9 nov (offertsida): fast pristak 18 000 kr/mån i 12 månader, alla befintliga och framtida moduler, inga installationsavgifter, 1 månads test.
- 10 nov (avtalspaket, Rozens krav): pristak 16 000 kr/mån mån 1–12 och 18 000 kr/mån mån 13–24, därefter högst KPI + 1 %-enhet per år. 3 mån uppsägning, ingen bindning, 30 dagar netto. Sms 0,60 kr, mejl 0,03 kr.
Kontrollera att offertsidan (18 000 kr i 12 mån) och avtalet (16 000 → 18 000) stämmer överens innan påskrift.`;
sql.push(`UPDATE customers SET
  email = COALESCE(email, 'kundservice@rozenclean.se'), phone = COALESCE(phone, '010-330 81 80'),
  visiting_address = COALESCE(visiting_address, 'Labradorgatan 24'),
  expected_value_minor = COALESCE(expected_value_minor, 21600000),
  notes = CASE WHEN notes IS NULL OR substr(notes, 1, 36) = 'Referenskund. Offertsida, checklista' THEN ${q(NOTES)} ELSE notes END,
  updated_at = ${q(T)}
WHERE id = ${CUST};`);
sql.push(`INSERT INTO contacts (id, org_id, customer_id, name, title, email, phone, is_primary, created_at, updated_at)
SELECT 'con_rozenkundservice01', ${ORG}, ${CUST}, 'Kundtjänst Rozen Clean', 'Vardagar 07.30–16.15', 'kundservice@rozenclean.se', '010-330 81 80', 1, ${q(T)}, ${q(T)}
WHERE NOT EXISTS (SELECT 1 FROM contacts WHERE customer_id = ${CUST} AND org_id = ${ORG});`);

// ---------- Affär i pipelinen ----------
sql.push(`INSERT INTO deals (id, org_id, customer_id, title, stage, value_minor, monthly_value_minor, probability, owner_user_id, next_step, position, created_at, updated_at)
SELECT 'deal_rozenclean000001', ${ORG}, ${CUST}, 'Rozen Clean – referenskund, alla moduler', 'negotiation', 0, 1800000, 75, ${OWNER},
  'Få sekretessavtal, personligt åtagande och PUB underskrivna före start', 1, ${q(T)}, ${q(T)}
WHERE NOT EXISTS (SELECT 1 FROM deals WHERE customer_id = ${CUST} AND org_id = ${ORG});`);

// ---------- Historik med kända datum ----------
const HIST = [
  ['act_rozenhist00000001', '2026-10-28T12:00:00.000Z', 'note', 'Säljpresentation förberedd: KELA × Rozen Clean – Digitaliseringsresa', 'Referenskundserbjudande i presentationen: 9 500 kr/mån (Chattis + Bokis) och installation 20 800 kr.'],
  ['act_rozenhist00000002', '2026-11-03T13:50:00.000Z', 'system', 'Offertsida publicerad på hemlig adress', null],
  ['act_rozenhist00000003', '2026-11-03T14:38:32.000Z', 'system', 'Rozen Clean valde moduler på offertsidan: 9 Ja och 8 Kanske',
    'Ja: Adminpanel, Bokis, Chattis, Customer hub, Kundportal, Nyhetsbrev och sms, Kundfeedback, Headof, Personalapp.\nKanske: Avtalshantering, Rekrytering, Contentgenerator, SEO och GEO, Meta-annonser, Automatiska påminnelser, Influencersamarbeten, Inkassohantering.'],
  ['act_rozenhist00000004', '2026-11-04T08:00:00.000Z', 'note', 'Presentation med tidsplan och demo framtagen', 'Hemsida och intranät, Headof, Customer Hub, Bokis och tidsplan.'],
  ['act_rozenhist00000005', '2026-11-09T12:00:00.000Z', 'note', 'Offerten uppdaterad: pristak 18 000 kr/mån i 12 månader', 'Alla befintliga och framtida moduler ingår, inga installationsavgifter, 1 månads test.'],
  ['act_rozenhist00000006', '2026-11-10T20:00:00.000Z', 'note', 'Avtalspaket framtaget enligt Rozens krav (5 avtal + 3 före start)', 'Pristak 16 000 kr/mån mån 1–12 och 18 000 kr/mån mån 13–24. 3 mån uppsägning, ingen bindning. Inget personligt vite.'],
  ['act_rozenhist00000007', '2026-11-11T07:00:00.000Z', 'system', 'Checklista för chattbot och bokning delad med Rozen Clean', null],
];
for (const [id, at, type, title, body] of HIST) {
  sql.push(`INSERT OR IGNORE INTO activities (id, org_id, customer_id, deal_id, type, title, body, actor_user_id, created_at)
VALUES (${q(id)}, ${ORG}, ${CUST}, (SELECT id FROM deals WHERE customer_id = ${CUST} ORDER BY created_at LIMIT 1), ${q(type)}, ${q(title)}, ${q(body)}, ${type === 'note' ? OWNER : 'NULL'}, ${q(at)});`);
}

// ---------- Koppla offertsida och checklista till kunden ----------
sql.push(`UPDATE tracked_pages SET customer_id = ${CUST} WHERE id IN ('tpg_rozenclean0000001','tpg_rozenchecklista01') AND customer_id IS NULL;`);
sql.push(`INSERT INTO audit_logs (id, org_id, action, entity_type, entity_id, summary, data_json, created_at)
SELECT 'aud_rozenimport000001', ${ORG}, 'document.imported', 'customer', ${CUST}, 'Rozen Clean: ${DOCS.length} dokument och ${fileCount} filer importerade', '{}', ${q(T)}
WHERE NOT EXISTS (SELECT 1 FROM audit_logs WHERE id = 'aud_rozenimport000001');`);

writeFileSync(OUT, sql.join('\n') + '\n');
console.log(`${DOCS.length} dokument, ${fileCount} filer (${(bytesTotal / 1024 / 1024).toFixed(1)} MB), ${sql.length} SQL-satser → ${OUT}`);
