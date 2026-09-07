import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, type Queryable } from '@dispatch/db';
import { dropAll, runMigrations } from '@dispatch/db/migrations';
import { isLocalPostgres } from '../../test-helpers';
import { buildIncidentSummary, createIncidentFromReport, regenerateIncidentSummary } from './index';
import { __resetSummaryDebounce } from './internal/summary';

async function reset(): Promise<Queryable> {
  await dropAll();
  await runMigrations();
  return db();
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Mock del cliente Groq: devuelve texto fijo y cuenta llamadas. */
function stubGroq(content: string): { calls: () => number } {
  vi.stubEnv('GROQ_API_KEY', 'fake-key-for-test');
  const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
      status: 200, headers: { 'content-type': 'application/json' },
    }),
  );
  return { calls: () => spy.mock.calls.length };
}

describe.skipIf(!isLocalPostgres())('resumen consolidado por IA', () => {
  let q: Queryable;

  beforeEach(async () => {
    q = await reset();
    __resetSummaryDebounce();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('sin motor LLM: regenerateIncidentSummary no lanza y deja ai_summary en null', async () => {
    const { incident } = await createIncidentFromReport({
      type: 'CARDIAC', point: { lat: 10.4006, lng: -75.556 }, accuracyM: 20,
      patientCount: 1, source: 'WEB', description: 'Hombre con dolor fuerte en el pecho',
    }, { now: 1_000_000 });

    await expect(regenerateIncidentSummary(incident.id)).resolves.toBeUndefined();

    const row = await q.one<{ ai_summary: string | null }>(
      'SELECT ai_summary FROM incidents WHERE id = ?', [incident.id],
    );
    expect(row?.ai_summary).toBeNull();
  });

  it('buildIncidentSummary devuelve null si ningún reporte tiene texto', async () => {
    const { incident } = await createIncidentFromReport({
      type: 'FALL', point: { lat: 10.4006, lng: -75.556 }, accuracyM: 20,
      patientCount: 1, source: 'WEB', // sin description
    }, { now: 1_000_000 });

    expect(await buildIncidentSummary(incident.id)).toBeNull();
  });

  it('con motor disponible: puebla ai_summary y registra INCIDENT_ENRICHED', async () => {
    const { incident } = await createIncidentFromReport({
      type: 'TRAFFIC_ACCIDENT', point: { lat: 10.4006, lng: -75.556 }, accuracyM: 20,
      patientCount: 2, source: 'WEB', description: 'Choque de dos carros, un herido tirado en el piso',
    }, { now: 1_000_000 });
    await sleep(20); // deja resolver el fire-and-forget (sin key todavía)

    const fake = 'R1 00:00: Choque de dos carros con un herido tirado en el piso.';
    stubGroq(fake);
    __resetSummaryDebounce();

    await regenerateIncidentSummary(incident.id);

    const row = await q.one<{ ai_summary: string | null; ai_summary_updated_at: number | null }>(
      'SELECT ai_summary, ai_summary_updated_at FROM incidents WHERE id = ?', [incident.id],
    );
    expect(row?.ai_summary).toBe(fake);
    expect(row?.ai_summary_updated_at ?? 0).toBeGreaterThan(0);

    const event = await q.one<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM incident_events
        WHERE incident_id = ? AND event_type = 'INCIDENT_ENRICHED'`, [incident.id],
    );
    expect(event?.n).toBe(1);
  });

  it('debounce: dos regeneraciones en <15s hacen UNA sola llamada a Groq', async () => {
    const { incident } = await createIncidentFromReport({
      type: 'CARDIAC', point: { lat: 10.4006, lng: -75.556 }, accuracyM: 20,
      patientCount: 1, source: 'WEB', description: 'Dolor en el pecho, sudoración',
    }, { now: 2_000_000 });
    await sleep(20);

    const groq = stubGroq('R1 00:00: Dolor torácico con sudoración.');
    __resetSummaryDebounce();

    await regenerateIncidentSummary(incident.id);
    await regenerateIncidentSummary(incident.id); // dentro de la ventana de debounce

    expect(groq.calls()).toBe(1);
    const event = await q.one<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM incident_events
        WHERE incident_id = ? AND event_type = 'INCIDENT_ENRICHED'`, [incident.id],
    );
    expect(event?.n).toBe(1);
  });

  it('replay idempotente: no dispara una segunda regeneración', async () => {
    const groq = stubGroq('R1 00:00: reporte.');
    const key = 'replay-key-1';

    await createIncidentFromReport({
      type: 'CARDIAC', point: { lat: 10.4006, lng: -75.556 }, accuracyM: 20,
      patientCount: 1, source: 'WEB', description: 'primer reporte con texto',
    }, { now: 3_000_000, idempotencyKey: key });
    await sleep(30);
    const afterFirst = groq.calls();
    expect(afterFirst).toBeGreaterThanOrEqual(1);

    __resetSummaryDebounce(); // aísla: si hay 2ª regen, es por el replay, no el debounce

    await createIncidentFromReport({
      type: 'CARDIAC', point: { lat: 10.4009, lng: -75.5551 }, accuracyM: 20,
      patientCount: 1, source: 'WEB', description: 'texto distinto en el replay',
    }, { now: 3_000_500, idempotencyKey: key });
    await sleep(30);

    expect(groq.calls()).toBe(afterFirst); // sin llamadas nuevas
  });
});
