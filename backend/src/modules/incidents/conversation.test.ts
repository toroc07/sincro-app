import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { converseTurn, splitSpeakable, streamConverseTurn, synthesizeSpeech } from './conversation.js';

describe('converseTurn', () => {
  const ORIGINAL_KEY = process.env.GROQ_API_KEY;

  beforeEach(() => {
    process.env.GROQ_API_KEY = 'test-key';
  });

  afterEach(() => {
    process.env.GROQ_API_KEY = ORIGINAL_KEY;
    vi.unstubAllGlobals();
  });

  it('devuelve la respuesta del asistente cuando el LLM responde bien', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '  Mantén la calma, haz presión sobre la herida.  ' } }] }),
    }));
    const { reply } = await converseTurn('mi vecino se está desangrando', []);
    expect(reply).toBe('Mantén la calma, haz presión sobre la herida.');
  });

  it('manda el historial (recortado a los últimos 12 turnos) junto al mensaje nuevo', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
    });
    vi.stubGlobal('fetch', fetchSpy);
    const longHistory = Array.from({ length: 20 }, (_, i) => ({ role: i % 2 === 0 ? 'user' : 'assistant', content: `turno ${i}` }) as const);
    await converseTurn('nuevo mensaje', longHistory);

    const body = JSON.parse(fetchSpy.mock.calls[0]![1].body);
    // system + 12 de historial + el mensaje nuevo
    expect(body.messages).toHaveLength(1 + 12 + 1);
    expect(body.messages.at(-1)).toEqual({ role: 'user', content: 'nuevo mensaje' });
  });

  it('lanza si no hay GROQ_API_KEY (a diferencia de analyzeTranscript, aquí sí se propaga)', async () => {
    delete process.env.GROQ_API_KEY;
    await expect(converseTurn('hola', [])).rejects.toThrow(/GROQ_API_KEY/);
  });

  it('lanza si el LLM responde con error HTTP', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(converseTurn('hola', [])).rejects.toThrow(/falló/);
  });

  it('lanza si el LLM no devuelve contenido', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [] }) }));
    await expect(converseTurn('hola', [])).rejects.toThrow(/no respondió/);
  });

  it('detecta el tipo a partir de TODO lo dicho por el usuario, no solo el turno actual', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
    });
    vi.stubGlobal('fetch', fetchSpy);
    const history = [
      { role: 'user' as const, content: 'hubo un choque de motos' },
      { role: 'assistant' as const, content: '¿está consciente?' },
    ];
    const { detectedTypes } = await converseTurn('sí pero está inconsciente', history);
    expect(detectedTypes).toEqual(expect.arrayContaining(['TRAFFIC_ACCIDENT', 'UNCONSCIOUS']));
  });

  it('inyecta el protocolo de primeros auxilios del tipo detectado en el system prompt', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
    });
    vi.stubGlobal('fetch', fetchSpy);

    await converseTurn('se cayó de una escalera y no puede moverse', []);

    const body = JSON.parse(fetchSpy.mock.calls[0]![1].body);
    const systemMessage = body.messages[0].content;
    expect(systemMessage).toContain('FALL');
    expect(systemMessage).toContain('lesión en cuello, espalda o cadera');
  });

  it('no agrega protocolo al prompt si no se detecta ningún tipo', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
    });
    vi.stubGlobal('fetch', fetchSpy);

    const { detectedTypes } = await converseTurn('hay una situación rara', []);

    expect(detectedTypes).toEqual([]);
    const body = JSON.parse(fetchSpy.mock.calls[0]![1].body);
    expect(body.messages[0].content).not.toContain('Contexto médico de referencia');
  });

  it('nunca minimiza una lesión nueva y grave que aparece a mitad de conversación (bug reportado en vivo)', async () => {
    // Reproduce el escenario real: inconsciente (turno 1) y luego amputación
    // catastrófica (turno 2) — el segundo tipo NO debe perderse.
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
    });
    vi.stubGlobal('fetch', fetchSpy);
    const history = [
      { role: 'user' as const, content: 'está inconsciente' },
      { role: 'assistant' as const, content: 'Verifique si respira.' },
    ];

    const { detectedTypes } = await converseTurn('el bus le cortó las piernas', history);

    expect(detectedTypes).toEqual(expect.arrayContaining(['UNCONSCIOUS', 'TRAUMA']));
    const body = JSON.parse(fetchSpy.mock.calls[0]![1].body);
    const systemMessage = body.messages[0].content;
    // TRAUMA (control de sangrado) va primero cuando hay más de un tipo.
    expect(systemMessage.indexOf('TRAUMA')).toBeLessThan(systemMessage.indexOf('UNCONSCIOUS'));
    expect(systemMessage).toContain('prioridad sobre cualquier otra instrucción');
    // No debe esperar a que le confirmen que hay sangrado para instruir presión.
    expect(systemMessage).toContain('No preguntes primero si está sangrando');
  });

  it('el prompt prohíbe explícitamente prometer tiempos de llegada', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
    });
    vi.stubGlobal('fetch', fetchSpy);
    await converseTurn('hola', []);
    const body = JSON.parse(fetchSpy.mock.calls[0]![1].body);
    const systemMessage = body.messages[0].content;
    expect(systemMessage).toContain('ya viene');
    expect(systemMessage).toContain('está en camino');
    expect(systemMessage).toContain('tiempos de llegada');
  });
});

