PRAGMA defer_foreign_keys = ON;

CREATE TABLE users_with_viewer (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'FOREMAN' CHECK (role IN ('ADMIN', 'FOREMAN', 'VIEWER')),
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

INSERT INTO users_with_viewer (id,name,role,pin_lookup,active,archived_at,created_at,updated_at,pin_salt,pin_hash,credential_version,last_login)
SELECT id,name,role,pin_lookup,active,archived_at,created_at,updated_at,pin_salt,pin_hash,credential_version,last_login FROM users;

DROP TABLE users;
ALTER TABLE users_with_viewer RENAME TO users;

INSERT OR IGNORE INTO users (id,name,role,active,created_at,updated_at)
VALUES (
  'initial-viewer',
  'Project Viewer',
  'VIEWER',
  1,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);
