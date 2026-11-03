-- Offertsidor med spårning: designade säljsidor (t.ex. referenskundserbjudandet till Rozen Clean)
-- som ligger på en hemlig adress under /s/<slug>/. Sidan rapporterar besök, lästid, scroll,
-- vilka delar som visats och kundens val (Ja/Kanske/Nej per modul). Inga kakor, ingen lagring i besökarens webbläsare.

CREATE TABLE tracked_pages (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  slug TEXT NOT NULL UNIQUE,          -- hemlig del av adressen: /s/<slug>/
  title TEXT NOT NULL,
  customer_name TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  choices_json TEXT NOT NULL DEFAULT '{}', -- kundens senaste val { modul: 'ja'|'kanske'|'nej' }
  choices_updated_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_tracked_pages_org ON tracked_pages(org_id);

-- Ett besök = en sidvisning (en flik). id skapas slumpat i webbläsaren och lever bara i minnet.
CREATE TABLE tracked_visits (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  page_id TEXT NOT NULL REFERENCES tracked_pages(id),
  started_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  active_seconds INTEGER NOT NULL DEFAULT 0, -- tid som sidan faktiskt varit synlig
  max_scroll INTEGER NOT NULL DEFAULT 0,     -- hur långt ner (0–100 %)
  sections_json TEXT NOT NULL DEFAULT '[]',  -- vilka delar som visats
  device TEXT,                               -- 'mobil' | 'dator' | 'surfplatta'
  ip TEXT,
  ua TEXT
);
CREATE INDEX idx_tracked_visits_page ON tracked_visits(page_id, started_at);

CREATE TABLE tracked_events (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  page_id TEXT NOT NULL REFERENCES tracked_pages(id),
  visit_id TEXT REFERENCES tracked_visits(id),
  type TEXT NOT NULL,                 -- open | section | choice | all_yes | clear | copy
  data_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX idx_tracked_events_page ON tracked_events(page_id, created_at);

-- Rozen Cleans referenskundserbjudande. Kopplas till företaget som skapades vid installationen.
INSERT INTO tracked_pages (id, org_id, slug, title, customer_name, created_at)
SELECT 'tpg_rozenclean0000001', id, 'rozen-clean-uW6qK8R7nUi9Pw4D69L2tkvt', 'Offert – referenskundserbjudande', 'Rozen Clean AB', '2026-11-03T00:00:00.000Z'
FROM organizations ORDER BY created_at LIMIT 1;
