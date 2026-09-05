import { database, first, now, statement } from './d1';
import { createCredential, verifyCredential } from './credentials';
import { lookup } from './legacy-credentials';

export const COOKIE = 'tree_session';
const SESSION_SECONDS = 8 * 60 * 60;
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 10 * 60 * 1000;
const BLOCK_MS = 15 * 60 * 1000;

function authDiagnostic(code: string, error: unknown) {
  const name = error instanceof Error ? error.name : 'UnknownError';
  let message = error instanceof Error ? error.message : 'Unknown authentication failure';
  for (const value of [
    process.env.SESSION_SECRET,
    process.env.ADMIN_PIN,
    process.env.SUPERVISOR_PIN,
  ])
    if (value) message = message.replaceAll(value, '[redacted]');
  message = message
    .replace(/\b\d{3}\b/g, '[redacted]')
    .replace(/[\r\n]+/g, ' ')
    .slice(0, 180);
  console.error(code, name, message);
}

async function authStage<T>(code: string, action: () => Promise<T>) {
  try {
    return await action();
  } catch (error) {
    authDiagnostic(code, error);
    throw error;
  }
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

type Role = 'ADMIN' | 'FOREMAN';
type Identity = {
  id: string;
  name: string;
  role: Role;
  credentialVersion?: number;
};
type SessionClaims = {
  userId: string;
  role: Role;
  name: string;
  credentialVersion: number;
  expiration: number;
};
type UserRow = {
  id: string;
  name: string;
  role: Role;
  active: number;
  archivedAt: string | null;
  pinLookup: string | null;
  pinSalt: string | null;
  pinHash: string | null;
  credentialVersion: number;
  lastLogin: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Actor = Identity & {
  credentialVersion: number;
  active: boolean;
  archivedAt: Date | null;
  defaultPin: boolean;
  lastLogin: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function sessionSecret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw Error('SETUP_REQUIRED');
  return value;
}

function constantTimeEqual(left: string, right: string) {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1)
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  return difference === 0;
}

const encoder = new TextEncoder();
function encodeBase64Url(value: string | Uint8Array) {
  const bytes = typeof value === 'string' ? encoder.encode(value) : value;
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function decodeBase64Url(value: string) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
async function signingKey() {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(sessionSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function createSessionToken(
  identity: Identity,
  expiration = Math.floor(Date.now() / 1000) + SESSION_SECONDS,
) {
  const payload = encodeBase64Url(JSON.stringify({
    userId: identity.id,
    role: identity.role,
    name: identity.name,
    credentialVersion: identity.credentialVersion || 0,
    expiration,
  } satisfies SessionClaims));
  const unsigned = `v2.${payload}`;
  const signature = new Uint8Array(
    await crypto.subtle.sign('HMAC', await signingKey(), encoder.encode(unsigned)),
  );
  return `${unsigned}.${encodeBase64Url(signature)}`;
}

export async function verifySessionToken(token: string) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3 || parts[0] !== 'v2') throw Error('INVALID');
    const unsigned = `${parts[0]}.${parts[1]}`;
    if (!(await crypto.subtle.verify(
      'HMAC',
      await signingKey(),
      decodeBase64Url(parts[2]),
      encoder.encode(unsigned),
    ))) throw Error('INVALID');
    const claims = JSON.parse(
      new TextDecoder().decode(decodeBase64Url(parts[1])),
    ) as Partial<SessionClaims>;
    if (
      !claims.userId ||
      !claims.name ||
      !['ADMIN', 'FOREMAN'].includes(String(claims.role)) ||
      !Number.isInteger(claims.credentialVersion) ||
      !Number.isSafeInteger(claims.expiration) ||
      Number(claims.expiration) <= Math.floor(Date.now() / 1000)
    ) throw Error('INVALID');
    const epoch = new Date(0);
    return {
      id: claims.userId,
      name: claims.name,
      role: claims.role as Role,
      credentialVersion: claims.credentialVersion!,
      active: true,
      archivedAt: null,
      defaultPin: false,
      lastLogin: null,
      createdAt: epoch,
      updatedAt: epoch,
    } satisfies Actor;
  } catch (error) {
    if (error instanceof Error && error.message === 'SETUP_REQUIRED') throw error;
    throw new HttpError(401, 'Your session has expired. Please sign in again.');
  }
}

function userSelect(where: string) {
  return `SELECT id,name,role,active,archived_at AS archivedAt,
    pin_lookup AS pinLookup,pin_salt AS pinSalt,pin_hash AS pinHash,
    credential_version AS credentialVersion,last_login AS lastLogin,
    created_at AS createdAt,updated_at AS updatedAt FROM users WHERE ${where}`;
}

function actorFromRow(row: UserRow): Actor {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    credentialVersion: Number(row.credentialVersion),
    active: Boolean(Number(row.active)),
    archivedAt: row.archivedAt ? new Date(row.archivedAt) : null,
    defaultPin: !row.pinHash,
    lastLogin: row.lastLogin ? new Date(row.lastLogin) : null,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

export async function userFor(req: Request) {
  const token = req.headers.get('cookie')?.split(';').map((value) => value.trim())
    .find((value) => value.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!token) throw new HttpError(401, 'Please sign in to continue.');
  const claims = await verifySessionToken(token);
  const row = await first<UserRow>(userSelect('id=?'), claims.id);
  if (
    !row ||
    !Number(row.active) ||
    row.archivedAt ||
    row.role !== claims.role ||
    Number(row.credentialVersion) !== claims.credentialVersion
  ) throw new HttpError(401, 'Your session has expired. Please sign in again.');
  return actorFromRow(row);
}

async function failure(identifier: string) {
  const timestamp = Date.now();
  const current = await first<{ attempts: number; windowStartedAt: string }>(
    'SELECT attempts,window_started_at AS windowStartedAt FROM login_attempts WHERE identifier=?',
    identifier,
  );
  const expired = !current ||
    timestamp - new Date(current.windowStartedAt).getTime() > WINDOW_MS;
  const attempts = expired ? 1 : Number(current.attempts) + 1;
  const blocked = attempts >= MAX_ATTEMPTS
    ? new Date(timestamp + BLOCK_MS).toISOString()
    : null;
  await statement(
    `INSERT INTO login_attempts (identifier,attempts,window_started_at,blocked_until)
     VALUES (?,?,?,?) ON CONFLICT(identifier) DO UPDATE SET
     attempts=excluded.attempts,window_started_at=excluded.window_started_at,
     blocked_until=excluded.blocked_until`,
    identifier,
    attempts,
    expired ? new Date(timestamp).toISOString() : current.windowStartedAt,
    blocked,
  ).run();
}

export async function login(pin: string, clientIdentifier = 'unknown') {
  const rateKey = await authStage('AUTH_LOGIN_LOOKUP_FAILED', () =>
    lookup(`login:${clientIdentifier}`),
  );
  const attempt = await authStage('AUTH_LOGIN_LOOKUP_FAILED', () =>
    first<{ blockedUntil: string | null }>(
      'SELECT blocked_until AS blockedUntil FROM login_attempts WHERE identifier=?',
      rateKey,
    ),
  );
  if (attempt?.blockedUntil && new Date(attempt.blockedUntil).getTime() > Date.now())
    return { error: true as const, throttled: true as const };
  if (!/^\d{3}$/.test(pin)) {
    await failure(rateKey);
    return { error: true as const };
  }
  const pinLookup = await authStage('AUTH_LOGIN_LOOKUP_FAILED', () => lookup(pin));
  let row = await authStage('AUTH_LOGIN_LOOKUP_FAILED', () =>
    first<UserRow>(userSelect('pin_lookup=?'), pinLookup),
  );
  let valid = Boolean(
    row?.pinSalt && row.pinHash &&
    await authStage('AUTH_CREDENTIAL_VERIFY_FAILED', () =>
      verifyCredential(pin, row!.pinSalt!, row!.pinHash!),
    ),
  );

  if (!valid) {
    const candidates = [
      { id: 'initial-admin', pin: process.env.ADMIN_PIN },
      { id: 'initial-foreman', pin: process.env.SUPERVISOR_PIN },
    ];
    const legacy = candidates.find(
      (candidate) => candidate.pin && /^\d{3}$/.test(candidate.pin) &&
        constantTimeEqual(pin, candidate.pin),
    );
    if (legacy) {
      const bootstrap = await authStage('AUTH_LOGIN_LOOKUP_FAILED', () =>
        first<UserRow>(userSelect('id=?'), legacy.id),
      );
      if (bootstrap && (!bootstrap.pinSalt || !bootstrap.pinHash)) {
        const credential = await authStage(
          'AUTH_BOOTSTRAP_CREDENTIAL_FAILED',
          () => createCredential(pin),
        );
        await authStage('AUTH_BOOTSTRAP_CREDENTIAL_FAILED', () =>
          statement(
            `UPDATE users SET pin_lookup=?,pin_salt=?,pin_hash=?,
             credential_version=credential_version+1,updated_at=?
             WHERE id=? AND (pin_salt IS NULL OR pin_hash IS NULL)`,
            credential.pinLookup,
            credential.pinSalt,
            credential.pinHash,
            now(),
            bootstrap.id,
          ).run(),
        );
        row = await authStage('AUTH_LOGIN_LOOKUP_FAILED', () =>
          first<UserRow>(userSelect('id=?'), bootstrap.id),
        );
        valid = Boolean(
          row?.pinSalt && row.pinHash &&
          await authStage('AUTH_CREDENTIAL_VERIFY_FAILED', () =>
            verifyCredential(pin, row!.pinSalt!, row!.pinHash!),
          ),
        );
      }
    }
  }

  if (!valid || !row || !Number(row.active) || row.archivedAt) {
    await failure(rateKey);
    return { error: true as const };
  }
  const timestamp = now();
  await database().batch([
    statement('UPDATE users SET last_login=? WHERE id=?', timestamp, row.id),
    statement('DELETE FROM login_attempts WHERE identifier=?', rateKey),
  ]);
  row.lastLogin = timestamp;
  const user = actorFromRow(row);
  return {
    error: false as const,
    token: await authStage('AUTH_SESSION_CREATE_FAILED', () =>
      createSessionToken(user),
    ),
    user,
  };
}

export function admin(user: Actor) {
  if (user.role !== 'ADMIN')
    throw new HttpError(403, 'Administrator access required.');
}

export function sameOrigin(req: Request) {
  const origin = req.headers.get('origin');
  if (!origin || origin !== new URL(req.url).origin)
    throw new HttpError(403, 'Invalid request origin.');
}

export function cookie(token: string, age = SESSION_SECONDS) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
}
