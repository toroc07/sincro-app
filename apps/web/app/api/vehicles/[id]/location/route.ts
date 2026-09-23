import { zPostLocationRequest } from '@dispatch/contracts';
import { recordLocations } from '@/src/server/modules/vehicles';
import { apiErrorResponse } from '@/src/server/infra/errors';
import { isLocalPreview, updateLocalPreviewVehicleLocation } from '@/src/server/demo/localPreview';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = await context.params;
    const body = zPostLocationRequest.parse(await request.json());
    if (isLocalPreview()) {
      const point = body.positions.at(-1);
      if (!point || !updateLocalPreviewVehicleLocation(id, point.lat, point.lng, point.recordedAt)) {
        return Response.json({ error: { code: 'NOT_FOUND', message: 'Unidad no encontrada.' } }, { status: 404 });
      }
      return Response.json({ accepted: body.positions.length }, { status: 201 });
    }
    const positions = await recordLocations(id, body.positions);
    return Response.json({ positions, accepted: positions.length }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
