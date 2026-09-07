/**
 * Rate-limiting best-effort para la entrada de reportes.
 *
 * Ventana deslizante en memoria del proceso. CAVEAT SERVERLESS: en varias
 * instancias cada una tiene su propio Map (igual que el bus de eventos), así
 * que el tope efectivo se multiplica por el número de instancias. Es defensa
 * contra un bucle roto o un abuso torpe, NO un límite duro — y nunca bloquea:
 * el reporte se crea igual, solo se marca `suspected_abuse` y no se
 * auto-despacha.
 *
 * Dos cupos distintos: el teléfono identifica (casi) a una persona; una IP
 * detrás de CGNAT puede ser un barrio entero, así que su tope es mucho más alto.
 */

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_TEL = 5;
const RATE_LIMIT_MAX_IP = 20;

/** clave -> timestamps (ms) de los hits dentro de la ventana. */
const hits = new Map<string, number[]>();
/** Idempotency-Key ya visto -> resultado + momento, para no cobrar cupo dos
 *  veces por el reintento del mismo POST. */
const seenDedupe = new Map<string, { at: number; result: RateLimitResult }>();

export interface RateLimitResult {
  limited: boolean;
  key: string | null;
}

function maxFor(key: string): number {
  return key.startsWith('ip:') ? RATE_LIMIT_MAX_IP : RATE_LIMIT_MAX_TEL;
}

/** Poda perezosa: quita timestamps viejos y borra la clave si queda vacía. */
function prune(now: number): void {
  for (const [key, arr] of hits) {
    const fresh = arr.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    if (fresh.length === 0) hits.delete(key);
    else if (fresh.length !== arr.length) hits.set(key, fresh);
  }
  for (const [key, entry] of seenDedupe) {
    if (now - entry.at >= RATE_LIMIT_WINDOW_MS) seenDedupe.delete(key);
  }
}

/**
 * Registra un hit para cada clave y devuelve si ALGUNA supera su cupo en la
 * ventana. Si `dedupeKey` (p. ej. el Idempotency-Key) ya se vio en la ventana,
 * devuelve el resultado cacheado SIN cobrar un hit nuevo — un reintento no
 * consume cupo. `now` inyectable para tests.
 */
export function checkReportRateLimit(
  keys: string[],
  now: number = Date.now(),
  dedupeKey?: string,
): RateLimitResult {
  prune(now);

  if (dedupeKey) {
    const cached = seenDedupe.get(dedupeKey);
    if (cached) return cached.result;
  }

  let limitedKey: string | null = null;
  for (const key of keys) {
    if (!key) continue;
    const fresh = hits.get(key) ?? [];
    fresh.push(now);
    hits.set(key, fresh);
    if (fresh.length > maxFor(key) && limitedKey === null) limitedKey = key;
  }

  const result: RateLimitResult = { limited: limitedKey !== null, key: limitedKey };
  if (dedupeKey) seenDedupe.set(dedupeKey, { at: now, result });
  return result;
}

/** Solo para tests: vacía el estado. */
export function __resetReportRateLimit(): void {
  hits.clear();
  seenDedupe.clear();
}
