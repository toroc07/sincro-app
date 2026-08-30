import type { Point } from '@dispatch/contracts';
import { straightLineRoute, type RouteResult } from '@/src/lib/routing';

/**
 * Cliente del servicio de rutas (backend/routing/routing_service.py, A* sobre
 * el grafo vial de OpenStreetMap de Cartagena).
 *
 * Vive en `infra` y no dentro de un modulo porque lo usan dos consumidores que
 * no se conocen entre si: el proxy `/api/routing` que alimenta el mapa, y el
 * seguimiento del ciudadano, que necesita el MISMO numero para no mostrar un
 * ETA distinto al del mapa que tiene justo encima.
 *
 * Nunca lanza: si el servicio esta dormido o caido devuelve la linea recta con
 * `source: 'straight'`, y quien llama decide como decirlo en pantalla.
 */

const ROUTING_URL = process.env.ROUTING_SERVICE_URL ?? 'http://127.0.0.1:4002';

/** Un mapa que tarda 6 s en pintar la ruta es peor que uno que pinta la recta
 *  al instante: en una emergencia el usuario ya esta mirando la pantalla. */
export const DEFAULT_ROUTING_TIMEOUT_MS = Number(process.env.ROUTING_TIMEOUT_MS ?? 6_000);

interface GraphRouteResponse {
  coordinates: [number, number][];
  distanceMeters: number;
  durationSeconds: number;
  durationText: string;
  approximate: boolean;
}

export async function fetchGraphRoute(
  from: Point,
  to: Point,
  timeoutMs: number = DEFAULT_ROUTING_TIMEOUT_MS,
): Promise<RouteResult> {
  try {
    const url = new URL('/route', ROUTING_URL);
    url.searchParams.set('fromLat', String(from.lat));
    url.searchParams.set('fromLng', String(from.lng));
    url.searchParams.set('toLat', String(to.lat));
    url.searchParams.set('toLng', String(to.lng));

    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) throw new Error(`routing-service ${response.status}`);

    const graph = (await response.json()) as GraphRouteResponse;
    if (!Array.isArray(graph.coordinates) || graph.coordinates.length < 2) {
      throw new Error('routing-service devolvió una geometría vacía');
    }

    return {
      coordinates: graph.coordinates,
      distanceMeters: graph.distanceMeters,
      durationSeconds: graph.durationSeconds,
      durationText: graph.durationText,
      approximate: Boolean(graph.approximate),
      source: 'graph',
    };
  } catch (error) {
    // No es un error: la ruta recta es una respuesta valida y honesta, con
    // `source: 'straight'` para que la UI lo diga. Se registra para que un
    // servicio dormido se note en los logs y no en silencio.
    console.warn('[routing] respaldo en línea recta:', (error as Error).message);
    return straightLineRoute(from, to);
  }
}
