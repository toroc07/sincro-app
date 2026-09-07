import { beforeEach, describe, expect, it } from 'vitest';
import { db, newId, type Queryable } from '@dispatch/db';
import { dropAll, runMigrations } from '@dispatch/db/migrations';
import { hashPassword } from '@/src/server/infra/crypto';
import { isLocalPostgres } from '../../test-helpers';
import { findCitizen, listCitizenReports, loginCitizen, registerCitizen } from './index';
import { normalizePhone } from './internal/phone';

async function reset(): Promise<Queryable> {
  await dropAll();
  await runMigrations();
  return db();
}

describe('normalizePhone', () => {
  it('deja solo dígitos y es idempotente', () => {
    expect(normalizePhone('+57 300 555 1234')).toBe('3005551234');
    expect(normalizePhone('300-555-1234')).toBe('3005551234');
    expect(normalizePhone('3005551234')).toBe('3005551234');
    expect(normalizePhone(normalizePhone('+57 300 555 1234'))).toBe('3005551234');
  });
});

describe.skipIf(!isLocalPostgres())('ciudadano passwordless', () => {
  let q: Queryable;

  beforeEach(async () => {
    q = await reset();
  });

  it('registra con nombre + teléfono y devuelve una sesión sin correo', async () => {
    const session = await registerCitizen({ name: 'Ana Ruiz', phone: '3005551234' });
    expect(session).toMatchObject({ name: 'Ana Ruiz', phone: '3005551234', email: null });
    expect(session.id).toBeTruthy();

    const row = await q.one<{ email: string | null; password_hash: string | null }>(
      'SELECT email, password_hash FROM citizens WHERE id = ?', [session.id],
    );
    expect(row).toEqual({ email: null, password_hash: null });
  });

  it('"+57 300 555 1234" y "3005551234" son la misma cuenta', async () => {
    const first = await registerCitizen({ name: 'Ana Ruiz', phone: '+57 300 555 1234' });
    const again = await registerCitizen({ name: 'Ana R', phone: '3005551234' });

    expect(again.id).toBe(first.id);
    expect(again.name).toBe('Ana R');
    expect(await q.one('SELECT COUNT(*)::int AS n FROM citizens')).toEqual({ n: 1 });
    expect(await q.one<{ phone: string }>('SELECT phone FROM citizens WHERE id = ?', [first.id]))
      .toEqual({ phone: '3005551234' });
  });

  it('loginCitizen restaura la sesión por teléfono (normalizado)', async () => {
    const registered = await registerCitizen({ name: 'Beto Díaz', phone: '3019876543' });
    expect(await loginCitizen('  +57 301 987 6543 ')).toEqual(registered);
  });

  it('loginCitizen con un teléfono desconocido lanza 404', async () => {
    await expect(loginCitizen('3000000000')).rejects.toMatchObject({ status: 404 });
  });

  it('una cuenta con password_hash (cuenta vieja) exige contraseña en el login', async () => {
    const id = newId();
    await q.run(
      'INSERT INTO citizens (id, name, email, phone, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, 'Cuenta Vieja', 'vieja@example.com', '3025554444', hashPassword('secreto123'), Date.now()],
    );

    await expect(loginCitizen('3025554444')).rejects.toMatchObject({ status: 403 });
    await expect(loginCitizen('3025554444', 'mala')).rejects.toMatchObject({ status: 401 });
    expect(await loginCitizen('3025554444', 'secreto123')).toMatchObject({ id, name: 'Cuenta Vieja' });
  });

  it('findCitizen devuelve la sesión por id', async () => {
    const registered = await registerCitizen({ name: 'Carla Mora', phone: '3111112222' });
    expect(await findCitizen(registered.id)).toEqual(registered);
    expect(await findCitizen('no-existe')).toBeNull();
  });

  it('listCitizenReports empareja por dígitos y NO expone tracking_token', async () => {
    const citizen = await registerCitizen({ name: 'Dora Paz', phone: '+57 302 111 0000' });
    // Reporte con el teléfono tecleado con formato: se guarda tal cual.
    const incidentId = newId();
    const reportId = newId();
    await q.run(
      `INSERT INTO incidents (id, code, status, type, lat, lng, patient_count, created_at, tracking_token)
       VALUES (?, 'INC-T01', 'OPEN', 'CARDIAC', 10.4, -75.5, 1, ?, 'tok-secreto-xyz')`,
      [incidentId, Date.now()],
    );
    await q.run(
      `INSERT INTO incident_reports (id, incident_id, source, reporter_contact, description, lat, lng, was_merged, created_at)
       VALUES (?, ?, 'WEB', '+57 302 111 0000', 'algo', 10.4, -75.5, FALSE, ?)`,
      [reportId, incidentId, Date.now()],
    );

    const reports = await listCitizenReports(citizen);
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ id: incidentId, code: 'INC-T01' });
    expect(reports[0]).not.toHaveProperty('trackingToken');
  });
});
