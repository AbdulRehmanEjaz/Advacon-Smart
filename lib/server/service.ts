import { z } from 'zod';
import { admin, type Actor, HttpError } from './auth';
import { database, first, id, json, now, statement } from './d1';
import {
  approvedTotals,
  assertStageOrder,
  calculateKpiProgress,
  readiness,
  targetFor,
  type OpeningBalance,
  type Submission,
  type Block,
} from '../domain/calculations';
import type { PackageDefinition, Settings } from '../domain/baseline';
import type { Inspection, User } from '../types';
import { assertReviewable } from '../domain/workflow';
import { supervisorAction } from './supervisors';
import { createCredential } from './credentials';
import { riyadhDate } from '../domain/date';

type Row = Record<string, string | number | boolean | null>;
type Core = {
  settings: Settings;
  packages: PackageDefinition[];
  submissions: Submission[];
  blocks: Block[];
  zones: { id: string; capacity: number; spacing: string }[];
  users: User[];
  inspections: Inspection[];
  openingBalances: OpeningBalance[];
};

export const serial = <T>(value: unknown): T => JSON.parse(JSON.stringify(value));
const bool = (value: unknown) => Boolean(Number(value));
const parseJson = (value: string | number | boolean | null) => {
  if (value == null) return null;
  try {
    return JSON.parse(String(value));
  } catch {
    return null;
  }
};

const settingsSql = `SELECT
  design_capacity AS designCapacity,
  translocation_target AS translocationTarget,
  translocation_target_is_approximate AS translocationTargetIsApproximate,
  new_tree_target AS newTreeTarget,
  irrigation_target AS irrigationTarget,
  block_target AS blockTarget,
  row_target AS rowTarget,
  post_target AS postTarget,
  valve_target AS valveTarget,
  decoder_target AS decoderTarget,
  productivity_min AS productivityMin,
  productivity_max AS productivityMax,
  amber_variance AS amberVariance,
  red_variance AS redVariance,
  pending_hours AS pendingHours
FROM project_settings WHERE project_id = 'tree-project'`;

const submissionsSql = (filtered: boolean) => `SELECT
  s.id, s.request_key AS requestKey, s.supervisor_id AS supervisorId,
  u.name AS supervisorName, s.work_date AS workDate, s.block_id AS blockId,
  s.package_id AS packageId, s.batch_number AS batchNumber, s.remarks,
  s.override_reason AS overrideReason, s.status, s.version,
  s.created_at AS createdAt, s.updated_at AS updatedAt
FROM daily_submissions s JOIN users u ON u.id = s.supervisor_id
${filtered ? 'WHERE s.supervisor_id = ?' : ''}
ORDER BY s.created_at DESC`;

