import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from 'bcryptjs';
import { createHmac } from 'node:crypto';
import { baseline, packages, zones } from '../lib/domain/baseline';
export async function seedProject(
  prisma: PrismaClient,
  secret: string,
  adminPin: string,
  foremanPin: string,
) {
  if (
    secret.length < 32 ||
    !/^\d{3}$/.test(adminPin) ||
    !/^\d{3}$/.test(foremanPin) ||
    adminPin === foremanPin
  )
    throw Error('Set a valid secret and distinct three-digit seed PINs.');
  await prisma.$transaction(
    async (tx) => {
      // Also serializes initialization with normal project mutations on reruns.
      await tx.project.upsert({
        where: { id: 'tree-project' },
        create: { id: 'tree-project' },
        update: {},
      });
      await tx.$queryRaw`SELECT id FROM "Project" WHERE id = 'tree-project' FOR UPDATE`;
      await seedBaseline(tx);
      const users = [
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
      ];
      // Preflight both PINs before any account update; never overwrite another user.
      for (const user of users) {
        const pinLookup = createHmac('sha256', secret)
          .update(user.pin)
          .digest('hex');
        const conflict = await tx.user.findUnique({
          where: { pinLookup },
          select: { id: true },
        });
        if (conflict && conflict.id !== user.id)
          throw Error(
            'An initialization PIN is already assigned to another account. No accounts changed.',
          );
      }
      for (const user of users) {
        await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id} FOR UPDATE`;
        const existing = await tx.user.findUnique({
          where: { id: user.id },
          select: { id: true },
        });
        const values = {
          name: user.name,
          role: user.role,
          active: true,
          archivedAt: null,
          pinHash: await hash(user.pin, 12),
          pinLookup: createHmac('sha256', secret)
            .update(user.pin)
            .digest('hex'),
          defaultPin: true,
          failedLoginCount: 0,
          lockedUntil: null,
        };
        await tx.user.upsert({
          where: { id: user.id },
          create: { id: user.id, ...values },
          update: values,
        });
        await tx.session.deleteMany({ where: { userId: user.id } });
        await tx.auditLog.create({
          data: {
            action: existing ? 'INITIAL_USER_RESET' : 'USER_SEEDED',
            entityType: 'User',
            entityId: user.id,
            after: {
              name: user.name,
              role: user.role,
              active: true,
              pinReset: true,
            },
          },
        });
      }
    },
    { timeout: 60000 },
  );
}

async function seedBaseline(
  tx: import('@prisma/client').Prisma.TransactionClient,
) {
  await tx.project.upsert({
    where: { id: 'tree-project' },
    create: { id: 'tree-project' },
    update: {},
  });
  await tx.projectSettings.upsert({
    where: { projectId: 'tree-project' },
    create: { projectId: 'tree-project', ...baseline },
    update: {},
  });
  for (const zone of zones) {
    await tx.zone.upsert({
      where: { id: zone.id },
      create: {
        id: zone.id,
        capacity: zone.capacity,
        spacing: zone.spacing,
      },
      update: {},
    });
    for (let i = 1; i <= zone.count; i++) {
      const id = zone.id + String(i).padStart(2, '0');
      await tx.block.upsert({
        where: { id },
        create: { id, name: id, zoneId: zone.id },
        update: {},
      });
    }
  }
  for (const p of packages) {
    await tx.workPackage.upsert({
      where: { id: p.id },
      create: { id: p.id, name: p.name, weight: p.weight, order: p.order },
      update: {},
    });
    for (const a of p.activities) {
      const { schedule: _schedule, ...data } = a;
      await tx.activity.upsert({
        where: { id: a.id },
        create: data,
        update: {},
      });
    }
  }
}

// Importing the seed for isolated tests never executes it or contacts a database.
if (process.argv[1]?.replaceAll('\\', '/').endsWith('/prisma/seed.ts')) {
  const connectionString =
    process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
  if (!connectionString || !/^postgres(?:ql)?:\/\//.test(connectionString))
    throw Error('Set the migration database URL privately.');
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  try {
    await seedProject(
      prisma,
      process.env.SESSION_SECRET || '',
      process.env.INITIAL_ADMIN_PIN || '',
      process.env.INITIAL_FOREMAN_PIN || '',
    );
    console.log(
      'Initial accounts created/updated. Existing operational progress and baseline settings preserved.',
    );
  } catch {
    console.error(
      'Initialization failed. Verify the migration status, secret and unique seed PINs. No secret values are logged.',
    );
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
