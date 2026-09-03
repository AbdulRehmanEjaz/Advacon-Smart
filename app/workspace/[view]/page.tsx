import { Workspace } from '@/components/workspace';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { userFor, HttpError } from '@/lib/server/auth';
import { withDatabase } from '@/lib/server/db';
export const dynamic = 'force-dynamic';
export default async function Page({
  params,
}: {
  params: Promise<{ view: string }>;
}) {
  const { view } = await params;
  // Enforce access on the server even when an administrator URL is entered manually.
  const requestHeaders = await headers();
  let user;
  try {
    user = await withDatabase(() =>
      userFor(
        new Request('https://internal.invalid/', { headers: requestHeaders }),
      ),
    );
  } catch (e) {
    if (e instanceof HttpError && e.status === 401) redirect('/');
    throw e;
  }
  if (user.role !== 'ADMIN' && !['dashboard', 'daily'].includes(view))
    redirect('/workspace/dashboard');
  return <Workspace view={view} />;
}
