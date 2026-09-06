import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * Hashea una contraseña usando scrypt con salt criptográfico de 16 bytes.
 * Formato persistido: `${salt}:${hash}`
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

/**
 * Verifica si una contraseña coincide con el hash almacenado.
 * Usa timingSafeEqual para prevenir ataques de temporización.
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  try {
    const [salt, key] = storedHash.split(':');
    if (!salt || !key) return false;
    const keyBuffer = Buffer.from(key, 'hex');
    const derivedBuffer = scryptSync(password, salt, 64);
    if (keyBuffer.length !== derivedBuffer.length) return false;
    return timingSafeEqual(keyBuffer, derivedBuffer);
  } catch {
    return false;
  }
}
