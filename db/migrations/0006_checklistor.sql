-- Checklistor för kunder på hemlig adress under /s/<slug>/ (samma tabell som offertsidorna).
-- Kunden fyller i utan konto: åtkomst styrs av den hemliga adressen. Varje punkt har ett svar och en bock.
-- Historiken sparar tidigare versioner, så att inget försvinner om någon skriver över ett svar.

ALTER TABLE tracked_pages ADD COLUMN kind TEXT NOT NULL DEFAULT 'offert'; -- 'offert' | 'checklista'

CREATE TABLE checklist_answers (
  page_id TEXT NOT NULL REFERENCES tracked_pages(id),
  org_id TEXT NOT NULL REFERENCES organizations(id),
  item_key TEXT NOT NULL,             -- punktens id på sidan, t.ex. 'priser'
  label TEXT NOT NULL DEFAULT '',     -- punktens rubrik när svaret sparades (så att KELA OS kan visa den)
  section TEXT NOT NULL DEFAULT '',   -- avsnittets rubrik
  text TEXT NOT NULL DEFAULT '',
  done INTEGER NOT NULL DEFAULT 0,
  updated_by TEXT,                    -- namnet personen skrev in på sidan (inte verifierat)
  updated_at TEXT NOT NULL,
  PRIMARY KEY (page_id, item_key)
);

CREATE TABLE checklist_history (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  page_id TEXT NOT NULL REFERENCES tracked_pages(id),
  item_key TEXT NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  done INTEGER NOT NULL DEFAULT 0,
  updated_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL            -- samma person som skriver vidare inom 10 minuter uppdaterar raden i stället för att skapa en ny
);
CREATE INDEX idx_checklist_history_item ON checklist_history(page_id, item_key, updated_at);

-- Rozen Cleans checklista inför chattbot och bokning.
INSERT INTO tracked_pages (id, org_id, slug, title, customer_name, kind, created_at)
SELECT 'tpg_rozenchecklista01', id, 'rozen-clean-checklista-vKiT4qIE-sznJg-dwr-mOm82-hTd', 'Checklista – chattbot och bokning', 'Rozen Clean AB', 'checklista', '2026-11-11T00:00:00.000Z'
FROM organizations ORDER BY created_at LIMIT 1;
