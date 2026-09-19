// Loading trip record. Defined here (the domain layer) so both the server
// modules and the shared State type can import it without cycles.
export type LoadingTrip = {
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

// ---------------------------------------------------------------------------
// Loading & Offloading Tracking System — pure domain logic.
// The Tree Translocation target always comes from the existing KPI system
// (settings.translocationTarget); nothing about quantities is hardcoded here.
// ---------------------------------------------------------------------------

/** Visible truck representation for a trip ID: uppercase, no separators. */
export function truckToken(truckNumber: string) {
  const token = truckNumber.toUpperCase().replaceAll(/[^A-Z0-9]/g, '');
  return token.length ? token.slice(0, 8) : 'TRUCK';
}

/**
 * Server-side trip ID: `XXXX-DD/MM-HH:MM-T<n>` in Asia/Riyadh civil time,
 * e.g. `1234-19/09-14:32-T1`. `<n>` comes from the caller's race-safe
 * sequence attempt (UNIQUE constraint on trip_id arbitrates collisions).
 */
export function buildTripId(
  truckNumber: string,
  departure: { datePart: string; timePart: string },
  sequence: number,
) {
  return `${truckToken(truckNumber)}-${departure.datePart}-${departure.timePart}-T${sequence}`;
}

export type LoadingSummary = {
  target: number;
  approved: number;
  pending: number;
  remaining: number;
};

/**
 * Approved-only math: pending trips NEVER reduce the remaining target.
 * remaining = target − approved (floored at 0).
 */
export function loadingSummary(target: number, trips: Pick<LoadingTrip, 'status' | 'treesLoaded'>[]): LoadingSummary {
  let approved = 0;
  let pending = 0;
  for (const trip of trips) {
    if (trip.status === 'APPROVED') approved += Number(trip.treesLoaded);
    else if (trip.status === 'PENDING') pending += Number(trip.treesLoaded);
  }
  return { target, approved, pending, remaining: Math.max(0, target - approved) };
}

/** Strip leading "T" so `-T2` sorts after `-T10` numerically when needed. */
export function tripSequenceOf(tripId: string) {
  const match = /-T(\d+)$/.exec(tripId);
  return match ? Number(match[1]) : 0;
}
