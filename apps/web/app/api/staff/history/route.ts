import { apiErrorResponse, HttpError } from '@/src/server/infra/errors';
import { resolveSession } from '@/src/server/infra/session';
import { listStaffEmergencyHistory } from '@/src/server/modules/staff';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  try {
    const session = resolveSession(request);
    if (!session) {
      throw new HttpError(401, 'FORBIDDEN', 'No hay sesión de personal activa');
    }
    const history = await listStaffEmergencyHistory(session.userId);
    return Response.json({ history });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
