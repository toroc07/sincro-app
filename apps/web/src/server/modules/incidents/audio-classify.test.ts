/**
 * Precedencia del `IncidentType` en la entrada por audio (§24).
 *
 * El tipo que SOLO propuso el LLM (sin respaldo de una regla regex) NUNCA
 * puede pisar el botón de tipo que el ciudadano eligió: podría ser MENOS grave
 * (LLM "OTHER" → P3 vs botón "CARDIAC" → P1). Un tipo respaldado por reglas sí
 * manda, porque es auditable. Ver `createIncidentFromAudio` (FIX 3 de la
 * revisión adversarial).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, type Queryable } from '@dispatch/db';
import { dropAll, runMigrations } from '@dispatch/db/migrations';
import type { AudioReportRequest, TranscriptionResult } from '@dispatch/contracts';
import { isLocalPostgres } from '../../test-helpers';

vi.mock('./internal/transcription', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./internal/transcription')>();
  return { ...actual, transcribeAudio: vi.fn() };
});

import { createIncidentFromAudio } from './index';
import { transcribeAudio } from './internal/transcription';

const mockTranscribe = vi.mocked(transcribeAudio);

function audioRequest(over: Partial<AudioReportRequest> = {}): AudioReportRequest {
  return {
    audioBase64: Buffer.from('no-es-audio-real').toString('base64'),
    mimeType: 'audio/webm',
    durationSeconds: 3,
    point: { lat: 10.4006, lng: -75.556 },
    accuracyM: 25,
    fallbackType: 'CARDIAC',
    ...over,
  };
}

function transcriptionResult(over: Partial<TranscriptionResult>): TranscriptionResult {
  return {
    transcript: 'algo le pasó al señor',
    language: 'es',
    confidence: 0.9,
    suggestedType: null,
    suggestedPatientCount: null,
    signals: {},
    locationHint: null,
    engine: 'test-stub',
    ...over,
  };
}

describe.skipIf(!isLocalPostgres())('createIncidentFromAudio — precedencia de tipo (§24)', () => {
  let q: Queryable;

  beforeEach(async () => {
    await dropAll();
    await runMigrations();
    q = db();
    mockTranscribe.mockReset();
  });

  it('un tipo que SOLO propuso el LLM no pisa el botón del ciudadano', async () => {
    mockTranscribe.mockResolvedValue(
      transcriptionResult({ suggestedType: 'OTHER', typeSource: 'llm', confidence: 0.4 }),
    );

    const created = await createIncidentFromAudio(audioRequest({ fallbackType: 'CARDIAC' }));

    const row = await q.one<{ type: string }>(
      'SELECT type FROM incidents WHERE id = ?', [created.incidentId],
    );
    expect(row?.type).toBe('CARDIAC');
  });

  it('un tipo respaldado por reglas sí manda sobre el botón', async () => {
    mockTranscribe.mockResolvedValue(
      transcriptionResult({ suggestedType: 'TRAFFIC_ACCIDENT', typeSource: 'rules', confidence: 0.8 }),
    );

    const created = await createIncidentFromAudio(audioRequest({ fallbackType: 'FALL' }));

    const row = await q.one<{ type: string }>(
      'SELECT type FROM incidents WHERE id = ?', [created.incidentId],
    );
    expect(row?.type).toBe('TRAFFIC_ACCIDENT');
  });

  it('sin transcripción ni tipo: cae al botón del ciudadano', async () => {
    mockTranscribe.mockResolvedValue(null);

    const created = await createIncidentFromAudio(audioRequest({ fallbackType: 'RESPIRATORY' }));

    const row = await q.one<{ type: string }>(
      'SELECT type FROM incidents WHERE id = ?', [created.incidentId],
    );
    expect(row?.type).toBe('RESPIRATORY');
  });
});
