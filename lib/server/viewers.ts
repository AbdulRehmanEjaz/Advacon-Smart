import { z } from 'zod';

type Row = Record<string, string | number | boolean | null>;

const id = z.string().min(1);
const name = z.string().trim().min(2).max(80);
const pin = z.string().regex(/^\d{3}$/, 'Use exactly three numeric digits.');

export const viewerAction = z
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

export type ViewerAction = z.infer<typeof viewerAction>;

export type ViewerRow = {
  id: string;
  name: string;
  active: number;
  archivedAt: string | null;
  pinLookup: string | null;
  pinSalt: string | null;
  pinHash: string | null;
  credentialVersion: number;
  lastLogin: string | null;
  createdAt: string;
  updatedAt: string;
};

export const viewerSelect = 'id,name,active,archived_at AS archivedAt,pin_lookup AS pinLookup,pin_salt AS pinSalt,pin_hash AS pinHash,credential_version AS credentialVersion,last_login AS lastLogin,created_at AS createdAt,updated_at AS updatedAt';

export function viewerFromRow(row: Row) {
  return {
    id: String(row.id),
    name: String(row.name),
    role: 'VIEWER' as const,
    active: Boolean(Number(row.active)),
    archivedAt: row.archivedAt == null ? null : String(row.archivedAt),
    hasHistory: false,
    defaultPin: !row.pinHash,
    lastLogin: row.lastLogin == null ? null : String(row.lastLogin),
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
  };
}
