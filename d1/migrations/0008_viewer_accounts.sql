-- Viewer accounts live in their own table so the existing users table, its
-- foreign keys, child rows and immutability triggers remain completely
-- untouched. The users table keeps its ADMIN/FOREMAN role constraint; viewers
-- never appear in it. Credentials use the same salted PIN scheme as users and
-- no plaintext PIN is ever stored. The initial viewer account is bootstrapped
-- from the VIEWER_PIN secret on first login, not seeded here.
CREATE TABLE viewer_accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  pin_lookup TEXT UNIQUE,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  pin_salt TEXT,
  pin_hash TEXT,
  credential_version INTEGER NOT NULL DEFAULT 0,
  last_login TEXT
);

CREATE INDEX idx_viewer_accounts_active ON viewer_accounts(active, name);
