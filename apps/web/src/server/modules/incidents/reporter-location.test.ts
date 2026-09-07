import { beforeEach, describe, expect, it } from 'vitest';
import { db, type Queryable } from '@dispatch/db';
import { dropAll, runMigrations } from '@dispatch/db/migrations';
import type { AudioReportRequest } from '@dispatch/contracts';
import { isLocalPostgres } from '../../test-helpers';
import { createIncidentFromAudio, getTracking, updateReporterLocation } from './index';

async function reset(): Promise<Queryable> {
  await dropAll();
  await runMigrations();
  return db();
}

/** Reporte por audio con base64 basura: sin motor de transcripción devuelve
 *  null y el incidente se crea igual, con su token de seguimiento. */
function audioRequest(lat: number, lng: number): AudioReportRequest {
  return {
    audioBase64: Buffer.from('no-es-audio-real').toString('base64'),
    mimeType: 'audio/webm', durationSeconds: 3,
    point: { lat, lng }, accuracyM: 25,
  };
}

describe.skipIf(!isLocalPostgres())('ubicación viva del reportante', () => {
  let q: Queryable;

  beforeEach(async () => {
    q = await reset();
  });

  it('guarda la posición y getTracking la devuelve si es fresca', async () => {
    const created = await createIncidentFromAudio(audioRequest(10.4006, -75.556));
    const token = created.trackingToken;

    const result = await updateReporterLocation(token, { lat: 10.4100, lng: -75.5300, accuracyM: 12 });
    expect(result).toEqual({ ok: true });

    const tracking = await getTracking(token);
    expect(tracking?.reporterLocation).toEqual({
      lat: 10.41, lng: -75.53, at: expect.any(Number),
    });

    const row = await q.one<{ reporter_accuracy_m: number | null }>(
      'SELECT reporter_accuracy_m FROM incidents WHERE tracking_token = ?', [token],
    );
    expect(row?.reporter_accuracy_m).toBe(12);
  });

  it('una posición vieja (>60s) no se expone: reporterLocation es null', async () => {
    const created = await createIncidentFromAudio(audioRequest(10.4006, -75.556));
    const token = created.trackingToken;

    // `now` de hace dos minutos: al leer, getTracking la considera rancia.
    await updateReporterLocation(token, { lat: 10.41, lng: -75.53 }, Date.now() - 120_000);

    const tracking = await getTracking(token);
    expect(tracking?.reporterLocation).toBeNull();
  });

  it('token inválido: la función devuelve null y no lanza', async () => {
    await expect(updateReporterLocation('token-que-no-existe', { lat: 10.41, lng: -75.53 }))
      .resolves.toBeNull();
  });

  it('incidente cerrado: no-op silencioso (ok: true) sin escribir', async () => {
    const created = await createIncidentFromAudio(audioRequest(10.4006, -75.556));
    const token = created.trackingToken;
    await q.run("UPDATE incidents SET status = 'CANCELLED', closed_at = ? WHERE tracking_token = ?", [
      Date.now(), token,
    ]);

    expect(await updateReporterLocation(token, { lat: 10.41, lng: -75.53 })).toEqual({ ok: true });
    const row = await q.one<{ reporter_lat: number | null }>(
      'SELECT reporter_lat FROM incidents WHERE tracking_token = ?', [token],
    );
    expect(row?.reporter_lat).toBeNull();
  });
});
