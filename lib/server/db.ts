import { PrismaClient } from '@prisma/client/edge';
import { withAccelerate } from '@prisma/extension-accelerate';
let client: ReturnType<typeof create> | undefined;
function create() {
  if (!process.env.DATABASE_URL || !process.env.SESSION_SECRET)
    throw new Error('SETUP_REQUIRED');
  if (
    !process.env.DATABASE_URL.startsWith('prisma://') &&
    !process.env.DATABASE_URL.startsWith('prisma+postgres://')
  )
    throw new Error('SETUP_REQUIRED');
  return new PrismaClient({ datasourceUrl: process.env.DATABASE_URL }).$extends(
    withAccelerate(),
  );
}
export function db() {
  return (client ??= create());
}