async function loadCore(supervisorId?: string): Promise<Core> {
  const db = database();
  const filtered = Boolean(supervisorId);
  const bind = (sql: string) =>
    filtered ? db.prepare(sql).bind(supervisorId) : db.prepare(sql);
  const results = await db.batch([
    db.prepare(settingsSql),
    db.prepare(
      `SELECT id,name,weight,sort_order AS "order",active,kpi_version AS kpiVersion
       FROM work_packages WHERE active=1 ORDER BY sort_order`,
    ),
    db.prepare(`SELECT a.id,a.package_id AS packageId,a.name,a.unit,
      a.target_key AS targetKey,a.target,COALESCE(a.direct_project_weight,a.weight) AS weight,
      a.active,a.kpi_version AS kpiVersion,
      sc.start AS scheduleStart,sc.finish AS scheduleFinish
      FROM activities a LEFT JOIN schedule_activities sc ON sc.activity_id=a.id`),
    db.prepare(`SELECT id,name,zone_id AS zoneId,capacity,
      irrigation_target AS irrigationTarget,support_rows AS supportRows,hold
      FROM blocks ORDER BY id`),
    db.prepare(`SELECT id,capacity,spacing FROM zones ORDER BY id`),
    bind(submissionsSql(filtered)),
    bind(`SELECT i.id,i.submission_id AS submissionId,i.activity_id AS activityId,i.quantity
      FROM daily_submission_items i${filtered ? ' WHERE i.submission_id IN (SELECT id FROM daily_submissions WHERE supervisor_id=?)' : ''}`),
    bind(`SELECT a.item_id AS itemId,a.quantity,a.created_at AS createdAt
      FROM adjustments a${filtered ? ' WHERE a.item_id IN (SELECT i.id FROM daily_submission_items i JOIN daily_submissions s ON s.id=i.submission_id WHERE s.supervisor_id=?)' : ''}`),
    bind(`SELECT a.submission_id AS submissionId,a.decision,a.comment,a.created_at AS createdAt
      FROM approvals a${filtered ? ' WHERE a.submission_id IN (SELECT id FROM daily_submissions WHERE supervisor_id=?)' : ''} ORDER BY a.created_at`),
    bind(`SELECT p.id,p.submission_id AS submissionId,p.name,p.mime,p.external_url AS externalUrl
      FROM submission_photos p${filtered ? ' WHERE p.submission_id IN (SELECT id FROM daily_submissions WHERE supervisor_id=?)' : ''}`),
    db.prepare(`SELECT id,name,role,active,archived_at AS archivedAt,
      CASE WHEN pin_hash IS NULL THEN 1 ELSE 0 END AS defaultPin,
      last_login AS lastLogin,created_at AS createdAt,updated_at AS updatedAt
      FROM users ORDER BY role,name`),
    db.prepare(`SELECT id FROM users u WHERE
      EXISTS (SELECT 1 FROM daily_submissions WHERE supervisor_id=u.id) OR
      EXISTS (SELECT 1 FROM approvals WHERE reviewer_id=u.id) OR
      EXISTS (SELECT 1 FROM adjustments WHERE author_id=u.id) OR
      EXISTS (SELECT 1 FROM audit_logs WHERE user_id=u.id OR (entity_type='User' AND entity_id=u.id))`),
    db.prepare(`SELECT id,number,block_id AS blockId,type,inspector,result,date,
      remarks,first_attempt AS firstAttempt,created_at AS createdAt
      FROM inspections ORDER BY date DESC`),
    db.prepare(`SELECT id,inspection_id AS inspectionId,description,responsible,
      due_date AS dueDate,closed_at AS closedAt,created_at AS createdAt FROM observations`),
    db.prepare(`SELECT activity_id AS activityId,quantity,source,effective_at AS effectiveAt
      FROM kpi_opening_balances ORDER BY activity_id`),
  ]);
  const rows = results.map((result) => result.results as Row[]);
  const settingsRow = rows[0][0];
  if (!settingsRow) throw Error('D1_NOT_INITIALIZED');
  const settings = {
    ...settingsRow,
    translocationTargetIsApproximate: bool(
      settingsRow.translocationTargetIsApproximate,
    ),
  } as Settings;
  const activities = rows[2].map((activity) => ({
    id: String(activity.id),
    packageId: String(activity.packageId),
    name: String(activity.name),
    unit: String(activity.unit),
    targetKey: String(activity.targetKey),
    target: activity.target == null ? null : Number(activity.target),
    weight: Number(activity.weight),
    active: bool(activity.active),
    kpiVersion: String(activity.kpiVersion),
    schedule: activity.scheduleStart
      ? {
          start: String(activity.scheduleStart),
          finish: String(activity.scheduleFinish),
        }
      : null,
  }));
  const packages = rows[1].map((item) => ({
    id: String(item.id),
    name: String(item.name),
    weight: Number(item.weight),
    order: Number(item.order),
    active: bool(item.active),
    kpiVersion: String(item.kpiVersion),
    activities: activities.filter(
      (activity) => activity.packageId === item.id && activity.active,
    ),
  }));
  const adjustments = rows[7];
  const items = rows[6].map((item) => ({
    id: String(item.id),
    submissionId: String(item.submissionId),
    activityId: String(item.activityId),
    activityName: activities.find((activity) => activity.id === item.activityId)?.name,
    unit: activities.find((activity) => activity.id === item.activityId)?.unit,
    quantity: Number(item.quantity),
    adjustments: adjustments
      .filter((adjustment) => adjustment.itemId === item.id)
      .map((adjustment) => ({
        quantity: Number(adjustment.quantity),
        createdAt: String(adjustment.createdAt),
      })),
  }));
  const submissions = rows[5].map((submission) => ({
    id: String(submission.id),
    supervisorId: String(submission.supervisorId),
    supervisor: { name: String(submission.supervisorName) },
    status: String(submission.status),
    workDate: String(submission.workDate),
    createdAt: String(submission.createdAt),
    blockId: submission.blockId == null ? null : String(submission.blockId),
    packageId: String(submission.packageId),
    version: Number(submission.version),
    batchNumber:
      submission.batchNumber == null ? null : String(submission.batchNumber),
    remarks: String(submission.remarks || ''),
    items: items
      .filter((item) => item.submissionId === submission.id)
      .map(({ submissionId: _submissionId, ...item }) => item),
    photos: rows[9]
      .filter((photo) => photo.submissionId === submission.id)
      .map((photo) => ({ id: String(photo.id), name: String(photo.name) })),
    approvals: rows[8]
      .filter((approval) => approval.submissionId === submission.id)
      .map((approval) => ({
        decision: String(approval.decision),
        comment: String(approval.comment || ''),
        createdAt: String(approval.createdAt),
      })),
  }));
  return {
    settings,
    packages,
    submissions,
    blocks: rows[3].map((block) => ({
      id: String(block.id),
      name: String(block.name),
      zoneId: String(block.zoneId),
      capacity: block.capacity == null ? null : Number(block.capacity),
      irrigationTarget:
        block.irrigationTarget == null ? null : Number(block.irrigationTarget),
      supportRows:
        block.supportRows == null ? null : Number(block.supportRows),
      hold: bool(block.hold),
    })),
    zones: rows[4].map((zone) => ({
      id: String(zone.id),
      capacity: Number(zone.capacity),
      spacing: String(zone.spacing),
    })),
    users: supervisorId ? [] : usersFromRows(rows[10], rows[11]),
    inspections: supervisorId ? [] : inspectionsFromRows(rows[12], rows[13]),
    openingBalances: rows[14].map((entry) => ({
      activityId: String(entry.activityId),
      quantity: Number(entry.quantity),
      source: String(entry.source),
      effectiveAt: String(entry.effectiveAt),
    })),
  };
}

