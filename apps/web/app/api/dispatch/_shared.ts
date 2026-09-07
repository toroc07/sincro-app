import { apiErrorResponse } from '@/src/server/infra/errors';
import { expireStaleOffers, promoteHeldDispatches } from '@/src/server/modules/dispatch';

/**
 * Caduca las ofertas sin respuesta antes de despachar.
 *
 * Una oferta reserva la unidad (`vehicles.status = 'RESERVED'`) y expira a los
 * 30 s, pero la caducidad no se dispara sola: la ejecutaba el Command Center,
 * que ya no existe. Sin nadie que la corra, UNA sola oferta que nadie contestó
 * —una demo que se cerró a medias— deja la ambulancia reservada para siempre y
 * el panel se queda sordo: todos los reportes siguientes terminan en
 * NO_RESOURCE aunque la unidad esté ahí, con GPS en vivo y libre.
 *
 * Va aquí y no dentro de `runDispatch` porque `expireStaleOffers` vuelve a
 * despachar cada incidente que libera: meterlo en el motor sería recursivo.
 *
 * Nunca lanza — que la limpieza falle no puede impedir que se despache una
 * emergencia nueva.
 *
 * Tras caducar ofertas se promueven los despachos retenidos: un reporte de baja
 * confianza que entro en RECOMMEND y que ningun operador confirmo dentro del SLA
 * se asigna igual. Va después de la caducidad porque una unidad recién liberada
 * puede ser la que ese incidente retenido necesitaba.
 */
export async function sweepExpiredOffers(): Promise<void> {
  try {
    await expireStaleOffers();
  } catch (error) {
    console.error('no se pudieron caducar las ofertas vencidas', error);
  }
  try {
    await promoteHeldDispatches();
  } catch (error) {
    console.error('no se pudieron promover los despachos retenidos', error);
  }
}

export function dispatchApiError(error: unknown): Response {
  if (error instanceof Error && 'httpStatus' in error && 'code' in error) {
    return Response.json({ error: { code: String(error.code), message: error.message } }, { status: Number(error.httpStatus) });
  }
  return apiErrorResponse(error);
}

export async function optionalJson(request: Request): Promise<unknown> {
  const text = await request.text();
  return text ? JSON.parse(text) : {};
}
