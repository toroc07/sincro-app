import { clearCitizenSessionCookie } from '@/src/server/infra/citizenSession';

export const dynamic = 'force-dynamic';

/**
 * POST /api/citizens/logout
 * Cierra la sesión del ciudadano limpiando la cookie.
 */
export async function POST(): Promise<Response> {
  return Response.json(
    { ok: true },
    {
      status: 200,
      headers: { 'Set-Cookie': clearCitizenSessionCookie() },
    },
  );
}
