import { zCitizenLoginRequest, zCitizenLoginResponse } from '@dispatch/contracts';
import { apiErrorResponse, HttpError } from '@/src/server/infra/errors';
import { citizenSessionCookie } from '@/src/server/infra/citizenSession';
import { loginCitizen } from '@/src/server/modules/citizens';

export const dynamic = 'force-dynamic';

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, 'VALIDATION_FAILED', 'El cuerpo debe ser JSON válido');
  }
}

/**
 * POST /api/citizens/login
 * Inicia sesión usando correo o teléfono y contraseña (si aplica).
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const input = zCitizenLoginRequest.parse(await readJson(request));
    const citizen = await loginCitizen(input.identifier, input.password);
    return Response.json(zCitizenLoginResponse.parse({ citizen }), {
      status: 200,
      headers: { 'Set-Cookie': citizenSessionCookie(citizen) },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
