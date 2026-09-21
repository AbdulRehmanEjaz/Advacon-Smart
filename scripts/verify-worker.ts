import assert from 'node:assert/strict';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { approvedTotals, calculateKpiProgress } from '../lib/domain/calculations';
import { baselineSql } from '../lib/server/d1-baseline';
import { createCredential } from '../lib/server/credentials';
import { riyadhDate } from '../lib/domain/date';
import { unzipSync, strFromU8 } from 'fflate';

const root = fileURLToPath(new URL('../dist/server/', import.meta.url));
const config = JSON.parse(
  await readFile(resolve(root, 'wrangler.json'), 'utf8'),
) as {
  main: string;
  compatibility_date: string;
  compatibility_flags: string[];
  d1_databases: { binding: string }[];
};
assert.ok(config.d1_databases.some((binding) => binding.binding === 'DB'));
const names = (await readdir(root, { recursive: true })).filter((name) =>
  /\.(js|mjs|wasm)$/.test(name),
);
const modules = [config.main, ...names.filter((name) => name !== config.main)].map(
  (name) => ({
    type: name.endsWith('.wasm')
      ? ('CompiledWasm' as const)
      : ('ESModule' as const),
    path: resolve(root, name),
  }),
);
// Local test harness ONLY. These PINs never deploy: production secrets are
// set separately on the Worker. LOADING_PIN bootstraps the local initial-loader
// account exactly like the other roles.
const loginBindings = {
  SESSION_SECRET: 'disposable-worker-test-secret-not-for-production',
  ADMIN_PIN: '012',
  SUPERVISOR_PIN: '345',
  // Must not collide with any PIN the harness itself hands to accounts (e.g.
  // the supervisor test rotates away from '678' and expects that PIN to die):
  // the legacy bootstrap fallback would otherwise sign it in as the viewer.
  VIEWER_PIN: '560',
  LOADING_PIN: '747',
};
// The harness rotates a loader credential directly through D1 below;
// createCredential() needs the same secret the worker receives.
process.env.SESSION_SECRET = loginBindings.SESSION_SECRET;
const persistence = await mkdtemp(join(tmpdir(), 'tree-control-d1-'));
function runtime() {
  return new Miniflare(
    convertV4MiniflareOptions({
      resourcePersistencePath: persistence,
      workers: [
        {
          modulesRoot: root,
          modules,
          compatibilityDate: config.compatibility_date,
          compatibilityFlags: config.compatibility_flags,
          bindings: loginBindings,
          d1Databases: ['DB'],
        },
      ],
    }),
  );
}

const origin = 'https://swiftops.test';
function offsetRiyadhDate(days: number) {
  const value = new Date(`${riyadhDate()}T12:00:00+03:00`);
  value.setUTCDate(value.getUTCDate() + days);
  return riyadhDate(value);
}
type State = {
  user: { id: string; role: string };
  submissions: import('../lib/domain/calculations').Submission[];
  blocks: unknown[];
  packages: import('../lib/domain/baseline').PackageDefinition[];
  openingBalances: import('../lib/domain/calculations').OpeningBalance[];
  settings: import('../lib/domain/baseline').Settings;
  users?: { id: string; name: string }[];
  inspections?: { number: string }[];
  loadingTrips?: { id: string; tripId: string; status: string; treesLoaded: number }[];
  loadingAllocations?: { loadingTripId: string; tripId: string; blockId: string; quantity: number }[];
};
async function login(fetcher: typeof fetch, pin: string, ip = `test-${pin}`) {
  const started = performance.now();
  const response = await fetcher(origin + '/api/login', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json', 'cf-connecting-ip': ip },
    body: JSON.stringify({ pin }),
  });
  assert.equal(response.status, 200);
  const cookie = (response.headers.get('set-cookie') || '').split(';')[0];
  assert.match(cookie, /^tree_session=/);
  return { cookie, milliseconds: performance.now() - started };
}
async function loginResponse(fetcher: typeof fetch, pin: string, ip: string) {
  return fetcher(origin + '/api/login', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json', 'cf-connecting-ip': ip },
    body: JSON.stringify({ pin }),
  });
}
async function post(
  fetcher: typeof fetch,
  path: string,
  body: unknown,
  cookie: string,
) {
  return fetcher(origin + '/api/' + path, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify(body),
  });
}
async function state(fetcher: typeof fetch, cookie: string, suffix = '') {
  const response = await fetcher(origin + '/api/state' + suffix, {
    headers: { Cookie: cookie },
  });
  if (response.status !== 200)
    throw new Error(`State request failed (${response.status}): ${await response.text()}`);
  return (await response.json()) as State;
}

const SQL_SINGLE_QUOTE = String.fromCharCode(39);
const SQL_NEWLINE = String.fromCharCode(10);
const SQL_CARRIAGE = String.fromCharCode(13);

function stripSqlComments(sql: string): string {
  const physicalLines = sql
    .split(SQL_CARRIAGE + SQL_NEWLINE)
    .flatMap((part) => part.split(SQL_NEWLINE));
  const codeLines: string[] = [];
  for (const line of physicalLines) {
    if (line.trimStart().startsWith('--')) continue;
    const inline = line.indexOf(' --');
    codeLines.push(inline >= 0 ? line.slice(0, inline) : line);
  }
  return codeLines.join(SQL_NEWLINE);
}

