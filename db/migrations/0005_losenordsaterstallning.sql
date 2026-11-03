-- "Glömt lösenord": engångslänkar som skickas med e-post. Länken gäller i 30 minuter och kan bara användas en gång.
-- Bara SHA-256 av token sparas; själva token finns enbart i mejlet.
CREATE TABLE password_resets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  ip TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_password_resets_user ON password_resets(user_id, created_at);