function userFromRow(row: Row) {
  return {
    id: String(row.id),
    name: String(row.name),
    role: row.role as 'ADMIN' | 'FOREMAN',
    active: bool(row.active),
    archivedAt: row.archivedAt == null ? null : String(row.archivedAt),
    defaultPin: bool(row.defaultPin),
    lastLogin: row.lastLogin == null ? null : String(row.lastLogin),
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
  };
}

function usersFromRows(userRows: Row[], historyRows: Row[]) {
  const historyIds = new Set(
    historyRows.map((row) => String(row.id)),
  );
  return userRows.map((row) => ({
    ...userFromRow(row),
    hasHistory: historyIds.has(String(row.id)),
  }));
}

function inspectionsFromRows(inspectionRows: Row[], observationRows: Row[]) {
  return inspectionRows.map((row) => ({
    id: String(row.id),
    number: String(row.number),
    blockId: String(row.blockId),
    type: String(row.type),
    inspector: String(row.inspector),
    result: String(row.result),
    date: String(row.date),
    remarks: String(row.remarks || ''),
    firstAttempt: bool(row.firstAttempt),
    createdAt: String(row.createdAt),
    observations: observationRows
      .filter((observation) => observation.inspectionId === row.id)
      .map((observation) => ({
        id: String(observation.id),
        description: String(observation.description),
        responsible: String(observation.responsible),
        dueDate: String(observation.dueDate),
        closedAt:
          observation.closedAt == null ? null : String(observation.closedAt),
      })),
  }));
}

async function details(view: string | undefined, _user: Actor) {
  if (view === 'audit') {
    const audit = await database()
      .prepare(`SELECT id,user_id AS userId,role,action,entity_type AS entityType,
        entity_id AS entityId,before_json AS beforeJson,after_json AS afterJson,
        created_at AS createdAt FROM audit_logs ORDER BY created_at DESC LIMIT 500`)
      .all<Row>();
    return {
      audit: audit.results.map(({ beforeJson, afterJson, ...row }) => ({
        ...row,
        before: parseJson(beforeJson),
        after: parseJson(afterJson),
      })),
    };
  }
  return {};
}

export async function getState(user: Actor, view?: string) {
  const core = await loadCore(user.role === 'FOREMAN' ? user.id : undefined);
  return { ...core, user, ...(await details(view, user)) };
}

export async function getStateDetail(user: Actor, view: string) {
  if (user.role !== 'ADMIN' || view !== 'audit') return {};
  return details(view, user);
}

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (value) =>
      !Number.isNaN(new Date(value).getTime()) &&
      new Date(value).toISOString().slice(0, 10) === value,
    'Invalid date',
  );
const reason = z.string().trim().min(5).max(2000);
const submissionSchema = z.object({
  id: z.string().optional(),
  version: z.number().int().optional(),
  requestKey: z.uuid(),
  workDate: date,
  blockId: z.string().nullable().optional(),
  packageId: z.string(),
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
  core: Core,
  block: Block,
  items: { activityId: string; quantity: number }[],
  user: Actor,
  override?: string,
) {
  const trees = items
    .filter((item) => ['placed', 'planted'].includes(item.activityId))
    .reduce((sum, item) => sum + item.quantity, 0);
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
      `${problems.join('. ')}. An administrator must provide a documented override.`,
    );
}

