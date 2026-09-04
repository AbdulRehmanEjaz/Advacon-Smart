CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE project_settings (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE RESTRICT,
  design_capacity INTEGER NOT NULL,
  translocation_target INTEGER NOT NULL,
  translocation_target_is_approximate INTEGER NOT NULL CHECK (translocation_target_is_approximate IN (0, 1)),
  new_tree_target INTEGER NOT NULL,
  irrigation_target REAL NOT NULL,
  block_target INTEGER NOT NULL,
  row_target INTEGER NOT NULL,
  post_target INTEGER NOT NULL,
  valve_target INTEGER NOT NULL,
  decoder_target INTEGER NOT NULL,
  productivity_min INTEGER NOT NULL,
  productivity_max INTEGER NOT NULL,
  amber_variance REAL NOT NULL,
  red_variance REAL NOT NULL,
  pending_hours INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'FOREMAN' CHECK (role IN ('ADMIN', 'FOREMAN')),
  pin_lookup TEXT UNIQUE,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE zones (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  capacity INTEGER NOT NULL,
  spacing TEXT NOT NULL
);

CREATE TABLE blocks (
  id TEXT PRIMARY KEY,
  zone_id TEXT NOT NULL REFERENCES zones(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  capacity INTEGER,
  irrigation_target REAL,
  support_rows INTEGER,
  hold INTEGER NOT NULL DEFAULT 0 CHECK (hold IN (0, 1))
);

CREATE TABLE work_packages (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  weight REAL NOT NULL,
  sort_order INTEGER NOT NULL
);

CREATE TABLE activities (
  id TEXT PRIMARY KEY,
  package_id TEXT NOT NULL REFERENCES work_packages(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  unit TEXT NOT NULL,
  target_key TEXT NOT NULL,
  target REAL,
  weight REAL NOT NULL
);

CREATE TABLE schedule_activities (
  activity_id TEXT PRIMARY KEY REFERENCES activities(id) ON DELETE CASCADE,
  start TEXT NOT NULL,
  finish TEXT NOT NULL
);

CREATE TABLE daily_submissions (
  id TEXT PRIMARY KEY,
  request_key TEXT NOT NULL UNIQUE,
  supervisor_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  work_date TEXT NOT NULL,
  block_id TEXT NOT NULL REFERENCES blocks(id) ON DELETE RESTRICT,
  package_id TEXT NOT NULL REFERENCES work_packages(id) ON DELETE RESTRICT,
  batch_number TEXT,
  remarks TEXT NOT NULL DEFAULT '',
  override_reason TEXT,
  status TEXT NOT NULL DEFAULT 'WAITING' CHECK (status IN ('WAITING', 'APPROVED', 'RETURNED', 'REJECTED')),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE daily_submission_items (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES daily_submissions(id) ON DELETE RESTRICT,
  activity_id TEXT NOT NULL REFERENCES activities(id) ON DELETE RESTRICT,
  quantity REAL NOT NULL CHECK (quantity > 0),
  UNIQUE (submission_id, activity_id)
);

CREATE TABLE submission_photos (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES daily_submissions(id) ON DELETE RESTRICT,
  external_file_id TEXT,
  external_url TEXT,
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE approvals (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES daily_submissions(id) ON DELETE RESTRICT,
  reviewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  decision TEXT NOT NULL CHECK (decision IN ('APPROVED', 'RETURNED', 'REJECTED')),
  comment TEXT NOT NULL,
  version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (submission_id, version)
);

CREATE TABLE adjustments (
  id TEXT PRIMARY KEY,
  request_key TEXT NOT NULL UNIQUE,
  item_id TEXT NOT NULL REFERENCES daily_submission_items(id) ON DELETE RESTRICT,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  quantity REAL NOT NULL CHECK (quantity <> 0),
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE inspections (
  id TEXT PRIMARY KEY,
  number TEXT NOT NULL UNIQUE,
  block_id TEXT NOT NULL REFERENCES blocks(id) ON DELETE RESTRICT,
  type TEXT NOT NULL,
  inspector TEXT NOT NULL,
  result TEXT NOT NULL,
  date TEXT NOT NULL,
  remarks TEXT NOT NULL DEFAULT '',
  first_attempt INTEGER NOT NULL DEFAULT 1 CHECK (first_attempt IN (0, 1)),
  created_at TEXT NOT NULL
);

CREATE TABLE observations (
  id TEXT PRIMARY KEY,
  inspection_id TEXT NOT NULL REFERENCES inspections(id) ON DELETE RESTRICT,
  description TEXT NOT NULL,
  responsible TEXT NOT NULL,
  due_date TEXT NOT NULL,
  closed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  role TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  before_json TEXT,
  after_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_submissions_status_created ON daily_submissions(status, created_at DESC);
CREATE INDEX idx_submissions_supervisor_work_date ON daily_submissions(supervisor_id, work_date DESC);
CREATE INDEX idx_items_submission ON daily_submission_items(submission_id);
CREATE INDEX idx_adjustments_item ON adjustments(item_id);
CREATE INDEX idx_approvals_submission ON approvals(submission_id, created_at);
CREATE INDEX idx_observations_inspection ON observations(inspection_id);
CREATE INDEX idx_audit_created ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);

CREATE TRIGGER approval_insert_guard
BEFORE INSERT ON approvals
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM daily_submissions
    WHERE id = NEW.submission_id AND status = 'WAITING' AND version = NEW.version
  ) THEN RAISE(ABORT, 'SUBMISSION_NOT_REVIEWABLE') END;
END;

CREATE TRIGGER approvals_immutable_update
BEFORE UPDATE ON approvals BEGIN SELECT RAISE(ABORT, 'APPROVAL_IMMUTABLE'); END;
CREATE TRIGGER approvals_immutable_delete
BEFORE DELETE ON approvals BEGIN SELECT RAISE(ABORT, 'APPROVAL_IMMUTABLE'); END;
CREATE TRIGGER adjustments_immutable_update
BEFORE UPDATE ON adjustments BEGIN SELECT RAISE(ABORT, 'ADJUSTMENT_IMMUTABLE'); END;
CREATE TRIGGER adjustments_immutable_delete
BEFORE DELETE ON adjustments BEGIN SELECT RAISE(ABORT, 'ADJUSTMENT_IMMUTABLE'); END;
CREATE TRIGGER audit_logs_immutable_update
BEFORE UPDATE ON audit_logs BEGIN SELECT RAISE(ABORT, 'AUDIT_LOG_IMMUTABLE'); END;
CREATE TRIGGER audit_logs_immutable_delete
BEFORE DELETE ON audit_logs BEGIN SELECT RAISE(ABORT, 'AUDIT_LOG_IMMUTABLE'); END;

CREATE TRIGGER approved_item_update_guard
BEFORE UPDATE ON daily_submission_items
WHEN EXISTS (SELECT 1 FROM daily_submissions WHERE id = OLD.submission_id AND status = 'APPROVED')
BEGIN SELECT RAISE(ABORT, 'APPROVED_QUANTITY_IMMUTABLE'); END;

CREATE TRIGGER approved_item_delete_guard
BEFORE DELETE ON daily_submission_items
WHEN EXISTS (SELECT 1 FROM daily_submissions WHERE id = OLD.submission_id AND status <> 'RETURNED')
BEGIN SELECT RAISE(ABORT, 'SUBMISSION_ITEMS_IMMUTABLE'); END;
