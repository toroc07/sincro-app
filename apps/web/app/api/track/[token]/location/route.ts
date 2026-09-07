import { zReporterLocationRequest } from '@dispatch/contracts';
import { apiErrorResponse, HttpError } from '@/src/server/infra/errors';
import { updateReporterLocation } from '@/src/server/modules/incidents';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/track/:token/location — el dispositivo del ciudadano transmite su
 * GPS mientras espera la ambulancia.
 *
 * Sin login (§2A): el token opaco de 128 bits es la única credencial. La lógica
 * (rate-limit, incidente cerrado, escritura) vive en el módulo — el route solo
 * valida y traduce.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  try {
    const { token } = await params;
    const input = zReporterLocationRequest.parse(await request.json());
    const result = await updateReporterLocation(token, input);
    if (!result) throw new HttpError(404, 'NOT_FOUND', 'Seguimiento no encontrado');
    return Response.json(result);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
