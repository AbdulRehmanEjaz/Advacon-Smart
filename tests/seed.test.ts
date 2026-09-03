import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { seedProject } from '../prisma/seed';
import { formatSeedError, SeedError } from '../prisma/seed-errors';
import { testPostgres } from './helpers/postgres';

const secret = 'isolated-seed-test-secret-more-than-32-characters';

await test('seed diagnostics expose only safe code, message and stage', () => {
  const sensitive = [
    'postgres://owner:password@example.test/app',
    'password',
    'session-secret-that-must-not-be-printed',
    'first-pin-value',
    'second-pin-value',
    'pinHash-value',
    'pinLookup-value',
  ];
  const source = Object.assign(
    new Error(`query failed ${sensitive.join(' ')}`),
    {
      code: 'P2028',
      meta: { modelName: 'User', cause: sensitive.join(' ') },
    },
  );
  const output = formatSeedError(new SeedError('transaction commit', source));
  assert.match(output, /Stage: transaction commit/);
  assert.match(output, /Code: P2028/);
  assert.match(output, /transaction could not start or expired/);
  for (const value of sensitive) assert.equal(output.includes(value), false);
});

await test(
  'seed is empty-database safe, latency tolerant and idempotently preserves operational data',
  { timeout: 30000 },
  async () => {
    const postgres = await testPostgres({ roundTripMs: 100 });
    const prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: postgres.url, max: 1 }),
    });
    try {
      await seedProject(prisma, secret, '012', '345');
      await prisma.block.update({ where: { id: 'A01' }, data: { hold: true } });
      await prisma.projectSettings.update({
        where: { projectId: 'tree-project' },
        data: { amberVariance: -7 },
      });
      await seedProject(prisma, secret, '012', '345');
      assert.equal(await prisma.project.count(), 1);
      assert.equal(await prisma.zone.count(), 4);
      assert.equal(await prisma.block.count(), 19);
      assert.equal(
        (await prisma.block.findUniqueOrThrow({ where: { id: 'A01' } })).hold,
        true,
      );
      assert.equal(
        Number(
          (
            await prisma.projectSettings.findUniqueOrThrow({
              where: { projectId: 'tree-project' },
            })
          ).amberVariance,
        ),
        -7,
      );
      assert.equal(
        await prisma.user.count({
          where: { id: { in: ['initial-admin', 'initial-foreman'] } },
        }),
        2,
      );
    } finally {
      await prisma.$disconnect();
      await postgres.close();
    }
  },
);
