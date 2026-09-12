import type { State } from '../types';

// Allowlist the presentation data; never send account lists, notes, photos or audit data.
export function viewerState(state: State): State {
  return {
    user: { id: state.user.id, name: state.user.name, role: 'VIEWER', active: true,
      archivedAt: null, defaultPin: false, lastLogin: null, createdAt: '', updatedAt: '' },
    settings: state.settings,
    packages: state.packages,
    openingBalances: state.openingBalances.map(({ activityId, quantity, effectiveAt }) => ({ activityId, quantity, effectiveAt, source: '' })),
    blocks: [],
    submissions: state.submissions.filter((row) => row.status === 'APPROVED').map((row) => ({
      id: row.id, status: row.status, workDate: row.workDate, createdAt: row.createdAt,
      packageId: row.packageId, blockId: null, version: 0, supervisorId: '', supervisor: { name: '' },
      remarks: '', photos: [],
      items: row.items.map(({ id, activityId, quantity, adjustments }) => ({ id, activityId, quantity,
        adjustments: adjustments.map(({ quantity, createdAt }) => ({ quantity, createdAt })) })),
      approvals: row.approvals.filter((entry) => entry.decision === 'APPROVED')
        .map(({ decision, createdAt }) => ({ decision, createdAt, comment: '' })),
    })),
    ...(state.manpower ? {
      manpower: state.manpower.map((row) => ({ ...row, name: '', code: '', company: '', createdAt: '', updatedAt: '' })),
      equipment: (state.equipment || []).map((row) => ({ ...row, code: '', company: '', createdAt: '', updatedAt: '' })),
      manpowerAttendance: (state.manpowerAttendance || []).map(({ id, resourceId, date, status }) => ({ id, resourceId, date, status, createdAt: '', updatedAt: '' })),
      equipmentAttendance: (state.equipmentAttendance || []).map(({ id, resourceId, date, status }) => ({ id, resourceId, date, status, createdAt: '', updatedAt: '' })),
      fuelRecords: (state.fuelRecords || []).map((row) => ({ ...row, description: '', createdAt: '', updatedAt: '' })),
      invoicePoRecords: (state.invoicePoRecords || []).map((row) => ({ ...row, invoiceNo: null, poNo: null, paidBy: '', description: '', createdAt: '', updatedAt: '' })),
    } : {}),
  };
}
