export type Role = 'ADMIN' | 'FOREMAN' | 'VIEWER' | 'LOADING_SUPERVISOR';

export const VIEWER_VIEWS = ['dashboard', 'kpi-progress', 'cost-control'] as const;

// Loading Supervisors have a dedicated workspace at /loading; the main
// workspace views are all off-limits to them.
export function canAccessView(role: Role, view: string) {
  if (role === 'LOADING_SUPERVISOR') return false;
  return role === 'ADMIN' || (role === 'VIEWER'
    ? VIEWER_VIEWS.some((allowed) => allowed === view)
    : ['dashboard', 'daily', 'search'].includes(view));
}
