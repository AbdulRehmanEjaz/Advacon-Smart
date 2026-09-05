ALTER TABLE work_packages ADD COLUMN active INTEGER NOT NULL DEFAULT 1;
ALTER TABLE work_packages ADD COLUMN kpi_version TEXT NOT NULL DEFAULT 'legacy';

ALTER TABLE activities ADD COLUMN active INTEGER NOT NULL DEFAULT 1;
ALTER TABLE activities ADD COLUMN kpi_version TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE activities ADD COLUMN direct_project_weight REAL;

CREATE TABLE kpi_opening_balances (
  activity_id TEXT PRIMARY KEY REFERENCES activities(id) ON DELETE RESTRICT,
  quantity REAL NOT NULL CHECK (quantity >= 0),
  source TEXT NOT NULL,
  effective_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_kpi_opening_balances_effective
  ON kpi_opening_balances(effective_at);
