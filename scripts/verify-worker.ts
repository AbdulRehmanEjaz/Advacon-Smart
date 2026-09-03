import assert from 'node:assert/strict';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { testPostgres } from '../tests/helpers/postgres';
import { withDatabase, db } from '../lib/server/db';
import { seedProject } from '../prisma/seed';

// Local verification only: never reads live credentials or deploys a Worker.
const database = await testPostgres();
const secret = 'disposable-worker-test-secret-not-for-production';
process.env.DATABASE_URL = database.url;
process.env.SESSION_SECRET = secret;
await withDatabase(() => seedProject(db(), secret, '012', '345'));
const root = fileURLToPath(new URL('../dist/server/', import.meta.url));
const config = JSON.parse(
  await readFile(resolve(root, 'wrangler.json'), 'utf8'),
) as {
  main: string;
  compatibility_date: string;
  compatibility_flags: string[];
};
const names = (await readdir(root, { recursive: true })).filter((name) =>
  /\.(js|mjs|wasm)$/.test(name),
);
const worker = new Miniflare(
  convertV4MiniflareOptions({
    workers: [
      {
        modulesRoot: root,
        modules: [config.main, ...names.filter((n) => n !== config.main)].map(
          (name) => ({
            type: name.endsWith('.wasm')
              ? ('CompiledWasm' as const)
              : ('ESModule' as const),
            path: resolve(root, name),
          }),
        ),
        compatibilityDate: config.compatibility_date,
        compatibilityFlags: config.compatibility_flags,
        bindings: { DATABASE_URL: database.url, SESSION_SECRET: secret },
      },
    ],
  }),
);
const origin = 'https://swiftops.test';
const fetch = worker.dispatchFetch.bind(worker);
async function send(path: string, body: unknown, cookie = '') {
  return fetch(origin + path, {
    method: 'POST',
    headers: {
      Origin: origin,
      'Content-Type': 'application/json',
      Cookie: cookie,
    },
    body: JSON.stringify(body),
  });
}
try {
  assert.equal((await fetch(origin + '/')).status, 200);
  assert.equal((await fetch(origin + '/design-preview')).status, 404);
  assert.equal((await fetch(origin + '/api/state')).status, 401);
  for (const [pin, role] of [
    ['012', 'ADMIN'],
    ['345', 'FOREMAN'],
  ]) {
    const response = await send('/api/login', { pin });
    assert.equal(response.status, 200, `Worker ${role} login failed`);
    const state = (await response.json()) as {
      user: { role: string };
      blocks: unknown[];
      packages: unknown[];
      users?: unknown[];
      audit?: unknown[];
      inspections?: unknown[];
    };
    assert.equal(state.user.role, role);
    assert.equal(state.blocks.length, 19);
    assert.ok(state.packages.length > 0);
    assert.equal(state.audit, undefined);
    assert.equal(state.inspections, undefined);
    assert.equal(state.users, undefined);
    const setCookie = response.headers.get('set-cookie') || '';
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /Secure/);
    assert.match(setCookie, /SameSite=Strict/);
    assert.equal(setCookie.includes('Domain='), false);
    const token = setCookie.split(';')[0];
    if (role === 'ADMIN') {
      const detailResponse = await fetch(
        origin + '/api/state?view=audit&detail=1',
        { headers: { Cookie: token } },
      );
      assert.equal(detailResponse.status, 200);
      const detail = (await detailResponse.json()) as {
        audit?: unknown[];
        users?: unknown[];
        submissions?: unknown[];
      };
      assert.ok(detail.audit);
      assert.ok(detail.users);
      assert.equal(detail.submissions, undefined);
    }
    if (role === 'FOREMAN') {
      assert.equal(state.users, undefined);
      assert.equal(
        (
          await send(
            '/api/supervisor',
            {
              action: 'create',
              name: 'Forbidden',
              pin: '678',
              confirmPin: '678',
            },
            token,
          )
        ).status,
        403,
      );
      const page = await fetch(origin + '/workspace/supervisors', {
        headers: { Cookie: token },
        redirect: 'manual',
      });
      assert.equal(page.status, 307);
      assert.match(
        page.headers.get('location') || '',
        /\/workspace\/dashboard/,
      );
    }
    const logout = await send('/api/logout', {}, token);
    assert.equal(logout.status, 200);
    await logout.text();
    const expired = await fetch(origin + '/api/state', {
      headers: { Cookie: token },
    });
    assert.equal(
      expired.status,
      401,
      `Revoked session must fail: ${await expired.text()}`,
    );
  }
  console.log(
    'Worker smoke test passed: TCP adapter, both logins, host-only secure cookies, role guards, logout and production preview isolation.',
  );
} finally {
  await worker.dispose();
  await database.close();
}
