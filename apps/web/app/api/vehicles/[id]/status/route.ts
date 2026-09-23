import { zUpdateVehicleStatusRequest } from '@dispatch/contracts';
import { setStatus } from '@/src/server/modules/vehicles';
import { getActiveAssignmentForVehicle } from '@/src/server/modules/vehicles';
import { markEnRoute } from '@/src/server/modules/dispatch';
import { apiErrorResponse } from '@/src/server/infra/errors';
import { isLocalPreview, setLocalPreviewEnRoute } from '@/src/server/demo/localPreview';

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = await context.params;
    if (isLocalPreview()) {
      const vehicle = setLocalPreviewEnRoute(id);
      if (!vehicle) return Response.json({ error: { code: 'NOT_FOUND', message: 'Unidad no encontrada.' } }, { status: 404 });
      return Response.json(vehicle);
    }
    const { status } = zUpdateVehicleStatusRequest.parse(await request.json());
    if (status === 'EN_ROUTE') {
      const active = await getActiveAssignmentForVehicle(id);
      if (active?.assignment.status === 'ACCEPTED') {
        return Response.json(await markEnRoute(active.assignment.id));
      }
    }
    return Response.json(await setStatus(id, status));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
