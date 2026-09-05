import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createCredential, verifyCredential } from '../lib/server/credentials';

process.env.SESSION_SECRET = 'test-only-random-secret-not-a-production-secret';

await test('per-user PIN credentials are salted, verifiable and never plaintext', async () => {
  const first = await createCredential('090');
  const second = await createCredential('090');
  assert.notEqual(first.pinSalt, second.pinSalt);
  assert.notEqual(first.pinHash, second.pinHash);
  assert.equal(first.pinLookup, second.pinLookup);
  assert.equal(first.pinHash.includes('090'), false);
  assert.equal(await verifyCredential('090', first.pinSalt, first.pinHash), true);
  assert.equal(await verifyCredential('111', first.pinSalt, first.pinHash), false);
});

await test('auth contract keeps private cookies, strict origins and credential versions', async () => {
  const source = await readFile(new URL('../lib/server/auth.ts', import.meta.url), 'utf8');
  assert.match(source, /HttpOnly; SameSite=Strict/);
  assert.match(source, /origin !== new URL\(req\.url\)\.origin/);
  assert.match(source, /credentialVersion/);
  assert.match(source, /row\.credentialVersion\) !== claims\.credentialVersion/);
  assert.doesNotMatch(source, /DATABASE_URL|Prisma|localStorage/);
});