/** Respuesta de Groq en modo stream: SSE con una línea `data:` por token. */
function sseResponse(deltas: readonly string[], { split = false } = {}) {
  const lines = [
    ...deltas.map((delta) => `data: ${JSON.stringify({ choices: [{ delta: { content: delta } }] })}\n\n`),
    'data: [DONE]\n\n',
  ];
  const encoder = new TextEncoder();
  const payload = lines.join('');
  // `split` parte el SSE por la mitad de una línea: así se prueba que el
  // parser aguanta un chunk de red que corta un evento en dos.
  const chunks = split
    ? [payload.slice(0, Math.floor(payload.length / 2)), payload.slice(Math.floor(payload.length / 2))]
    : lines;
  return {
    ok: true,
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
  };
}

describe('streamConverseTurn', () => {
  const ORIGINAL_KEY = process.env.GROQ_API_KEY;

  beforeEach(() => { process.env.GROQ_API_KEY = 'test-key'; });
  afterEach(() => {
    process.env.GROQ_API_KEY = ORIGINAL_KEY;
    vi.unstubAllGlobals();
  });

  it('entrega los fragmentos a medida que llegan y devuelve la respuesta completa', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse(['Mantén ', 'la calma.', ' Haz presión.'])));
    const deltas: string[] = [];
    const { reply } = await streamConverseTurn('se está desangrando', [], (delta) => deltas.push(delta));

    expect(deltas).toEqual(['Mantén ', 'la calma.', ' Haz presión.']);
    expect(reply).toBe('Mantén la calma. Haz presión.');
  });

  it('reconstruye eventos partidos entre dos chunks de red', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse(['uno ', 'dos ', 'tres'], { split: true })));
    const { reply } = await streamConverseTurn('hola', [], () => {});
    expect(reply).toBe('uno dos tres');
  });

  it('pide stream a Groq con el mismo prompt y protocolo que la versión no-stream', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(sseResponse(['ok']));
    vi.stubGlobal('fetch', fetchSpy);
    const { detectedTypes } = await streamConverseTurn('se cayó de una escalera', [], () => {});

    const body = JSON.parse(fetchSpy.mock.calls[0]![1].body);
    expect(body.stream).toBe(true);
    expect(body.messages[0].content).toContain('FALL');
    expect(detectedTypes).toEqual(['FALL']);
  });

  it('lanza si el stream no trae ni un token de contenido', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse([])));
    await expect(streamConverseTurn('hola', [], () => {})).rejects.toThrow(/no respondió/);
  });

  it('ignora una línea malformada sin perder el resto del stream', async () => {
    const encoder = new TextEncoder();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode('data: {no es json\n\n'));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: 'sigue vivo' } }] })}\n\n`));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        },
      }),
    }));
    const { reply } = await streamConverseTurn('hola', [], () => {});
    expect(reply).toBe('sigue vivo');
  });
});

describe('splitSpeakable', () => {
  it('no corta hasta tener el mínimo de caracteres pedido', () => {
    expect(splitSpeakable('Ok. ', 24)).toBeNull();
    expect(splitSpeakable('Ok.', 2)).toEqual({ chunk: 'Ok.', rest: '' });
  });

  it('corta en el primer fin de frase que supera el mínimo', () => {
    const cut = splitSpeakable('Mantén la calma y no lo muevas. Haz presión sobre la herida.', 24);
    expect(cut).toEqual({ chunk: 'Mantén la calma y no lo muevas.', rest: ' Haz presión sobre la herida.' });
  });

  it('no confunde un decimal con un fin de frase', () => {
    expect(splitSpeakable('La herida mide 3.5 centímetros de largo', 10)).toBeNull();
  });

  it('corta por la fuerza si el modelo escribe sin puntuación', () => {
    const long = 'palabra '.repeat(40);
    const cut = splitSpeakable(long, 24, 60);
    expect(cut).not.toBeNull();
    expect(cut!.chunk.length).toBeLessThanOrEqual(60);
    expect(cut!.chunk + cut!.rest).toHaveLength(long.length);
  });

  it('devuelve null mientras la frase siga incompleta', () => {
    expect(splitSpeakable('Mantén la calma y no lo muevas mientras', 24)).toBeNull();
  });
});

describe('synthesizeSpeech', () => {
  const ORIGINAL_GROQ_KEY = process.env.GROQ_API_KEY;
  const ORIGINAL_ELEVENLABS_KEY = process.env.ELEVENLABS_API_KEY;

  beforeEach(() => {
    process.env.GROQ_API_KEY = 'test-groq-key';
    delete process.env.ELEVENLABS_API_KEY;
  });

  afterEach(() => {
    process.env.GROQ_API_KEY = ORIGINAL_GROQ_KEY;
    process.env.ELEVENLABS_API_KEY = ORIGINAL_ELEVENLABS_KEY;
    vi.unstubAllGlobals();
  });

  it('usa ElevenLabs primero si hay ELEVENLABS_API_KEY, sin llamar a Groq', async () => {
    process.env.ELEVENLABS_API_KEY = 'test-el-key';
    const bytes = new Uint8Array([9, 9, 9]);
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => bytes.buffer });
    vi.stubGlobal('fetch', fetchSpy);

    const result = await synthesizeSpeech('hola');
    expect(result).toEqual({ buffer: Buffer.from([9, 9, 9]), mimeType: 'audio/mpeg' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]![0])).toContain('elevenlabs.io');
  });

  it('cae a Groq si no hay ELEVENLABS_API_KEY', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => bytes.buffer });
    vi.stubGlobal('fetch', fetchSpy);

    const result = await synthesizeSpeech('hola');
    expect(result).toEqual({ buffer: Buffer.from([1, 2, 3, 4]), mimeType: 'audio/wav' });
    expect(String(fetchSpy.mock.calls[0]![0])).toContain('groq.com');
  });

  it('cae a Groq si ElevenLabs responde con error', async () => {
    process.env.ELEVENLABS_API_KEY = 'test-el-key';
    const bytes = new Uint8Array([5, 5]);
    const fetchSpy = vi.fn()
      .mockResolvedValueOnce({ ok: false }) // ElevenLabs falla
      .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => bytes.buffer }); // Groq responde
    vi.stubGlobal('fetch', fetchSpy);

    const result = await synthesizeSpeech('hola');
    expect(result).toEqual({ buffer: Buffer.from([5, 5]), mimeType: 'audio/wav' });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('nunca lanza: devuelve null si ningún proveedor está disponible', async () => {
    delete process.env.GROQ_API_KEY;
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await expect(synthesizeSpeech('hola')).resolves.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('nunca lanza: devuelve null si la red falla en ambos proveedores', async () => {
    process.env.ELEVENLABS_API_KEY = 'test-el-key';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    await expect(synthesizeSpeech('hola')).resolves.toBeNull();
  });
});
