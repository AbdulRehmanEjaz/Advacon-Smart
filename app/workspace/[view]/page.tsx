import { Workspace } from '@/components/workspace';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { userFor, HttpError } from '@/lib/server/auth';
import { getState, serial } from '@/lib/server/service';
import type { State } from '@/lib/types';
export const dynamic = 'force-dynamic';
export default async function Page({
  params,
}: {
  params: Promise<{ view: string }>;
}) {
  const { view } = await params;
  // Enforce access on the server even when an administrator URL is entered manually.
  const requestHeaders = await headers();
  let state;
  try {
    const user = await userFor(
      new Request('https://internal.invalid/', { headers: requestHeaders }),
    );
    if (user.role !== 'ADMIN' && !['dashboard', 'daily'].includes(view))
      redirect('/workspace/dashboard');
    state = await getState(user, view);
  } catch (e) {
    if (e instanceof HttpError && e.status === 401) redirect('/');
    throw e;
  }
  return <Workspace view={view} initialState={serial<State>(state)} />;
}
