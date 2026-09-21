import { z } from 'zod';
import { database, first, id, json, now, statement } from './d1';
import { admin, type Actor, HttpError } from './auth';
import { loadCore } from './service';
import {
  buildTripId,
  loadingSummary,
  LOADING_KPI_ACTIVITY,
  validateAllocations,
} from '../domain/loading';
import {
  calculateKpiProgress,
  readiness,
  targetFor,
} from '../domain/calculations';
import { riyadhDeparture } from '../domain/date';

type Row = Record<string, string | number | boolean | null>;

type TripRow = {
  id: string;
  tripId: string;
  supervisorId: string;
  supervisorName: string;
  truckNumber: string;
  treesLoaded: number;
  departureTime: string;
  notes: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'DELETED';
  submittedAt: string;
  approvedAt: string | null;
  approvedByName: string | null;
  deletedAt: string | null;
  deletedByName: string | null;
};

// The visible status folds the soft-delete marker into the status value:
// a trip with deleted_at set renders as DELETED while the raw status column
// (protected by an unalterable CHECK) keeps its original value.
const tripSql = `SELECT
  t.id, t.trip_id AS tripId, t.loading_supervisor_id AS supervisorId,
  ls.name AS supervisorName, t.truck_number AS truckNumber,
  t.trees_loaded AS treesLoaded, t.departure_time AS departureTime,
  t.notes, CASE WHEN t.deleted_at IS NOT NULL THEN 'DELETED' ELSE t.status END AS status,
  t.submitted_at AS submittedAt,
  t.approved_at AS approvedAt, ru.name AS approvedByName,
  t.deleted_at AS deletedAt, du.name AS deletedByName
FROM loading_trips t
JOIN loading_supervisors ls ON ls.id = t.loading_supervisor_id
LEFT JOIN users ru ON ru.id = t.approved_by
LEFT JOIN users du ON du.id = t.deleted_by`;

function tripFromRow(row: Record<string, unknown>): TripRow {
  return {
    id: String(row.id),
    tripId: String(row.tripId),
    supervisorId: String(row.supervisorId),
    supervisorName: String(row.supervisorName || ''),
    truckNumber: String(row.truckNumber || ''),
    treesLoaded: Number(row.treesLoaded),
    departureTime: String(row.departureTime || ''),
    notes: String(row.notes || ''),
    status: String(row.status) as TripRow['status'],
    submittedAt: String(row.submittedAt || ''),
    approvedAt: row.approvedAt == null ? null : String(row.approvedAt),
    approvedByName: row.approvedByName == null ? null : String(row.approvedByName),
    deletedAt: row.deletedAt == null ? null : String(row.deletedAt),
    deletedByName: row.deletedByName == null ? null : String(row.deletedByName),
  };
}

