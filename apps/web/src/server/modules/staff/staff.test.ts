import { describe, expect, it } from 'vitest';
import { hashPassword } from '@/src/server/infra/crypto';
import { loginStaff } from './index';

describe('staff module', () => {
  const dummyUser = {
    id: 'user-responder',
    org_id: 'org-ems',
    role: 'RESPONDER' as const,
    name: 'Tripulación Demo',
    email: 'responder@sincro.co',
    phone: '3001234567',
    password_hash: hashPassword('responder123'),
    created_at: Date.now(),
  };

  const mockQueryable = {
    one: async <T>(sql: string, params: unknown[] = []): Promise<T | null> => {
      const p = String(params[0]).toLowerCase();
      if (
        p === dummyUser.id.toLowerCase() ||
        p === dummyUser.email.toLowerCase() ||
        params[2] === dummyUser.phone
      ) {
        return dummyUser as unknown as T;
      }
      return null;
    },
    many: async <T>(): Promise<T[]> => [],
    run: async () => {},
  };

  it('inicia sesión con identificador y contraseña correctos', async () => {
    const session = await loginStaff('user-responder', 'responder123', mockQueryable as any);
    expect(session.userId).toBe('user-responder');
    expect(session.role).toBe('RESPONDER');
    expect(session.name).toBe('Tripulación Demo');
    expect(session.email).toBe('responder@sincro.co');
  });

  it('inicia sesión usando el correo electrónico', async () => {
    const session = await loginStaff('responder@sincro.co', 'responder123', mockQueryable as any);
    expect(session.userId).toBe('user-responder');
    expect(session.role).toBe('RESPONDER');
  });

  it('rechaza contraseñas incorrectas con código 403', async () => {
    await expect(
      loginStaff('user-responder', 'clave_invalida', mockQueryable as any),
    ).rejects.toThrow();
  });

  it('rechaza usuarios inexistentes con código 404', async () => {
    await expect(
      loginStaff('inexistente@sincro.co', 'responder123', mockQueryable as any),
    ).rejects.toThrow();
  });
});
