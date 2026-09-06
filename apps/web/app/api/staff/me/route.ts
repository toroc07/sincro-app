import { apiErrorResponse, HttpError } from '@/src/server/infra/errors';
import { resolveSession } from '@/src/server/infra/session';
import { getStaffProfile } from '@/src/server/modules/staff';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  try {
    const session = resolveSession(request);
    if (!session) {
      throw new HttpError(401, 'FORBIDDEN', 'No hay sesión de personal activa');
    }
    const profile = await getStaffProfile(session.userId);
    return Response.json(profile);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
