import { zDispatchRequest, zDispatchResponse } from '@dispatch/contracts';
import { getCandidates, runDispatch } from '@/src/server/modules/dispatch';
import { dispatchApiError, optionalJson, sweepExpiredOffers } from '@/app/api/dispatch/_shared';
import { dispatchLocalPreview, isLocalPreview } from '@/src/server/demo/localPreview';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = await context.params;
    const input = zDispatchRequest.parse(await optionalJson(request));
    if (isLocalPreview()) {
      const result = dispatchLocalPreview(id, input.overrideVehicleId);
      if (!result) return Response.json({ error: { code: 'NO_RESOURCE', message: 'No hay ninguna unidad disponible.' } }, { status: 409 });
      return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
    }
    // Idempotencia de dominio: un reintento, doble clic o pestaña duplicada
    // nunca debe reservar una segunda ambulancia para el mismo incidente.
    const current = await getCandidates(id);
    if (current.assignment) return Response.json(zDispatchResponse.parse(current), { headers: { 'Cache-Control': 'no-store' } });
    // El panel reintenta esta ruta mientras no tenga asignación: es el momento
    // exacto para soltar la unidad que quedó reservada por una oferta vieja.
    await sweepExpiredOffers();
    const result = await runDispatch(id, input, {
      idempotencyKey: request.headers.get('Idempotency-Key'),
      triggeredBy: 'DISPATCHER',
    });
    return Response.json(zDispatchResponse.parse(result));
  } catch (error) {
    return dispatchApiError(error);
  }
}