function validateCandidate(
  core: Core,
  submissions: Submission[],
  user: Actor,
  override?: string,
) {
  try {
    for (const block of core.blocks)
      {
        const totals = approvedTotals(
          submissions.filter((item) => item.blockId === block.id),
        );
        if (Object.keys(totals).some((key) => !key.startsWith('kpi-')))
          assertStageOrder(totals);
      }
  } catch (error) {
    throw new HttpError(
      400,
      error instanceof Error ? error.message : 'Invalid stage quantities.',
    );
  }
  const totals = calculateKpiProgress(
    core.packages,
    core.openingBalances,
    submissions,
    core.settings,
  ).totals;
  for (const activity of core.packages.flatMap((item) => item.activities))
    if (
      (totals[activity.id] || 0) > targetFor(activity, core.settings) &&
      targetFor(activity, core.settings) > 0
    )
      requireThat(
        user.role === 'ADMIN' && override && override.length >= 5,
        `${activity.name} would exceed its project target. A documented administrator override is required.`,
      );
  for (const block of core.blocks) {
    const totalsForBlock = approvedTotals(
      submissions.filter((item) => item.blockId === block.id),
    );
    if ((totalsForBlock.commissioned || 0) > 0)
      requireThat(
        block.irrigationTarget != null &&
          ['route', 'trench', 'pipe', 'backfill'].every(
            (key) =>
              (totalsForBlock[key] || 0) >= Number(block.irrigationTarget),
          ) &&
          (totalsForBlock.valves || 0) >= 1 &&
          (totalsForBlock.decoders || 0) >= 1,
        'Commissioning requires the configured block pipe length, backfill, valve and decoder.',
      );
  }
}

function validateSubmittedRemaining(
  core: Core,
  items: { activityId: string; quantity: number }[],
) {
  const official = calculateKpiProgress(
    core.packages,
    core.openingBalances,
    core.submissions,
    core.settings,
  );
  for (const item of items) {
    const activity = core.packages
      .flatMap((workPackage) => workPackage.activities)
      .find((candidate) => candidate.id === item.activityId);
    requireThat(activity, 'Select an active approved KPI.');
    const target = targetFor(activity, core.settings) || 100;
    const current = official.totals[item.activityId] || 0;
    requireThat(
      current + item.quantity <= target + 0.000001,
      `${activity.name} has only ${Math.max(0, target - current).toLocaleString()} ${activity.unit} remaining.`,
    );
  }
}

