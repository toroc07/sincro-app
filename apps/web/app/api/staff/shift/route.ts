import { zStaffStartShiftRequest } from '@dispatch/contracts';
import { apiErrorResponse, HttpError } from '@/src/server/infra/errors';
import { resolveSession } from '@/src/server/infra/session';
import { endStaffShift, startStaffShift } from '@/src/server/modules/staff';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  try {
    const session = resolveSession(request);
    if (!session) {
      throw new HttpError(401, 'FORBIDDEN', 'No hay sesión de personal activa');
    }
    const json = await request.json();
    const input = zStaffStartShiftRequest.parse(json);
    const activeShift = await startStaffShift(session.userId, input.vehicleId);
    return Response.json({ activeShift }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(request: Request): Promise<Response> {
  try {
    const session = resolveSession(request);
    if (!session) {
      throw new HttpError(401, 'FORBIDDEN', 'No hay sesión de personal activa');
    }
    await endStaffShift(session.userId);
    return Response.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
