import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './internal/crypto';

describe('citizens authentication crypto', () => {
  it('genera un hash con salt no determinista', () => {
    const pwd = 'password123';
    const hash1 = hashPassword(pwd);
    const hash2 = hashPassword(pwd);

    expect(hash1).not.toBe(hash2);
    expect(hash1).toContain(':');
    expect(hash2).toContain(':');
  });

  it('verifica correctamente una contraseña válida', () => {
    const pwd = 'MiPasswordSeguro!2026';
    const hash = hashPassword(pwd);

    expect(verifyPassword(pwd, hash)).toBe(true);
    expect(verifyPassword('otroPassword', hash)).toBe(false);
  });

  it('rechaza hashes malformados sin lanzar excepción', () => {
    expect(verifyPassword('algo', '')).toBe(false);
    expect(verifyPassword('algo', 'sinsalt')).toBe(false);
    expect(verifyPassword('algo', 'salt:claveinvalidahex')).toBe(false);
  });
});
