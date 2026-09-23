import { zCitizenLoginRequest, zCitizenLoginResponse } from '@dispatch/contracts';
import { apiErrorResponse, HttpError } from '@/src/server/infra/errors';
import { citizenSessionCookie } from '@/src/server/infra/citizenSession';
import { loginCitizen } from '@/src/server/modules/citizens';
import { isLocalPreview, loginLocalPreviewCitizen } from '@/src/server/demo/localPreview';

export const dynamic = 'force-dynamic';

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, 'VALIDATION_FAILED', 'El cuerpo debe ser JSON válido');
  }
}

/**
 * POST /api/citizens/login — "restaurar sesión por teléfono": sin contraseña,
 * el identifier es el número con el que se registró.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const input = zCitizenLoginRequest.parse(await readJson(request));
    const citizen = isLocalPreview()
      ? loginLocalPreviewCitizen(input.identifier)
      : await loginCitizen(input.identifier, input.password);
    if (!citizen) throw new HttpError(404, 'NOT_FOUND', 'No encontramos ese número. Regístrate para continuar.');
    return Response.json(zCitizenLoginResponse.parse({ citizen }), {
      status: 200,
      headers: { 'Set-Cookie': citizenSessionCookie(citizen) },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
