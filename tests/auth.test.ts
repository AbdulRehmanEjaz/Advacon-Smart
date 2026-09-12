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
  assert.equal(first.pinSalt.includes('090'), false);
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
  assert.match(source, /AUTH_BOOTSTRAP_CREDENTIAL_FAILED/);
  assert.match(source, /AUTH_SESSION_CREATE_FAILED/);
  assert.match(source, /initial-viewer/);
  assert.match(source, /VIEWER_PIN \?\? '000'/);
});

await test('credential path uses Worker-safe HMAC and contains no PBKDF2', async () => {
  const source = await readFile(new URL('../lib/server/credentials.ts', import.meta.url), 'utf8');
  assert.match(source, /pin-credential:v1/);
  assert.match(source, /HMAC/);
  assert.doesNotMatch(source, /PBKDF2|deriveBits/);
});

await test('viewer accounts use a dedicated table and never rebuild the users table', async () => {
  const [migration, baseline, envExample, initial] = await Promise.all([
    readFile(new URL('../d1/migrations/0008_viewer_accounts.sql', import.meta.url), 'utf8'),
    readFile(new URL('../lib/server/d1-baseline.ts', import.meta.url), 'utf8'),
    readFile(new URL('../.env.example', import.meta.url), 'utf8'),
    readFile(new URL('../d1/migrations/0001_initial.sql', import.meta.url), 'utf8'),
  ]);
  assert.match(migration, /CREATE TABLE viewer_accounts/);
  assert.match(migration, /pin_salt TEXT/);
  assert.match(migration, /pin_hash TEXT/);
  assert.match(migration, /credential_version INTEGER NOT NULL DEFAULT 0/);
  assert.doesNotMatch(migration, /DROP TABLE users|INSERT INTO users|ALTER TABLE users/i);
  assert.match(initial, /CHECK \(role IN \('ADMIN', 'FOREMAN'\)\)/);
  assert.doesNotMatch(baseline, /initial-viewer/);
  assert.match(envExample, /VIEWER_PIN=000/);
});