async function auditStatement(
  user: Actor,
  action: string,
  entityId: string,
  before: unknown,
  after: unknown,
) {
  await statement(
    `INSERT INTO audit_logs (id,user_id,role,action,entity_type,entity_id,before_json,after_json,created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    id(),
    user.id,
    user.role,
    action,
    'LoadingTrip',
    entityId,
    json(before),
    json(after),
    now(),
  ).run();
}

// The Tree Translocation target comes from the existing KPI system
// (project_settings.translocationTarget) — never hardcoded.
async function translocationTarget() {
  const row = await first<{ translocationTarget: number }>(
    `SELECT translocation_target AS translocationTarget
     FROM project_settings WHERE project_id='tree-project'`,
  );
  const target = Number(row?.translocationTarget ?? 0);
  if (!Number.isFinite(target) || target <= 0)
    throw new HttpError(503, 'Tree Translocation target is not configured.');
  return target;
}

// Re-validate the live account on every write (same defense as service.ts).
async function activeLoader(user: Actor) {
  const row = await first<Row>(
    `SELECT id,active,archived_at AS archivedAt,credential_version AS credentialVersion
     FROM loading_supervisors WHERE id=?`,
    user.id,
  );
  if (!row || !Number(row.active) || row.archivedAt ||
      Number(row.credentialVersion) !== user.credentialVersion)
    throw new HttpError(403, 'Your access has changed. Please sign in again.');
}

export async function loadingState(user: Actor) {
  if (user.role !== 'LOADING_SUPERVISOR')
    throw new HttpError(403, 'Loading Supervisor access required.');
  const rows = await database()
    .prepare(
      `${tripSql} WHERE t.loading_supervisor_id=? AND t.deleted_at IS NULL
       ORDER BY t.submitted_at DESC`,
    )
    .bind(user.id)
    .all<Row>();
  const trips = rows.results.map(tripFromRow);
  const target = await translocationTarget();
  // Any of the loader's trips were soft-deleted by an admin? Surfaced as a
  // flag (no quantities, no IDs leak beyond what the loader already owns).
  const deleted = await first<{ count: number }>(
    `SELECT COUNT(*) AS count FROM loading_trips
     WHERE loading_supervisor_id=? AND deleted_at IS NOT NULL`,
    user.id,
  );
  const deletedCount = Number(deleted?.count ?? 0);
  return {
    user: {
      id: user.id,
      name: user.name,
      role: user.role,
    },
    target,
    summary: loadingSummary(target, trips),
    trips,
    deletedTripsExcluded: deletedCount > 0,
  };
}

const truckNumber = z
  .string()
  .trim()
  .min(1)
  .max(24)
  .regex(/^[\w\s\-.]+$/, 'Use letters, numbers, spaces or dashes for the truck number.');
const notesSchema = z.string().trim().max(500).default('');

const tripSchema = z.object({
  truckNumber,
  treesLoaded: z.number().int().min(1).max(100000),
  notes: notesSchema,
});

// Departure time and trip ID are generated HERE, on the server, in
// Asia/Riyadh civil time. Client-supplied values are never trusted.
export async function createTrip(req: Request, user: Actor) {
  if (user.role !== 'LOADING_SUPERVISOR')
    throw new HttpError(403, 'Loading Supervisor access required.');
  const body: unknown = await req.json();
  const data = tripSchema.parse(body);
  await activeLoader(user);

  const departure = riyadhDeparture();
  const timestamp = now();
  // Race-safe sequence: try T1, T2, … — the UNIQUE constraint on trip_id
  // arbitrates, so two near-simultaneous submissions for the same truck and
  // minute can never receive the same trip number.
  for (let sequence = 1; sequence <= 50; sequence += 1) {
    const tripId = buildTripId(data.truckNumber, departure, sequence);
    try {
      await statement(
        `INSERT INTO loading_trips
         (id,trip_id,loading_supervisor_id,truck_number,trees_loaded,departure_time,
          notes,status,submitted_at,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,'PENDING',?,?,?)`,
        id(),
        tripId,
        user.id,
        data.truckNumber,
        data.treesLoaded,
        departure.iso,
        data.notes,
        timestamp,
        timestamp,
        timestamp,
      ).run();
      await auditStatement(user, 'TRIP_CREATED', tripId, undefined, {
        tripId,
        truckNumber: data.truckNumber,
        treesLoaded: data.treesLoaded,
        departureTime: departure.iso,
      });
      return { ok: true, tripId };
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message.includes('UNIQUE constraint failed') && message.includes('trip_id'))
        continue;
      throw error;
    }
  }
  throw new HttpError(409, 'Too many trips in the same minute. Try again shortly.');
}

// Rejection stays a single decision: no quantities move, so no allocation is
// needed. Approval REQUIRES the block allocation and lives in allocateTrip —
// a trip can never enter progress by a bare "approve" click.
const reviewSchema = z.object({
  id: z.string(),
  decision: z.literal('REJECTED'),
});

export async function reviewTrip(req: Request, user: Actor) {
  admin(user);
  const body: unknown = await req.json();
  const data = reviewSchema.parse(body);
  // Aliased select (tripSql) — tripFromRow expects camelCase keys; a bare
  // SELECT * returns snake_case and silently yields NaN quantities.
  const row = await first<Row>(`${tripSql} WHERE t.id=?`, data.id);
  if (!row) throw new HttpError(404, 'Trip not found.');
  const before = tripFromRow(row);
  if (!['PENDING', 'APPROVED'].includes(before.status))
    throw new HttpError(409, 'This trip has already been reviewed. Refresh the page.');
  const timestamp = now();
  await statement(
    `UPDATE loading_trips SET status=?,approved_at=?,approved_by=?,updated_at=?
     WHERE id=? AND status='PENDING'`,
    data.decision,
    timestamp,
    user.id,
    timestamp,
    data.id,
  ).run();
  await auditStatement(user, 'TRIP_REJECTED', before.tripId, before, { status: data.decision });
  return { ok: true };
}

const allocationSchema = z.object({
  id: z.string().min(1),
  allocations: z
    .array(
      z.object({
        blockId: z.string().min(1),
        quantity: z.number().int().min(1).max(100000),
      }),
    )
    .min(1)
    .max(50),
});

/**
 * Admin approval of a pending loading trip WITH its block allocation.
 *
 * Hard rules enforced here (never trusted from the client):
 *  1. Trip must still be PENDING.
 *  2. Allocations must sum EXACTLY to trees_loaded (no under/over assignment).
 *  3. Existing project controls apply: blocks must exist, not be on hold,
 *     have capacity for the assigned trees, and the existing Tree
 *     Translocation "Loading Activities" KPI must not be exceeded.
 *  4. Atomicity: one D1 batch flips the trip AND writes the allocation rows.
 *     The guarded UPDATE (… WHERE status='PENDING') is the race fence — a
 *     second admin's batch writes zero rows and fails safely with 409, so a
 *     trip can never be approved twice nor allocated twice.
 *  5. Progress impact: allocations (sum === trip quantity) feed the existing
 *     KPI engine exactly once; pending/rejected trips feed nothing.
 */
export async function allocateTrip(req: Request, user: Actor) {
  admin(user);
  const body: unknown = await req.json();
  const data = allocationSchema.parse(body);
  // Aliased select (tripSql) — see reviewTrip; treesLoaded must be a real
  // number or the exact-sum rule below would pass vacuously.
  const row = await first<Row>(`${tripSql} WHERE t.id=?`, data.id);
  if (!row) throw new HttpError(404, 'Trip not found.');
  const trip = tripFromRow(row);
  if (trip.status !== 'PENDING')
    throw new HttpError(409, 'This trip has already been reviewed. Refresh the page.');

  const allocationError = validateAllocations(trip.treesLoaded, data.allocations);
  if (allocationError) throw new HttpError(400, allocationError);

  const core = await loadCore();
  for (const allocation of data.allocations) {
    const block = core.blocks.find((item) => item.id === allocation.blockId);
    if (!block) throw new HttpError(400, `Block ${allocation.blockId} does not exist.`);
    if (block.hold)
      throw new HttpError(400, `Block ${block.id} is on administrative hold — release it before assigning trees.`);
    const blockState = readiness(block, core.submissions, core.loadingAllocations);
    if (blockState.remaining != null && allocation.quantity > blockState.remaining)
      throw new HttpError(
        400,
        `Block ${block.id} has only ${Math.max(0, blockState.remaining)} tree slots remaining.`,
      );
  }
  const activity = core.packages
    .flatMap((workPackage) => workPackage.activities)
    .find((candidate) => candidate.id === LOADING_KPI_ACTIVITY);
  if (activity) {
    const official = calculateKpiProgress(
      core.packages,
      core.openingBalances,
      core.submissions,
      core.settings,
      undefined,
      core.loadingAllocations,
    );
    const target = targetFor(activity, core.settings) || 100;
    const current = official.totals[LOADING_KPI_ACTIVITY] || 0;
    if (current + trip.treesLoaded > target + 0.000001)
      throw new HttpError(
        400,
        `${activity.name} has only ${Math.max(0, target - current).toLocaleString()} ${activity.unit} remaining.`,
      );
  }

  const timestamp = now();
  const results = await database().batch([
    statement(
      `UPDATE loading_trips SET status='APPROVED',approved_at=?,approved_by=?,updated_at=?
       WHERE id=? AND status='PENDING'`,
      timestamp,
      user.id,
      timestamp,
      data.id,
    ),
    ...data.allocations.map((allocation) =>
      statement(
        `INSERT INTO loading_trip_block_allocations
         (id,loading_trip_id,block_id,quantity,created_by,created_at)
         SELECT ?, t.id, ?, ?, ?, ? FROM loading_trips t
         WHERE t.id=? AND t.approved_by=? AND t.approved_at=?`,
        id(),
        allocation.blockId,
        allocation.quantity,
        user.id,
        timestamp,
        data.id,
        user.id,
        timestamp,
      )),
  ]);
  const updateChanges = Number(results[0].meta?.changes ?? 0);
  const allocationChanges = results
    .slice(1)
    .reduce((sum, result) => sum + Number(result.meta?.changes ?? 0), 0);
  if (updateChanges === 0 || allocationChanges !== data.allocations.length)
    throw new HttpError(
      409,
      'This trip was just reviewed by another administrator. Refresh the page.',
    );

  await auditStatement(user, 'TRIP_APPROVED', trip.tripId, trip, {
    status: 'APPROVED',
    treesLoaded: trip.treesLoaded,
    allocations: data.allocations,
    approvedAt: timestamp,
  });
  return { ok: true };
}

/**
 * Admin soft-delete of a loading trip. The row is never removed: it is marked
 * DELETED (with who/when) and stays visible in the admin history, but the
 * KPI/progress engine counts allocations only from APPROVED trips, so a
 * deleted trip (even one approved earlier) drops out of Completed Trees,
 * Remaining Trees, block progress and overall progress immediately. Its
 * trip_id remains taken (UNIQUE), so the global T sequence simply continues —
 * deleted IDs are never reused or renumbered.
 */
const deleteSchema = z.object({ id: z.string().min(1) });

export async function tripDelete(req: Request, user: Actor) {
  admin(user);
  const body: unknown = await req.json();
  const data = deleteSchema.parse(body);
  // Aliased select (tripSql) — see reviewTrip; identity fields must be real.
  const row = await first<Row>(`${tripSql} WHERE t.id=?`, data.id);
  if (!row) throw new HttpError(404, 'Trip not found.');
  const before = tripFromRow(row);
  if (!['PENDING', 'APPROVED'].includes(before.status))
    throw new HttpError(409, 'This trip has already been deleted. Refresh the page.');
  const timestamp = now();
  const results = await database().batch([
    statement(
      `UPDATE loading_trips SET deleted_at=?,deleted_by=?,updated_at=?
       WHERE id=? AND deleted_at IS NULL AND status IN ('PENDING','APPROVED')`,
      timestamp,
      user.id,
      timestamp,
      data.id,
    ),
  ]);
  if (Number(results[0].meta?.changes ?? 0) === 0)
    throw new HttpError(
      409,
      'This trip was just reviewed or deleted by another administrator. Refresh the page.',
    );
  await auditStatement(user, 'TRIP_DELETED', before.tripId, before, {
    status: 'DELETED',
    treesLoaded: before.treesLoaded,
    deletedAt: timestamp,
  });
  return { ok: true };
}
