import { clearSessionCookie } from '@/src/server/infra/session';

export const dynamic = 'force-dynamic';

export async function POST(): Promise<Response> {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': clearSessionCookie(),
    },
  });
}
