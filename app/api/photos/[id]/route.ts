import { userFor, HttpError } from '@/lib/server/auth';
import { first } from '@/lib/server/d1';

type PhotoRow = {
  externalUrl: string | null;
  supervisorId: string;
};

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await userFor(req);
    const { id } = await context.params;
    const photo = await first<PhotoRow>(
      `SELECT p.external_url AS externalUrl,s.supervisor_id AS supervisorId
       FROM submission_photos p JOIN daily_submissions s ON s.id=p.submission_id
       WHERE p.id=?`,
      id,
    );
    if (
      !photo ||
      (user.role !== 'ADMIN' && photo.supervisorId !== user.id) ||
      !photo.externalUrl ||
      !photo.externalUrl.startsWith('https://')
    )
      throw new HttpError(404, 'Not found');
    return Response.redirect(photo.externalUrl, 302);
  } catch (error) {
    return Response.json(
      { error: 'Photo unavailable.' },
      { status: error instanceof HttpError ? error.status : 500 },
    );
  }
}
