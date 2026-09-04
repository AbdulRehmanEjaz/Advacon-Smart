import assert from 'node:assert/strict';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { approvedTotals, progress } from '../lib/domain/calculations';
import { baselineSql } from '../lib/server/d1-baseline';

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
type State = {
  user: { role: string };
  submissions: import('../lib/domain/calculations').Submission[];
  blocks: unknown[];
  packages: import('../lib/domain/baseline').PackageDefinition[];
  settings: import('../lib/domain/baseline').Settings;
  users?: { id: string; name: string }[];
  inspections?: { number: string }[];
};
async function login(fetcher: typeof fetch, pin: string) {
  const started = performance.now();
  const response = await fetcher(origin + '/api/login', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin }),
  });
  assert.equal(response.status, 200);
  const cookie = (response.headers.get('set-cookie') || '').split(';')[0];
  assert.match(cookie, /^tree_session=/);
  return { cookie, milliseconds: performance.now() - started };
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
  await d1.exec(baselineSql('2026-09-03T00:00:00.000Z'));
  await d1.exec(baselineSql('2026-09-03T00:00:00.000Z'));

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
  assert.equal(adminState.submissions.length, 0);
  assert.equal((await state(fetcher, supervisor.cookie)).user.role, 'FOREMAN');

  const submit = await post(
    fetcher,
    'submission',
    {
      requestKey: crypto.randomUUID(),
      workDate: '2026-09-03',
      blockId: 'A01',
      packageId: 'irrigation',
      remarks: 'D1 workflow verification',
      items: [{ activityId: 'route', quantity: 100 }],
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
  assert.equal(approvedTotals(adminState.submissions).route, 100);
  assert.ok(
    progress(
      adminState.packages,
      approvedTotals(adminState.submissions),
      adminState.settings,
    ).overall > 0,
  );

  async function submitForDecision(decision: 'RETURNED' | 'REJECTED') {
    const response = await post(
      fetcher,
      'submission',
      {
        requestKey: crypto.randomUUID(),
        workDate: '2026-09-03',
        blockId: 'A02',
        packageId: 'irrigation',
        remarks: decision,
        items: [{ activityId: 'route', quantity: 10 }],
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
  assert.equal(approvedTotals(adminState.submissions).route, 100);
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
      workDate: '2026-09-03',
      blockId: 'A02',
      packageId: 'irrigation',
      remarks: 'Corrected and resubmitted',
      items: [{ activityId: 'route', quantity: 20 }],
    },
    supervisor.cookie,
  );
  assert.equal(resubmit.status, 200, await resubmit.text());
  adminState = await state(fetcher, admin.cookie);
  const revised = adminState.submissions.find((item) => item.id === returnedId);
  assert.equal(revised?.status, 'WAITING');
  assert.equal(revised?.version, 2);
  assert.equal(approvedTotals(adminState.submissions).route, 100);

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

  const logout = await post(fetcher, 'logout', {}, admin.cookie);
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get('set-cookie') || '', /Max-Age=0/);

  await worker.dispose();
  worker = runtime();
  const afterDeploy = await state(
    worker.dispatchFetch.bind(worker) as unknown as typeof fetch,
    supervisor.cookie,
  );
  assert.equal(afterDeploy.submissions.length, 3);
  assert.equal(afterDeploy.settings.translocationTarget, 10001);

  console.log(
    `Worker D1 smoke passed: login ${admin.milliseconds.toFixed(1)}ms, snapshot ${snapshotMs.toFixed(1)}ms, audit ${auditMs.toFixed(1)}ms; workflow, roles and redeploy persistence verified.`,
  );
} finally {
  await worker.dispose();
  await rm(persistence, { recursive: true, force: true });
}
