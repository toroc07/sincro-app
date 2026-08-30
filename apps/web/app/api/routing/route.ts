import { apiErrorResponse, HttpError } from '@/src/server/infra/errors';
import { fetchGraphRoute } from '@/src/server/infra/routing';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/routing?fromLat&fromLng&toLat&toLng — ruta por calles reales.
 *
 * Proxy al servicio de Python (backend/routing/routing_service.py), que corre
 * el A* sobre el grafo vial de OpenStreetMap de Cartagena. Va por el servidor
 * y no directo desde el navegador por dos razones: la URL del servicio no se
 * publica al cliente, y aquí podemos degradar a línea recta si el servicio
 * está dormido o caído — el mapa nunca se queda vacío, solo deja de decir
 * "por calles". La llamada en sí vive en `infra/routing` porque el seguimiento
 * del ciudadano usa exactamente la misma ruta para su ETA.
 *
 * El grafo es de solo lectura y no depende de la base de datos: si esto falla,
 * el despacho sigue funcionando igual.
 */

function coordinate(params: URLSearchParams, name: string, limit: number): number {
  const raw = params.get(name);
  const value = Number(raw);
  if (raw === null || !Number.isFinite(value) || Math.abs(value) > limit) {
    throw new HttpError(400, 'VALIDATION_FAILED', `Parámetro inválido: ${name}`);
  }
  return value;
}

export async function GET(request: Request): Promise<Response> {
  try {
    const params = new URL(request.url).searchParams;
    const from = { lat: coordinate(params, 'fromLat', 90), lng: coordinate(params, 'fromLng', 180) };
    const to = { lat: coordinate(params, 'toLat', 90), lng: coordinate(params, 'toLng', 180) };

    const route = await fetchGraphRoute(from, to);
    return Response.json(route, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
