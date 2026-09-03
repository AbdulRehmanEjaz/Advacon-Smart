import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { db } from './db';
import {
  admin,
  type Actor,
  HttpError,
  publicUser,
  COOKIE,
  digest,
  userFor,
} from './auth';
import {
  approvedTotals,
  assertStageOrder,
  readiness,
  targetFor,
  validateWeights,
  type Submission,
  type Block,
} from '../domain/calculations';
import type { PackageDefinition, Settings } from '../domain/baseline';
import { assertReviewable } from '../domain/workflow';
import { manageSupervisor } from './supervisors';
type Tx = Omit<
  ReturnType<typeof db>,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;
export const submissionInclude = {
  supervisor: { select: { name: true } },
  items: { include: { adjustments: true } },
  photos: { select: { id: true, name: true } },
  approvals: { orderBy: { createdAt: 'asc' as const } },
} as const;
export const serial = <T>(x: unknown): T => JSON.parse(JSON.stringify(x));
async function records(tx: Tx) {
  const [settings, packages, submissions, blocks] = await Promise.all([
    tx.projectSettings.findUniqueOrThrow({
      where: { projectId: 'tree-project' },
    }),
    tx.workPackage.findMany({
      orderBy: { order: 'asc' },
      include: { activities: { include: { schedule: true } } },
    }),
    tx.dailySubmission.findMany({
      include: submissionInclude,
      orderBy: { createdAt: 'desc' },
    }),
    tx.block.findMany({ orderBy: { id: 'asc' } }),
  ]);
  return {
    settings: serial<Settings>(settings),
    packages: serial<PackageDefinition[]>(packages),
    submissions: serial<Submission[]>(submissions),
    blocks: serial<Block[]>(blocks).map((b) => ({
      ...b,
      irrigationTarget:
        b.irrigationTarget == null ? null : Number(b.irrigationTarget),
    })),
  };
}
export async function getState(user: Actor) {
  if (user.role === 'FOREMAN') {
    // A coherent snapshot on one connection, including the user's history and
    // the block/activity selectors needed to enter a new submission.
    return db().$transaction(
      async (tx) => {
        const [submissions, blocks, packages] = await Promise.all([
          tx.dailySubmission.findMany({
            where: { supervisorId: user.id },
            include: submissionInclude,
            orderBy: { createdAt: 'desc' },
          }),
          tx.block.findMany({ select: { id: true, name: true, zoneId: true } }),
          tx.workPackage.findMany({
            orderBy: { order: 'asc' },
            include: { activities: true },
          }),
        ]);
        return { user, submissions, blocks, packages };
      },
      { isolationLevel: 'RepeatableRead', timeout: 15000 },
    );
  }
  return db().$transaction(
    async (tx) => {
      const core = await records(tx);
      const [userRows, zones, inspections, audit, auditActors, auditSubjects] =
        await Promise.all([
          tx.user.findMany({
            select: {
              ...publicUser,
              _count: {
                select: {
                  submissions: true,
                  approvals: true,
                  adjustments: true,
                },
              },
            },
            orderBy: { name: 'asc' },
          }),
          tx.zone.findMany({ orderBy: { id: 'asc' } }),
          tx.inspection.findMany({
            include: { observations: true },
            orderBy: { date: 'desc' },
          }),
          tx.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 500 }),
          tx.auditLog.groupBy({
            by: ['userId'],
            where: { userId: { not: null } },
          }),
          tx.auditLog.groupBy({
            by: ['entityId'],
            where: { entityType: 'User', entityId: { not: null } },
          }),
        ]);
      const historyIds = new Set([
        ...auditActors.map((a) => a.userId),
        ...auditSubjects.map((a) => a.entityId),
      ]);
      const users = userRows.map(({ _count, ...u }) => ({
        ...u,
        hasHistory:
          historyIds.has(u.id) ||
          Object.values(_count).some((count) => count > 0),
      }));
      return { ...core, user, users, zones, inspections, audit };
    },
    { isolationLevel: 'RepeatableRead', timeout: 15000 },
  );
}
async function audit(
  tx: Tx,
  user: Actor,
  action: string,
  entityType: string,
  entityId?: string,
  before?: unknown,
  after?: unknown,
) {
  await tx.auditLog.create({
    data: {
      userId: user.id,
      role: user.role,
      action,
      entityType,
      entityId,
      ...(before !== undefined
        ? { before: serial<Prisma.InputJsonValue>(before) }
        : {}),
      ...(after !== undefined
        ? { after: serial<Prisma.InputJsonValue>(after) }
        : {}),
    },
  });
}
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !Number.isNaN(new Date(v).getTime()) &&
      new Date(v).toISOString().slice(0, 10) === v,
    'Invalid date',
  );
