import { z } from 'zod';

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
  .superRefine((value, context) => {
    if ('pin' in value && value.pin !== value.confirmPin)
      context.addIssue({
        code: 'custom',
        path: ['confirmPin'],
        message: 'PINs do not match.',
      });
  });
