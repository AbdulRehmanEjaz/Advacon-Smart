import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import {
  admin,
  type Actor,
  HttpError,
  lookup,
  pinHash,
  publicUser,
} from './auth';

const id = z.string().min(1);
const name = z.string().trim().min(2).max(80);
const pin = z.string().regex(/^\d{3}$/, 'Use exactly three numeric digits.');
export const supervisorAction = z
  .discriminatedUnion('action', [
    z.object({ action: z.literal('create'), name, pin, confirmPin: pin }),
    z.object({ action: z.literal('rename'), id, name }),
    z.object({ action: z.literal('pin'), id, pin, confirmPin: pin }),
    z.object({ action: z.literal('status'), id, active: z.boolean() }),
    z.object({ action: z.literal('delete'), id, confirmed: z.literal(true) }),
  ])
  .superRefine((value, ctx) => {
    if ('pin' in value && value.pin !== value.confirmPin)
      ctx.addIssue({
        code: 'custom',
        path: ['confirmPin'],
        message: 'PINs do not match.',
      });
  });

export async function hasSupervisorHistory(
  tx: Prisma.TransactionClient,
  id: string,
) {
  const counts = await Promise.all([
    tx.dailySubmission.count({ where: { supervisorId: id } }),
    tx.approval.count({ where: { reviewerId: id } }),
    tx.adjustment.count({ where: { authorId: id } }),
    tx.auditLog.count({
      where: { OR: [{ userId: id }, { entityType: 'User', entityId: id }] },
    }),
  ]);
  return counts.some((count) => count > 0);
}

// Caller holds the project lock. All changes, session revocation and audit
// events commit together; historical foreign keys are never rewritten.
export async function manageSupervisor(
  tx: Prisma.TransactionClient,
  actor: Actor,
  body: unknown,
) {
  admin(actor);
  const data = supervisorAction.parse(body);
  const targetId = 'id' in data ? data.id : undefined;
  if (targetId)
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${targetId} FOR UPDATE`;
  const before = targetId
    ? await tx.user.findUnique({ where: { id: targetId }, select: publicUser })
    : null;
  if (targetId && !before) throw new HttpError(404, 'Account not found.');
  if (
    before?.role === 'ADMIN' &&
    (before.id !== actor.id || !['rename', 'pin'].includes(data.action))
  )
    throw new HttpError(
      403,
      'Administrator accounts cannot be deactivated or deleted here.',
    );

  let secret:
    | { pinHash: string; pinLookup: string; defaultPin: boolean }
    | undefined;
  if ('pin' in data) {
    const pinLookup = await lookup(data.pin);
    const duplicate = await tx.user.findUnique({
      where: { pinLookup },
      select: { id: true },
    });
    if (duplicate && duplicate.id !== targetId)
      throw new HttpError(
        409,
        'That PIN is already assigned. Choose a different PIN.',
      );
    // Reserve PINs on inactive accounts too, making reactivation unambiguous.
    secret = { pinHash: await pinHash(data.pin), pinLookup, defaultPin: false };
  }

  let saved;
  let action: string;
  let outcome: 'saved' | 'archived' | 'deleted' = 'saved';
  if (data.action === 'create') {
    saved = await tx.user.create({
      data: { name: data.name, role: 'FOREMAN', ...secret! },
      select: publicUser,
    });
    action = 'SUPERVISOR_CREATED';
  } else if (data.action === 'delete') {
    await tx.session.deleteMany({ where: { userId: data.id } });
    if (await hasSupervisorHistory(tx, data.id)) {
      saved = await tx.user.update({
        where: { id: data.id },
        data: { active: false, archivedAt: before!.archivedAt ?? new Date() },
        select: publicUser,
      });
      outcome = 'archived';
      action = 'SUPERVISOR_ARCHIVED';
    } else {
      saved = await tx.user.delete({
        where: { id: data.id },
        select: publicUser,
      });
      outcome = 'deleted';
      action = 'SUPERVISOR_DELETED';
    }
  } else {
    const values =
      data.action === 'rename'
        ? { name: data.name }
        : data.action === 'pin'
          ? secret!
          : {
              active: data.active,
              archivedAt: data.active ? null : before!.archivedAt,
            };
    saved = await tx.user.update({
      where: { id: data.id },
      data: values,
      select: publicUser,
    });
    if (data.action === 'pin' || (data.action === 'status' && !data.active))
      await tx.session.deleteMany({ where: { userId: data.id } });
    action =
      data.action === 'rename'
        ? 'SUPERVISOR_RENAMED'
        : data.action === 'pin'
          ? 'USER_PIN_RESET'
          : data.active
            ? 'SUPERVISOR_ACTIVATED'
            : 'SUPERVISOR_DEACTIVATED';
  }
  await tx.auditLog.create({
    data: {
      userId: actor.id,
      role: actor.role,
      action,
      entityType: 'User',
      entityId: saved.id,
      ...(before
        ? {
            before: {
              name: before.name,
              role: before.role,
              active: before.active,
              archived: Boolean(before.archivedAt),
            },
          }
        : {}),
      after: {
        name: saved.name,
        role: saved.role,
        active: saved.active,
        archived: Boolean(saved.archivedAt),
        outcome,
        pinReset: 'pin' in data,
      },
    },
  });
  return { id: saved.id, outcome };
}
