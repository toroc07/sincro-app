import { zAddReporterContactRequest } from '@dispatch/contracts';
import { apiErrorResponse, HttpError } from '@/src/server/infra/errors';
import { attachReporterContact, getTracking } from '@/src/server/modules/incidents';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/track/:token/contact — el reporter agrega su celular DESPUÉS de
 * enviar el reporte, para que la tripulación pueda llamarlo.
 *
 * Sin login (§2A): el token opaco de 128 bits es la única credencial. La lógica
 * (rate-limit, incidente cerrado, en qué reporte se escribe) vive en el módulo;
 * el route solo valida y devuelve el seguimiento actualizado.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  try {
    const { token } = await params;
    const input = zAddReporterContactRequest.parse(await request.json());

    const result = await attachReporterContact(token, input.phone);
    if (!result) throw new HttpError(404, 'NOT_FOUND', 'Seguimiento no encontrado');

    const tracking = await getTracking(token);
    if (!tracking) throw new HttpError(404, 'NOT_FOUND', 'Seguimiento no encontrado');
    return Response.json(tracking);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
