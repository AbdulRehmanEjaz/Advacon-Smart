import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { userFor, HttpError } from '@/lib/server/auth';
import { loadingState } from '@/lib/server/loading';
import { LoadingDashboard } from '@/components/loading-dashboard';
export const dynamic = 'force-dynamic';
export default async function Page() {
  const requestHeaders = await headers();
  let state;
  try {
    const user = await userFor(
      new Request('https://internal.invalid/', { headers: requestHeaders }),
    );
    if (user.role !== 'LOADING_SUPERVISOR') redirect('/workspace/dashboard');
    state = await loadingState(user);
  } catch (e) {
    if (e instanceof HttpError && e.status === 401) redirect('/');
    throw e;
  }
  return <LoadingDashboard initialState={JSON.parse(JSON.stringify(state))} />;
}
