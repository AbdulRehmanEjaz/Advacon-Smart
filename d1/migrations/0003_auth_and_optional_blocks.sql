ALTER TABLE users ADD COLUMN pin_salt TEXT;
ALTER TABLE users ADD COLUMN pin_hash TEXT;
ALTER TABLE users ADD COLUMN credential_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN last_login TEXT;

CREATE TABLE login_attempts (
  identifier TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  window_started_at TEXT NOT NULL,
  blocked_until TEXT
);

DROP TRIGGER approval_insert_guard;
DROP TRIGGER approved_item_update_guard;
DROP TRIGGER approved_item_delete_guard;

CREATE TABLE daily_submissions_new (
  id TEXT PRIMARY KEY,
  request_key TEXT NOT NULL UNIQUE,
  supervisor_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  work_date TEXT NOT NULL,
  block_id TEXT REFERENCES blocks(id) ON DELETE RESTRICT,
  package_id TEXT NOT NULL REFERENCES work_packages(id) ON DELETE RESTRICT,
  batch_number TEXT,
  remarks TEXT NOT NULL DEFAULT '',
  override_reason TEXT,
  status TEXT NOT NULL DEFAULT 'WAITING' CHECK (status IN ('WAITING', 'APPROVED', 'RETURNED', 'REJECTED')),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO daily_submissions_new
SELECT id,request_key,supervisor_id,work_date,block_id,package_id,batch_number,
       remarks,override_reason,status,version,created_at,updated_at
FROM daily_submissions;

PRAGMA defer_foreign_keys = ON;
DROP TABLE daily_submissions;
ALTER TABLE daily_submissions_new RENAME TO daily_submissions;

CREATE INDEX idx_submissions_status_created
  ON daily_submissions(status, created_at DESC);
CREATE INDEX idx_submissions_supervisor_work_date
  ON daily_submissions(supervisor_id, work_date DESC);

CREATE TRIGGER approval_insert_guard
BEFORE INSERT ON approvals
BEGIN
  SELECT (CASE WHEN NOT EXISTS (
    SELECT 1 FROM daily_submissions
    WHERE id = NEW.submission_id AND status = 'WAITING' AND version = NEW.version
  ) THEN RAISE(ABORT, 'SUBMISSION_NOT_REVIEWABLE') END);
END;

CREATE TRIGGER approved_item_update_guard
BEFORE UPDATE ON daily_submission_items
WHEN EXISTS (SELECT 1 FROM daily_submissions WHERE id = OLD.submission_id AND status = 'APPROVED')
BEGIN SELECT RAISE(ABORT, 'APPROVED_QUANTITY_IMMUTABLE'); END;

CREATE TRIGGER approved_item_delete_guard
BEFORE DELETE ON daily_submission_items
WHEN EXISTS (SELECT 1 FROM daily_submissions WHERE id = OLD.submission_id AND status <> 'RETURNED')
BEGIN SELECT RAISE(ABORT, 'SUBMISSION_ITEMS_IMMUTABLE'); END;
