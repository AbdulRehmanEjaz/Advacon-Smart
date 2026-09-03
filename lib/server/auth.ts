import { compare, hash } from 'bcryptjs';
import { db } from './db';
export const COOKIE = 'tree_session';
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function digest(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
    ),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
}
export async function lookup(pin: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw Error('SETUP_REQUIRED');
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return Array.from(
    new Uint8Array(
      await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(pin)),
    ),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
}
export const pinHash = (pin: string) => hash(pin, 12);
let dummyHash: Promise<string> | undefined;
export const publicUser = {
  id: true,
  name: true,
  role: true,
  active: true,
  defaultPin: true,
  lastLogin: true,
  createdAt: true,
} as const;
export async function userFor(req: Request) {
  const token = req.headers
    .get('cookie')
    ?.split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith(COOKIE + '='))
    ?.slice(COOKIE.length + 1);
  if (!token) throw new HttpError(401, 'Please sign in to continue.');
  const session = await db().session.findUnique({
    where: { id: await digest(token) },
    include: { user: { select: publicUser } },
  });
  if (!session || session.expiresAt < new Date() || !session.user.active)
    throw new HttpError(401, 'Your session has expired. Please sign in again.');
  return session.user;
}
export type Actor = Awaited<ReturnType<typeof userFor>>;
export function admin(user: Actor) {
  if (user.role !== 'ADMIN')
    throw new HttpError(403, 'Administrator access required.');
}
export function sameOrigin(req: Request) {
  const origin = req.headers.get('origin');
  if (!origin || origin !== new URL(req.url).origin)
    throw new HttpError(403, 'Invalid request origin.');
}
export function cookie(token: string, age = 28800) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
}
export async function login(req: Request, pin: string) {
  const ip =
    process.env.TRUST_CLOUDFLARE_IP === 'true'
      ? req.headers.get('cf-connecting-ip') || 'shared'
      : 'shared';
  const id = await lookup('throttle:' + ip);
  const now = new Date();
  return db().$transaction(
    async (tx) => {
      await tx.authThrottle.upsert({
        where: { id },
        create: { id },
        update: {},
      });
      await tx.$queryRaw`SELECT id FROM "AuthThrottle" WHERE id = ${id} FOR UPDATE`;
      const throttle = await tx.authThrottle.findUniqueOrThrow({
        where: { id },
      });
      if (throttle.lockedUntil && throttle.lockedUntil > now)
        return { error: true as const };
      const user = /^\d{3}$/.test(pin)
        ? await tx.user.findUnique({ where: { pinLookup: await lookup(pin) } })
        : null;
      const matches = await compare(
        pin,
        user?.pinHash ??
          (await (dummyHash ??= pinHash('invalid-access-marker'))),
      );
      const valid = user && user.active && matches;
      if (!valid) {
        const failures =
          throttle.lockedUntil && throttle.lockedUntil <= now
            ? 1
            : throttle.failures + 1;
        await tx.authThrottle.update({
          where: { id },
          data: {
            failures,
            lockedUntil:
              failures >= 5 ? new Date(now.getTime() + 15 * 60 * 1000) : null,
          },
        });
        await tx.auditLog.create({
          data: { action: 'LOGIN_FAILED', entityType: 'Session', ipHash: id },
        });
        return { error: true as const };
      }
      const token = Array.from(
        crypto.getRandomValues(new Uint8Array(32)),
        (b) => b.toString(16).padStart(2, '0'),
      ).join('');
      await tx.session.create({
        data: {
          id: await digest(token),
          userId: user.id,
          expiresAt: new Date(now.getTime() + 8 * 3600000),
        },
      });
      await tx.authThrottle.update({
        where: { id },
        data: { failures: 0, lockedUntil: null },
      });
      await tx.user.update({
        where: { id: user.id },
        data: { lastLogin: now },
      });
      await tx.auditLog.create({
        data: {
          userId: user.id,
          role: user.role,
          action: 'LOGIN',
          entityType: 'Session',
          ipHash: id,
        },
      });
      return { error: false as const, token };
    },
    { timeout: 15000 },
  );
}
