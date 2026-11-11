-- Dokument och avtal per kund: avtal, offerter, bilagor, presentationer och länkar samlade i KELA OS.
-- Filer (PDF, Word m.m.) lagras i D1 uppdelade i delar om högst 512 kB (BLOB). Kan flyttas till R2 senare
-- utan att ändra documents/document_files – bara var bytes ligger.

CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  quote_id TEXT REFERENCES quotes(id),
  project_id TEXT REFERENCES projects(id),
  kind TEXT NOT NULL CHECK (kind IN ('avtal','offert','bilaga','presentation','checklista','ovrigt')),
  title TEXT NOT NULL,
  -- Avtal: draft → sent → signed → active → terminated | replaced. Övriga dokument: draft | sent | final | replaced.
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','signed','active','terminated','replaced','final')),
  url TEXT,                    -- extern länk (offertsida, presentation) i stället för eller utöver filer
  tracked_page_id TEXT REFERENCES tracked_pages(id),
  description TEXT,
  sent_at TEXT,
  signed_at TEXT,              -- datum då avtalet skrevs under (anges manuellt; e-signering kopplas senare)
  valid_from TEXT,
  valid_to TEXT,
  notice_months INTEGER,       -- uppsägningstid i månader
  sort INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);
CREATE INDEX idx_documents_customer ON documents(org_id, customer_id, kind, archived_at);
CREATE INDEX idx_documents_org ON documents(org_id, kind, status);

CREATE TABLE document_files (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  document_id TEXT NOT NULL REFERENCES documents(id),
  file_name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,        -- kontrollsumma: visar att filen är oförändrad sedan uppladdning
  chunk_count INTEGER NOT NULL,
  uploaded_by TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_document_files_doc ON document_files(org_id, document_id);

CREATE TABLE document_chunks (
  file_id TEXT NOT NULL REFERENCES document_files(id),
  idx INTEGER NOT NULL,
  data BLOB NOT NULL,
  PRIMARY KEY (file_id, idx)
);

-- Offertsidor och checklistor kan kopplas till en kund i CRM:et.
ALTER TABLE tracked_pages ADD COLUMN customer_id TEXT REFERENCES customers(id);
