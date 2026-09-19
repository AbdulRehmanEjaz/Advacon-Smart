-- ============================================================
-- 0009 — Loading & Offloading Tracking System
-- Forward-only. Adds two NEW tables; no existing table is
-- rebuilt, dropped, altered or has production rows moved.
-- Mirrors 0008's pattern: supervisor accounts live in their own
-- table so the users table and its ADMIN/FOREMAN role check
-- remain completely untouched. Credentials reuse the same salted
-- PIN scheme; no plaintext PIN is ever stored. The demo/local
-- supervisor account is bootstrapped from LOADING_PIN on first
-- login (see auth.ts), never seeded with a hardcoded credential.
-- ============================================================

CREATE TABLE loading_supervisors (
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

CREATE INDEX idx_loading_supervisors_active ON loading_supervisors(active, name);

CREATE TABLE loading_trips (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL UNIQUE,
  loading_supervisor_id TEXT NOT NULL REFERENCES loading_supervisors(id) ON DELETE RESTRICT,
  truck_number TEXT NOT NULL,
  trees_loaded INTEGER NOT NULL CHECK (trees_loaded > 0),
  -- Server-generated Asia/Riyadh departure timestamp (ISO 8601 with offset).
  departure_time TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  submitted_at TEXT NOT NULL,
  approved_at TEXT,
  approved_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_loading_trips_trip_id ON loading_trips(trip_id);
CREATE INDEX idx_loading_trips_status ON loading_trips(status, submitted_at DESC);
CREATE INDEX idx_loading_trips_supervisor ON loading_trips(loading_supervisor_id, submitted_at DESC);
CREATE INDEX idx_loading_trips_departure ON loading_trips(departure_time);
