import { beforeEach, describe, expect, it } from 'vitest';
import { db, type Queryable } from '@dispatch/db';
import { dropAll, runMigrations } from '@dispatch/db/migrations';
import { isLocalPostgres } from '../../test-helpers';
import { confirmIncidentType, createIncidentFromReport, listReporterContacts, updateIncident } from './index';

async function resetDatabase(): Promise<Queryable> {
  await dropAll();
  await runMigrations();
  return db();
}

/** Fija un token de seguimiento en el incidente — `createIncidentFromReport`
 *  no lo hace (eso es de la ruta de audio), pero `confirmIncidentType` lo
 *  necesita para localizar el incidente. */
async function setToken(q: Queryable, incidentId: string, token: string): Promise<void> {
  await q.run('UPDATE incidents SET tracking_token = ? WHERE id = ?', [token, incidentId]);
}

describe.skipIf(!isLocalPostgres())('incidents — intake slice 1', () => {
  let q: Queryable;

  beforeEach(async () => {
    q = await resetDatabase();
  });

  describe('listReporterContacts', () => {
    it('fusiona 3 reportes en 2 contactos, ordena por recencia y marca el primario', async () => {
      const base = 9_000_000;
      const point = { lat: 10.4006, lng: -75.5560 };

      const first = await createIncidentFromReport({
        type: 'TRAFFIC_ACCIDENT', point, accuracyM: 20, patientCount: 1, source: 'WEB',
        reporterContact: '+573001112222', description: 'Choque de dos carros en la avenida',
      }, { now: base });
      const incidentId = first.incident.id;

      await createIncidentFromReport({
        type: 'TRAFFIC_ACCIDENT', point: { lat: 10.4007, lng: -75.5561 }, accuracyM: 20,
        patientCount: 1, source: 'WEB', reporterContact: '+573003334444',
        description: 'Hay una persona tirada en el piso',
      }, { now: base + 20_000 });

      await createIncidentFromReport({
        type: 'TRAFFIC_ACCIDENT', point: { lat: 10.4005, lng: -75.5559 }, accuracyM: 20,
        patientCount: 1, source: 'WEB', reporterContact: '+573003334444',
        description: 'Ya vienen los bomberos, sigue atrapado',
      }, { now: base + 40_000 });

      // Un ciudadano registrado: su nombre tiene que salir por el LEFT JOIN.
      await q.run('INSERT INTO citizens (id, name, email, phone, created_at) VALUES (?, ?, ?, ?, ?)', [
        'cit-1', 'María Pérez', 'maria@example.com', '+573003334444', base,
      ]);

      const detail = await q.one<{ id: string }>('SELECT id FROM incidents WHERE id = ?', [incidentId]);
      expect(detail).toBeTruthy();

      const contacts = await listReporterContacts(incidentId);
      expect(contacts).toHaveLength(2);
      expect(contacts.map((c) => c.contact)).toEqual(['+573003334444', '+573001112222']);

      expect(contacts[0]).toMatchObject({
        contact: '+573003334444', name: 'María Pérez', isPrimary: false, at: base + 40_000,
        snippet: 'Ya vienen los bomberos, sigue atrapado',
      });
      expect(contacts[1]).toMatchObject({
        contact: '+573001112222', name: null, isPrimary: true, at: base,
      });
    });
  });

  describe('confirmIncidentType — guarda de de-escalada', () => {
    it('no rebaja la prioridad de un incidente cardíaco (P1) a una caída (P3)', async () => {
      const created = await createIncidentFromReport({
        type: 'CARDIAC', point: { lat: 10.4006, lng: -75.5560 }, accuracyM: 20,
        patientCount: 1, source: 'WEB',
      }, { now: 9_100_000 });
      await setToken(q, created.incident.id, 'token-cardiac');

      await confirmIncidentType('token-cardiac', 'FALL');

      const row = await q.one<{ type: string; priority: string; needs_review: boolean }>(
        'SELECT type, priority, needs_review FROM incidents WHERE id = ?', [created.incident.id],
      );
      expect(row).toEqual({ type: 'CARDIAC', priority: 'P1', needs_review: true });

      const rejected = await q.one<{ actor_type: string; metadata: string }>(
        `SELECT actor_type, metadata FROM incident_events
          WHERE incident_id = ? AND event_type = 'PRIORITY_SET' AND actor_type = 'REPORTER'
          ORDER BY created_at DESC LIMIT 1`,
        [created.incident.id],
      );
      expect(rejected?.actor_type).toBe('REPORTER');
      expect(JSON.parse(String(rejected?.metadata))).toMatchObject({
        requestedType: 'FALL', rejected: true,
      });
    });

    it('aplica el cambio y deja needs_review cuando el ciudadano AGRAVA (OTHER→CARDIAC)', async () => {
      const created = await createIncidentFromReport({
        type: 'OTHER', point: { lat: 10.4006, lng: -75.5560 }, accuracyM: 20,
        patientCount: 1, source: 'WEB',
      }, { now: 9_200_000 });
      await setToken(q, created.incident.id, 'token-other');

      await confirmIncidentType('token-other', 'CARDIAC');

      const row = await q.one<{ type: string; priority: string; needs_review: boolean; required_capability: string }>(
        'SELECT type, priority, needs_review, required_capability FROM incidents WHERE id = ?',
        [created.incident.id],
      );
      // Escalada por token compartido: se aplica, pero un operador debe verlo.
      expect(row).toEqual({
        type: 'CARDIAC', priority: 'P1', needs_review: true, required_capability: 'ALS',
      });

      const event = await q.one<{ actor_type: string; metadata: string }>(
        `SELECT actor_type, metadata FROM incident_events
          WHERE incident_id = ? AND event_type = 'PRIORITY_SET' AND actor_type = 'REPORTER'
          ORDER BY created_at DESC LIMIT 1`,
        [created.incident.id],
      );
      expect(JSON.parse(String(event?.metadata))).toMatchObject({
        confirmedType: 'CARDIAC', viaTrackingToken: true,
      });
    });

    it('respeta la señal crítica persistida: no rechaza RESPIRATORY sobre un "no respira" (P1)', async () => {
      // OTHER + notBreathing → R01 P1/ALS. La señal se persiste (migración 025).
      const created = await createIncidentFromReport({
        type: 'OTHER', point: { lat: 10.4006, lng: -75.5560 }, accuracyM: 20,
        patientCount: 1, source: 'WEB', signals: { notBreathing: true },
      }, { now: 9_300_000 });
      expect(created.incident.priority).toBe('P1');
      await setToken(q, created.incident.id, 'token-signal');

      // RESPIRATORY sin señales sería P2 (de-escalada, rechazable). Con la señal
      // persistida vuelve a dar R01 P1/ALS → igual → se aplica el tipo.
      await confirmIncidentType('token-signal', 'RESPIRATORY');

      const row = await q.one<{ type: string; priority: string; needs_review: boolean }>(
        'SELECT type, priority, needs_review FROM incidents WHERE id = ?', [created.incident.id],
      );
      expect(row).toEqual({ type: 'RESPIRATORY', priority: 'P1', needs_review: false });
    });
  });

  describe('suspectedAbuse (Fase F)', () => {
    it('marca suspected_abuse cuando la opción llega true (rama NEW)', async () => {
      const created = await createIncidentFromReport({
        type: 'CARDIAC', point: { lat: 10.4006, lng: -75.5560 }, accuracyM: 20,
        patientCount: 1, source: 'WEB',
      }, { now: 9_400_000, suspectedAbuse: true });

      expect(await q.one('SELECT suspected_abuse FROM incidents WHERE id = ?', [created.incident.id]))
        .toEqual({ suspected_abuse: true });
      expect(created.incident.suspectedAbuse).toBe(true);
    });

    it('sin la opción, suspected_abuse queda en false', async () => {
      const created = await createIncidentFromReport({
        type: 'CARDIAC', point: { lat: 10.42, lng: -75.54 }, accuracyM: 20,
        patientCount: 1, source: 'WEB',
      }, { now: 9_400_000 });

      expect(await q.one('SELECT suspected_abuse FROM incidents WHERE id = ?', [created.incident.id]))
        .toEqual({ suspected_abuse: false });
    });

    it('un merge NO propaga suspected_abuse al incidente destino', async () => {
      const base = 9_500_000;
      const point = { lat: 10.4006, lng: -75.5560 };
      const first = await createIncidentFromReport({
        type: 'TRAFFIC_ACCIDENT', point, accuracyM: 20, patientCount: 1, source: 'WEB',
        description: 'choque', reporterContact: '3001110000',
      }, { now: base });
      // Segundo reporte, marcado como abuso, se fusiona.
      const merged = await createIncidentFromReport({
        type: 'TRAFFIC_ACCIDENT', point: { lat: 10.4007, lng: -75.5561 }, accuracyM: 20,
        patientCount: 1, source: 'WEB', description: 'lo mismo', reporterContact: '3002220000',
      }, { now: base + 20_000, suspectedAbuse: true });

      expect(merged.wasMerged).toBe(true);
      expect(await q.one('SELECT suspected_abuse FROM incidents WHERE id = ?', [first.incident.id]))
        .toEqual({ suspected_abuse: false });
    });

    it('3+ reportes fusionados limpian una marca de abuso previa', async () => {
      const base = 9_600_000;
      const point = { lat: 10.4006, lng: -75.5560 };
      const first = await createIncidentFromReport({
        type: 'TRAFFIC_ACCIDENT', point, accuracyM: 20, patientCount: 1, source: 'WEB',
        description: 'choque', reporterContact: '3001110001',
      }, { now: base, suspectedAbuse: true });
      expect(await q.one('SELECT suspected_abuse FROM incidents WHERE id = ?', [first.incident.id]))
        .toEqual({ suspected_abuse: true });

      await createIncidentFromReport({
        type: 'TRAFFIC_ACCIDENT', point: { lat: 10.4007, lng: -75.5561 }, accuracyM: 20,
        patientCount: 1, source: 'WEB', description: 'lo vi', reporterContact: '3002220002',
      }, { now: base + 20_000 });
      // 3er reporte: ahora hay 3 testigos -> se limpia.
      await createIncidentFromReport({
        type: 'TRAFFIC_ACCIDENT', point: { lat: 10.4005, lng: -75.5559 }, accuracyM: 20,
        patientCount: 1, source: 'WEB', description: 'también', reporterContact: '3003330003',
      }, { now: base + 40_000 });

      expect(await q.one('SELECT suspected_abuse FROM incidents WHERE id = ?', [first.incident.id]))
        .toEqual({ suspected_abuse: false });
      const ev = await q.one<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM incident_events
          WHERE incident_id = ? AND event_type = 'MANUAL_OVERRIDE'
            AND metadata::text LIKE '%clearedAbuseFlag%'`,
        [first.incident.id],
      );
      expect(ev?.n).toBe(1);
    });

    it('updateIncident({ clearAbuse: true }) retira la marca', async () => {
      const created = await createIncidentFromReport({
        type: 'CARDIAC', point: { lat: 10.43, lng: -75.53 }, accuracyM: 20,
        patientCount: 1, source: 'WEB',
      }, { now: 9_700_000, suspectedAbuse: true });

      const updated = await updateIncident(created.incident.id, { clearAbuse: true });
      expect(updated.suspectedAbuse).toBe(false);
      expect(await q.one('SELECT suspected_abuse FROM incidents WHERE id = ?', [created.incident.id]))
        .toEqual({ suspected_abuse: false });
    });
  });
});
