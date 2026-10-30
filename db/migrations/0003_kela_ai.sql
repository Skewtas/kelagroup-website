-- KELA AI – AI-assistenten på hemsidan (och framtida kunders hemsidor).
-- Multi-tenant: varje assistent ("tenant") hör till ett företag (org_id). All data filtreras på org_id + tenant_id.
-- Personuppgifter: samtal gallras automatiskt efter tenantens lagringstid (standard 90 dagar).
-- Bilder sparas aldrig – bara AI:ns textanalys av bilden.

CREATE TABLE ai_tenants (
  id TEXT PRIMARY KEY,                -- publik nyckel som widgeten anger, t.ex. 'kela'
  org_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  allowed_origins TEXT NOT NULL DEFAULT '[]', -- JSON-lista med ursprung som får bädda in widgeten (utöver samma ursprung)
  config_json TEXT NOT NULL DEFAULT '{}',     -- välkomsttext, förslag, ton, sidregler, kunskap, varumärke, lagringstid
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_ai_tenants_org ON ai_tenants(org_id);

CREATE TABLE ai_conversations (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  tenant_id TEXT NOT NULL REFERENCES ai_tenants(id),
  token_hash TEXT NOT NULL,           -- besökarens hemliga nyckel (SHA-256). Krävs för att läsa, exportera eller radera.
  session_hash TEXT,                  -- slumpad fliksession (inga kakor), för att räkna unika sessioner
  status TEXT NOT NULL DEFAULT 'ai' CHECK (status IN ('ai','handoff','human','closed')),
  lang TEXT,
  first_page TEXT,
  last_page TEXT,
  profile_json TEXT NOT NULL DEFAULT '{}', -- det AI:n kommit ihåg (bransch, behov, system …). Besökaren kan se och rensa det.
  lead_id TEXT REFERENCES leads(id),
  customer_id TEXT REFERENCES customers(id),
  turns INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  cost_micro_usd INTEGER NOT NULL DEFAULT 0,
  rating_up INTEGER NOT NULL DEFAULT 0,
  rating_down INTEGER NOT NULL DEFAULT 0,
  staff_user_id TEXT REFERENCES users(id),
  staff_unread INTEGER NOT NULL DEFAULT 0,  -- nya besökarmeddelanden sedan personal senast tittade
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_ai_conv_org ON ai_conversations(org_id, tenant_id, updated_at);
CREATE INDEX idx_ai_conv_status ON ai_conversations(org_id, status, updated_at);

CREATE TABLE ai_messages (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  conversation_id TEXT NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','staff','system')),
  api_json TEXT,                      -- exakt innehåll som skickas till modellen (append-only historik). NULL för personal/system.
  display_text TEXT NOT NULL DEFAULT '',
  ui_json TEXT,                       -- validerade UI-komponenter som visades
  staff_user_id TEXT REFERENCES users(id),
  input_tokens INTEGER,
  output_tokens INTEGER,
  rating INTEGER,                     -- 1 / -1 från besökaren
  created_at TEXT NOT NULL,
  UNIQUE (conversation_id, seq)
);
CREATE INDEX idx_ai_msg_conv ON ai_messages(conversation_id, seq);

-- Anonyma händelser för statistik. Inga personuppgifter.
CREATE TABLE ai_events (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  tenant_id TEXT NOT NULL,
  conversation_id TEXT,
  session_hash TEXT,
  type TEXT NOT NULL,                 -- open, demo_start, demo_complete, lead, meeting_request, handoff, error, fallback, tool …
  name TEXT,
  page TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_ai_events_org ON ai_events(org_id, tenant_id, type, created_at);
