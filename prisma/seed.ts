import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from 'bcryptjs';
import { createHmac } from 'node:crypto';
import { baseline, packages, zones } from '../lib/domain/baseline';
import { SeedError, type SeedStage, formatSeedError } from './seed-errors';

export async function seedProject(
  prisma: PrismaClient,
  secret: string,
  adminPin: string,
  foremanPin: string,
) {
  let stage: SeedStage = 'input validation';
  try {
    if (
      secret.length < 32 ||
      !/^\d{3}$/.test(adminPin) ||
      !/^\d{3}$/.test(foremanPin) ||
      adminPin === foremanPin
    )
      throw new SeedError(stage, undefined, 'INVALID_INPUT');

    stage = 'account hashing';
    // bcrypt is deliberately OUTSIDE the transaction/row locks. Only database
    // work should consume the interactive transaction's timeout budget.
    const users = await Promise.all(
      [
        {
          id: 'initial-admin',
          name: 'Project Administrator',
          role: 'ADMIN' as const,
          pin: adminPin,
        },
        {
          id: 'initial-foreman',
          name: 'Site Supervisor',
          role: 'FOREMAN' as const,
          pin: foremanPin,
        },
      ].map(async ({ pin, ...user }) => ({
        ...user,
        pinHash: await hash(pin, 12),
        pinLookup: createHmac('sha256', secret).update(pin).digest('hex'),
      })),
    );

    stage = 'transaction acquisition';
    await prisma.$transaction(
      async (tx) => {
        stage = 'project creation';
        // Atomic INSERT ON CONFLICT DO NOTHING works on an empty database and
        // concurrent initializations. Empty-update upserts expand into many
        // read/create queries in Prisma 6's query compiler.
        await tx.project.createMany({
          data: [{ id: 'tree-project' }],
          skipDuplicates: true,
        });
        stage = 'project lock';
        await tx.$queryRaw`SELECT id FROM "Project" WHERE id = 'tree-project' FOR UPDATE`;
        await seedBaseline(tx, (next) => {
          stage = next;
        });

        stage = 'initial account locks';
        // No rows on first initialization is expected, NOT an error. The project
        // lock serializes creators; existing-user locks also serialize logins.
        await tx.$queryRaw`SELECT id FROM "User" WHERE id IN ('initial-admin', 'initial-foreman') ORDER BY id FOR UPDATE`;
        stage = 'initial account PIN uniqueness';
        const conflicts = await tx.user.findMany({
          where: { pinLookup: { in: users.map((user) => user.pinLookup) } },
          select: { id: true, pinLookup: true },
        });
        for (const user of users)
          if (
            conflicts.some(
              (other) =>
                other.pinLookup === user.pinLookup && other.id !== user.id,
            )
          )
            throw new SeedError(stage, undefined, 'PIN_CONFLICT');

        stage = 'initial account lookup';
        const existing = await tx.user.findMany({
          where: { id: { in: users.map((user) => user.id) } },
          select: { id: true },
        });
        for (const { id, ...user } of users) {
          stage =
            id === 'initial-admin'
              ? 'initial administrator upsert'
              : 'initial supervisor upsert';
          const values = {
            ...user,
            active: true,
            archivedAt: null,
            defaultPin: true,
            failedLoginCount: 0,
            lockedUntil: null,
          };
          await tx.user.upsert({
            where: { id },
            create: { id, ...values },
            update: values,
            select: { id: true },
          });
        }
        stage = 'initial account session revocation';
        await tx.session.deleteMany({
          where: { userId: { in: users.map((user) => user.id) } },
        });
        stage = 'initial account audit creation';
        await tx.auditLog.createMany({
          data: users.map((user) => ({
            action: existing.some((row) => row.id === user.id)
              ? 'INITIAL_USER_RESET'
              : 'USER_SEEDED',
            entityType: 'User',
            entityId: user.id,
            after: {
              name: user.name,
              role: user.role,
              active: true,
              pinReset: true,
            },
          })),
        });
        stage = 'transaction commit';
      },
      { maxWait: 15000, timeout: 60000 },
    );
  } catch (error) {
    // Never attach the original exception: Prisma messages can include query
    // arguments (including account hashes), SQL parameters or connection URLs.
    throw error instanceof SeedError ? error : new SeedError(stage, error);
  }
}

async function seedBaseline(
  tx: import('@prisma/client').Prisma.TransactionClient,
  setStage: (stage: SeedStage) => void,
) {
  // FK-ordered bulk inserts: existing settings/allocations/weights are NEVER
  // overwritten. This replaces hundreds of remote round trips with five.
  setStage('project settings');
  await tx.projectSettings.createMany({
    data: [{ projectId: 'tree-project', ...baseline }],
    skipDuplicates: true,
  });
  setStage('zones');
  await tx.zone.createMany({
    data: zones.map((zone) => ({
      id: zone.id,
      projectId: 'tree-project',
      capacity: zone.capacity,
      spacing: zone.spacing,
    })),
    skipDuplicates: true,
  });
  setStage('blocks');
  await tx.block.createMany({
    data: zones.flatMap((zone) =>
      Array.from({ length: zone.count }, (_, index) => {
        const id = zone.id + String(index + 1).padStart(2, '0');
        return { id, name: id, zoneId: zone.id };
      }),
    ),
    skipDuplicates: true,
  });
  setStage('work packages');
  await tx.workPackage.createMany({
    data: packages.map((p) => ({
      id: p.id,
      projectId: 'tree-project',
      name: p.name,
      weight: p.weight,
      order: p.order,
    })),
    skipDuplicates: true,
  });
  setStage('activities');
  await tx.activity.createMany({
    data: packages.flatMap((p) =>
      p.activities.map(({ schedule: _schedule, ...data }) => data),
    ),
    skipDuplicates: true,
  });
}

// Importing the seed for isolated tests never executes it or contacts a database.
if (process.argv[1]?.replaceAll('\\', '/').endsWith('/prisma/seed.ts')) {
  let prisma: PrismaClient | undefined;
  try {
    const connectionString =
      process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
    if (!connectionString || !/^postgres(?:ql)?:\/\//.test(connectionString))
      throw new SeedError(
        'database configuration',
        undefined,
        'INVALID_DATABASE_CONFIG',
      );
    prisma = new PrismaClient({
      adapter: new PrismaPg({
        connectionString,
        max: 1,
        connectionTimeoutMillis: 10000,
        idleTimeoutMillis: 5000,
      }),
      // Do not enable Prisma query/error logging; only the safe reporter below.
      log: [],
    });
    await seedProject(
      prisma,
      process.env.SESSION_SECRET || '',
      process.env.INITIAL_ADMIN_PIN || '',
      process.env.INITIAL_FOREMAN_PIN || '',
    );
    console.log(
      'Initial accounts created/updated. Existing operational progress and baseline settings preserved.',
    );
  } catch (error) {
    console.error(
      formatSeedError(
        error instanceof SeedError
          ? error
          : new SeedError('database configuration', error),
      ),
    );
    process.exitCode = 1;
  } finally {
    try {
      await prisma?.$disconnect();
    } catch (error) {
      console.error(
        formatSeedError(new SeedError('database disconnect', error)),
      );
      process.exitCode = 1;
    }
  }
}
