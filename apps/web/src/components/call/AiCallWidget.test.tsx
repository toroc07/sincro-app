// @vitest-environment jsdom
/**
 * El widget es la mitad visible de la "llamada" con la IA: estas pruebas
 * verifican que el audio del micrófono REALMENTE sale del navegador hacia el
 * audio-service — no solo que el botón cambia de color. El micrófono y el
 * MediaRecorder se sustituyen por dobles que entregan un chunk con datos;
 * el fetch se espía para comprobar que el FormData lleva el archivo de audio
 * y el historial de la conversación.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const AUDIO_URL = 'http://audio.test';
const TRANSCRIPT = 'mi vecino se cayó de la escalera';
const REPLY = 'Verifique si respira.';

/** MediaStream mínimo: lo único que el widget consulta es que el track siga vivo. */
function fakeStream(): MediaStream {
  const track = { readyState: 'live' as const, stop: vi.fn() };
  return {
    active: true,
    getAudioTracks: () => [track],
    getTracks: () => [track],
  } as unknown as MediaStream;
}

/** MediaRecorder que entrega un chunk de ~2 KB al parar (por encima del mínimo
 *  de 1200 bytes que exige el widget para no descartar el turno). */
class FakeMediaRecorder {
  static isTypeSupported = () => true;
  static instances: FakeMediaRecorder[] = [];

  state: 'inactive' | 'recording' = 'inactive';
  mimeType = 'audio/webm;codecs=opus';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(public stream: MediaStream, public options?: MediaRecorderOptions) {
    FakeMediaRecorder.instances.push(this);
  }

  start() { this.state = 'recording'; }

  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob([new Uint8Array(2048)], { type: 'audio/webm' }) });
    this.onstop?.();
  }
}

/** Web Audio no existe en jsdom: cadena DSP mínima para `createFilteredAudio`
 *  (cada nodo solo necesita connect() y los params que el código toca). */
class FakeAudioNode {
  connect() { return this; }
}
class FakeAudioContext {
  createMediaStreamSource() { return new FakeAudioNode(); }
  createBiquadFilter() {
    return Object.assign(new FakeAudioNode(), { type: '', frequency: { value: 0 }, Q: { value: 0 } });
  }
  createDynamicsCompressor() {
    return Object.assign(new FakeAudioNode(), {
      threshold: { value: 0 }, knee: { value: 0 }, ratio: { value: 0 },
      attack: { value: 0 }, release: { value: 0 },
    });
  }
  createMediaStreamDestination() {
    return Object.assign(new FakeAudioNode(), { stream: fakeStream() });
  }
  createAnalyser() {
    return Object.assign(new FakeAudioNode(), {
      fftSize: 0, frequencyBinCount: 64, getByteTimeDomainData: () => {},
    });
  }
  close() { return Promise.resolve(); }
}

/** Stream NDJSON que el audio-service devuelve en un turno exitoso. */
function ndjsonResponse(reply = REPLY): Response {
  const events = [
    { type: 'transcript', text: TRANSCRIPT },
    { type: 'reply', text: reply },
    { type: 'audio', text: reply, base64: 'QUJD', mimeType: 'audio/mpeg' },
    {
      type: 'done', reply,
      history: [
        { role: 'user', content: TRANSCRIPT },
        { role: 'assistant', content: reply },
      ],
    },
  ];
  return new Response(events.map((e) => JSON.stringify(e)).join('\n') + '\n', {
    status: 200,
    headers: { 'Content-Type': 'application/x-ndjson' },
  });
}

async function pressAndHold(button: HTMLElement, holdMs: number) {
  fireEvent.pointerDown(button);
  await screen.findByText('Suelta para enviar');
  await new Promise((resolve) => setTimeout(resolve, holdMs));
  fireEvent.pointerUp(button);
}

