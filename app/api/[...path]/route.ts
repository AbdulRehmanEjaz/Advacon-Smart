import { z } from 'zod';
import {
  cookie,
  admin,
  HttpError,
  login,
  sameOrigin,
  userFor,
} from '@/lib/server/auth';
import { getState, getStateDetail, mutate } from '@/lib/server/service';
import { buildProgressPdf } from '@/lib/server/pdf';
import { buildMonthlyTimesheetXlsx } from '@/lib/server/xlsx';
import { riyadhDate } from '@/lib/domain/date';
import type { State } from '@/lib/types';
export const dynamic = 'force-dynamic';
const reply = (data: unknown, status = 200, headers = {}) =>
  Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store', ...headers },
  });
async function handler(req: Request) {
  try {
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/api\//, '');
    if (req.method === 'POST') sameOrigin(req);
    if (path === 'login' && req.method === 'POST') {
      const body = z
        .object({ pin: z.string().max(10) })
        .parse(await req.json());
      const result = await login(
        body.pin,
        req.headers.get('cf-connecting-ip') ||
          req.headers.get('x-forwarded-for') ||
          'unknown',
      );
      return result.error
        ? reply(
            {
              error:
                'Access could not be verified. Check your PIN or try again later.',
            },
            401,
          )
        : reply({ ok: true }, 200, {
            'Set-Cookie': cookie(result.token),
          });
    }
    if (path === 'logout' && req.method === 'POST') {
      return reply({ ok: true }, 200, { 'Set-Cookie': cookie('', 0) });
    }
    const user = await userFor(req);
    if (path === 'report.pdf' && req.method === 'GET') {
      admin(user);
      const bytes = buildProgressPdf(await getState(user, 'reports'));
      return new Response(bytes, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="Tree_Translocation_Progress_Report_${riyadhDate()}.pdf"`,
          'Cache-Control': 'no-store',
          Pragma: 'no-cache',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }
    if (path === 'timesheet.xlsx' && req.method === 'GET') {
      admin(user);
      const month = url.searchParams.get('month') || '';
      const today = riyadhDate();
      if (!/^\d{4}-\d{2}$/.test(month) || month > today.slice(0, 7))
        throw new HttpError(400, 'Select a valid current or past month.');
      const bytes = buildMonthlyTimesheetXlsx(
        (await getState(user, 'timesheet')) as unknown as State,
        month,
        today,
      );
      const label = new Date(`${month}-01T00:00:00Z`)
        .toLocaleDateString('en-US', {
          month: 'short',
          year: 'numeric',
          timeZone: 'UTC',
        })
        .replace(' ', '_');
      return new Response(
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ) as ArrayBuffer,
        {
          headers: {
            'Content-Type':
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="Tree_Translocation_Timesheet_${label}.xlsx"`,
            'Cache-Control': 'no-store',
            Pragma: 'no-cache',
            'X-Content-Type-Options': 'nosniff',
          },
        },
      );
    }
    if (path === 'state' && req.method === 'GET') {
      const view = url.searchParams.get('view') || 'dashboard';
      return reply(
        url.searchParams.get('detail') === '1'
          ? await getStateDetail(user, view)
          : await getState(user, view),
      );
    }
    if (req.method === 'POST') {
      const result = await mutate(path, req, user);
      return reply(result);
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
            'Project runtime configuration is incomplete. Please contact your administrator.',
        },
        503,
      );
    if (
      e instanceof Error &&
      (e.message.includes('UNIQUE constraint failed') ||
        e.message.includes('SUBMISSION_NOT_REVIEWABLE'))
    )
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
export const GET = handler;
export const POST = GET;
