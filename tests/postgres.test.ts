import { test } from 'node:test';
import assert from 'node:assert/strict';
import { databaseConfig, withDatabase, db } from '../lib/server/db';
import { login, userFor, cookie, publicUser } from '../lib/server/auth';
import { lookup } from '../lib/server/legacy-credentials';
import { mutate, getState } from '../lib/server/service';
import { seedProject } from '../prisma/seed';
import { approvedTotals } from '../lib/domain/calculations';
import { supervisorAction } from '../lib/server/supervisors';
import { testPostgres } from './helpers/postgres';

const secret = 'isolated-test-secret-not-for-production-123456';
await test('database configuration accepts Postgres and fails securely for missing secrets / wrong protocols', () => {
  for (const protocol of ['postgres', 'postgresql'])
    assert.equal(
      databaseConfig({
        DATABASE_URL: `${protocol}://test:test@localhost/test`,
        SESSION_SECRET: secret,
      }).max,
      3,
    );
  for (const env of [
    {},
    { DATABASE_URL: 'postgres://localhost/test' },
    { SESSION_SECRET: secret },
    { DATABASE_URL: 'prisma://localhost/test', SESSION_SECRET: secret },
  ])
    assert.throws(() => databaseConfig(env), /SETUP_REQUIRED/);
  assert.throws(() => db(), /request scope/);
});
await test('PIN confirmation and exact three-digit validation', () => {
  assert.equal(
    supervisorAction.safeParse({
      action: 'create',
      name: 'Test',
      pin: '123',
      confirmPin: '124',
    }).success,
    false,
  );
  assert.equal(
    supervisorAction.safeParse({
      action: 'create',
      name: 'Test',
      pin: '12',
      confirmPin: '12',
    }).success,
    false,
  );
  assert.equal(
    supervisorAction.safeParse({
      action: 'pin',
      id: 'test',
      pin: '012',
      confirmPin: '012',
    }).success,
    true,
  );
});

