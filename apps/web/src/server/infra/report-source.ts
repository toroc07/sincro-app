/**
 * Claves de rate-limit para la entrada de reportes: IP y teléfono del
 * reportante normalizado a dígitos.
 *
 * Compartido por `/api/incidents` y `/api/incidents/audio` para que las dos
 * puertas de entrada cuenten contra el mismo cupo.
 *
 * La IP sale del ÚLTIMO salto de `x-forwarded-for`, no del primero: cuando el
 * proxy de confianza (Render, Vercel) AÑADE la cabecera, el último valor es el
 * que ese proxy vio de verdad; los anteriores los pudo poner el cliente y son
 * falsificables. Es best-effort: si no hay proxy, no hay clave de IP.
 */
export function reportRateLimitKeys(
  request: Request,
  reporterContact: string | null | undefined,
): string[] {
  const keys: string[] = [];

  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',').map((s) => s.trim()).filter(Boolean).at(-1);
  if (ip) keys.push(`ip:${ip}`);

  const digits = (reporterContact ?? '').replace(/\D/g, '');
  if (digits.length >= 7) keys.push(`tel:${digits}`);

  return keys;
}
