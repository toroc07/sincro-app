import { db } from '@dispatch/db';
import { sweepExpiredOffers } from '@/app/api/dispatch/_shared';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// El host serverless (Netlify Functions en Free) corta a los 10 s. Esta ruta
// NO espera el arranque en frío de Render (~50 s): dispara el ping y sigue.
// Abrir la conexión ya basta para que Render empiece a bootear.
export const maxDuration = 10;

/**
 * GET /api/keepalive — mantiene despiertas las piezas que se duermen.
 *
 * Las dependencias externas de la demo están en capas gratuitas que suspenden
 * por inactividad:
 *
 *   - audio-service (Render): duerme a los ~15 min y tarda ~50 s en despertar.
 *   - routing-service: carga 25k nodos del grafo al arrancar.
 *   - Neon: suspende el cómputo a los pocos minutos.
 *
 * Quien de verdad garantiza que Render no duerma es el cron de GitHub Actions
 * (.github/workflows/keepalive.yml), que pinga `/health` de audio y routing
 * DIRECTAMENTE cada 10 min. Esta ruta se enfoca en lo que solo puede hacerse
 * desde dentro de la app —despertar Neon y barrer ofertas vencidas— y ademas
 * "toca" audio/routing best-effort (timeout corto) para el navegador que la
 * llama al abrir la app.
 *
 * Nunca falla con 5xx: un monitor que solo mira el código de estado debe ver
 * 200 mientras la app viva. El detalle por servicio va en el cuerpo; que un
 * ping externo dé timeout es normal si el servicio estaba frío.
 */

/** Corto a propósito: no bloquea la respuesta esperando un arranque en frío. */
const PING_TIMEOUT_MS = 3_500;

interface ProbeResult {
  ok: boolean;
  ms: number;
  detail?: string;
}

async function probe(name: string, run: () => Promise<void>): Promise<[string, ProbeResult]> {
  const started = Date.now();
  try {
    await run();
    return [name, { ok: true, ms: Date.now() - started }];
  } catch (error) {
    return [name, { ok: false, ms: Date.now() - started, detail: (error as Error).message }];
  }
}

async function ping(baseUrl: string | undefined): Promise<void> {
  if (!baseUrl) throw new Error('sin URL configurada');
  const response = await fetch(new URL('/health', baseUrl), {
    cache: 'no-store',
    signal: AbortSignal.timeout(PING_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
}

export async function GET(): Promise<Response> {
  const results = await Promise.all([
    probe('audio', () => ping(process.env.AUDIO_SERVICE_URL)),
    probe('routing', () => ping(process.env.ROUTING_SERVICE_URL ?? 'http://127.0.0.1:4002')),
    // `SELECT 1` basta para sacar a Neon de la suspensión: el coste está en
    // levantar el cómputo, no en la consulta.
    probe('database', async () => { await db().one('SELECT 1 AS ok'); }),
    // Techo de respaldo del SLA de despacho: el cron de GitHub pinga esta ruta
    // cada 10 min, así un reporte retenido se despacha aunque nadie tenga un
    // panel abierto. `sweepExpiredOffers` nunca lanza.
    probe('dispatch-sweep', () => sweepExpiredOffers()),
  ]);

  const services = Object.fromEntries(results) as Record<string, ProbeResult>;

  return Response.json(
    { ok: true, at: new Date().toISOString(), services },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