function auditStatement(
  user: Actor,
  action: string,
  entityType: string,
  entityId?: string,
  before?: unknown,
  after?: unknown,
) {
  return statement(
    `INSERT INTO audit_logs (id,user_id,role,action,entity_type,entity_id,before_json,after_json,created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    id(),
    user.id,
    user.role,
    action,
    entityType,
    entityId ?? null,
    json(before),
    json(after),
    now(),
  );
}

async function activeUser(user: Actor) {
  const row = await first<Row>(
    `SELECT id,name,role,active,archived_at AS archivedAt,created_at AS createdAt,
     credential_version AS credentialVersion,updated_at AS updatedAt FROM users WHERE id=?`,
    user.id,
  );
  if (!row || !bool(row.active) || row.archivedAt || row.role !== user.role ||
      Number(row.credentialVersion) !== user.credentialVersion)
    throw new HttpError(403, 'Your access has changed. Please sign in again.');
  return row;
}

export async function mutate(path: string, req: Request, user: Actor) {
  if (Number(req.headers.get('content-length') || 0) > 8_000_000)
    throw new HttpError(413, 'Upload is too large.');
  const body: unknown = await req.json();
  await activeUser(user);

  if (path === 'submission') {
    const data = submissionSchema.parse(body);
    if (user.role === 'FOREMAN')
      requireThat(
        data.workDate === riyadhDate(),
        `Supervisors can only submit progress for today (${riyadhDate()} Asia/Riyadh).`,
      );
    const duplicate = await first<Row>(
      'SELECT id,supervisor_id AS supervisorId FROM daily_submissions WHERE request_key=?',
      data.requestKey,
    );
    if (duplicate && !data.id) {
      requireThat(duplicate.supervisorId === user.id, 'Duplicate request.');
      return { id: String(duplicate.id) };
    }
    const core = await loadCore();
    const sitePackage = ['translocation', 'new-trees'].includes(data.packageId);
    requireThat(
      sitePackage ? Boolean(data.blockId) : !data.blockId,
      sitePackage
        ? 'Zone and Block are required for this Main Activity.'
        : 'Zone and Block do not apply to this Main Activity.',
    );
    const block = data.blockId
      ? core.blocks.find((item) => item.id === data.blockId)
      : undefined;
    const workPackage = core.packages.find((item) => item.id === data.packageId);
    requireThat(workPackage, 'Select a valid active Main Activity.');
    requireThat(
      !['mobilization', 'drawings'].includes(workPackage.id),
      'This Main Activity is not available for site submissions.',
    );
    requireThat(!sitePackage || block, 'Select a valid Zone and Block.');
    requireThat(
      new Set(data.items.map((item) => item.activityId)).size ===
        data.items.length,
      'Duplicate activity.',
    );
    for (const item of data.items) {
      const activity = workPackage.activities.find(
        (candidate) => candidate.id === item.activityId,
      );
      requireThat(activity, 'Activity does not belong to this work package.');
      requireThat(
        activity.unit === 'm' || Number.isInteger(item.quantity),
        'Use whole numbers for trees, rows, posts and milestones.',
      );
      if (activity.unit.toLowerCase() === 'milestone')
        requireThat(item.quantity === 1, 'Milestones must be submitted as one completed item.');
    }
    validateSubmittedRemaining(core, data.items);
    if (user.role !== 'ADMIN')
      requireThat(!data.overrideReason, 'Only administrators can override readiness.');
    if (block) checkPlacement(core, block, data.items, user, data.overrideReason);
    const timestamp = now();
    if (data.id) {
      const before = core.submissions.find((item) => item.id === data.id);
      requireThat(
        before &&
          before.supervisorId === user.id &&
          before.status === 'RETURNED' &&
          before.version === data.version,
        'Only your own returned submission can be edited and resubmitted.',
      );
      await database().batch([
        statement('DELETE FROM daily_submission_items WHERE submission_id=?', data.id),
        statement(
          `UPDATE daily_submissions SET request_key=?,work_date=?,block_id=?,package_id=?,batch_number=?,
           remarks=?,override_reason=?,status='WAITING',version=version+1,updated_at=?
           WHERE id=? AND supervisor_id=? AND status='RETURNED' AND version=?`,
          data.requestKey,
          data.workDate,
          data.blockId,
          data.packageId,
          null,
          data.remarks,
          data.overrideReason ?? null,
          timestamp,
          data.id,
          user.id,
          data.version,
        ),
        ...data.items.map((item) =>
          statement(
            'INSERT INTO daily_submission_items (id,submission_id,activity_id,quantity) VALUES (?,?,?,?)',
            id(),
            data.id,
            item.activityId,
            item.quantity,
          ),
        ),
        auditStatement(user, 'RESUBMIT', 'Submission', data.id, before, data),
      ]);
      return { id: data.id };
    }
    const submissionId = id();
    await database().batch([
      statement(
        `INSERT INTO daily_submissions
        (id,request_key,supervisor_id,work_date,block_id,package_id,batch_number,remarks,override_reason,status,version,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,'WAITING',1,?,?)`,
        submissionId,
        data.requestKey,
        user.id,
        data.workDate,
        data.blockId,
        data.packageId,
        null,
        data.remarks,
        data.overrideReason ?? null,
        timestamp,
        timestamp,
      ),
      ...data.items.map((item) =>
        statement(
          'INSERT INTO daily_submission_items (id,submission_id,activity_id,quantity) VALUES (?,?,?,?)',
          id(),
          submissionId,
          item.activityId,
          item.quantity,
        ),
      ),
      auditStatement(user, 'SUBMIT', 'Submission', submissionId, undefined, data),
    ]);
    return { id: submissionId };
  }

  if (path === 'photo')
    throw new HttpError(
      503,
      'Photo storage is temporarily unavailable while external file storage is being connected.',
    );

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
    const core = await loadCore();
    const before = core.submissions.find((item) => item.id === data.id);
    requireThat(before, 'Submission not found.');
    try {
      assertReviewable(before.status, before.version, data.version);
    } catch (error) {
      throw new HttpError(409, (error as Error).message);
    }
    if (data.decision !== 'APPROVED')
      requireThat(data.comment.length >= 5, 'A meaningful review comment is required.');
    if (data.decision === 'APPROVED') {
      const reviewBlock = before.blockId
        ? core.blocks.find((item) => item.id === before.blockId)
        : undefined;
      if (reviewBlock)
        checkPlacement(core, reviewBlock, before.items, user, data.overrideReason);
      validateCandidate(
        core,
        core.submissions.map((item) =>
          item.id === before.id ? { ...item, status: 'APPROVED' } : item,
        ),
        user,
        data.overrideReason,
      );
    }
    const timestamp = now();
    await database().batch([
      statement(
        `INSERT INTO approvals (id,submission_id,reviewer_id,decision,comment,version,created_at)
         VALUES (?,?,?,?,?,?,?)`,
        id(),
        data.id,
        user.id,
        data.decision,
        data.comment,
        data.version,
        timestamp,
      ),
      statement(
        'UPDATE daily_submissions SET status=?,updated_at=? WHERE id=? AND status=\'WAITING\' AND version=?',
        data.decision,
        timestamp,
        data.id,
        data.version,
      ),
      auditStatement(user, data.decision, 'Submission', data.id, before, data),
    ]);
    return { ok: true };
  }

  if (path === 'adjustment') {
    const data = z
      .object({
        requestKey: z.uuid(),
        itemId: z.string(),
        quantity: z.number().min(-1000000).max(1000000).multipleOf(0.001).refine((value) => value !== 0),
        reason,
        overrideReason: z.string().trim().max(2000).optional(),
      })
      .parse(body);
    const duplicate = await first<Row>('SELECT id FROM adjustments WHERE request_key=?', data.requestKey);
    if (duplicate) return { id: String(duplicate.id) };
    const core = await loadCore();
    const submission = core.submissions.find((candidate) =>
      candidate.items.some((item) => item.id === data.itemId),
    );
    const item = submission?.items.find((candidate) => candidate.id === data.itemId);
    requireThat(submission && item, 'Submission item not found.');
    requireThat(submission.status === 'APPROVED', 'Only approved work may be adjusted.');
    requireThat(
      Number(item.quantity) + item.adjustments.reduce((sum, entry) => sum + Number(entry.quantity), 0) + data.quantity >= 0,
      'Adjustment cannot make this item negative.',
    );
    const activity = core.packages.flatMap((item) => item.activities).find((candidate) => candidate.id === item.activityId);
    requireThat(activity, 'Only active approved KPI quantities can be adjusted.');
    requireThat(activity.unit === 'm' || Number.isInteger(data.quantity), 'Use whole quantities for this activity.');
    const candidate = core.submissions.map((entry) => ({
      ...entry,
      items: entry.items.map((value) =>
        value.id === item.id
          ? { ...value, adjustments: [...value.adjustments, { quantity: data.quantity, createdAt: now() }] }
          : value,
      ),
    }));
    const sourceBlock = submission.blockId
      ? core.blocks.find((block) => block.id === submission.blockId)
      : undefined;
    const beforeBlock = sourceBlock
      ? readiness(sourceBlock, core.submissions)
      : null;
    if (data.quantity > 0 && beforeBlock)
      checkPlacement(
        core,
        beforeBlock,
        [{ activityId: item.activityId, quantity: data.quantity }],
        user,
        data.overrideReason,
      );
    validateCandidate(core, candidate, user, data.overrideReason);
    if (beforeBlock) {
      const afterBlock = readiness(beforeBlock, candidate);
      requireThat(
        !(beforeBlock.ready && !afterBlock.ready && beforeBlock.occupied > 0),
        'This correction would remove readiness from an occupied block. Place the block on hold and resolve the safety issue first.',
      );
    }
    const adjustmentId = id();
    await database().batch([
      statement(
        `INSERT INTO adjustments (id,request_key,item_id,author_id,quantity,reason,created_at) VALUES (?,?,?,?,?,?,?)`,
        adjustmentId,
        data.requestKey,
        item.id,
        user.id,
        data.quantity,
        data.reason,
        now(),
      ),
      auditStatement(user, 'ADJUST', 'SubmissionItem', item.id, item, data),
    ]);
    return { id: adjustmentId };
  }

  if (path === 'supervisor') {
    const data = supervisorAction.parse(body);
    const targetId = 'id' in data ? data.id : undefined;
    const before = targetId
      ? await first<Row>(
          `SELECT id,name,role,active,archived_at AS archivedAt,created_at AS createdAt,updated_at AS updatedAt FROM users WHERE id=?`,
          targetId,
        )
      : null;
    if (targetId && !before) throw new HttpError(404, 'Account not found.');
    if (before?.role === 'ADMIN' && (before.id !== user.id || !['rename', 'pin'].includes(data.action)))
      throw new HttpError(403, 'Administrator accounts cannot be deactivated or deleted here.');
    let credential:
      | { pinLookup: string; pinSalt: string; pinHash: string }
      | undefined;
    if ('pin' in data) {
      credential = await createCredential(data.pin);
      const duplicate = await first<Row>('SELECT id FROM users WHERE pin_lookup=?', credential.pinLookup);
      if (duplicate && duplicate.id !== targetId)
        throw new HttpError(409, 'That PIN is already reserved. Choose a different PIN.');
    }
    const timestamp = now();
    let savedId = targetId;
    let outcome: 'saved' | 'archived' | 'deleted' = 'saved';
    let action = '';
    const writes: D1PreparedStatement[] = [];
    if (data.action === 'create') {
      savedId = id();
      writes.push(
        statement(
          `INSERT INTO users (id,name,role,pin_lookup,pin_salt,pin_hash,credential_version,active,created_at,updated_at)
           VALUES (?,?,'FOREMAN',?,?,?,1,1,?,?)`,
          savedId,
          data.name,
          credential!.pinLookup,
          credential!.pinSalt,
          credential!.pinHash,
          timestamp,
          timestamp,
        ),
      );
      action = 'SUPERVISOR_CREATED';
    } else if (data.action === 'delete') {
      const history = await first<Row>(`SELECT 1 AS found WHERE
        EXISTS (SELECT 1 FROM daily_submissions WHERE supervisor_id=?) OR
        EXISTS (SELECT 1 FROM approvals WHERE reviewer_id=?) OR
        EXISTS (SELECT 1 FROM adjustments WHERE author_id=?) OR
        EXISTS (SELECT 1 FROM audit_logs WHERE user_id=? OR (entity_type='User' AND entity_id=?))`,
        data.id,data.id,data.id,data.id,data.id);
      if (history) {
        writes.push(statement('UPDATE users SET active=0,archived_at=COALESCE(archived_at,?),credential_version=credential_version+1,updated_at=? WHERE id=?', timestamp,timestamp,data.id));
        outcome = 'archived';
        action = 'SUPERVISOR_ARCHIVED';
      } else {
        writes.push(statement('DELETE FROM users WHERE id=?', data.id));
        outcome = 'deleted';
        action = 'SUPERVISOR_DELETED';
      }
    } else if (data.action === 'rename') {
      writes.push(statement('UPDATE users SET name=?,updated_at=? WHERE id=?', data.name,timestamp,data.id));
      action = 'SUPERVISOR_RENAMED';
    } else if (data.action === 'pin') {
      writes.push(statement(
        'UPDATE users SET pin_lookup=?,pin_salt=?,pin_hash=?,credential_version=credential_version+1,updated_at=? WHERE id=?',
        credential!.pinLookup,credential!.pinSalt,credential!.pinHash,timestamp,data.id,
      ));
      action = 'USER_PIN_CHANGED';
    } else {
      writes.push(statement('UPDATE users SET active=?,archived_at=?,credential_version=credential_version+1,updated_at=? WHERE id=?', Number(data.active),data.active ? null : before!.archivedAt,timestamp,data.id));
      action = data.active ? 'SUPERVISOR_ACTIVATED' : 'SUPERVISOR_DEACTIVATED';
    }
    writes.push(auditStatement(user, action, 'User', savedId, before, { action: data.action, outcome }));
    await database().batch(writes);
    return { id: savedId!, outcome };
  }

  if (path === 'block') {
    const data = z.object({ id: z.string(), capacity: z.number().int().nonnegative().nullable(), irrigationTarget: z.number().nonnegative().nullable(), supportRows: z.number().int().nonnegative().nullable(), hold: z.boolean(), reason }).parse(body);
    const core = await loadCore();
    const before = core.blocks.find((item) => item.id === data.id);
    requireThat(before, 'Block not found.');
    const zone = core.zones.find((item) => item.id === before.zoneId)!;
    const peers = core.blocks.filter((item) => item.id !== data.id);
    requireThat(peers.filter((item) => item.zoneId === zone.id).reduce((sum, item) => sum + (item.capacity || 0), 0) + (data.capacity || 0) <= zone.capacity, 'Block allocations exceed the zone capacity.');
    requireThat(peers.reduce((sum, item) => sum + (item.supportRows || 0), 0) + (data.supportRows || 0) <= core.settings.rowTarget, 'Row allocations exceed the project baseline.');
    requireThat(peers.reduce((sum, item) => sum + Number(item.irrigationTarget || 0), 0) + Number(data.irrigationTarget || 0) <= core.settings.irrigationTarget, 'Irrigation allocations exceed the baseline.');
    const occupied = readiness(before, core.submissions).occupied;
    requireThat(data.capacity == null ? occupied === 0 : data.capacity >= occupied, 'Capacity cannot be reduced below occupied capacity.');
    await database().batch([
      statement('UPDATE blocks SET capacity=?,irrigation_target=?,support_rows=?,hold=? WHERE id=?', data.capacity,data.irrigationTarget,data.supportRows,Number(data.hold),data.id),
      auditStatement(user, 'BLOCK_UPDATED', 'Block', data.id, before, data),
    ]);
    return { ok: true };
  }

  if (path === 'schedule') {
    const data = z.object({ activities: z.array(z.object({ id: z.string(), start: date, finish: date })).min(1), reason }).parse(body);
    requireThat(new Set(data.activities.map((item) => item.id)).size === data.activities.length, 'Duplicate schedule activity.');
    for (const activity of data.activities) requireThat(activity.finish >= activity.start, 'Finish must not precede start.');
    await database().batch([
      ...data.activities.map((activity) => statement(`INSERT INTO schedule_activities (activity_id,start,finish) VALUES (?,?,?) ON CONFLICT(activity_id) DO UPDATE SET start=excluded.start,finish=excluded.finish`, activity.id,activity.start,activity.finish)),
      auditStatement(user, 'SCHEDULE_UPDATED', 'Schedule', undefined, undefined, data),
    ]);
    return { ok: true };
  }

  if (path === 'activity-weights') {
    throw new HttpError(403, 'Approved KPI targets and project weights are read-only.');
  }

  if (path === 'settings') {
    const positive = z.number().int().positive();
    const data = z.object({ translocationTarget: positive, newTreeTarget: positive, irrigationTarget: z.number().positive(), rowTarget: positive, postTarget: positive, productivityMin: positive, productivityMax: positive, pendingHours: positive, translocationTargetIsApproximate: z.boolean(), reason }).parse(body);
    requireThat(data.postTarget === data.rowTarget * 5, 'Support baseline requires five posts per row.');
    requireThat(data.productivityMax >= data.productivityMin, 'Productivity maximum must be at least the minimum.');
    const core = await loadCore();
    validateCandidate(core, core.submissions, user);
    requireThat(core.blocks.reduce((sum, item) => sum + Number(item.irrigationTarget || 0), 0) <= data.irrigationTarget && core.blocks.reduce((sum, item) => sum + (item.supportRows || 0), 0) <= data.rowTarget, 'Baseline cannot be below allocated block quantities.');
    await database().batch([
      statement(`UPDATE project_settings SET translocation_target=?,translocation_target_is_approximate=?,new_tree_target=?,irrigation_target=?,row_target=?,post_target=?,productivity_min=?,productivity_max=?,pending_hours=?,updated_at=? WHERE project_id='tree-project'`, data.translocationTarget,Number(data.translocationTargetIsApproximate),data.newTreeTarget,data.irrigationTarget,data.rowTarget,data.postTarget,data.productivityMin,data.productivityMax,data.pendingHours,now()),
      auditStatement(user, 'BASELINE_UPDATED', 'Project', 'tree-project', core.settings, data),
    ]);
    return { ok: true };
  }

  if (path === 'inspection') {
    const data = z.object({ number: z.string().trim().min(2).max(80), blockId: z.string(), type: z.enum(['Irrigation','Support','Tree health','New tree acceptance','Final inspection']), inspector: z.string().trim().min(2).max(80), result: z.enum(['PASSED','FAILED','REINSPECTION']), date, firstAttempt: z.boolean(), remarks: z.string().max(2000), observation: z.string().max(2000).optional(), responsible: z.string().max(80).optional(), dueDate: date.optional() }).parse(body);
    requireThat(data.date <= new Date().toISOString().slice(0, 10), 'Inspection date cannot be in the future.');
    if (data.result !== 'PASSED' || data.observation) requireThat(data.observation && data.responsible && data.dueDate, 'Observations require a description, responsible person and due date.');
    const inspectionId = id();
    const timestamp = now();
    const writes = [statement(`INSERT INTO inspections (id,number,block_id,type,inspector,result,date,remarks,first_attempt,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`, inspectionId,data.number,data.blockId,data.type,data.inspector,data.result,data.date,data.remarks,Number(data.firstAttempt),timestamp)];
    if (data.observation) writes.push(statement(`INSERT INTO observations (id,inspection_id,description,responsible,due_date,created_at) VALUES (?,?,?,?,?,?)`, id(),inspectionId,data.observation,data.responsible!,data.dueDate!,timestamp));
    writes.push(auditStatement(user, 'INSPECTION_RECORDED', 'Inspection', inspectionId, undefined, data));
    await database().batch(writes);
    return { id: inspectionId };
  }

  if (path === 'close-observation') {
    const data = z.object({ id: z.string(), reason }).parse(body);
    const before = await first<Row>('SELECT id,closed_at AS closedAt FROM observations WHERE id=?', data.id);
    requireThat(before && !before.closedAt, 'Observation already closed or not found.');
    await database().batch([
      statement('UPDATE observations SET closed_at=? WHERE id=? AND closed_at IS NULL', now(),data.id),
      auditStatement(user, 'OBSERVATION_CLOSED', 'Observation', data.id, before, data),
    ]);
    return { ok: true };
  }

  throw new HttpError(404, 'Unknown action.');
}
