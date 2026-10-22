-- KELA OS – fas 1: affärsgrund
-- Princip: varje verksamhetstabell har org_id (förberett för flera företag/SaaS).
-- Belopp lagras som heltal i minsta enhet (öre) + valutakod. Moms i baspunkter (2500 = 25 %).
-- Antal lagras i tusendelar (qty_milli: 1000 = 1 st) för att undvika flyttal.
-- Tider: ISO 8601 UTC-strängar.

CREATE TABLE organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  org_number TEXT,
  currency TEXT NOT NULL DEFAULT 'SEK',
  default_vat_bp INTEGER NOT NULL DEFAULT 2500,
  settings_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  totp_secret_enc TEXT,
  totp_enabled INTEGER NOT NULL DEFAULT 0,
  totp_pending_enc TEXT,
  totp_last_step INTEGER,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  last_login_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE memberships (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK (role IN ('superadmin','admin','sales','pm','finance','customer')),
  created_at TEXT NOT NULL,
  UNIQUE (org_id, user_id)
);

CREATE TABLE invites (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  email TEXT NOT NULL COLLATE NOCASE,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  revoked_at TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE sessions (
  id_hash TEXT PRIMARY KEY,           -- SHA-256 av sessionstoken; själva token finns bara i kakan
  user_id TEXT NOT NULL REFERENCES users(id),
  org_id TEXT NOT NULL REFERENCES organizations(id),
  mfa_ok INTEGER NOT NULL DEFAULT 0,
  ip TEXT,
  ua TEXT,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE rate_limits (
  key TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_rate_limits ON rate_limits(key, created_at);

CREATE TABLE counters (
  org_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value INTEGER NOT NULL,
  PRIMARY KEY (org_id, key)
);

CREATE TABLE customers (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  org_number TEXT,
  status TEXT NOT NULL DEFAULT 'prospect' CHECK (status IN ('prospect','active','paused','former')),
  industry TEXT,
  website TEXT,
  email TEXT,
  phone TEXT,
  billing_address TEXT,
  visiting_address TEXT,
  owner_user_id TEXT REFERENCES users(id),
  expected_value_minor INTEGER,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);
CREATE INDEX idx_customers_org ON customers(org_id, archived_at, name);

CREATE TABLE contacts (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  name TEXT NOT NULL,
  title TEXT,
  email TEXT,
  phone TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_contacts_customer ON contacts(org_id, customer_id);

CREATE TABLE deals (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  customer_id TEXT REFERENCES customers(id),
  title TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'new' CHECK (stage IN ('new','contacted','meeting','analysis','quote_sent','negotiation','won','lost')),
  value_minor INTEGER NOT NULL DEFAULT 0,          -- förväntat engångsvärde
  monthly_value_minor INTEGER NOT NULL DEFAULT 0,  -- förväntat månadsvärde
  currency TEXT NOT NULL DEFAULT 'SEK',
  probability INTEGER NOT NULL DEFAULT 10 CHECK (probability BETWEEN 0 AND 100),
  owner_user_id TEXT REFERENCES users(id),
  expected_close_date TEXT,
  next_step TEXT,
  next_step_date TEXT,
  lost_reason TEXT,
  lost_note TEXT,
  won_at TEXT,
  lost_at TEXT,
  position REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_deals_org ON deals(org_id, stage, position);
CREATE INDEX idx_deals_customer ON deals(org_id, customer_id);

CREATE TABLE leads (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  company TEXT,
  email TEXT,
  phone TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  message TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','qualified','disqualified','converted')),
  owner_user_id TEXT REFERENCES users(id),
  customer_id TEXT REFERENCES customers(id),
  deal_id TEXT REFERENCES deals(id),
  contacted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_leads_org ON leads(org_id, status, created_at);

CREATE TABLE activities (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  customer_id TEXT,
  deal_id TEXT,
  lead_id TEXT,
  quote_id TEXT,
  type TEXT NOT NULL CHECK (type IN ('note','call','meeting','email','system')),
  title TEXT NOT NULL,
  body TEXT,
  actor_user_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_activities_org ON activities(org_id, created_at);
CREATE INDEX idx_activities_customer ON activities(org_id, customer_id, created_at);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  title TEXT NOT NULL,
  due_date TEXT,
  assignee_user_id TEXT REFERENCES users(id),
  customer_id TEXT,
  deal_id TEXT,
  quote_id TEXT,
  source_key TEXT,            -- för idempotens: samma automatiska uppgift skapas bara en gång
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','done')),
  done_at TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (org_id, source_key)
);
CREATE INDEX idx_tasks_org ON tasks(org_id, status, due_date);

CREATE TABLE services (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  category TEXT,
  description TEXT,
  delivery_time TEXT,
  includes_json TEXT NOT NULL DEFAULT '[]',
  addons_json TEXT NOT NULL DEFAULT '[]',
  current_price_version_id TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_services_org ON services(org_id, active, sort);

-- Varje prisändring skapar en ny rad. Offerter pekar på den version som gällde.
CREATE TABLE service_price_versions (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  service_id TEXT NOT NULL REFERENCES services(id),
  once_price_minor INTEGER,
  monthly_price_minor INTEGER,
  internal_once_cost_minor INTEGER,
  internal_monthly_cost_minor INTEGER,
  vat_bp INTEGER NOT NULL DEFAULT 2500,
  currency TEXT NOT NULL DEFAULT 'SEK',
  created_by TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_price_versions_service ON service_price_versions(org_id, service_id, created_at);

CREATE TABLE quotes (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  number INTEGER NOT NULL,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  contact_id TEXT REFERENCES contacts(id),
  deal_id TEXT REFERENCES deals(id),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','review','sent','viewed','accepted','declined','expired')),
  current_version_id TEXT,     -- versionen som redigeras / senast skapades
  sent_version_id TEXT,        -- versionen kunden ser via länken (alltid låst)
  owner_user_id TEXT REFERENCES users(id),
  valid_until TEXT,
  share_token_hash TEXT UNIQUE,   -- uppslag sker på hash
  share_token_enc TEXT,           -- krypterad kopia så att admin kan kopiera länken igen
  share_created_at TEXT,
  sent_at TEXT,
  first_viewed_at TEXT,
  last_viewed_at TEXT,
  accepted_at TEXT,
  declined_at TEXT,
  decline_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (org_id, number)
);
CREATE INDEX idx_quotes_org ON quotes(org_id, status, updated_at);
CREATE INDEX idx_quotes_customer ON quotes(org_id, customer_id);

CREATE TABLE quote_versions (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  quote_id TEXT NOT NULL REFERENCES quotes(id),
  version_no INTEGER NOT NULL,
  locked INTEGER NOT NULL DEFAULT 0,  -- 1 = skickad/fryst, får aldrig ändras
  content_json TEXT NOT NULL DEFAULT '{}',
  currency TEXT NOT NULL DEFAULT 'SEK',
  discount_bp INTEGER NOT NULL DEFAULT 0,
  totals_json TEXT NOT NULL DEFAULT '{}',
  snapshot_json TEXT,                 -- fullständig fryst kopia vid låsning
  snapshot_hash TEXT,                 -- SHA-256 av snapshot_json
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  locked_at TEXT,
  UNIQUE (quote_id, version_no)
);

CREATE TABLE quote_items (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  quote_version_id TEXT NOT NULL REFERENCES quote_versions(id),
  service_id TEXT,
  price_version_id TEXT,
  name TEXT NOT NULL,
  description TEXT,
  billing TEXT NOT NULL CHECK (billing IN ('once','monthly')),
  unit TEXT NOT NULL DEFAULT 'st',
  qty_milli INTEGER NOT NULL DEFAULT 1000,
  unit_price_minor INTEGER NOT NULL DEFAULT 0,
  discount_bp INTEGER NOT NULL DEFAULT 0,
  vat_bp INTEGER NOT NULL DEFAULT 2500,
  optional INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_quote_items_version ON quote_items(quote_version_id, sort);

CREATE TABLE quote_events (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  quote_id TEXT NOT NULL REFERENCES quotes(id),
  version_id TEXT,
  type TEXT NOT NULL,
  actor_kind TEXT NOT NULL CHECK (actor_kind IN ('user','customer','system')),
  actor_user_id TEXT,
  data_json TEXT NOT NULL DEFAULT '{}',
  ip TEXT,
  ua TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_quote_events ON quote_events(org_id, quote_id, created_at);

CREATE TABLE quote_acceptances (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  quote_id TEXT NOT NULL UNIQUE REFERENCES quotes(id),  -- en offert kan bara accepteras en gång
  version_id TEXT NOT NULL REFERENCES quote_versions(id),
  snapshot_hash TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'click_accept',           -- 'click_accept' | framtida 'esign:<leverantör>'
  signer_name TEXT NOT NULL,
  signer_email TEXT NOT NULL,
  signer_title TEXT,
  selected_optional_json TEXT NOT NULL DEFAULT '[]',
  totals_json TEXT NOT NULL,
  esign_provider TEXT,
  esign_reference TEXT,
  esign_evidence_json TEXT,
  ip TEXT,
  ua TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE quote_templates (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  description TEXT,
  content_json TEXT NOT NULL DEFAULT '{}',
  items_json TEXT NOT NULL DEFAULT '[]',
  discount_bp INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  org_id TEXT,
  actor_user_id TEXT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  summary TEXT,
  data_json TEXT NOT NULL DEFAULT '{}',
  ip TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_audit_org ON audit_logs(org_id, created_at);
