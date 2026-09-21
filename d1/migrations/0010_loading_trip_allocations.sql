-- ============================================================
-- 0010 — Loading trip block allocations
-- Forward-only and purely additive: one new table + indexes.
-- No existing table is rebuilt, dropped or altered.
--
-- Model (per the approved design): ONE loading trip is the source
-- transaction; its block allocation rows DISTRIBUTE the same
-- quantity. Sum(allocations.quantity) === loading_trips.trees_loaded
-- is enforced by the approval endpoint (never by a trigger), so the
-- KPI engine can add the allocations once — no double counting.
-- Rows are only written inside the same atomic batch that flips the
-- trip PENDING -> APPROVED, so every allocation belongs to an
-- approved trip by construction and pending/rejected trips can
-- never contribute progress.
-- ============================================================

CREATE TABLE loading_trip_block_allocations (
  id TEXT PRIMARY KEY,
  loading_trip_id TEXT NOT NULL REFERENCES loading_trips(id) ON DELETE RESTRICT,
  block_id TEXT NOT NULL REFERENCES blocks(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (loading_trip_id, block_id)
);

CREATE INDEX idx_loading_allocations_trip ON loading_trip_block_allocations(loading_trip_id);
CREATE INDEX idx_loading_allocations_block ON loading_trip_block_allocations(block_id);
