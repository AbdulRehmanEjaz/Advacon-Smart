import assert from 'node:assert/strict';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { approvedTotals, calculateKpiProgress } from '../lib/domain/calculations';
import { baselineSql } from '../lib/server/d1-baseline';
import { riyadhDate } from '../lib/domain/date';

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
const loginBindings = {
  SESSION_SECRET: 'disposable-worker-test-secret-not-for-production',
  ADMIN_PIN: '012',
  SUPERVISOR_PIN: '345',
};
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
  assert.equal((await post(fetcher, 'supervisor', {
    action: 'status', id: createdId, active: false,
  }, admin.cookie)).status, 200);
  assert.equal((await fetcher(origin + '/api/state', { headers: { Cookie: changedLogin.cookie } })).status, 401);
  assert.equal((await loginResponse(fetcher, '679', 'inactive-account')).status, 401);
  assert.equal((await post(fetcher, 'supervisor', {
    action: 'rename', id: 'initial-foreman', name: 'Forbidden Rename',
  }, supervisor.cookie)).status, 403);

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
