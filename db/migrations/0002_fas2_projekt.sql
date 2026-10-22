-- KELA OS – fas 2: projekthantering.

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  number INTEGER NOT NULL,
  name TEXT NOT NULL,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  quote_id TEXT REFERENCES quotes(id),
  deal_id TEXT REFERENCES deals(id),
  owner_user_id TEXT REFERENCES users(id),
  template_key TEXT,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','active','waiting_customer','paused','done','cancelled')),
  description TEXT,
  start_date TEXT,
  due_date TEXT,
  budget_minor INTEGER,             -- intern budget exkl. moms
  estimated_hours INTEGER,
  actual_hours REAL NOT NULL DEFAULT 0,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (org_id, number)
);
-- En accepterad offert ger högst ett projekt (idempotent automatisering).
CREATE UNIQUE INDEX idx_projects_quote ON projects(org_id, quote_id) WHERE quote_id IS NOT NULL;
CREATE INDEX idx_projects_org ON projects(org_id, status, due_date);
CREATE INDEX idx_projects_customer ON projects(org_id, customer_id);

-- Projektuppgifter återanvänder tasks-tabellen.
ALTER TABLE tasks ADD COLUMN project_id TEXT REFERENCES projects(id);
ALTER TABLE tasks ADD COLUMN stage TEXT NOT NULL DEFAULT 'todo';      -- todo | doing | review | done (kanban)
ALTER TABLE tasks ADD COLUMN milestone INTEGER NOT NULL DEFAULT 0;    -- 1 = milstolpe
ALTER TABLE tasks ADD COLUMN sort INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN description TEXT;
ALTER TABLE tasks ADD COLUMN estimated_hours REAL;
CREATE INDEX idx_tasks_project ON tasks(org_id, project_id, sort);

-- Befintliga uppgifter: håll kanban-steget i synk med status.
UPDATE tasks SET stage = 'done' WHERE status = 'done';
