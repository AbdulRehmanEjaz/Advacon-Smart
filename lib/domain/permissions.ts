export type Role = 'ADMIN' | 'FOREMAN' | 'VIEWER';

export const VIEWER_VIEWS = ['dashboard', 'kpi-progress', 'cost-control'] as const;

export function canAccessView(role: Role, view: string) {
  return role === 'ADMIN' || (role === 'VIEWER'
    ? VIEWER_VIEWS.some((allowed) => allowed === view)
    : ['dashboard', 'daily', 'search'].includes(view));
}
