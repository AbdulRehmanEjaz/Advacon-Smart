CREATE TABLE manpower (
  id TEXT PRIMARY KEY,
  labour_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  company TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE equipment (
  id TEXT PRIMARY KEY,
  equipment_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  company TEXT NOT NULL,
  daily_rate_halalas INTEGER NOT NULL CHECK (daily_rate_halalas >= 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE manpower_attendance (
  id TEXT PRIMARY KEY,
  manpower_id TEXT NOT NULL REFERENCES manpower(id) ON DELETE RESTRICT,
  attendance_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('P', 'A', 'F', 'H')),
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (manpower_id, attendance_date)
);

CREATE TABLE equipment_attendance (
  id TEXT PRIMARY KEY,
  equipment_id TEXT NOT NULL REFERENCES equipment(id) ON DELETE RESTRICT,
  attendance_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('P', 'A', 'F', 'H')),
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (equipment_id, attendance_date)
);

CREATE INDEX idx_manpower_active_company ON manpower(active, company, name);
CREATE INDEX idx_equipment_active_company ON equipment(active, company, name);
CREATE INDEX idx_manpower_attendance_date ON manpower_attendance(attendance_date, manpower_id);
CREATE INDEX idx_equipment_attendance_date ON equipment_attendance(attendance_date, equipment_id);
