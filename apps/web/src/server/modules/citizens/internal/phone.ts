/**
 * Normalización de teléfono para el upsert e identidad del ciudadano.
 *
 * Determinista e idempotente: `normalizePhone(normalizePhone(x)) === normalizePhone(x)`.
 *  - Se queda solo con los dígitos (el ciudadano escribe "+57 300 555 1234",
 *    "300-555-1234", etc.).
 *  - Si quedan 12 dígitos que empiezan por 57 (móvil colombiano con prefijo
 *    país), se recorta el 57: así "+57 300 555 1234" y "3005551234" son la
 *    misma cuenta.
 *
 * NO se toca `incident_reports.reporter_contact`: ahí se guarda lo que teclea
 * el ciudadano para que el `tel:` del panel de la ambulancia marque bien. La
 * normalización es solo para comparar/identificar.
 */
export function normalizePhone(raw: string): string {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('57')) return digits.slice(2);
  return digits;
}