describe('AiCallWidget — captura de micrófono y envío del turno', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.stubEnv('NEXT_PUBLIC_AUDIO_SERVICE_URL', AUDIO_URL);
    vi.resetModules();
    FakeMediaRecorder.instances = [];

    vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
    vi.stubGlobal('AudioContext', FakeAudioContext);
    // jsdom no implementa scrollIntoView (el widget auto-scrollea el log).
    Object.defineProperty(window.Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: () => {},
    });
    Object.defineProperty(window.navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue(fakeStream()) },
    });

    // jsdom no reproduce <audio>: se simula la reproducción como instantánea
    // (play() dispara 'ended' para que la cola de voz drene igual que en vivo).
    Object.defineProperty(window.HTMLMediaElement.prototype, 'play', {
      configurable: true,
      value(this: HTMLMediaElement) {
        queueMicrotask(() => this.onended?.(new Event('ended')));
        return Promise.resolve();
      },
    });

    fetchSpy = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/health')) return Promise.resolve(new Response('{"ok":true}'));
      if (url.endsWith('/api/incidents/converse/stream')) return Promise.resolve(ndjsonResponse());
      return Promise.reject(new Error(`fetch inesperado: ${url}`));
    });
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  async function renderWidget() {
    const { AiCallWidget } = await import('./AiCallWidget');
    return render(<AiCallWidget />);
  }

  it('al mantener pulsado pide el micrófono, graba y sube el audio al audio-service', async () => {
    await renderWidget();
    const button = screen.getByRole('button', { name: /mantén pulsado para hablar/i });

    await pressAndHold(button, 400);

    await screen.findByText(TRANSCRIPT);
    await screen.findByText(REPLY);

    // El audio del micrófono viajó en el POST, no por otro camino.
    const converseCalls = fetchSpy.mock.calls.filter(([url]) =>
      String(url).endsWith('/api/incidents/converse/stream'));
    expect(converseCalls).toHaveLength(1);
    const body = converseCalls[0]![1]!.body as FormData;
    const audio = body.get('audio') as File;
    expect(audio).toBeInstanceOf(File);
    expect(audio.size).toBeGreaterThan(0);
    expect(audio.type).toContain('audio/');
    expect(JSON.parse(body.get('history') as string)).toEqual([]);

    // El micrófono se pidió una sola vez y se grabó sobre ese stream.
    expect(window.navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);
    expect(FakeMediaRecorder.instances[0]!.stream).toBeDefined();
  });

  it('en el segundo turno manda el historial que devolvió el servicio', async () => {
    await renderWidget();
    const button = screen.getByRole('button', { name: /mantén pulsado para hablar/i });

    await pressAndHold(button, 400);
    await screen.findByText(REPLY);

    await pressAndHold(button, 400);
    await waitFor(() => expect(fetchSpy.mock.calls.filter(([url]) =>
      String(url).endsWith('/api/incidents/converse/stream'))).toHaveLength(2));

    const secondBody = fetchSpy.mock.calls
      .filter(([url]) => String(url).endsWith('/api/incidents/converse/stream'))[1]![1]!.body as FormData;
    expect(JSON.parse(secondBody.get('history') as string)).toEqual([
      { role: 'user', content: TRANSCRIPT },
      { role: 'assistant', content: REPLY },
    ]);
  });

  it('un toque demasiado corto no gasta un turno: avisa y no envía nada', async () => {
    await renderWidget();
    const button = screen.getByRole('button', { name: /mantén pulsado para hablar/i });

    // Empieza a grabar pero suelta antes del mínimo (350 ms).
    fireEvent.pointerDown(button);
    await screen.findByText('Suelta para enviar');
    fireEvent.pointerUp(button);

    await screen.findByText(/No se grabó nada/);
    expect(fetchSpy.mock.calls.filter(([url]) =>
      String(url).includes('/converse'))).toHaveLength(0);
  });

  it('si el navegador niega el micrófono lo dice y no envía nada', async () => {
    (window.navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new DOMException('denied', 'NotAllowedError'));
    await renderWidget();
    const button = screen.getByRole('button', { name: /mantén pulsado para hablar/i });

    fireEvent.pointerDown(button);
    await screen.findByText(/No pudimos usar el micrófono/);
    expect(fetchSpy.mock.calls.filter(([url]) =>
      String(url).includes('/converse'))).toHaveLength(0);
  });

  it('si el servicio responde con error, lo muestra y vuelve a estado listo', async () => {
    fetchSpy.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/health')) return Promise.resolve(new Response('{"ok":true}'));
      return Promise.resolve(Response.json(
        { error: { code: 'VALIDATION_FAILED', message: 'No te escuchamos bien.' } },
        { status: 422 },
      ));
    });
    await renderWidget();
    const button = screen.getByRole('button', { name: /mantén pulsado para hablar/i });

    await pressAndHold(button, 400);
    await screen.findByText('No te escuchamos bien.');
  });
});