/** Split migration SQL on semicolons outside single-quoted literals. */
function splitSqlStatements(sql: string): string[] {
  const cleaned = stripSqlComments(sql);
  const statements: string[] = [];
  let current = '';
  let inString = false;
  for (const char of cleaned) {
    if (char === SQL_SINGLE_QUOTE) inString = !inString;
    if (char === ';' && !inString) {
      if (current.trim()) statements.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

type ExecD1 = { exec: (sql: string) => Promise<unknown> };

/** D1 exec() runs one query per line, so statements must be single-line. */
function flattenStatement(sql: string): string {
  return sql
    .split(SQL_CARRIAGE + SQL_NEWLINE)
    .join(' ')
    .split(SQL_NEWLINE)
    .join(' ');
}

async function execSqlFile(d1: ExecD1, url: URL): Promise<void> {
  for (const statement of splitSqlStatements(await readFile(url, 'utf8'))) {
    await d1.exec(flattenStatement(statement));
  }
}
let worker = runtime();
try {
  const d1 = await worker.getD1Database('DB');
  await d1.exec(
    (
      await readFile(
        new URL('../d1/migrations/0001_initial.sql', import.meta.url),
        'utf8',
      )
    ).replace(/\s*\r?\n\s*/g, ' '),
  );
  await d1.exec(
    (
      await readFile(
        new URL('../d1/migrations/0002_approved_kpi_system.sql', import.meta.url),
        'utf8',
      )
    ).replace(/\s*\r?\n\s*/g, ' '),
  );
  await d1.exec(baselineSql('2026-09-03T00:00:00.000Z'));
  await d1.prepare(`INSERT INTO daily_submissions
    (id,request_key,supervisor_id,work_date,block_id,package_id,remarks,status,version,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).bind(
      'migration-preservation', 'migration-preservation', 'initial-foreman',
      '2026-09-03', 'A01', 'irrigation', 'Preserve me', 'WAITING', 1,
      '2026-09-03', '2026-09-03',
    ).run();
  await d1.exec(
    (
      await readFile(
        new URL('../d1/migrations/0003_auth_and_optional_blocks.sql', import.meta.url),
        'utf8',
      )
    ).replace(/\s*\r?\n\s*/g, ' '),
  );
  await d1.exec(
    (
      await readFile(
        new URL('../d1/migrations/0004_timesheet_attendance.sql', import.meta.url),
        'utf8',
      )
    ).replace(/\s*\r?\n\s*/g, ' '),
  );
  await d1.exec(
    (
      await readFile(
        new URL('../d1/migrations/0005_update_irrigation_trenching_kpi.sql', import.meta.url),
        'utf8',
      )
    ).replace(/\s*\r?\n\s*/g, ' '),
  );
  await d1.exec(
    (
      await readFile(
        new URL('../d1/migrations/0006_cost_control.sql', import.meta.url),
        'utf8',
      )
    ).replace(/\s*\r?\n\s*/g, ' '),
  );
  await d1.prepare(`INSERT INTO invoice_po_records
    (id,record_date,vat_status,invoice_no,po_no,entered_amount_halalas,net_amount_halalas,
     vat_removed_halalas,description,active,created_by,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,1,?,?,?)`).bind(
      'legacy-po', riyadhDate(), 'NON_VAT', null, 'LEGACY-PO', 25_000, 25_000,
      0, 'Preserved migration record', 'initial-admin', riyadhDate(), riyadhDate(),
    ).run();
  await d1.exec(
    (
      await readFile(
        new URL('../d1/migrations/0007_split_invoices_pos.sql', import.meta.url),
        'utf8',
      )
    ).replace(/\s*\r?\n\s*/g, ' '),
  );
  await execSqlFile(d1, new URL('../d1/migrations/0008_viewer_accounts.sql', import.meta.url));
  await execSqlFile(d1, new URL('../d1/migrations/0009_loading_supervisors.sql', import.meta.url));
  await execSqlFile(d1, new URL('../d1/migrations/0010_loading_trip_allocations.sql', import.meta.url));
  assert.equal(
    (await d1.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name IN ('loading_supervisors','loading_trips','loading_trip_block_allocations','viewer_accounts')").first<{ count: number }>())?.count,
    4,
  );
  assert.equal(
    (await d1.prepare("SELECT COUNT(*) AS count FROM invoice_po_records WHERE id='legacy-po'").first<{ count: number }>())?.count,
    1,
  );
  assert.equal(
    (await d1.prepare("SELECT COUNT(*) AS count FROM daily_submissions WHERE id='migration-preservation'").first<{ count: number }>())?.count,
    1,
  );
  await d1.prepare("DELETE FROM daily_submissions WHERE id='migration-preservation'").run();
  await d1.exec(baselineSql('2026-09-03T00:00:00.000Z'));
  await d1.exec(baselineSql('2026-09-03T00:00:00.000Z'));
  await d1.prepare("UPDATE users SET pin_salt='cGFydGlhbA==',pin_hash=NULL WHERE id='initial-admin'").run();
  await d1.prepare("UPDATE users SET pin_salt=NULL,pin_hash='cGFydGlhbA==' WHERE id='initial-foreman'").run();

  const fetcher = worker.dispatchFetch.bind(worker) as unknown as typeof fetch;
  assert.equal((await fetcher(origin + '/')).status, 200);
  assert.equal((await fetcher(origin + '/design-preview')).status, 404);
  assert.equal((await fetcher(origin + '/api/state')).status, 401);
  assert.equal((await post(fetcher, 'login', { pin: '999' }, '')).status, 401);

  const admin = await login(fetcher, '012');
  const supervisor = await login(fetcher, '345');
  const snapshotStarted = performance.now();
  let adminState = await state(fetcher, admin.cookie);
  const snapshotMs = performance.now() - snapshotStarted;
  assert.equal(adminState.user.role, 'ADMIN');
  assert.equal(adminState.blocks.length, 19);
  assert.equal(adminState.packages.length, 7);
  assert.equal(adminState.packages.flatMap((item) => item.activities).length, 23);
  const trenching = adminState.packages
    .flatMap((item) => item.activities)
    .find((item) => item.id === 'kpi-irrigation-trenching');
  assert.equal(trenching?.name, 'Trenching & Excavation');
  assert.equal(trenching?.target, 1070);
  assert.equal(trenching?.weight, 4);
  assert.equal(adminState.openingBalances.filter((item) =>
    adminState.packages.flatMap((group) => group.activities).some((activity) => activity.id === item.activityId),
  ).length, 23);
  assert.equal(adminState.submissions.length, 0);
  assert.equal(
    Object.keys(adminState.users?.[0] || {}).some((key) =>
      ['pin', 'pinHash', 'pinSalt', 'pinLookup'].includes(key),
    ),
    false,
  );
  assert.equal((await state(fetcher, supervisor.cookie)).user.role, 'FOREMAN');

  // ------------------------------------------------------------------
  // Loading Supervisor flow (migrations 0008+0009 applied above).
  // LOADING_PIN=747 is a LOCAL TEST binding - never a production secret.
  // ------------------------------------------------------------------
  // The loader signs in on the SHARED /api/login - his PIN is just another
  // role there (mirrors the viewer PIN flow; no separate login page).
  async function loadingLoginRequest(pin: string, ip: string) {
    return fetcher(origin + '/api/login', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json', 'cf-connecting-ip': ip },
      body: JSON.stringify({ pin }),
    });
  }
  // 7. Wrong PIN returns 401 (distinct test IP so the limiter stays isolated).
  assert.equal((await loadingLoginRequest('999', 'loader-wrong')).status, 401);
  // 1/2. Correct bootstrap PIN logs in and sets the session cookie.
  const loaderResponse = await loadingLoginRequest('747', 'loader-main');
  assert.equal(loaderResponse.status, 200, await loaderResponse.clone().text());
  const loaderCookie = (loaderResponse.headers.get('set-cookie') || '').split(';')[0];
  assert.match(loaderCookie, /^tree_session=/);
  // F. Browser-facing flow proof: cookie from Set-Cookie authenticates /api/loading-state.
  const loaderStateResponse = await fetcher(origin + '/api/loading-state', {
    headers: { Cookie: loaderCookie },
  });
  assert.equal(loaderStateResponse.status, 200);
  const loaderState = (await loaderStateResponse.json()) as {
    user: { id: string; role: string; name: string };
    target: number;
    summary: { target: number; approved: number; pending: number; remaining: number };
    trips: { id: string; tripId: string; status: string; treesLoaded: number }[];
  };
  assert.equal(loaderState.user.role, 'LOADING_SUPERVISOR');
  assert.equal(loaderState.user.id, 'initial-loader');
  // 3. State carries the live KPI target and approved-only math.
  assert.equal(loaderState.target, 10000);
  assert.deepEqual(loaderState.summary, { target: 10000, approved: 0, pending: 0, remaining: 10000 });
  // 4. /loading page opens with the session cookie.
  assert.equal((await fetcher(origin + '/loading', { headers: { Cookie: loaderCookie } })).status, 200);
  // 5. Loader cannot read the main workspace state.
  assert.equal((await fetcher(origin + '/api/state?view=dashboard', { headers: { Cookie: loaderCookie } })).status, 403);
  // 6. Loader cannot hit admin mutations (trip review is admin-only).
  assert.equal((await post(fetcher, 'trip-review', { id: 'nope', decision: 'APPROVED' }, loaderCookie)).status, 403);
  assert.equal((await post(fetcher, 'review', { id: 'nope', version: 1, decision: 'APPROVED', comment: '' }, loaderCookie)).status, 403);
  // 10. Trip creation works; departure and trip ID are server-generated.
  const tripResponse = await post(fetcher, 'loading-trip', {
    truckNumber: '1234', treesLoaded: 250, notes: 'smoke trip',
  }, loaderCookie);
  assert.equal(tripResponse.status, 200, await tripResponse.clone().text());
  const trip = (await tripResponse.json()) as { tripId: string };
  // 11. Trip ID format: TOKEN-DD/MM-HH:MM-T1 (Riyadh civil time, sequence 1).
  assert.match(trip.tripId, /^1234-\d{2}\/\d{2}-\d{2}:\d{2}-T1$/);
  // 12. Pending trip appears in loading state.
  const withTrip = await (await fetcher(origin + '/api/loading-state', { headers: { Cookie: loaderCookie } })).json() as typeof loaderState;
  assert.equal(withTrip.trips.length, 1);
  assert.equal(withTrip.trips[0].status, 'PENDING');
  assert.equal(withTrip.trips[0].tripId, trip.tripId);
  // 13. Pending trip does NOT reduce the remaining target.
  assert.deepEqual(withTrip.summary, { target: 10000, approved: 0, pending: 250, remaining: 10000 });
  // Zero/negative quantities are rejected server-side.
  assert.equal((await post(fetcher, 'loading-trip', { truckNumber: '1234', treesLoaded: 0 }, loaderCookie)).status, 400);
  // 9/8. Rate limiting: five bad attempts on one IP trip the 15-minute block,
  // the correct PIN then reports throttled too, and a different IP is unaffected.
  for (let attempt = 0; attempt < 5; attempt += 1)
    assert.equal((await loadingLoginRequest('111', 'loader-limited')).status, 401);
  const throttled = await loadingLoginRequest('747', 'loader-limited');
  // The shared login endpoint deliberately returns the same generic message
  // for throttled and wrong-PIN (no lockout enumeration); the limiter itself
  // is proven by the clean-IP control right below.
  assert.equal(throttled.status, 401);
  assert.equal(((await throttled.json()) as { error: string }).error.includes('Access could not be verified'), true);
  // 8. A correct PIN still works from a clean IP after the failed attempts.
  assert.equal((await loadingLoginRequest('747', 'loader-clean')).status, 200);
  // Loader credential rotation (admin PIN management ships later): rotating
  // the stored credential must invalidate the old session and the old PIN,
  // and the new PIN must authenticate - the same contract supervisors and
  // viewers follow via the admin PIN-change endpoints.
  const rotatedCredential = await createCredential('848');
  await d1.prepare(
    'UPDATE loading_supervisors SET pin_lookup=?,pin_salt=?,pin_hash=?,credential_version=credential_version+1 WHERE id=?',
  ).bind(
    rotatedCredential.pinLookup,
    rotatedCredential.pinSalt,
    rotatedCredential.pinHash,
    'initial-loader',
  ).run();
  assert.equal((await fetcher(origin + '/api/loading-state', { headers: { Cookie: loaderCookie } })).status, 401);
  assert.equal((await loadingLoginRequest('747', 'loader-rotated')).status, 401);
  const rotatedLogin = await loadingLoginRequest('848', 'loader-rotated');
  assert.equal(rotatedLogin.status, 200, await rotatedLogin.clone().text());
  const rotatedCookie = (rotatedLogin.headers.get('set-cookie') || '').split(';')[0];
  assert.equal((await fetcher(origin + '/api/loading-state', { headers: { Cookie: rotatedCookie } })).status, 200);

  // ------------------------------------------------------------------
  // Admin Review & Assign: one pending trip + block allocations.
  // Hard rules: exact-sum, atomic, single-count. Scenarios TEST 1-9.
  // ------------------------------------------------------------------
  async function fetchAdminState() {
    const res = await fetcher(origin + '/api/state?view=approvals', { headers: { Cookie: admin.cookie } });
    assert.equal(res.status, 200, await res.clone().text());
    return (await res.json()) as { loadingTrips?: { id: string; tripId: string; status: string; treesLoaded: number }[]; loadingAllocations?: { loadingTripId: string; blockId: string; quantity: number }[] };
  }
  // Locate the pending smoke trip created by the loader flow above.
  const pendingTrip = (await fetchAdminState()).loadingTrips?.find((trip) => trip.status === 'PENDING');
  assert.ok(pendingTrip, 'pending loading trip should be visible in admin state');
  assert.equal(pendingTrip!.treesLoaded, 250);
  // TEST 4/5: under- and over-assignment are rejected; the trip stays PENDING
  // and nothing moves anywhere.
  assert.equal((await post(fetcher, 'trip-allocate', { id: pendingTrip!.id, allocations: [{ blockId: 'A01', quantity: 70 }, { blockId: 'A02', quantity: 20 }] }, admin.cookie)).status, 400);
  assert.equal((await post(fetcher, 'trip-allocate', { id: pendingTrip!.id, allocations: [{ blockId: 'A01', quantity: 300 }] }, admin.cookie)).status, 400);
  assert.equal((await fetchAdminState()).loadingTrips?.find((t) => t.id === pendingTrip!.id)?.status, 'PENDING');
  // Loader math is untouched by failed attempts: remaining stays 10000.
  assert.deepEqual(
    ((await (await fetcher(origin + '/api/loading-state', { headers: { Cookie: rotatedCookie } })).json()) as typeof loaderState).summary,
    { target: 10000, approved: 0, pending: 250, remaining: 10000 },
  );
  // TEST 2: exact split 70+30 = 250 must not be accepted — allocations must
  // match THIS trip's 250 trees exactly, proving the rule binds to the trip.
  assert.equal((await post(fetcher, 'trip-allocate', { id: pendingTrip!.id, allocations: [{ blockId: 'A01', quantity: 70 }, { blockId: 'A02', quantity: 30 }] }, admin.cookie)).status, 400);
  // TEST 1: full assignment to one block → approval succeeds.
  const allocateResponse = await post(fetcher, 'trip-allocate', { id: pendingTrip!.id, allocations: [{ blockId: 'A01', quantity: 250 }] }, admin.cookie);
  assert.equal(allocateResponse.status, 200, await allocateResponse.clone().text());
  const approvedState = await fetchAdminState();
  const approvedTrip = approvedState.loadingTrips?.find((t) => t.id === pendingTrip!.id);
  assert.equal(approvedTrip?.status, 'APPROVED');
  const tripAllocations = approvedState.loadingAllocations?.filter(
    (item) => item.loadingTripId === pendingTrip!.id,
  );
  assert.deepEqual(
    tripAllocations?.map(({ blockId, quantity }) => ({ blockId, quantity })),
    [{ blockId: 'A01', quantity: 250 }],
  );
  assert.ok(tripAllocations?.every((item) => (item as { tripId?: string }).tripId === pendingTrip!.tripId));
  // Overall KPI contribution counted exactly once through allocations.
  // The engine runs client-side over raw state, so recompute it here with the
  // same authoritative domain function the UI uses.
  const kpiAdmin = await state(fetcher, admin.cookie, '?view=dashboard');
  const translocationKpi = calculateKpiProgress(
    kpiAdmin.packages,
    kpiAdmin.openingBalances,
    kpiAdmin.submissions,
    kpiAdmin.settings!,
    undefined,
    (kpiAdmin.loadingAllocations || []).map((entry) => ({ blockId: entry.blockId, quantity: entry.quantity })),
  ).work.find((work) => work.id === 'translocation');
  assert.ok(translocationKpi, 'translocation package must exist');
  assert.equal(translocationKpi!.progress > 0, true, 'approved allocation must feed overall progress');
  // TEST 6: the approved 250 now reduce the loader's remaining target.
  assert.deepEqual(
    ((await (await fetcher(origin + '/api/loading-state', { headers: { Cookie: rotatedCookie } })).json()) as typeof loaderState).summary,
    { target: 10000, approved: 250, pending: 0, remaining: 9750 },
  );
  // TEST 8: approving the same trip again fails safely — no double counting.
  const double = await post(fetcher, 'trip-allocate', { id: pendingTrip!.id, allocations: [{ blockId: 'A02', quantity: 250 }] }, admin.cookie);
  assert.equal(double.status, 409);
  assert.equal((await fetchAdminState()).loadingAllocations?.filter((item) => item.loadingTripId === pendingTrip!.id).length, 1);
  // Loader cannot approve/allocate or touch admin endpoints.
  assert.equal((await post(fetcher, 'trip-allocate', { id: 'x', allocations: [{ blockId: 'A01', quantity: 1 }] }, rotatedCookie)).status, 403);
  assert.equal((await fetcher(origin + '/api/state?view=translocation', { headers: { Cookie: rotatedCookie } })).status, 403);

    assert.equal((await fetcher(origin + '/api/state?view=timesheet', { headers: { Cookie: supervisor.cookie } })).status, 403);
  assert.equal((await fetcher(origin + '/api/state?view=timesheet&detail=1', { headers: { Cookie: supervisor.cookie } })).status, 403);
  const labourResponse = await post(fetcher, 'manpower', {
    action: 'save', code: 'LAB-001', name: 'Worker One', company: 'Site Services',
  }, admin.cookie);
  assert.equal(labourResponse.status, 200, await labourResponse.clone().text());
  const labourId = ((await labourResponse.json()) as { id: string }).id;
  assert.equal((await post(fetcher, 'manpower', {
    action: 'save', code: 'LAB-001', name: 'Duplicate Worker', company: 'Site Services',
  }, admin.cookie)).status, 409);
  const equipmentResponse = await post(fetcher, 'equipment', {
    action: 'save', code: 'EX-01', name: 'Excavator', company: 'Plant Rental', dailyRateHalalas: 85000,
  }, admin.cookie);
  assert.equal(equipmentResponse.status, 200, await equipmentResponse.clone().text());
  const equipmentId = ((await equipmentResponse.json()) as { id: string }).id;
  assert.equal((await post(fetcher, 'equipment', {
    action: 'save', id: equipmentId, code: 'EX-01', name: 'Excavator', company: 'Plant Rental', dailyRateHalalas: 90000,
  }, admin.cookie)).status, 200);
  assert.equal((await post(fetcher, 'attendance', {
    kind: 'manpower', date: riyadhDate(), entries: [{ resourceId: labourId, status: 'P' }],
  }, supervisor.cookie)).status, 403);
  assert.equal((await post(fetcher, 'attendance', {
    kind: 'manpower', date: offsetRiyadhDate(1), entries: [{ resourceId: labourId, status: 'P' }],
  }, admin.cookie)).status, 400);
  assert.equal((await post(fetcher, 'attendance', {
    kind: 'manpower', date: riyadhDate(), entries: [{ resourceId: labourId, status: 'INVALID' }],
  }, admin.cookie)).status, 400);
  for (const attendanceDate of [offsetRiyadhDate(-1), riyadhDate()]) {
    assert.equal((await post(fetcher, 'attendance', {
      kind: 'manpower', date: attendanceDate, entries: [{ resourceId: labourId, status: 'P' }],
    }, admin.cookie)).status, 200);
  }
  assert.equal((await post(fetcher, 'attendance', {
    kind: 'manpower', date: riyadhDate(), entries: [{ resourceId: labourId, status: 'A' }],
  }, admin.cookie)).status, 200);
  assert.equal((await post(fetcher, 'attendance', {
    kind: 'equipment', date: riyadhDate(), entries: [{ resourceId: equipmentId, status: 'P' }],
  }, admin.cookie)).status, 200);
  const attendanceDetail = await state(fetcher, admin.cookie, '?view=timesheet');
  const attendanceData = attendanceDetail as State & {
    manpower: { id: string; dailyRateHalalas: number }[];
    equipment: { id: string; dailyRateHalalas: number }[];
    manpowerAttendance: { resourceId: string; date: string; status: string }[];
  };
  assert.equal(attendanceData.manpower.find((item) => item.id === labourId)?.dailyRateHalalas, 13000);
  assert.equal(attendanceData.equipment.find((item) => item.id === equipmentId)?.dailyRateHalalas, 90000);
  assert.equal(attendanceData.manpowerAttendance.filter((item) => item.resourceId === labourId && item.date === riyadhDate()).length, 1);
  assert.equal(attendanceData.manpowerAttendance.find((item) => item.resourceId === labourId && item.date === riyadhDate())?.status, 'A');

  assert.equal((await fetcher(origin + '/api/state?view=cost-control', {
    headers: { Cookie: supervisor.cookie },
  })).status, 403);
  assert.equal((await post(fetcher, 'fuel', {
    action: 'save', date: riyadhDate(), fuelType: 'DIESEL', quantityMillilitres: 10_000,
    vatStatus: 'NON_VAT', enteredAmountHalalas: 10_000, description: '',
  }, supervisor.cookie)).status, 403);
  assert.equal((await post(fetcher, 'fuel', {
    action: 'save', date: offsetRiyadhDate(1), fuelType: 'DIESEL', quantityMillilitres: 10_000,
    vatStatus: 'NON_VAT', enteredAmountHalalas: 10_000, description: '',
  }, admin.cookie)).status, 400);
  assert.equal((await post(fetcher, 'fuel', {
    action: 'save', date: riyadhDate(), fuelType: 'DIESEL', quantityMillilitres: 10_000,
    vatStatus: 'VAT_INCLUDED', enteredAmountHalalas: 115_000, description: 'Generator fuel',
  }, admin.cookie)).status, 200);
  assert.equal((await post(fetcher, 'invoice-po', {
    action: 'save', recordType: 'INVOICE', date: riyadhDate(), vatStatus: 'NON_VAT',
    invoiceNo: 'INV-001', poNo: '', paidBy: 'Project Office',
    enteredAmountHalalas: 1_000_000, description: 'Site services',
  }, admin.cookie)).status, 200);
  assert.equal((await post(fetcher, 'invoice-po', {
    action: 'save', recordType: 'PO', date: riyadhDate(), vatStatus: 'VAT_INCLUDED',
    invoiceNo: 'INV-002', poNo: 'PO-001', paidBy: 'Procurement',
    enteredAmountHalalas: 1_150_000, description: 'Plant order',
  }, admin.cookie)).status, 200);
  assert.equal((await post(fetcher, 'invoice-po', {
    action: 'save', recordType: 'PO', date: riyadhDate(), vatStatus: 'NON_VAT',
    invoiceNo: 'INV-003', poNo: '', paidBy: 'Procurement',
    enteredAmountHalalas: 100_000, description: '',
  }, admin.cookie)).status, 400);
  const costResponse = await fetcher(origin + '/api/state?view=cost-control', {
    headers: { Cookie: admin.cookie },
  });
  assert.equal(costResponse.status, 200);
  const dashboardCosts = await fetcher(origin + '/api/state?view=dashboard', { headers: { Cookie: admin.cookie } });
  assert.equal(dashboardCosts.status, 200);
  assert.ok(Array.isArray(((await dashboardCosts.json()) as { fuelRecords: unknown[] }).fuelRecords));
  assert.equal((await fetcher(origin + '/api/state?view=cost-records', { headers: { Cookie: supervisor.cookie } })).status, 403);
  const managementCosts = await fetcher(origin + '/api/state?view=cost-records', { headers: { Cookie: admin.cookie } });
  assert.equal(managementCosts.status, 200);
  assert.ok(Array.isArray(((await managementCosts.json()) as { invoicePoRecords: unknown[] }).invoicePoRecords));
  const costData = await costResponse.json() as {
    fuelRecords: { enteredAmountHalalas: number; netAmountHalalas: number; vatRemovedHalalas: number }[];
    invoicePoRecords: { recordType: 'INVOICE' | 'PO'; invoiceNo: string; poNo: string | null; paidBy: string; enteredAmountHalalas: number; netAmountHalalas: number; vatRemovedHalalas: number }[];
  };
  assert.deepEqual(costData.fuelRecords[0], {
    ...costData.fuelRecords[0], enteredAmountHalalas: 115_000,
    netAmountHalalas: 100_000, vatRemovedHalalas: 15_000,
  });
  const invoiceRecord = costData.invoicePoRecords.find((item) => item.recordType === 'INVOICE');
  const poRecord = costData.invoicePoRecords.find((item) => item.recordType === 'PO');
  const legacyPoRecord = costData.invoicePoRecords.find((item) => item.poNo === 'LEGACY-PO');
  assert.deepEqual(invoiceRecord && {
    recordType: invoiceRecord.recordType, invoiceNo: invoiceRecord.invoiceNo,
    poNo: invoiceRecord.poNo, paidBy: invoiceRecord.paidBy,
    netAmountHalalas: invoiceRecord.netAmountHalalas,
    vatRemovedHalalas: invoiceRecord.vatRemovedHalalas,
  }, { recordType: 'INVOICE', invoiceNo: 'INV-001', poNo: null, paidBy: 'Project Office', netAmountHalalas: 1_000_000, vatRemovedHalalas: 0 });
  assert.deepEqual(poRecord && {
    recordType: poRecord.recordType, invoiceNo: poRecord.invoiceNo,
    poNo: poRecord.poNo, paidBy: poRecord.paidBy,
    netAmountHalalas: poRecord.netAmountHalalas,
    vatRemovedHalalas: poRecord.vatRemovedHalalas,
  }, { recordType: 'PO', invoiceNo: 'INV-002', poNo: 'PO-001', paidBy: 'Procurement', netAmountHalalas: 1_000_000, vatRemovedHalalas: 150_000 });
  assert.equal(legacyPoRecord?.recordType, 'PO');
  assert.equal(legacyPoRecord?.netAmountHalalas, 25_000);
  assert.equal((await fetcher(origin + '/api/finance.xlsx')).status, 401);
  assert.equal((await fetcher(origin + '/api/finance.xlsx', { headers: { Cookie: supervisor.cookie } })).status, 403);
  const financeExport = await fetcher(origin + '/api/finance.xlsx', { headers: { Cookie: admin.cookie } });
  assert.equal(financeExport.status, 200);
  assert.match(financeExport.headers.get('content-type') || '', /spreadsheetml/);
  assert.match(financeExport.headers.get('content-disposition') || '', /attachment;.*\.xlsx/);
  assert.equal(financeExport.headers.get('cache-control'), 'no-store');
  const financeFiles = unzipSync(new Uint8Array(await financeExport.arrayBuffer()));
  assert.match(strFromU8(financeFiles['xl/worksheets/sheet1.xml']), /Generator fuel/);
  assert.match(strFromU8(financeFiles['xl/worksheets/sheet2.xml']), /PO-001/);
  assert.match(strFromU8(financeFiles['xl/worksheets/sheet3.xml']), /INV-001/);
  assert.match(strFromU8(financeFiles['xl/worksheets/sheet3.xml']), /r="I5" s="3"><v>10000<\/v>/);

  const timesheetExport = await fetcher(
    `${origin}/api/timesheet.xlsx?month=${riyadhDate().slice(0, 7)}`,
    { headers: { Cookie: admin.cookie } },
  );
  assert.equal(timesheetExport.status, 200, await timesheetExport.clone().text());
  assert.equal(
    timesheetExport.headers.get('content-type'),
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  assert.match(timesheetExport.headers.get('content-disposition') || '', /\.xlsx"$/);
  assert.equal(timesheetExport.headers.get('cache-control'), 'no-store');
  assert.equal(
    String.fromCharCode(...new Uint8Array(await timesheetExport.arrayBuffer()).slice(0, 2)),
    'PK',
  );
  assert.equal((await fetcher(
    `${origin}/api/timesheet.xlsx?month=${riyadhDate().slice(0, 7)}`,
    { headers: { Cookie: supervisor.cookie } },
  )).status, 403);
  assert.equal((await fetcher(`${origin}/api/timesheet.xlsx?month=2999-01`, {
    headers: { Cookie: admin.cookie },
  })).status, 400);

  const report = await fetcher(`${origin}/api/report.pdf`, {
    headers: { Cookie: admin.cookie },
  });
  assert.equal(report.status, 200, await report.clone().text());
  assert.equal(report.headers.get('content-type'), 'application/pdf');
  assert.equal(report.headers.get('cache-control'), 'no-store');
  assert.match(report.headers.get('content-disposition') || '', /Progress_Report_\d{4}-\d{2}-\d{2}\.pdf/);
  assert.equal((await fetcher(`${origin}/api/report.pdf`, {
    headers: { Cookie: supervisor.cookie },
  })).status, 403);

  const createdResponse = await post(fetcher, 'supervisor', {
    action: 'create', name: 'Second Site Supervisor', pin: '678', confirmPin: '678',
  }, admin.cookie);
  assert.equal(createdResponse.status, 200, await createdResponse.clone().text());
  const createdId = ((await createdResponse.json()) as { id: string }).id;
  const secondLogin = await login(fetcher, '678', 'second-supervisor');
  assert.equal((await state(fetcher, secondLogin.cookie)).user.id, createdId);
  const duplicatePin = await post(fetcher, 'supervisor', {
    action: 'create', name: 'Duplicate PIN Account', pin: '678', confirmPin: '678',
  }, admin.cookie);
  assert.equal(duplicatePin.status, 409);
  assert.equal((await post(fetcher, 'supervisor', {
    action: 'rename', id: createdId, name: 'Renamed Site Supervisor',
  }, admin.cookie)).status, 200);
  assert.equal((await state(fetcher, secondLogin.cookie)).user.id, createdId);
  assert.equal((await post(fetcher, 'supervisor', {
    action: 'pin', id: createdId, pin: '679', confirmPin: '679',
  }, admin.cookie)).status, 200);
  assert.equal((await fetcher(origin + '/api/state', { headers: { Cookie: secondLogin.cookie } })).status, 401);
  assert.equal((await loginResponse(fetcher, '678', 'old-pin')).status, 401);
  const changedLogin = await login(fetcher, '679', 'changed-pin');
  // The new PIN's session works before the account is deactivated below.
  assert.equal((await state(fetcher, changedLogin.cookie)).user.id, createdId);
  assert.equal((await post(fetcher, 'supervisor', {
    action: 'status', id: createdId, active: false,
  }, admin.cookie)).status, 200);
  assert.equal((await fetcher(origin + '/api/state', { headers: { Cookie: changedLogin.cookie } })).status, 401);
  assert.equal((await loginResponse(fetcher, '679', 'inactive-account')).status, 401);
  assert.equal((await post(fetcher, 'supervisor', {
    action: 'rename', id: 'initial-foreman', name: 'Forbidden Rename',
  }, supervisor.cookie)).status, 403);
  // Viewer PIN change follows the same invalidation contract: the bootstrap
  // login creates initial-viewer from VIEWER_PIN, an admin PIN change kills
  // the old cookie and the old PIN, and the new PIN signs in cleanly.
  const viewerLogin = await login(fetcher, '560', 'viewer-before-pin');
  assert.equal((await state(fetcher, viewerLogin.cookie)).user.role, 'VIEWER');
  assert.equal((await post(fetcher, 'viewer', {
    action: 'pin', id: 'initial-viewer', pin: '561', confirmPin: '561',
  }, admin.cookie)).status, 200);
  assert.equal((await fetcher(origin + '/api/state', { headers: { Cookie: viewerLogin.cookie } })).status, 401);
  assert.equal((await loginResponse(fetcher, '560', 'viewer-old-pin')).status, 401);
  const viewerChanged = await login(fetcher, '561', 'viewer-after-pin');
  assert.equal((await state(fetcher, viewerChanged.cookie)).user.role, 'VIEWER');

  for (const wrongDate of [offsetRiyadhDate(-1), offsetRiyadhDate(1)]) {
    const wrongDay = await post(fetcher, 'submission', {
      requestKey: crypto.randomUUID(), workDate: wrongDate, blockId: null,
      packageId: 'irrigation', remarks: '',
      items: [{ activityId: 'kpi-irrigation-hdpe', quantity: 1 }],
    }, supervisor.cookie);
    assert.equal(wrongDay.status, 400);
  }
  const unnecessaryBlock = await post(fetcher, 'submission', {
    requestKey: crypto.randomUUID(), workDate: riyadhDate(), blockId: 'A01',
    packageId: 'irrigation', remarks: '',
    items: [{ activityId: 'kpi-irrigation-hdpe', quantity: 1 }],
  }, supervisor.cookie);
  assert.equal(unnecessaryBlock.status, 400);
  const missingBlock = await post(fetcher, 'submission', {
    requestKey: crypto.randomUUID(), workDate: riyadhDate(), blockId: null,
    packageId: 'translocation', remarks: '',
    items: [{ activityId: 'kpi-translocation-preparation', quantity: 1 }],
  }, supervisor.cookie);
  assert.equal(missingBlock.status, 400);
  const missingSupplyBlock = await post(fetcher, 'submission', {
    requestKey: crypto.randomUUID(), workDate: riyadhDate(), blockId: null,
    packageId: 'new-trees', remarks: '',
    items: [{ activityId: 'kpi-new-selection', quantity: 1 }],
  }, supervisor.cookie);
  assert.equal(missingSupplyBlock.status, 400);
  for (const packageId of ['mobilization', 'drawings']) {
    const activityId = packageId === 'mobilization' ? 'kpi-mobilization' : 'kpi-designs-drawings';
    const unavailable = await post(fetcher, 'submission', {
      requestKey: crypto.randomUUID(), workDate: riyadhDate(), blockId: null,
      packageId, remarks: '', items: [{ activityId, quantity: 1 }],
    }, supervisor.cookie);
    assert.equal(unavailable.status, 400);
  }
  const removedKpi = await post(fetcher, 'submission', {
    requestKey: crypto.randomUUID(), workDate: riyadhDate(), blockId: 'A01',
    packageId: 'new-trees', remarks: '',
    items: [{ activityId: 'kpi-new-inspection', quantity: 1 }],
  }, supervisor.cookie);
  assert.equal(removedKpi.status, 400);

  for (const [packageId, activityId, blockId] of [
    ['support', 'kpi-support-wire', null],
    ['translocation', 'kpi-translocation-preparation', 'A01'],
    ['new-trees', 'kpi-new-selection', 'A01'],
  ] as const) {
    const adminEntry = await post(fetcher, 'submission', {
      requestKey: crypto.randomUUID(), workDate: '2026-01-15', blockId,
      packageId, remarks: 'Administrator historical-date verification',
      items: [{ activityId, quantity: 1 }],
    }, admin.cookie);
    assert.equal(adminEntry.status, 200, await adminEntry.text());
  }
  const legacySubmit = await post(
    fetcher,
    'submission',
    {
      requestKey: crypto.randomUUID(),
      workDate: riyadhDate(),
      blockId: null,
      packageId: 'irrigation',
      remarks: 'Inactive KPI must be rejected',
      items: [{ activityId: 'route', quantity: 1 }],
    },
    supervisor.cookie,
  );
  assert.equal(legacySubmit.status, 400);

  const submit = await post(
    fetcher,
    'submission',
    {
      requestKey: crypto.randomUUID(),
      workDate: riyadhDate(),
      blockId: null,
      packageId: 'irrigation',
      remarks: 'D1 workflow verification',
      items: [{ activityId: 'kpi-irrigation-hdpe', quantity: 100 }],
    },
    supervisor.cookie,
  );
  assert.equal(submit.status, 200);
  const submissionId = ((await submit.json()) as { id: string }).id;
  adminState = await state(fetcher, admin.cookie);
  assert.equal(adminState.submissions[0].status, 'WAITING');
  assert.deepEqual(approvedTotals(adminState.submissions), {});

  const review = await post(
    fetcher,
    'review',
    { id: submissionId, version: 1, decision: 'APPROVED', comment: '' },
    admin.cookie,
  );
  assert.equal(review.status, 200, await review.text());
  const duplicateReview = await post(
    fetcher,
    'review',
    { id: submissionId, version: 1, decision: 'APPROVED', comment: '' },
    admin.cookie,
  );
  assert.equal(duplicateReview.status, 409);
  adminState = await state(fetcher, admin.cookie);
  assert.equal(approvedTotals(adminState.submissions)['kpi-irrigation-hdpe'], 100);
  assert.ok(
    calculateKpiProgress(
      adminState.packages,
      adminState.openingBalances,
      adminState.submissions,
      adminState.settings,
    ).overall > 0,
  );

  async function submitForDecision(decision: 'RETURNED' | 'REJECTED') {
    const response = await post(
      fetcher,
      'submission',
      {
        requestKey: crypto.randomUUID(),
        workDate: riyadhDate(),
        blockId: null,
        packageId: 'irrigation',
        remarks: decision,
        items: [{ activityId: 'kpi-irrigation-hdpe', quantity: 10 }],
      },
      supervisor.cookie,
    );
    const record = (await response.json()) as { id: string };
    const reviewed = await post(
      fetcher,
      'review',
      {
        id: record.id,
        version: 1,
        decision,
        comment: `${decision.toLowerCase()} during verification`,
      },
      admin.cookie,
    );
    assert.equal(reviewed.status, 200, await reviewed.text());
    return record.id;
  }
  const returnedId = await submitForDecision('RETURNED');
  const rejectedId = await submitForDecision('REJECTED');
  adminState = await state(fetcher, admin.cookie);
  assert.equal(approvedTotals(adminState.submissions)['kpi-irrigation-hdpe'], 100);
  assert.equal(
    adminState.submissions.find((item) => item.id === returnedId)?.status,
    'RETURNED',
  );
  assert.equal(
    adminState.submissions.find((item) => item.id === rejectedId)?.status,
    'REJECTED',
  );
  const resubmit = await post(
    fetcher,
    'submission',
    {
      id: returnedId,
      version: 1,
      requestKey: crypto.randomUUID(),
      workDate: riyadhDate(),
      blockId: null,
      packageId: 'irrigation',
      remarks: 'Corrected and resubmitted',
      items: [{ activityId: 'kpi-irrigation-hdpe', quantity: 20 }],
    },
    supervisor.cookie,
  );
  assert.equal(resubmit.status, 200, await resubmit.text());
  adminState = await state(fetcher, admin.cookie);
  const revised = adminState.submissions.find((item) => item.id === returnedId);
  assert.equal(revised?.status, 'WAITING');
  assert.equal(revised?.version, 2);
  assert.equal(approvedTotals(adminState.submissions)['kpi-irrigation-hdpe'], 100);

  const finalSubmission = await post(fetcher, 'submission', {
    requestKey: crypto.randomUUID(), workDate: riyadhDate(), blockId: null,
    packageId: 'final-completion', remarks: 'Final completion verification',
    items: [{ activityId: 'kpi-final-handover', quantity: 1 }],
  }, supervisor.cookie);
  assert.equal(finalSubmission.status, 200, await finalSubmission.clone().text());
  const finalId = ((await finalSubmission.json()) as { id: string }).id;
  adminState = await state(fetcher, admin.cookie);
  assert.equal(approvedTotals(adminState.submissions)['kpi-final-handover'], undefined);
  const approveFinal = await post(fetcher, 'review', {
    id: finalId, version: 1, decision: 'APPROVED', comment: '',
  }, admin.cookie);
  assert.equal(approveFinal.status, 200, await approveFinal.text());
  adminState = await state(fetcher, admin.cookie);
  assert.equal(approvedTotals(adminState.submissions)['kpi-final-handover'], 1);

  const reportResponse = await fetcher(origin + '/api/report.pdf', {
    headers: { Cookie: admin.cookie },
  });
  assert.equal(reportResponse.status, 200);
  assert.equal(reportResponse.headers.get('content-type'), 'application/pdf');
  const reportText = new TextDecoder().decode(await reportResponse.arrayBuffer());
  assert.match(reportText, /^%PDF-1\.7/);
  assert.match(reportText, /Overall Project Progress/);
  assert.doesNotMatch(reportText, /Pre-Delivery Inspection/);
  assert.equal((await fetcher(origin + '/api/report.pdf', {
    headers: { Cookie: supervisor.cookie },
  })).status, 403);

  const settings = adminState.settings;
  const settingsResponse = await post(
    fetcher,
    'settings',
    {
      translocationTarget: 10001,
      translocationTargetIsApproximate: true,
      newTreeTarget: settings.newTreeTarget,
      irrigationTarget: settings.irrigationTarget,
      rowTarget: settings.rowTarget,
      postTarget: settings.postTarget,
      productivityMin: settings.productivityMin,
      productivityMax: settings.productivityMax,
      pendingHours: settings.pendingHours,
      weights: adminState.packages.map((item) => ({
        id: item.id,
        weight: Number(item.weight),
      })),
      reason: 'D1 persistence verification',
    },
    admin.cookie,
  );
  assert.equal(settingsResponse.status, 200, await settingsResponse.text());
  assert.equal(
    (
      await post(
        fetcher,
        'supervisor',
        { action: 'rename', id: 'initial-foreman', name: 'Field Supervisor' },
        admin.cookie,
      )
    ).status,
    200,
  );
  const supervisorDetail = await state(fetcher, admin.cookie);
  assert.ok(
    supervisorDetail.users?.some(
      (item) => item.id === 'initial-foreman' && item.name === 'Field Supervisor',
    ),
  );
  assert.equal(
    (
      await post(
        fetcher,
        'inspection',
        {
          number: 'D1-001',
          blockId: 'A01',
          type: 'Irrigation',
          inspector: 'Test Inspector',
          result: 'PASSED',
          date: '2026-09-03',
          firstAttempt: true,
          remarks: 'Persisted in D1',
        },
        admin.cookie,
      )
    ).status,
    200,
  );
  const qualityDetail = await state(fetcher, admin.cookie);
  assert.ok(
    qualityDetail.inspections?.some((item) => item.number === 'D1-001'),
  );
  const auditStarted = performance.now();
  const auditResponse = await fetcher(origin + '/api/state?view=audit&detail=1', {
    headers: { Cookie: admin.cookie },
  });
  assert.equal(auditResponse.status, 200);
  assert.ok(((await auditResponse.json()) as { audit: unknown[] }).audit.length > 0);
  const auditMs = performance.now() - auditStarted;

  const renameAdmin = await post(fetcher, 'supervisor', {
    action: 'rename', id: 'initial-admin', name: 'Project Administrator Updated',
  }, admin.cookie);
  assert.equal(renameAdmin.status, 200);
  assert.equal((await state(fetcher, admin.cookie)).user.id, 'initial-admin');
  const changeAdminPin = await post(fetcher, 'supervisor', {
    action: 'pin', id: 'initial-admin', pin: '089', confirmPin: '089',
  }, admin.cookie);
  assert.equal(changeAdminPin.status, 200);
  assert.equal((await fetcher(origin + '/api/state', { headers: { Cookie: admin.cookie } })).status, 401);
  assert.equal((await loginResponse(fetcher, '012', 'retired-admin-pin')).status, 401);
  const updatedAdmin = await login(fetcher, '089', 'updated-admin-pin');

  for (let attempt = 0; attempt < 5; attempt += 1)
    assert.equal((await loginResponse(fetcher, '998', 'rate-limited-client')).status, 401);
  assert.equal((await loginResponse(fetcher, '089', 'rate-limited-client')).status, 401);
  assert.equal((await loginResponse(fetcher, '089', 'separate-client')).status, 200);

  const logout = await post(fetcher, 'logout', {}, updatedAdmin.cookie);
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get('set-cookie') || '', /Max-Age=0/);

  await worker.dispose();
  worker = runtime();
  const afterDeploy = await state(
    worker.dispatchFetch.bind(worker) as unknown as typeof fetch,
    supervisor.cookie,
  );
  assert.equal(afterDeploy.submissions.length, 4);
  assert.equal(afterDeploy.settings.translocationTarget, 10001);

  console.log(
    `Worker D1 smoke passed: login ${admin.milliseconds.toFixed(1)}ms, snapshot ${snapshotMs.toFixed(1)}ms, audit ${auditMs.toFixed(1)}ms; workflow, roles and redeploy persistence verified.`,
  );
} finally {
  await worker.dispose();
  await rm(persistence, { recursive: true, force: true });
}
