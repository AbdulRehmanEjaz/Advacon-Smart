-- Soft-deletion metadata for loading trips.
--
-- Admin deletion never removes a trip row and never rewrites its status
-- (the status column carries a CHECK constraint that ALTER TABLE cannot
-- modify). Instead, deleted_at/deleted_by mark the row: every query that
-- serves trips computes status as
--   CASE WHEN deleted_at IS NOT NULL THEN 'DELETED' ELSE status END
-- so the admin history shows Status DELETED with Deleted By / Deleted At.
-- The row keeps its trip_id (still protected by the UNIQUE constraint, so
-- the global T sequence is never reused or renumbered). Allocation rows are
-- retained for history but excluded from the KPI engine by the
-- deleted_at IS NULL condition in the allocation query, so deleted trips
-- contribute nothing to Completed Trees, Remaining Trees, block progress
-- or overall progress.
ALTER TABLE loading_trips ADD COLUMN deleted_at TEXT;
ALTER TABLE loading_trips ADD COLUMN deleted_by TEXT REFERENCES users(id);
