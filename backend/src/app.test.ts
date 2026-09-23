/**
 * Test de integración del audio-service: levanta la app Express real en un
 * puerto efímero y le envía audio por multipart, igual que hace el widget.
 * El único doble es `fetch` hacia afuera (Groq/ElevenLabs): lo que se verifica
 * es el pipeline COMPLETO de proceso de audio — multer recibe el archivo,
 * se transcribe, el LLM responde y la voz se sintetiza por frase.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import app from './app.js';

const TRANSCRIPT = 'mi vecino se cayó de la escalera y no se despierta';
const REPLY = 'Verifique si respira. Si no respira, llame al 123 y comience RCP.';

/** SSE en el formato de Groq: una línea data: por delta + [DONE]. */
function sseStream(deltas: readonly string[]): Response {
  const payload = deltas.map((d) => `data: ${JSON.stringify({ choices: [{ delta: { content: d } }] })}\n\n`).join('')
    + 'data: [DONE]\n\n';
  return new Response(payload, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

interface StubOptions {
  transcript?: string;
  chatContent?: string | null;
  chatDeltas?: string[];
}

/** Doble de la red SALIENTE: intercepta Groq/ElevenLabs por host y deja pasar
 *  al fetch real todo lo demás — el propio test llama al servidor local por
 *  fetch y no debe comerse su propia petición. */
function stubOutboundFetch({ transcript = TRANSCRIPT, chatContent = REPLY, chatDeltas = [REPLY] }: StubOptions = {}) {
  const realFetch = globalThis.fetch;
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (!url.includes('api.groq.com') && !url.includes('elevenlabs.io')) {
      return realFetch(input, init);
    }
    if (url.endsWith('/audio/transcriptions')) {
      return Response.json({ text: transcript });
    }
    if (url.endsWith('/chat/completions')) {
      const body = JSON.parse(String(init?.body)) as { stream?: boolean };
      if (body.stream) return sseStream(chatDeltas);
      return Response.json({ choices: chatContent === null ? [] : [{ message: { content: chatContent } }] });
    }
    if (url.includes('elevenlabs.io')) {
      return new Response(new Uint8Array([9, 9, 9]).buffer, { status: 200 });
    }
    if (url.endsWith('/audio/speech')) {
      return new Response(new Uint8Array([1, 2, 3]).buffer, { status: 200 });
    }
    throw new Error(`fetch inesperado: ${url}`);
  });
}

function audioForm({ withAudio = true, history = '[]' } = {}): FormData {
  const form = new FormData();
  if (withAudio) {
    form.set('audio', new Blob([new Uint8Array(4096)], { type: 'audio/webm' }), 'turno.webm');
  }
  form.set('history', history);
  return form;
}

async function ndjsonLines(response: Response): Promise<Array<Record<string, unknown>>> {
  const text = await response.text();
  return text.split('\n').filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe('audio-service — proceso del audio subido', () => {
  let server: Server;
  let base: string;

  beforeAll(async () => {
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('sin puerto');
    base = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    process.env.GROQ_API_KEY = 'test-groq';
    process.env.ELEVENLABS_API_KEY = 'test-el';
  });

  it('POST /converse: el audio se transcribe, responde y se sintetiza voz', async () => {
    vi.stubGlobal('fetch', stubOutboundFetch());

    const res = await fetch(`${base}/api/incidents/converse`, { method: 'POST', body: audioForm() });
    expect(res.status).toBe(200);

    const json = await res.json() as {
      transcript: string; reply: string; replyAudioBase64: string | null;
      detectedTypes: string[]; history: Array<{ role: string }>;
    };
    expect(json.transcript).toBe(TRANSCRIPT);
    expect(json.reply).toBe(REPLY);
    expect(json.replyAudioBase64).not.toBeNull();
    expect(json.detectedTypes).toEqual(expect.arrayContaining(['FALL', 'UNCONSCIOUS']));
    expect(json.history).toHaveLength(2);
  });

  it('POST /converse/stream: emite transcript → reply → audio por frase → done', async () => {
    vi.stubGlobal('fetch', stubOutboundFetch({
      chatDeltas: ['Verifique si respira. ', 'Si no respira, llame al 123.'],
    }));

    const res = await fetch(`${base}/api/incidents/converse/stream`, { method: 'POST', body: audioForm() });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('x-ndjson');

    const events = await ndjsonLines(res);
    const types = events.map((e) => e.type);
    expect(types[0]).toBe('transcript');
    expect(types.at(-1)).toBe('done');
    expect(types).toContain('reply');
    expect(types).toContain('audio');
    expect(events.find((e) => e.type === 'transcript')?.text).toBe(TRANSCRIPT);
    // Cada frase hablable lleva su audio (o null si el TTS no estuviera).
    for (const e of events.filter((e) => e.type === 'audio')) {
      expect(typeof e.base64 === 'string' || e.base64 === null).toBe(true);
    }
    const done = events.at(-1) as { reply: string; history: unknown[] };
    expect(done.reply.length).toBeGreaterThan(0);
    expect(done.history).toHaveLength(2);
  });

  it('sin archivo de audio responde 400, no 500', async () => {
    vi.stubGlobal('fetch', stubOutboundFetch());
    const res = await fetch(`${base}/api/incidents/converse`, { method: 'POST', body: audioForm({ withAudio: false }) });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
  });

  it('con `history` que no es JSON responde 400', async () => {
    vi.stubGlobal('fetch', stubOutboundFetch());
    const res = await fetch(`${base}/api/incidents/converse`, { method: 'POST', body: audioForm({ history: 'no-json' }) });
    expect(res.status).toBe(400);
  });

  it('una transcripción que es alucinación de Whisper responde 422 "no te escuchamos"', async () => {
    vi.stubGlobal('fetch', stubOutboundFetch({ transcript: 'Gracias por ver el video' }));
    const res = await fetch(`${base}/api/incidents/converse`, { method: 'POST', body: audioForm() });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: { message: expect.stringMatching(/escuchamos/) } });
  });

  it('si el LLM no devuelve contenido, /converse responde 502', async () => {
    vi.stubGlobal('fetch', stubOutboundFetch({ chatContent: null }));
    const res = await fetch(`${base}/api/incidents/converse`, { method: 'POST', body: audioForm() });
    expect(res.status).toBe(502);
  });

  it('si el LLM falla a mitad del stream, emite evento error (HTTP ya era 200)', async () => {
    // Stream que se cierra sin tokens de contenido.
    vi.stubGlobal('fetch', stubOutboundFetch({ chatDeltas: [] }));
    const res = await fetch(`${base}/api/incidents/converse/stream`, { method: 'POST', body: audioForm() });
    expect(res.status).toBe(200);
    const events = await ndjsonLines(res);
    expect(events[0]?.type).toBe('transcript');
    expect(events.at(-1)?.type).toBe('error');
  });
});
