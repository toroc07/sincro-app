import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { zConversationTurn, zConverseResponse } from '@dispatch/contracts';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import multer, { MulterError } from 'multer';
import { z } from 'zod';
import { converseTurn, splitSpeakable, streamConverseTurn, synthesizeSpeech } from './modules/incidents/conversation.js';
import { transcribeAudio } from './modules/incidents/voice.js';
import { HttpError, toApiError } from './errors.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT ?? 4001);
// WhatsApp limita notas de voz a ~16MB/varios minutos; aquí acotamos más
// corto (nota de emergencia, no un podcast) para mantener el request liviano.
const MAX_AUDIO_BYTES = 8 * 1024 * 1024;

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_AUDIO_BYTES } });

const app = express();
app.use(cors());
// public/test.html — página manual para grabar y probar la llamada sin curl/Postman.
app.use(express.static(path.join(__dirname, '../public')));

app.get('/health', (_req: Request, res: Response) => {
  res.json({ ok: true, service: 'audio-service' });
});

// Raíz informativa: no hay UI, así que un GET / a mano no debe verse "roto".
// El reporte de voz que CREA el incidente vive en apps/web (POST
// /api/incidents/audio) — ahí está el motor de deduplicación real. Este
// servicio es solo la "llamada" con IA: orientación en vivo mientras espera
// la ambulancia, no reemplaza ni duplica ese reporte.
app.get('/', (_req: Request, res: Response) => {
  res.json({
    service: 'audio-service',
    endpoints: {
      'GET /health': 'estado del servicio',
      'GET /test.html': 'página manual para probar la llamada con la IA',
      'POST /api/incidents/converse': 'multipart: campos `audio` + `history` (JSON) → { transcript, reply, replyAudioBase64, history }',
      'POST /api/incidents/converse/stream': 'igual, pero NDJSON en vivo: {transcript} → {reply} por frase → {audio} por frase → {done}. Es el que usa la app: se oye la primera frase sin esperar a la última.',
    },
  });
});

/** Turnos previos que manda el cliente. El servicio no guarda sesión: el
 *  historial es del cliente y se valida en cada request. */
function parseHistory(raw: unknown): z.infer<typeof zConversationTurn>[] {
  const text = typeof raw === 'string' ? raw : '[]';
  try {
    return z.array(zConversationTurn).parse(JSON.parse(text));
  } catch {
    throw new HttpError(400, 'VALIDATION_FAILED', '`history` debe ser JSON válido: [{role, content}]');
  }
}

function requireAudio(req: Request): Express.Multer.File {
  if (!req.file || req.file.size === 0) {
    throw new HttpError(400, 'VALIDATION_FAILED', 'Falta el archivo de audio (`audio`)');
  }
  return req.file;
}

/**
 * Versión en vivo de /converse — la que usa la app.
 *
 * En una emergencia el silencio mientras "piensa" la IA es el peor momento de
 * la llamada, y en el camino de una sola respuesta ese silencio duraba
 * transcripción + respuesta COMPLETA + voz COMPLETA. Aquí cada etapa sale en
 * cuanto está: se transcribe, se emite; el LLM escribe la primera frase, se
 * emite y se manda a sintetizar mientras escribe la segunda. El reportero
 * empieza a oír la respuesta en cuanto existe la primera frase, no la última.
 *
 * Formato NDJSON (una línea JSON por evento):
 *   {type:'transcript', text}      lo que se entendió
 *   {type:'reply', text}           siguiente frase de la respuesta
 *   {type:'audio', text, base64, mimeType}   voz de esa frase (base64 null si no hay TTS)
 *   {type:'done', reply, detectedTypes, history}
 *   {type:'error', message}        fallo a mitad del stream (HTTP ya era 200)
 */
