import { AsyncLocalStorage } from 'node:async_hooks';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

export function databaseConfig(
  env: Record<string, string | undefined> = process.env,
) {
  const connectionString = env.DATABASE_URL;
  if (
    !connectionString ||
    !env.SESSION_SECRET ||
    env.SESSION_SECRET.length < 32
  )
    throw Error('SETUP_REQUIRED');
  try {
    const url = new URL(connectionString);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname)
      throw Error();
  } catch {
    throw Error('SETUP_REQUIRED');
  }
  return {
    connectionString,
    max: 3,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 5000,
  };
}

// TCP sockets belong to one Worker request, never to a global client/pool.
// AsyncLocalStorage isolates concurrent requests while sharing within a request.
const scope = new AsyncLocalStorage<{ client?: PrismaClient }>();
export async function withDatabase<T>(work: () => Promise<T>): Promise<T> {
  if (scope.getStore()) return work();
  const state: { client?: PrismaClient } = {};
  return scope.run(state, async () => {
    try {
      return await work();
    } finally {
      await state.client?.$disconnect();
    }
  });
}
export function db() {
  const state = scope.getStore();
  if (!state) throw Error('Database access requires a request scope');
  return (state.client ??= new PrismaClient({
    adapter: new PrismaPg(databaseConfig()),
  }));
}
