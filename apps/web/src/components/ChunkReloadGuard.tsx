'use client';

import { useEffect } from 'react';

/**
 * Autorrecuperación de "chunk viejo": la app se redespliega a menudo (cada
 * redeploy en Vercel cambia el hash de los archivos de `_next/static`), y si
 * alguien deja la pestaña abierta desde ANTES de un redeploy, el siguiente
 * `import()` dinámico (p. ej. `maplibre-gl` en el mapa) o la siguiente
 * navegación de Next intenta pedir un chunk que ya no existe. El servidor
 * responde con la página 404 en HTML, y el navegador lo reporta como
 * "Failed to load module script: ... non-JavaScript MIME type of text/html"
 * — no es un bug de código, es una pestaña desactualizada.
 *
 * La recuperación es recargar una vez. `sessionStorage` evita un bucle si el
 * fallo fuera de verdad (red caída): se intenta solo una vez por pestaña.
 */
const RELOAD_FLAG = 'sincro_chunk_reload_at';
const RELOAD_COOLDOWN_MS = 10_000;

function looksLikeStaleChunk(message: string): boolean {
  return (
    /Failed to fetch dynamically imported module/i.test(message)
    || /Loading chunk [\d]+ failed/i.test(message)
    || /non-javascript mime type/i.test(message)
    || /ChunkLoadError/i.test(message)
  );
}

function reloadOnce() {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_FLAG) ?? 0);
    if (Date.now() - last < RELOAD_COOLDOWN_MS) return; // ya se intentó hace poco
    sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));
  } catch {
    // Sin sessionStorage (modo privado estricto) igual se intenta una vez.
  }
  window.location.reload();
}

export function ChunkReloadGuard() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      if (looksLikeStaleChunk(event.message ?? '')) reloadOnce();
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const message = event.reason instanceof Error ? event.reason.message : String(event.reason);
      if (looksLikeStaleChunk(message)) reloadOnce();
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return null;
}
