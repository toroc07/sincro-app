import { apiErrorResponse, HttpError } from '@/src/server/infra/errors';
import { resolveSession } from '@/src/server/infra/session';
import { findStaffUser } from '@/src/server/modules/staff';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  try {
    const session = resolveSession(request);
    if (!session) {
      throw new HttpError(401, 'FORBIDDEN', 'No hay sesión activa');
    }
    if (session.role !== 'ADMIN' && session.role !== 'DISPATCHER') {
      throw new HttpError(403, 'FORBIDDEN', 'No autorizado para el centro de comando');
    }

    const user = await findStaffUser(session.userId);
    if (!user) {
      throw new HttpError(404, 'NOT_FOUND', 'Usuario no encontrado');
    }

    return Response.json({ user });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
