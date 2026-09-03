import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';
import { createHmac } from 'node:crypto';
import { baseline, packages, zones } from '../lib/domain/baseline';
const direct = process.env.DIRECT_DATABASE_URL,
  secret = process.env.SESSION_SECRET;
if (!direct || !secret || secret.length < 32)
  throw Error(
    'Set DIRECT_DATABASE_URL and SESSION_SECRET (at least 32 random characters) before seeding.',
  );
const adminPin = process.env.INITIAL_ADMIN_PIN,
  foremanPin = process.env.INITIAL_FOREMAN_PIN;
if (
  !adminPin ||
  !foremanPin ||
  !/^\d{3}$/.test(adminPin) ||
  !/^\d{3}$/.test(foremanPin) ||
  adminPin === foremanPin
)
  throw Error(
    'Set distinct, three-digit INITIAL_ADMIN_PIN and INITIAL_FOREMAN_PIN values.',
  );
const prisma = new PrismaClient({ datasourceUrl: direct });
try {
  await prisma.$transaction(
    async (tx) => {
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
      for (const user of [
        {
          id: 'initial-admin',
          name: 'Project Administrator',
          role: 'ADMIN' as const,
          pin: adminPin,
        },
        {
          id: 'initial-foreman',
          name: 'Site Foreman',
          role: 'FOREMAN' as const,
          pin: foremanPin,
        },
      ]) {
        const existing = await tx.user.findUnique({ where: { id: user.id } });
        if (existing) continue;
        await tx.user.create({
          data: {
            id: user.id,
            name: user.name,
            role: user.role,
            pinHash: await hash(user.pin, 12),
            pinLookup: createHmac('sha256', secret)
              .update(user.pin)
              .digest('hex'),
            defaultPin: true,
          },
        });
        await tx.auditLog.create({
          data: {
            action: 'USER_SEEDED',
            entityType: 'User',
            entityId: user.id,
            after: { name: user.name, role: user.role },
          },
        });
      }
    },
    { timeout: 30000 },
  );
  console.log(
    'Baseline and initial accounts seeded. Existing users and project data were preserved. No progress quantities were created.',
  );
} finally {
  await prisma.$disconnect();
}
