import { beforeEach, describe, expect, it } from 'vitest';
import { db, type Queryable } from '@dispatch/db';
import { dropAll, runMigrations } from '@dispatch/db/migrations';
import type { AudioReportRequest } from '@dispatch/contracts';
import { isLocalPostgres } from '../../test-helpers';
import { createIncidentFromAudio, getTracking, listReporterContacts } from './index';
import { attachReporterContact, __resetReporterContactRateLimit } from './internal/tracking';

async function reset(): Promise<Queryable> {
  await dropAll();
  await runMigrations();
  __resetReporterContactRateLimit();
  return db();
}

function audioRequest(lat: number, lng: number): AudioReportRequest {
  return {
    audioBase64: Buffer.from('no-es-audio-real').toString('base64'),
    mimeType: 'audio/webm', durationSeconds: 3,
    point: { lat, lng }, accuracyM: 25,
  };
}

async function countContactEvents(q: Queryable, incidentId: string): Promise<number> {
  const row = await q.one<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM incident_events
      WHERE incident_id = ? AND event_type = 'REPORTER_CONTACT_ADDED'`,
    [incidentId],
  );
  return row?.n ?? 0;
}

describe.skipIf(!isLocalPostgres())('teléfono diferido del reportante', () => {
  let q: Queryable;

  beforeEach(async () => {
    q = await reset();
  });

  it('incidente sin contacto: lo escribe en el reporte primario y lo expone', async () => {
    const created = await createIncidentFromAudio(audioRequest(10.4006, -75.556));
    const { trackingToken: token, incidentId } = created;

    const result = await attachReporterContact(token, '  300 555 1212  ');
    expect(result).toEqual({ ok: true });

    const row = await q.one<{ reporter_contact: string | null }>(
      'SELECT reporter_contact FROM incident_reports WHERE incident_id = ?', [incidentId],
    );
    expect(row?.reporter_contact).toBe('300 555 1212');

    const tracking = await getTracking(token);
    expect(tracking?.reporterContactOnFile).toBe(true);

    const contacts = await listReporterContacts(incidentId);
    expect(contacts.map((c) => c.contact)).toContain('300 555 1212');

    expect(await countContactEvents(q, incidentId)).toBe(1);
  });

  it('un segundo número no pisa el primero pero sí registra otro evento', async () => {
    const created = await createIncidentFromAudio(audioRequest(10.4006, -75.556));
    const { trackingToken: token, incidentId } = created;

    const t0 = Date.now();
    await attachReporterContact(token, '3005551212', t0);
    await attachReporterContact(token, '3009998888', t0 + 10_000);

    const row = await q.one<{ reporter_contact: string | null }>(
      'SELECT reporter_contact FROM incident_reports WHERE incident_id = ?', [incidentId],
    );
    expect(row?.reporter_contact).toBe('3005551212');

    expect(await countContactEvents(q, incidentId)).toBe(2);

    const second = await q.one<{ metadata: unknown }>(
      `SELECT metadata FROM incident_events
        WHERE incident_id = ? AND event_type = 'REPORTER_CONTACT_ADDED'
        ORDER BY created_at DESC LIMIT 1`,
      [incidentId],
    );
    const meta = typeof second?.metadata === 'string'
      ? JSON.parse(second.metadata) as Record<string, unknown>
      : second?.metadata as Record<string, unknown>;
    expect(meta.phone).toBe('3009998888');
  });

  it('token inexistente: devuelve null y no lanza', async () => {
    await expect(attachReporterContact('token-que-no-existe', '3005551212'))
      .resolves.toBeNull();
  });

  it('incidente COMPLETED: no-op silencioso sin escribir', async () => {
    const created = await createIncidentFromAudio(audioRequest(10.4006, -75.556));
    const { trackingToken: token, incidentId } = created;
    await q.run("UPDATE incidents SET status = 'COMPLETED', closed_at = ? WHERE tracking_token = ?", [
      Date.now(), token,
    ]);

    expect(await attachReporterContact(token, '3005551212')).toEqual({ ok: true });

    const row = await q.one<{ reporter_contact: string | null }>(
      'SELECT reporter_contact FROM incident_reports WHERE incident_id = ?', [incidentId],
    );
    expect(row?.reporter_contact).toBeNull();
    expect(await countContactEvents(q, incidentId)).toBe(0);
  });

  it('rate-limit: dos llamadas seguidas < cadencia, la segunda es no-op', async () => {
    const created = await createIncidentFromAudio(audioRequest(10.4006, -75.556));
    const { trackingToken: token, incidentId } = created;

    const t0 = Date.now();
    await attachReporterContact(token, '3005551212', t0);
    await attachReporterContact(token, '3009998888', t0 + 500);

    expect(await countContactEvents(q, incidentId)).toBe(1);
  });
});
