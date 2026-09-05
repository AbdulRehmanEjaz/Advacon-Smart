import { calculateKpiProgress } from '@/lib/domain/calculations';
import { type State, number } from '@/lib/types';

export function ApprovedKpiProgress({ state }: { state: State }) {
  const calculated = calculateKpiProgress(
    state.packages,
    state.openingBalances,
    state.submissions,
    state.settings!,
  );
  return (
    <article className="card kpi-detail-card">
      <div className="card-heading">
        <div>
          <h2 className="card-title">Approved KPI Progress</h2>
          <p className="card-subtitle">
            Opening balance plus approved submissions and adjustments
          </p>
        </div>
        <span className="badge approved">Official</span>
      </div>
      <div className="table-scroll">
        <table className="responsive-table">
          <thead>
            <tr>
              <th>KPI / Sub-Activity</th>
              <th>Target</th>
              <th>Progress</th>
              <th>Remaining</th>
              <th>Weight</th>
              <th>Completion</th>
              <th>Earned</th>
            </tr>
          </thead>
          <tbody>
            {calculated.groups.flatMap((group) => [
              <tr className="kpi-group-row" key={`group-${group.id}`}>
                <td colSpan={7}>
                  <strong>{group.name}</strong> · {group.progress.toFixed(2)}%
                  complete · {group.earned.toFixed(4)}% earned
                </td>
              </tr>,
              ...group.activities.map((activity) => (
                <tr key={activity.id}>
                  <td data-label="KPI / Sub-Activity">{activity.name}</td>
                  <td data-label="Target">
                    {activity.id === 'kpi-final-handover'
                      ? 'Completed'
                      : `${number(activity.target)} ${activity.unit}`}
                  </td>
                  <td data-label="Progress">
                    {activity.id === 'kpi-final-handover'
                      ? activity.quantity >= 1
                        ? 'Completed'
                        : 'Not Completed'
                      : number(activity.quantity)}
                  </td>
                  <td data-label="Remaining">
                    {activity.id === 'kpi-final-handover'
                      ? activity.remaining === 0
                        ? 'Completed'
                        : 'Not Completed'
                      : number(activity.remaining)}
                  </td>
                  <td data-label="Weight">{activity.weight.toFixed(2)}%</td>
                  <td data-label="Completion">
                    {activity.completion.toFixed(2)}%
                  </td>
                  <td data-label="Earned">{activity.earned.toFixed(4)}%</td>
                </tr>
              )),
            ])}
          </tbody>
        </table>
      </div>
    </article>
  );
}
