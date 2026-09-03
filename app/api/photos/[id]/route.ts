import { userFor, HttpError } from '@/lib/server/auth';
import { db, withDatabase } from '@/lib/server/db';
async function handler(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await userFor(req);
    const { id } = await context.params;
    const photo = await db().submissionPhoto.findUnique({
      where: { id },
      include: { submission: { select: { supervisorId: true } } },
    });
    if (
      !photo ||
      (user.role !== 'ADMIN' && photo.submission.supervisorId !== user.id)
    )
      throw new HttpError(404, 'Not found');
    return new Response(photo.bytes, {
      headers: {
        'Content-Type': photo.mime,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    });
  } catch (e) {
    return Response.json(
      { error: 'Photo unavailable.' },
      { status: e instanceof HttpError ? e.status : 500 },
    );
  }
}
export const GET = (
  req: Request,
  context: { params: Promise<{ id: string }> },
) => withDatabase(() => handler(req, context));