await test(
  'real pg adapter: initialization, stateless login, supervisor records and preserved approved history',
  { timeout: 120000 },
  async () => {
    let databaseRoundTrips = 0;
    const postgres = await testPostgres({
      onRoundTrip: () => {
        databaseRoundTrips += 1;
      },
    });
    const previous = {
      DATABASE_URL: process.env.DATABASE_URL,
      SESSION_SECRET: process.env.SESSION_SECRET,
      ADMIN_PIN: process.env.ADMIN_PIN,
      SUPERVISOR_PIN: process.env.SUPERVISOR_PIN,
    };
    process.env.DATABASE_URL = postgres.url;
    process.env.SESSION_SECRET = secret;
    process.env.ADMIN_PIN = '012';
    process.env.SUPERVISOR_PIN = '345';
    const request = (path = 'login', body: unknown = {}, token = '') =>
      new Request(`https://swiftops.web.id/api/${path}`, {
        method: 'POST',
        headers: {
          Origin: 'https://swiftops.web.id',
          Cookie: cookie(token),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    try {
      await withDatabase(() => seedProject(db(), secret, '012', '345'));
      databaseRoundTrips = 0;
      const adminLogin = await login('012');
      const foremanLogin = await login('345');
      assert.equal(adminLogin.error, false);
      assert.equal(foremanLogin.error, false);
      if (adminLogin.error || foremanLogin.error)
        throw Error('Fixture login failed');
      const administrator = await withDatabase(() =>
        userFor(request('state', {}, adminLogin.token)),
      );
      const supervisor = await withDatabase(() =>
        userFor(request('state', {}, foremanLogin.token)),
      );
      assert.equal(databaseRoundTrips, 0);
      assert.equal(administrator.role, 'ADMIN');
      assert.equal(supervisor.role, 'FOREMAN');
      const change = (body: unknown) =>
        withDatabase(() =>
          mutate(
            'supervisor',
            request('supervisor', body, adminLogin.token),
            administrator,
          ),
        );
      await assert.rejects(
        withDatabase(() =>
          mutate(
            'supervisor',
            request(
              'supervisor',
              { action: 'rename', id: supervisor.id, name: 'Forbidden' },
              foremanLogin.token,
            ),
            supervisor,
          ),
        ),
        /Administrator/,
      );
      await assert.rejects(
        change({ action: 'delete', id: administrator.id, confirmed: true }),
        /cannot be deactivated or deleted/,
      );
      await change({ action: 'rename', id: supervisor.id, name: 'Ahmed Ali' });
      assert.equal(
        (await userFor(request('state', {}, foremanLogin.token))).name,
        'Site Supervisor',
      );
      const record = await withDatabase(() =>
        mutate(
          'submission',
          request(
            'submission',
            {
              requestKey: crypto.randomUUID(),
              workDate: '2026-09-01',
              blockId: 'A01',
              packageId: 'irrigation',
              items: [{ activityId: 'route', quantity: 100 }],
            },
            foremanLogin.token,
          ),
          supervisor,
        ),
      );
      assert.ok('id' in record);
      let state = await withDatabase(() => getState(administrator));
      assert.deepEqual(
        approvedTotals(JSON.parse(JSON.stringify(state.submissions))),
        {},
      );
      await withDatabase(() =>
        mutate(
          'review',
          request(
            'review',
            { id: record.id, version: 1, decision: 'APPROVED' },
            adminLogin.token,
          ),
          administrator,
        ),
      );
      await assert.rejects(
        withDatabase(() =>
          mutate(
            'review',
            request(
              'review',
              { id: record.id, version: 1, decision: 'APPROVED' },
              adminLogin.token,
            ),
            administrator,
          ),
        ),
      );
      state = await withDatabase(() => getState(administrator));
      assert.equal(
        approvedTotals(JSON.parse(JSON.stringify(state.submissions))).route,
        100,
      );
      await assert.rejects(
        change({
          action: 'create',
          name: 'Duplicate',
          pin: '012',
          confirmPin: '012',
        }),
        /already assigned/,
      );
      const created = await change({
        action: 'create',
        name: 'Second Supervisor',
        pin: '678',
        confirmPin: '678',
      });
      assert.ok('id' in created);
      assert.equal((await login('678')).error, true);
      await change({
        action: 'pin',
        id: supervisor.id,
        pin: '456',
        confirmPin: '456',
      });
      assert.equal(
        (await userFor(request('state', {}, foremanLogin.token))).role,
        'FOREMAN',
      );
      assert.equal((await login('345')).error, false);
      assert.equal((await login('456')).error, true);
      await change({ action: 'status', id: supervisor.id, active: false });
      assert.equal((await login('345')).error, false);
      await change({ action: 'status', id: supervisor.id, active: true });
      assert.equal((await login('345')).error, false);
      const archived = await change({
        action: 'delete',
        id: supervisor.id,
        confirmed: true,
      });
      assert.ok('outcome' in archived && archived.outcome === 'archived');
      assert.equal((await login('345')).error, false);
      state = await withDatabase(() => getState(administrator));
      assert.equal(
        approvedTotals(JSON.parse(JSON.stringify(state.submissions))).route,
        100,
      );
      assert.equal(state.submissions[0].supervisor.name, 'Ahmed Ali');
      await withDatabase(async () => {
        // No-linked-record branch: imported unused account with no audit history.
        await db().user.create({
          data: {
            id: 'unused',
            name: 'Unused',
            pinHash: 'test',
            pinLookup: await lookup('789'),
          },
        });
      });
      const deleted = await change({
        action: 'delete',
        id: 'unused',
        confirmed: true,
      });
      assert.ok('outcome' in deleted && deleted.outcome === 'deleted');
      await withDatabase(() => seedProject(db(), secret, '012', '345'));
      await withDatabase(async () => {
        assert.equal(
          await db().user.count({ where: { id: supervisor.id } }),
          1,
        );
        const reset = await db().user.findUniqueOrThrow({
          where: { id: supervisor.id },
          select: publicUser,
        });
        assert.equal(reset.name, 'Site Supervisor');
        assert.equal(reset.active, true);
        assert.equal(reset.archivedAt, null);
        assert.equal(await db().dailySubmission.count(), 1);
        assert.equal(await db().approval.count(), 1);
        assert.equal(await db().block.count(), 19);
        const logs = JSON.stringify(await db().auditLog.findMany());
        assert.equal(logs.includes('pinHash'), false);
        assert.equal(logs.includes('pinLookup'), false);
      });
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      await postgres.close();
    }
  },
);
