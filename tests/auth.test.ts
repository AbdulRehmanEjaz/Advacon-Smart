import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  admin,
  cookie,
  createSessionToken,
  HttpError,
  login,
  sameOrigin,
  userFor,
  verifySessionToken,
  type Actor,
} from '../lib/server/auth';

process.env.SESSION_SECRET = 'test-only-random-secret-not-a-production-secret';
process.env.ADMIN_PIN = '012';
process.env.SUPERVISOR_PIN = '345';

await test('role guard denies foreman and accepts administrator', () => {
  assert.throws(() => admin({ role: 'FOREMAN' } as Actor), HttpError);
  assert.doesNotThrow(() => admin({ role: 'ADMIN' } as Actor));
});

await test('write origins must exactly match app origin', () => {
  assert.throws(() =>
    sameOrigin(
      new Request('https://project.test/api/review', { method: 'POST' }),
    ),
  );
  assert.throws(() =>
    sameOrigin(
      new Request('https://project.test/api/review', {
        method: 'POST',
        headers: { Origin: 'https://attacker.test' },
      }),
    ),
  );
  assert.doesNotThrow(() =>
    sameOrigin(
      new Request('https://project.test/api/review', {
        method: 'POST',
        headers: { Origin: 'https://project.test' },
      }),
    ),
  );
});

await test('cookies are HttpOnly, SameSite strict and expire after eight hours', () => {
  const result = cookie('signed-session-token');
  assert.match(result, /HttpOnly/);
  assert.match(result, /SameSite=Strict/);
  assert.match(result, /Max-Age=28800/);
  assert.equal(result.includes('ADMIN'), false);
  assert.equal(result.includes('Domain='), false);
});

await test('runtime secret PINs issue locally verified role sessions', async () => {
  const adminLogin = await login('012');
  const supervisorLogin = await login('345');
  const rejected = await login('999');
  assert.equal(adminLogin.error, false);
  assert.equal(supervisorLogin.error, false);
  assert.equal(rejected.error, true);
  if (adminLogin.error || supervisorLogin.error) throw Error('Fixture failure');
  assert.equal((await verifySessionToken(adminLogin.token)).role, 'ADMIN');
  assert.equal(
    (await verifySessionToken(supervisorLogin.token)).role,
    'FOREMAN',
  );
});

await test('modified and expired session cookies are rejected', async () => {
  const result = await login('012');
  if (result.error) throw Error('Fixture failure');
  const signatureStart = result.token.lastIndexOf('.') + 1;
  const changed =
    result.token.slice(0, signatureStart) +
    (result.token[signatureStart] === 'a' ? 'b' : 'a') +
    result.token.slice(signatureStart + 1);
  await assert.rejects(verifySessionToken(changed), HttpError);
  const expired = await createSessionToken(
    result.user,
    Math.floor(Date.now() / 1000) - 1,
  );
  await assert.rejects(verifySessionToken(expired), HttpError);
});

await test('request authentication needs no database configuration', async () => {
  const previousDatabase = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    const result = await login('012');
    if (result.error) throw Error('Fixture failure');
    const request = new Request('https://project.test/api/state', {
      headers: { Cookie: cookie(result.token) },
    });
    assert.equal((await userFor(request)).id, 'initial-admin');
  } finally {
    if (previousDatabase === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabase;
  }
});
