import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compare } from 'bcryptjs';
import {
  admin,
  cookie,
  HttpError,
  lookup,
  pinHash,
  sameOrigin,
  type Actor,
} from '../lib/server/auth';
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
await test('cookies are HttpOnly, SameSite strict and expiring', () => {
  const result = cookie('opaque-session-token');
  assert.match(result, /HttpOnly/);
  assert.match(result, /SameSite=Strict/);
  assert.match(result, /Max-Age=28800/);
  assert.equal(result.includes('ADMIN'), false);
});
await test('PIN hashing never retains plaintext and lookup is secret-bound', async () => {
  process.env.SESSION_SECRET =
    'test-only-random-secret-not-a-production-secret';
  const pin = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
  const hashed = await pinHash(pin);
  assert.match(hashed, /^\$2[aby]\$12\$/);
  assert.equal(await compare(pin, hashed), true);
  const one = await lookup(pin);
  process.env.SESSION_SECRET = 'another-test-only-random-secret-for-isolation';
  assert.notEqual(await lookup(pin), one);
  assert.equal(one.length, 64);
});
