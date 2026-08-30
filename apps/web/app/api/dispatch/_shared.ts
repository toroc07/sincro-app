import { apiErrorResponse } from '@/src/server/infra/errors';
import { expireStaleOffers } from '@/src/server/modules/dispatch';

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
 */
export async function sweepExpiredOffers(): Promise<void> {
  try {
    await expireStaleOffers();
  } catch (error) {
    console.error('no se pudieron caducar las ofertas vencidas', error);
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
