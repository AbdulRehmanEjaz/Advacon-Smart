import { z } from 'zod';
import {
  cookie,
  HttpError,
  login,
  sameOrigin,
  userFor,
} from '@/lib/server/auth';
import { getState, mutate } from '@/lib/server/service';
import { withDatabase } from '@/lib/server/db';
export const dynamic = 'force-dynamic';
const reply = (data: unknown, status = 200, headers = {}) =>
  Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store', ...headers },
  });
async function handler(req: Request) {
  try {
    const path = new URL(req.url).pathname.replace(/^\/api\//, '');
    if (req.method === 'POST') sameOrigin(req);
    if (path === 'login' && req.method === 'POST') {
      const body = z
        .object({ pin: z.string().max(10) })
        .parse(await req.json());
      const result = await login(req, body.pin);
      return result.error
        ? reply(
            {
              error:
                'Access could not be verified. Check your PIN or try again later.',
            },
            401,
          )
        : reply({ ok: true }, 200, { 'Set-Cookie': cookie(result.token) });
    }
    const user = await userFor(req);
    if (path === 'state' && req.method === 'GET')
      return reply(await getState(user));
    if (req.method === 'POST') {
      const result = await mutate(path, req, user);
      return reply(
        result,
        200,
        path === 'logout' ? { 'Set-Cookie': cookie('', 0) } : {},
      );
    }
    throw new HttpError(404, 'Not found.');
  } catch (e) {
    if (e instanceof SyntaxError)
      return reply({ error: 'Invalid JSON request.' }, 400);
    if (e instanceof HttpError) return reply({ error: e.message }, e.status);
    if (e instanceof z.ZodError)
      return reply(
        {
          error: e.issues
            .map((i) => `${i.path.join('.')}: ${i.message}`)
            .join('; '),
        },
        400,
      );
    if (e instanceof Error && e.message === 'SETUP_REQUIRED')
      return reply(
        {
          error:
            'Project database is not configured yet. Please contact your administrator.',
        },
        503,
      );
    if (e instanceof Error && 'code' in e && e.code === 'P2002')
      return reply(
        { error: 'This record already exists. Refresh and try again.' },
        409,
      );
    console.error(
      'Project request failed',
      e instanceof Error ? e.name : 'Unknown',
    );
    return reply(
      {
        error:
          'Unable to complete this request. Please try again or contact your administrator.',
      },
      500,
    );
  }
}
export const GET = (req: Request) => withDatabase(() => handler(req));
export const POST = GET;