app.post('/api/incidents/converse/stream', upload.single('audio'), async (req: Request, res: Response) => {
  let streaming = false;
  const write = (event: Record<string, unknown>): void => { res.write(`${JSON.stringify(event)}\n`); };

  try {
    const file = requireAudio(req);
    const history = parseHistory(req.body?.history);

    // La transcripción va ANTES de abrir el stream a propósito: es el fallo
    // más común (audio ininteligible, 422) y con las cabeceras ya enviadas no
    // habría forma de devolver un código de error de verdad.
    const transcript = await transcribeAudio(file.buffer, file.mimetype, file.originalname || 'turno.webm');

    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    // Sin esto un proxy intermedio (nginx de Render) acumula la respuesta y
    // devuelve todo junto al final, que es exactamente lo que evitamos aquí.
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    streaming = true;
    write({ type: 'transcript', text: transcript });

    // Las síntesis arrancan en paralelo (una frase no espera a la anterior),
    // pero se ESCRIBEN en orden: el cliente las reproduce como llegan y un
    // audio adelantado sonaría la respuesta desordenada.
    let writes = Promise.resolve();
    const speak = (text: string): void => {
      const pending = synthesizeSpeech(text);
      writes = writes.then(async () => {
        const audio = await pending;
        write({
          type: 'audio', text,
          base64: audio ? audio.buffer.toString('base64') : null,
          mimeType: audio ? audio.mimeType : null,
        });
      });
    };

    let buffered = '';
    let spokenChunks = 0;
    const drain = (): void => {
      for (;;) {
        // Primer trozo corto (voz cuanto antes), siguientes más largos: una
        // vez ya está sonando algo, cortar corto solo suena entrecortado.
        const cut = splitSpeakable(buffered, spokenChunks === 0 ? 24 : 90);
        if (!cut) return;
        buffered = cut.rest;
        spokenChunks += 1;
        write({ type: 'reply', text: cut.chunk });
        speak(cut.chunk);
      }
    };

    const { reply, detectedTypes } = await streamConverseTurn(transcript, history, (delta) => {
      buffered += delta;
      drain();
    });

    const tail = buffered.trim();
    if (tail) {
      write({ type: 'reply', text: tail });
      speak(tail);
    }
    await writes;

    write({
      type: 'done', reply, detectedTypes,
      history: [...history, { role: 'user', content: transcript }, { role: 'assistant', content: reply }],
    });
    res.end();
  } catch (error) {
    const mapped = toApiError(error);
    if (streaming) {
      write({ type: 'error', message: mapped.body.error.message });
      res.end();
      return;
    }
    res.status(mapped.status).json(mapped.body);
  }
});

app.post('/api/incidents/converse', upload.single('audio'), async (req: Request, res: Response) => {
  try {
    const file = requireAudio(req);
    const history = parseHistory(req.body?.history);

    const transcript = await transcribeAudio(file.buffer, file.mimetype, file.originalname || 'turno.webm');
    const { reply, detectedTypes } = await converseTurn(transcript, history);
    const replyAudio = await synthesizeSpeech(reply);

    res.json(zConverseResponse.parse({
      transcript,
      reply,
      detectedTypes,
      replyAudioBase64: replyAudio ? replyAudio.buffer.toString('base64') : null,
      replyAudioMimeType: replyAudio ? replyAudio.mimeType : null,
      history: [...history, { role: 'user', content: transcript }, { role: 'assistant', content: reply }],
    }));
  } catch (error) {
    const mapped = toApiError(error);
    res.status(mapped.status).json(mapped.body);
  }
});

// Errores de multer (archivo demasiado grande, campo inválido) no pasan por
// el try/catch de la ruta: llegan aquí.
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof MulterError) {
    res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: 'El audio es demasiado largo o el campo es inválido' } });
    return;
  }
  const mapped = toApiError(error);
  res.status(mapped.status).json(mapped.body);
});

app.listen(PORT, () => {
  console.log(`[audio-service] escuchando en http://localhost:${PORT}`);
});
