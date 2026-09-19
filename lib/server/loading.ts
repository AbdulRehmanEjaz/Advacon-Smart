import { z } from 'zod';
import { database, first, id, json, now, statement } from './d1';
import { admin, type Actor, HttpError } from './auth';
import {
  buildTripId,
  loadingSummary,
} from '../domain/loading';
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
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  submittedAt: string;
  approvedAt: string | null;
  approvedByName: string | null;
};

const tripSql = `SELECT
  t.id, t.trip_id AS tripId, t.loading_supervisor_id AS supervisorId,
  ls.name AS supervisorName, t.truck_number AS truckNumber,
  t.trees_loaded AS treesLoaded, t.departure_time AS departureTime,
  t.notes, t.status, t.submitted_at AS submittedAt,
  t.approved_at AS approvedAt, ru.name AS approvedByName
FROM loading_trips t
JOIN loading_supervisors ls ON ls.id = t.loading_supervisor_id
LEFT JOIN users ru ON ru.id = t.approved_by`;

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
    .prepare(`${tripSql} WHERE t.loading_supervisor_id=? ORDER BY t.submitted_at DESC`)
    .bind(user.id)
    .all<Row>();
  const trips = rows.results.map(tripFromRow);
  const target = await translocationTarget();
  return {
    user: {
      id: user.id,
      name: user.name,
      role: user.role,
    },
    target,
    summary: loadingSummary(target, trips),
    trips,
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

const reviewSchema = z.object({
  id: z.string(),
  decision: z.enum(['APPROVED', 'REJECTED']),
});

export async function reviewTrip(req: Request, user: Actor) {
  admin(user);
  const body: unknown = await req.json();
  const data = reviewSchema.parse(body);
  const row = await first<Row>('SELECT * FROM loading_trips WHERE id=?', data.id);
  if (!row) throw new HttpError(404, 'Trip not found.');
  const before = tripFromRow(row);
  if (before.status !== 'PENDING')
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
  await auditStatement(user, data.decision === 'APPROVED' ? 'TRIP_APPROVED' : 'TRIP_REJECTED', before.tripId, before, { status: data.decision });
  return { ok: true };
}