const reason = z.string().trim().min(5).max(2000);
const submissionSchema = z.object({
  id: z.string().optional(),
  version: z.number().int().optional(),
  requestKey: z.uuid(),
  workDate: date,
  blockId: z.string(),
  packageId: z.string(),
  batchNumber: z.string().trim().max(100).optional(),
  remarks: z.string().trim().max(3000).default(''),
  overrideReason: z.string().trim().max(2000).optional(),
  items: z
    .array(
      z.object({
        activityId: z.string(),
        quantity: z.number().positive().max(1000000).multipleOf(0.001),
      }),
    )
    .min(1)
    .max(30),
});
function requireThat(value: unknown, message: string): asserts value {
  if (!value) throw new HttpError(400, message);
}
function checkPlacement(
  core: Awaited<ReturnType<typeof records>>,
  block: Block,
  items: { activityId: string; quantity: number }[],
  user: Actor,
  override?: string,
) {
  const trees = items
    .filter((i) => ['placed', 'planted'].includes(i.activityId))
    .reduce((n, i) => n + i.quantity, 0);
  if (!trees) return;
  const state = readiness(block, core.submissions);
  const problems = [
    ...(!state.ready ? state.reasons : []),
    ...(state.remaining == null
      ? ['Block capacity is not configured']
      : trees > state.remaining
        ? ['Block capacity would be exceeded']
        : []),
  ];
  if (problems.length)
    requireThat(
      user.role === 'ADMIN' && override && override.trim().length >= 5,
      problems.join('. ') +
        '. An administrator must provide a documented override.',
    );
}
function validateCandidate(
  core: Awaited<ReturnType<typeof records>>,
  submissions: Submission[],
  user: Actor,
  override?: string,
) {
  try {
    for (const block of core.blocks)
      assertStageOrder(
        approvedTotals(submissions.filter((s) => s.blockId === block.id)),
      );
  } catch (e) {
    throw new HttpError(
      400,
      e instanceof Error ? e.message : 'Invalid stage quantities.',
    );
  }
  const totals = approvedTotals(submissions);
  for (const a of core.packages.flatMap((p) => p.activities))
    if (
      (totals[a.id] || 0) > targetFor(a, core.settings) &&
      targetFor(a, core.settings) > 0
    )
      requireThat(
        user.role === 'ADMIN' && override && override.length >= 5,
        `${a.name} would exceed its project target. A documented administrator override is required.`,
      );
  for (const block of core.blocks) {
    const t = approvedTotals(submissions.filter((s) => s.blockId === block.id));
    if ((t.commissioned || 0) > 0)
      requireThat(
        block.irrigationTarget != null &&
          ['route', 'trench', 'pipe', 'backfill'].every(
            (k) => (t[k] || 0) >= Number(block.irrigationTarget),
          ) &&
          (t.valves || 0) >= 1 &&
          (t.decoders || 0) >= 1,
        'Commissioning requires the configured block pipe length, backfill, valve and decoder.',
      );
  }
}
export async function mutate(path: string, req: Request, user: Actor) {
  if (path === 'logout') {
    const token = req.headers
      .get('cookie')
      ?.split(';')
      .map((s) => s.trim())
      .find((s) => s.startsWith(COOKIE + '='))
      ?.slice(COOKIE.length + 1);
    if (token)
      await db().session.deleteMany({ where: { id: await digest(token) } });
    return { ok: true };
  }
  if (Number(req.headers.get('content-length') || 0) > 8_000_000)
    throw new HttpError(413, 'Upload is too large.');
  const body: unknown = await req.json();
  return db().$transaction(
    async (tx) => {
      // All project mutations use one database lock: approval, adjustments and configuration cannot race.
      await tx.$queryRaw`SELECT id FROM "Project" WHERE id = 'tree-project' FOR UPDATE`;
      const fresh = await tx.user.findUniqueOrThrow({
        where: { id: user.id },
        select: publicUser,
      });
      if (!fresh.active || fresh.archivedAt || fresh.role !== user.role)
        throw new HttpError(
          403,
          'Your access has changed. Please sign in again.',
        );
      // A request waiting behind an account reset must not keep using a
      // session revoked while it waited for the project lock.
      const sessionUser = await userFor(req, tx);
      if (sessionUser.id !== fresh.id)
        throw new HttpError(403, 'Account mismatch.');
      if (path === 'submission') {
        const data = submissionSchema.parse(body);
        requireThat(
          data.workDate <= new Date().toISOString().slice(0, 10),
          'Future-dated progress is not allowed.',
        );
        const existing = await tx.dailySubmission.findUnique({
          where: { requestKey: data.requestKey },
        });
        if (existing && !data.id) {
          requireThat(existing.supervisorId === user.id, 'Duplicate request.');
          return { id: existing.id };
        }
        const core = await records(tx),
          block = core.blocks.find((b) => b.id === data.blockId),
          pkg = core.packages.find((p) => p.id === data.packageId);
        requireThat(block && pkg, 'Select a valid block and work package.');
        requireThat(
          new Set(data.items.map((i) => i.activityId)).size ===
            data.items.length,
          'Duplicate activity.',
        );
        for (const item of data.items) {
          const activity = pkg.activities.find((a) => a.id === item.activityId);
          requireThat(
            activity,
            'Activity does not belong to this work package.',
          );
          requireThat(
            activity.unit === 'm' || Number.isInteger(item.quantity),
            'Use whole numbers for trees, rows, posts and milestones.',
          );
          if (activity.unit === 'milestone')
            requireThat(
              item.quantity === 1,
              'Milestones must be submitted as one completed item.',
            );
        }
        if (user.role !== 'ADMIN')
          requireThat(
            !data.overrideReason,
            'Only administrators can override readiness.',
          );
        checkPlacement(core, block, data.items, user, data.overrideReason);
        const { items, id, version, ...values } = data;
        let record;
        if (id) {
          const before = await tx.dailySubmission.findUniqueOrThrow({
            where: { id },
            include: submissionInclude,
          });
          requireThat(
            before.supervisorId === user.id &&
              before.status === 'RETURNED' &&
              before.version === version,
            'Only your own returned submission can be edited and resubmitted.',
          );
          await tx.dailySubmissionItem.deleteMany({
            where: { submissionId: id },
          });
          record = await tx.dailySubmission.update({
            where: { id },
            data: {
              ...values,
              workDate: new Date(values.workDate),
              status: 'WAITING',
              version: { increment: 1 },
              items: { create: items },
            },
          });
          await audit(tx, user, 'RESUBMIT', 'Submission', id, before, {
            ...data,
            status: 'WAITING',
          });
        } else {
          record = await tx.dailySubmission.create({
            data: {
              ...values,
              workDate: new Date(values.workDate),
              supervisorId: user.id,
              items: { create: items },
            },
          });
          await audit(
            tx,
            user,
            'SUBMIT',
            'Submission',
            record.id,
            undefined,
            data,
          );
        }
        return { id: record.id };
      }
      if (path === 'photo') {
        const data = z
          .object({
            submissionId: z.string(),
            name: z.string().max(100),
            data: z.string().max(7_000_000),
            mime: z.enum(['image/jpeg', 'image/png', 'image/webp']),
          })
          .parse(body);
        const sub = await tx.dailySubmission.findUniqueOrThrow({
          where: { id: data.submissionId },
          include: { photos: { select: { id: true } } },
        });
        requireThat(
          sub.supervisorId === user.id &&
            ['WAITING', 'RETURNED'].includes(sub.status),
          'Photos can only be attached to your unapproved submissions.',
        );
        requireThat(
          sub.photos.length < 5,
          'Maximum five photos per submission.',
        );
        let bytes: Uint8Array<ArrayBuffer>;
        try {
          bytes = Uint8Array.from(atob(data.data), (c) => c.charCodeAt(0));
        } catch {
          throw new HttpError(400, 'Invalid image data.');
        }
        requireThat(
          bytes.length <= 5 * 1024 * 1024,
          'Each photo must be under 5 MB.',
        );
        const valid =
          data.mime === 'image/png'
            ? bytes[0] === 137 &&
              bytes[1] === 80 &&
              bytes[2] === 78 &&
              bytes[3] === 71
            : data.mime === 'image/jpeg'
              ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
              : new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' &&
                new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP';
        requireThat(
          valid,
          'File content does not match the selected image type.',
        );
        const photo = await tx.submissionPhoto.create({
          data: {
            submissionId: sub.id,
            name: data.name,
            mime: data.mime,
            bytes,
          },
        });
        await audit(
          tx,
          user,
          'PHOTO_ATTACHED',
          'Submission',
          sub.id,
          undefined,
          { photoId: photo.id, name: data.name },
        );
        return { id: photo.id };
      }
      admin(user);
      if (path === 'review') {
        const data = z
          .object({
            id: z.string(),
            version: z.number().int(),
            decision: z.enum(['APPROVED', 'RETURNED', 'REJECTED']),
            comment: z.string().trim().max(2000).default(''),
            overrideReason: z.string().trim().max(2000).optional(),
          })
          .parse(body);
        const before = await tx.dailySubmission.findUniqueOrThrow({
          where: { id: data.id },
          include: submissionInclude,
        });
        try {
          assertReviewable(before.status, before.version, data.version);
        } catch (e) {
          throw new HttpError(409, (e as Error).message);
        }
        if (data.decision !== 'APPROVED')
          requireThat(
            data.comment.length >= 5,
            'A meaningful review comment is required.',
          );
        if (data.decision === 'APPROVED') {
          const core = await records(tx);
          const sub = serial<Submission>(before);
          checkPlacement(
            core,
            core.blocks.find((b) => b.id === sub.blockId)!,
            sub.items.map((i) => ({ ...i, quantity: Number(i.quantity) })),
            user,
            data.overrideReason,
          );
          validateCandidate(
            core,
            core.submissions.map((s) =>
              s.id === sub.id ? { ...s, status: 'APPROVED' } : s,
            ),
            user,
            data.overrideReason,
          );
        }
        await tx.approval.create({
          data: {
            submissionId: data.id,
            reviewerId: user.id,
            decision: data.decision,
            comment: data.comment,
            version: data.version,
          },
        });
        await tx.dailySubmission.update({
          where: { id: data.id },
          data: { status: data.decision },
        });
        await audit(
          tx,
          user,
          data.decision,
          'Submission',
          data.id,
          before,
          data,
        );
        return { ok: true };
      }
      if (path === 'adjustment') {
        const data = z
          .object({
            requestKey: z.uuid(),
            itemId: z.string(),
            quantity: z
              .number()
              .min(-1000000)
              .max(1000000)
              .multipleOf(0.001)
              .refine((n) => n !== 0),
            reason,
            overrideReason: z.string().trim().max(2000).optional(),
          })
          .parse(body);
        const duplicate = await tx.adjustment.findUnique({
          where: { requestKey: data.requestKey },
        });
        if (duplicate) return { id: duplicate.id };
        const item = await tx.dailySubmissionItem.findUniqueOrThrow({
          where: { id: data.itemId },
          include: { submission: true, activity: true, adjustments: true },
        });
        requireThat(
          item.submission.status === 'APPROVED',
          'Only approved work may be adjusted.',
        );
        requireThat(
          Number(item.quantity) +
            item.adjustments.reduce((n, a) => n + Number(a.quantity), 0) +
            data.quantity >=
            0,
          'Adjustment cannot make this item negative.',
        );
        requireThat(
          item.activity.unit === 'm' || Number.isInteger(data.quantity),
          'Use whole quantities for this activity.',
        );
        const core = await records(tx);
        const beforeBlock = readiness(
          core.blocks.find((b) => b.id === item.submission.blockId)!,
          core.submissions,
        );
        const candidate = core.submissions.map((s) => ({
          ...s,
          items: s.items.map((i) =>
            i.id === item.id
              ? {
                  ...i,
                  adjustments: [
                    ...i.adjustments,
                    {
                      quantity: data.quantity,
                      createdAt: new Date().toISOString(),
                    },
                  ],
                }
              : i,
          ),
        }));
        if (data.quantity > 0)
          checkPlacement(
            core,
            beforeBlock,
            [{ activityId: item.activityId, quantity: data.quantity }],
            user,
            data.overrideReason,
          );
        validateCandidate(core, candidate, user, data.overrideReason);
        const afterBlock = readiness(beforeBlock, candidate);
        requireThat(
          !(beforeBlock.ready && !afterBlock.ready && beforeBlock.occupied > 0),
          'This correction would remove readiness from an occupied block. Place the block on hold and resolve the safety issue first.',
        );
        const { overrideReason: _overrideReason, ...entry } = data;
        const saved = await tx.adjustment.create({
          data: { ...entry, authorId: user.id },
        });
        await audit(tx, user, 'ADJUST', 'SubmissionItem', item.id, item, data);
        return { id: saved.id };
      }
      if (path === 'supervisor') {
        return manageSupervisor(tx, fresh, body);
      }
      if (path === 'block') {
        const data = z
          .object({
            id: z.string(),
            capacity: z.number().int().nonnegative().nullable(),
            irrigationTarget: z.number().nonnegative().nullable(),
            supportRows: z.number().int().nonnegative().nullable(),
            hold: z.boolean(),
            reason,
          })
          .parse(body);
        const core = await records(tx),
          before = core.blocks.find((b) => b.id === data.id);
        requireThat(before, 'Block not found.');
        const zone = await tx.zone.findUniqueOrThrow({
          where: { id: before.zoneId },
        });
        const peers = core.blocks.filter((b) => b.id !== data.id);
        requireThat(
          peers
            .filter((b) => b.zoneId === zone.id)
            .reduce((n, b) => n + (b.capacity || 0), 0) +
            (data.capacity || 0) <=
            zone.capacity,
          'Block allocations exceed the zone capacity.',
        );
        requireThat(
          peers.reduce((n, b) => n + (b.supportRows || 0), 0) +
            (data.supportRows || 0) <=
            Number(core.settings.rowTarget),
          'Row allocations exceed the project baseline.',
        );
        requireThat(
          peers.reduce((n, b) => n + Number(b.irrigationTarget || 0), 0) +
            Number(data.irrigationTarget || 0) <=
            Number(core.settings.irrigationTarget),
          'Irrigation allocations exceed the baseline.',
        );
        const occupied = readiness(before, core.submissions).occupied;
        requireThat(
          data.capacity == null ? occupied === 0 : data.capacity >= occupied,
          'Capacity cannot be reduced below occupied capacity.',
        );
        const { id, reason: changeReason, ...values } = data;
        await tx.block.update({ where: { id }, data: values });
        await audit(tx, user, 'BLOCK_UPDATED', 'Block', id, before, {
          ...values,
          reason: changeReason,
        });
        return { ok: true };
      }
      if (path === 'schedule') {
        const data = z
          .object({
            activities: z
              .array(z.object({ id: z.string(), start: date, finish: date }))
              .min(1),
            reason,
          })
          .parse(body);
        requireThat(
          new Set(data.activities.map((a) => a.id)).size ===
            data.activities.length,
          'Duplicate schedule activity.',
        );
        for (const a of data.activities) {
          requireThat(a.finish >= a.start, 'Finish must not precede start.');
          await tx.scheduleActivity.upsert({
            where: { activityId: a.id },
            create: {
              activityId: a.id,
              start: new Date(a.start),
              finish: new Date(a.finish),
            },
            update: { start: new Date(a.start), finish: new Date(a.finish) },
          });
        }
        await audit(
          tx,
          user,
          'SCHEDULE_UPDATED',
          'Schedule',
          undefined,
          undefined,
          data,
        );
        return { ok: true };
      }
      if (path === 'activity-weights') {
        const data = z
          .object({
            packageId: z.string(),
            weights: z.array(
              z.object({ id: z.string(), weight: z.number().min(0).max(100) }),
            ),
            reason,
          })
          .parse(body);
        requireThat(
          validateWeights(data.weights),
          'Internal activity weights must total exactly 100%.',
        );
        if (data.packageId === 'translocation')
          requireThat(
            data.weights.every(
              (w) => w.weight === (w.id === 'placed' ? 100 : 0),
            ),
            'Official translocation progress must remain based only on correctly placed trees.',
          );
        const before = await tx.activity.findMany({
          where: { packageId: data.packageId },
        });
        requireThat(
          before.length === data.weights.length &&
            new Set(data.weights.map((w) => w.id)).size === before.length &&
            data.weights.every((w) => before.some((a) => a.id === w.id)),
          'Include every package activity exactly once.',
        );
        for (const w of data.weights)
          await tx.activity.update({
            where: { id: w.id },
            data: { weight: w.weight },
          });
        await audit(
          tx,
          user,
          'ACTIVITY_WEIGHTS_UPDATED',
          'WorkPackage',
          data.packageId,
          before.map((a) => ({ id: a.id, weight: a.weight })),
          data,
        );
        return { ok: true };
      }
      if (path === 'settings') {
        const positive = z.number().int().positive();
        const data = z
          .object({
            translocationTarget: positive,
            newTreeTarget: positive,
            irrigationTarget: z.number().positive(),
            rowTarget: positive,
            postTarget: positive,
            productivityMin: positive,
            productivityMax: positive,
            pendingHours: positive,
            translocationTargetIsApproximate: z.boolean(),
            weights: z.array(
              z.object({ id: z.string(), weight: z.number().min(0).max(100) }),
            ),
            reason,
          })
          .parse(body);
        requireThat(
          validateWeights(data.weights),
          'Package weights must total exactly 100%.',
        );
        requireThat(
          data.postTarget === data.rowTarget * 5,
          'Support baseline requires five posts per row.',
        );
        requireThat(
          data.productivityMax >= data.productivityMin,
          'Productivity maximum must be at least the minimum.',
        );
        const core = await records(tx);
        requireThat(
          data.weights.length === core.packages.length &&
            new Set(data.weights.map((w) => w.id)).size ===
              core.packages.length &&
            data.weights.every((w) => core.packages.some((p) => p.id === w.id)),
          'Include each work package once.',
        );
        const { weights, reason: changeReason, ...values } = data;
        const candidate = {
          ...core,
          settings: { ...core.settings, ...values },
        };
        validateCandidate(candidate, core.submissions, user); // Baselines cannot silently fall below approved quantities.
        requireThat(
          core.blocks.reduce(
            (n, b) => n + Number(b.irrigationTarget || 0),
            0,
          ) <= data.irrigationTarget &&
            core.blocks.reduce((n, b) => n + (b.supportRows || 0), 0) <=
              data.rowTarget,
          'Baseline cannot be below allocated block quantities.',
        );
        await tx.projectSettings.update({
          where: { projectId: 'tree-project' },
          data: values,
        });
        for (const w of weights)
          await tx.workPackage.update({
            where: { id: w.id },
            data: { weight: w.weight },
          });
        await audit(
          tx,
          user,
          'BASELINE_UPDATED',
          'Project',
          'tree-project',
          {
            settings: core.settings,
            weights: core.packages.map((p) => ({ id: p.id, weight: p.weight })),
          },
          { ...data, reason: changeReason },
        );
        return { ok: true };
      }
      if (path === 'inspection') {
        const data = z
          .object({
            number: z.string().trim().min(2).max(80),
            blockId: z.string(),
            type: z.enum([
              'Irrigation',
              'Support',
              'Tree health',
              'New tree acceptance',
              'Final inspection',
            ]),
            inspector: z.string().trim().min(2).max(80),
            result: z.enum(['PASSED', 'FAILED', 'REINSPECTION']),
            date,
            firstAttempt: z.boolean(),
            remarks: z.string().max(2000),
            observation: z.string().max(2000).optional(),
            responsible: z.string().max(80).optional(),
            dueDate: date.optional(),
          })
          .parse(body);
        requireThat(
          data.date <= new Date().toISOString().slice(0, 10),
          'Inspection date cannot be in the future.',
        );
        if (data.result !== 'PASSED' || data.observation)
          requireThat(
            data.observation && data.responsible && data.dueDate,
            'Observations require a description, responsible person and due date.',
          );
        const { observation, responsible, dueDate, ...values } = data;
        const saved = await tx.inspection.create({
          data: {
            ...values,
            date: new Date(values.date),
            ...(observation
              ? {
                  observations: {
                    create: {
                      description: observation,
                      responsible: responsible!,
                      dueDate: new Date(dueDate!),
                    },
                  },
                }
              : {}),
          },
        });
        await audit(
          tx,
          user,
          'INSPECTION_RECORDED',
          'Inspection',
          saved.id,
          undefined,
          data,
        );
        return { id: saved.id };
      }
      if (path === 'close-observation') {
        const data = z.object({ id: z.string(), reason }).parse(body);
        const before = await tx.observation.findUniqueOrThrow({
          where: { id: data.id },
        });
        requireThat(!before.closedAt, 'Observation already closed.');
        await tx.observation.update({
          where: { id: data.id },
          data: { closedAt: new Date() },
        });
        await audit(
          tx,
          user,
          'OBSERVATION_CLOSED',
          'Observation',
          data.id,
          before,
          data,
        );
        return { ok: true };
      }
      throw new HttpError(404, 'Unknown action.');
    },
    { timeout: 20000 },
  );
}
