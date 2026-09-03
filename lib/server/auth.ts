export const COOKIE = 'tree_session';
const SESSION_SECONDS = 8 * 60 * 60;

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const publicUser = {
  id: true,
  name: true,
  role: true,
  active: true,
  archivedAt: true,
  defaultPin: true,
  lastLogin: true,
  createdAt: true,
  updatedAt: true,
} as const;

type Role = 'ADMIN' | 'FOREMAN';
type Identity = { id: string; name: string; role: Role };
type SessionClaims = {
  userId: string;
  role: Role;
  name: string;
  expiration: number;
};

const ADMIN: Identity = {
  id: 'initial-admin',
  name: 'Project Administrator',
  role: 'ADMIN',
};
const SUPERVISOR: Identity = {
  id: 'initial-foreman',
  name: 'Site Supervisor',
  role: 'FOREMAN',
};

export type Actor = Identity & {
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

function loginConfig() {
  const adminPin = process.env.ADMIN_PIN;
  const supervisorPin = process.env.SUPERVISOR_PIN;
  if (
    !adminPin ||
    !supervisorPin ||
    !/^\d{3}$/.test(adminPin) ||
    !/^\d{3}$/.test(supervisorPin) ||
    adminPin === supervisorPin
  )
    throw Error('SETUP_REQUIRED');
  return { adminPin, supervisorPin };
}

function constantTimeEqual(left: string, right: string) {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1)
    difference |=
      (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
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
  const payload = encodeBase64Url(
    JSON.stringify({
      userId: identity.id,
      role: identity.role,
      name: identity.name,
      expiration,
    } satisfies SessionClaims),
  );
  const unsigned = `v1.${payload}`;
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      'HMAC',
      await signingKey(),
      encoder.encode(unsigned),
    ),
  );
  return `${unsigned}.${encodeBase64Url(signature)}`;
}

function actor(identity: Identity): Actor {
  const epoch = new Date(0);
  return {
    ...identity,
    active: true,
    archivedAt: null,
    defaultPin: false,
    lastLogin: null,
    createdAt: epoch,
    updatedAt: epoch,
  };
}

export async function verifySessionToken(token: string) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3 || parts[0] !== 'v1') throw Error('INVALID');
    const unsigned = `${parts[0]}.${parts[1]}`;
    const valid = await crypto.subtle.verify(
      'HMAC',
      await signingKey(),
      decodeBase64Url(parts[2]),
      encoder.encode(unsigned),
    );
    if (!valid) throw Error('INVALID');
    const claims = JSON.parse(
      new TextDecoder().decode(decodeBase64Url(parts[1])),
    ) as Partial<SessionClaims>;
    if (
      typeof claims.expiration !== 'number' ||
      !Number.isSafeInteger(claims.expiration) ||
      claims.expiration <= Math.floor(Date.now() / 1000)
    )
      throw Error('EXPIRED');
    const identity =
      claims.userId === ADMIN.id &&
      claims.role === ADMIN.role &&
      claims.name === ADMIN.name
        ? ADMIN
        : claims.userId === SUPERVISOR.id &&
            claims.role === SUPERVISOR.role &&
            claims.name === SUPERVISOR.name
          ? SUPERVISOR
          : null;
    if (!identity) throw Error('INVALID');
    return actor(identity);
  } catch (error) {
    if (error instanceof Error && error.message === 'SETUP_REQUIRED')
      throw error;
    throw new HttpError(401, 'Your session has expired. Please sign in again.');
  }
}

export async function userFor(req: Request) {
  const token = req.headers
    .get('cookie')
    ?.split(';')
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
  if (!token) throw new HttpError(401, 'Please sign in to continue.');
  return verifySessionToken(token);
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

export async function login(pin: string) {
  const { adminPin, supervisorPin } = loginConfig();
  const adminMatch = constantTimeEqual(pin, adminPin);
  const supervisorMatch = constantTimeEqual(pin, supervisorPin);
  const identity = adminMatch ? ADMIN : supervisorMatch ? SUPERVISOR : null;
  if (!/^\d{3}$/.test(pin) || !identity) return { error: true as const };
  return {
    error: false as const,
    token: await createSessionToken(identity),
    user: actor(identity),
  };
}
