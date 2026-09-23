import { resolveCitizenSession } from '@/src/server/infra/citizenSession';
import { apiErrorResponse, HttpError } from '@/src/server/infra/errors';
import { listCitizenReports } from '@/src/server/modules/citizens';
import { isLocalPreview, localPreviewCitizenReports } from '@/src/server/demo/localPreview';

export const dynamic = 'force-dynamic';

/**
 * GET /api/citizens/reports
 * Obtiene el historial de reportes asociados al ciudadano logueado.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const citizen = resolveCitizenSession(request);
    if (!citizen) {
      throw new HttpError(401, 'FORBIDDEN', 'Debes iniciar sesión para consultar tu historial.');
    }
    if (isLocalPreview()) return Response.json({ reports: localPreviewCitizenReports() });
    const reports = await listCitizenReports(citizen);
    return Response.json({ reports });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
