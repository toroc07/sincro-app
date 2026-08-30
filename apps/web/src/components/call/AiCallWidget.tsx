'use client';

/**
 * "Llamada" con la IA — orientación de primeros auxilios en vivo mientras
 * espera la ambulancia. Habla contra el audio-service (servicio aparte,
 * NEXT_PUBLIC_AUDIO_SERVICE_URL), no contra esta app: no crea ni modifica
 * incidentes, eso lo sigue haciendo POST /api/incidents/audio.
 *
 * Detección de voz automática (VAD): nada de botones de grabar/detener por
 * turno, se siente como hablar con alguien. Mismo mecanismo que
 * backend/public/test.html, adaptado a los tokens de diseño de la app.
 *
 * TIEMPO DE REACCIÓN — el silencio mientras "piensa" la IA es el peor momento
 * de una llamada de emergencia, así que se ataca por cuatro lados:
 *   1. La respuesta llega en streaming (NDJSON): se oye la PRIMERA frase sin
 *      esperar a que el modelo termine la última ni a que se sintetice toda
 *      la voz. Ver POST /api/incidents/converse/stream.
 *   2. El VAD cierra el turno antes (600 ms de silencio, no 900) y muestrea
 *      más seguido.
 *   3. Barge-in: si el reportero habla encima de la IA, la corta y escucha —
 *      como con una persona, no hay que esperar a que termine la frase.
 *   4. El servicio se calienta al montar el widget, no al pulsar llamar: en
 *      capa gratuita despertar el contenedor cuesta más que todo lo demás.
 */

import { useEffect, useRef, useState } from 'react';
import { AlertIcon, PhoneIcon, PhoneOffIcon } from '@/src/components/ui/icons';

const AUDIO_SERVICE_URL = process.env.NEXT_PUBLIC_AUDIO_SERVICE_URL ?? '';
/** Silencio que cierra el turno. Por debajo de ~500 ms se corta a quien duda
 *  a mitad de frase, que en pánico es lo normal. */
const SILENCE_MS = 600;
const MIN_SPEECH_MS = 250;
const MAX_TURN_MS = 20_000;
/** Cada cuánto se mide el volumen. Es el retardo máximo entre que alguien
 *  empieza a hablar y que el micrófono empieza a grabar. */
const VAD_POLL_MS = 60;
const SPEECH_THRESHOLD = 0.02;
/** Interrumpir a la IA exige hablar más fuerte que el umbral normal y
 *  sostenerlo: con manos libres el propio altavoz entra por el micrófono y no
 *  debe cortarse a sí misma. La cancelación de eco del navegador hace el resto. */
const BARGE_THRESHOLD = 0.06;
const BARGE_SUSTAIN_MS = 220;

type CallState = 'idle' | 'listening' | 'recording' | 'processing' | 'speaking' | 'unavailable';

interface Turn { role: 'user' | 'assistant'; content: string }

/** Eventos del stream NDJSON del audio-service. */
type StreamEvent =
  | { type: 'transcript'; text: string }
  | { type: 'reply'; text: string }
  | { type: 'audio'; text: string; base64: string | null; mimeType: string | null }
  | { type: 'done'; reply: string; history: Turn[] }
  | { type: 'error'; message: string };

interface ConverseResponse {
  transcript: string;
  reply: string;
  replyAudioBase64: string | null;
  replyAudioMimeType: string | null;
  history: Turn[];
}

const STATUS_LABEL: Partial<Record<CallState, string>> = {
  listening: 'Escuchando…',
  recording: 'Te estoy escuchando…',
  processing: 'Pensando…',
  speaking: 'Hablando… (puedes interrumpir)',
};

/** Opus a 24 kbps: un turno de 5 s pesa ~15 KB. En una red móvil mala la
 *  subida es una parte real de la espera, y para voz no se pierde nada. */
function recorderOptions(): MediaRecorderOptions {
  for (const mimeType of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']) {
    if (MediaRecorder.isTypeSupported?.(mimeType)) return { mimeType, audioBitsPerSecond: 24_000 };
  }
  return {};
}

export function AiCallWidget() {
  const [state, setState] = useState<CallState>(AUDIO_SERVICE_URL ? 'idle' : 'unavailable');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const historyRef = useRef<Turn[]>([]);
  const stateRef = useRef<CallState>(state);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const pollTimerRef = useRef<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recorderOptionsRef = useRef<MediaRecorderOptions>({});
  const chunksRef = useRef<BlobPart[]>([]);
  const speechStartedAtRef = useRef(0);
  const lastLoudAtRef = useRef(0);
  const bargeSinceRef = useRef(0);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  /** Cola de voz del turno en curso: cada frase que llega se reproduce en
   *  orden mientras el servidor sigue generando las siguientes. */
  const queueRef = useRef<string[]>([]);
  const playingRef = useRef(false);
  const streamDoneRef = useRef(false);
  const serverSpokeRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  /** Turno en curso, para poder cerrarlo en el historial si el reportero
   *  interrumpe a mitad: sin esto la IA "olvidaría" lo que ya dijo. */
  const turnTranscriptRef = useRef('');
  const turnReplyRef = useRef('');
  const assistantOpenRef = useRef(false);

  const setCallState = (next: CallState) => { stateRef.current = next; setState(next); };
  /** ¿Colgaron mientras esperábamos al servidor? Va en una función y no en una
   *  comparación suelta para que el compilador no arrastre el estrechamiento
   *  de tipos de un chequeo anterior a través de los `await`. */
  const hungUp = () => stateRef.current === 'idle';

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [turns]);

  // Despertar el servicio al montar, no al pulsar llamar: en capa gratuita el
  // contenedor dormido tarda ~50 s, y ese tiempo hay que gastarlo mientras la
  // persona lee la pantalla, no cuando ya está hablando.
  useEffect(() => {
    if (!AUDIO_SERVICE_URL) return;
    void fetch(`${AUDIO_SERVICE_URL}/health`, { cache: 'no-store' }).catch(() => {});
  }, []);

  useEffect(() => () => { endCall(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, []);

  function currentVolume(): number {
    const analyser = analyserRef.current;
    const dataArray = dataArrayRef.current;
    if (!analyser || !dataArray) return 0;
    analyser.getByteTimeDomainData(dataArray);
    let sum = 0;
    for (const v of dataArray) { const norm = (v - 128) / 128; sum += norm * norm; }
    return Math.sqrt(sum / dataArray.length);
  }

  function startRecorder() {
    const stream = streamRef.current;
    if (!stream) return;
    chunksRef.current = [];
    const recorder = new MediaRecorder(stream, recorderOptionsRef.current);
    recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
    recorder.start();
    mediaRecorderRef.current = recorder;
  }

  // ── Reproducción encolada ──────────────────────────────────────────────────

  function playNext() {
    const el = audioElRef.current;
    const next = queueRef.current.shift();
    if (!el || !next) {
      playingRef.current = false;
      // El turno solo termina cuando ya no queda voz por reproducir: volver a
      // escuchar antes cortaría a la IA a media frase.
      if (streamDoneRef.current && stateRef.current === 'speaking') setCallState('listening');
      return;
    }
    playingRef.current = true;
    if (stateRef.current !== 'speaking') setCallState('speaking');
    const advance = () => { el.onended = null; el.onerror = null; playNext(); };
    el.src = next;
    el.onended = advance;
    el.onerror = advance;
    el.play().catch(advance);
  }

  function enqueueAudio(uri: string) {
    queueRef.current.push(uri);
    if (!playingRef.current) playNext();
  }

  function stopPlayback() {
    queueRef.current = [];
    playingRef.current = false;
    const el = audioElRef.current;
    if (el) { el.onended = null; el.onerror = null; el.pause(); el.removeAttribute('src'); }
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  }

  /** Voz del navegador: solo si el servidor no pudo sintetizar ni una frase.
   *  Nunca ambas — se oiría la respuesta dos veces. */
  function speakWithBrowser(text: string) {
    if (!('speechSynthesis' in window)) { setCallState('listening'); return; }
    setCallState('speaking');
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'es-ES';
    utterance.onend = () => { if (stateRef.current === 'speaking') setCallState('listening'); };
    utterance.onerror = () => { if (stateRef.current === 'speaking') setCallState('listening'); };
    speechSynthesis.speak(utterance);
  }

  // ── Turno de conversación ──────────────────────────────────────────────────

  function pushUserTurn(text: string) {
    turnTranscriptRef.current = text;
    setTurns((prev) => [...prev, { role: 'user', content: text }]);
  }

  function appendAssistant(text: string) {
    turnReplyRef.current = `${turnReplyRef.current} ${text}`.trim();
    setTurns((prev) => {
      const last = prev[prev.length - 1];
      if (assistantOpenRef.current && last?.role === 'assistant') {
        return [...prev.slice(0, -1), { role: 'assistant', content: `${last.content} ${text}`.trim() }];
      }
      assistantOpenRef.current = true;
      return [...prev, { role: 'assistant', content: text }];
    });
  }

  /** Cierra el turno en el historial con lo que alcanzó a decirse. Se usa
   *  cuando el reportero interrumpe: el servidor nunca mandó su `done`. */
  function commitPartialTurn() {
    if (!turnTranscriptRef.current) return;
    historyRef.current = [
      ...historyRef.current,
      { role: 'user', content: turnTranscriptRef.current },
      ...(turnReplyRef.current ? [{ role: 'assistant' as const, content: turnReplyRef.current }] : []),
    ];
    turnTranscriptRef.current = '';
    turnReplyRef.current = '';
  }

  function handleEvent(event: StreamEvent) {
    switch (event.type) {
      case 'transcript':
        pushUserTurn(event.text);
        break;
      case 'reply':
        appendAssistant(event.text);
        break;
      case 'audio':
        if (!event.base64) break;
        serverSpokeRef.current = true;
        enqueueAudio(`data:${event.mimeType || 'audio/wav'};base64,${event.base64}`);
        break;
      case 'done':
        historyRef.current = event.history;
        turnTranscriptRef.current = '';
        turnReplyRef.current = '';
        streamDoneRef.current = true;
        if (!serverSpokeRef.current) speakWithBrowser(event.reply);
        else if (!playingRef.current && stateRef.current !== 'recording') setCallState('listening');
        break;
      case 'error':
        setErrorMsg(event.message);
        streamDoneRef.current = true;
        if (!playingRef.current) setCallState('listening');
        break;
    }
  }

  /**
   * Camino rápido. Devuelve false si el servicio desplegado todavía no tiene
   * la ruta de streaming, para caer al camino de una sola respuesta en vez de
   * dejar al reportero sin llamada.
   */
  async function sendStreaming(form: FormData, signal: AbortSignal): Promise<boolean> {
    const response = await fetch(`${AUDIO_SERVICE_URL}/api/incidents/converse/stream`, {
      method: 'POST', body: form, signal,
    });
    if (response.status === 404 || response.status === 405) return false;
    if (!response.ok || !response.body) {
      const json = await response.json().catch(() => null) as { error?: { message?: string } } | null;
      setErrorMsg(json?.error?.message ?? `Error del servicio (${response.status})`);
      setCallState('listening');
      return true;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf('\n');
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf('\n');
        if (!line) continue;
        try { handleEvent(JSON.parse(line) as StreamEvent); } catch { /* línea suelta cortada */ }
      }
    }

    // Si el stream se cerró sin `done` (red que se cae a mitad), la cola de voz
    // igual debe poder terminar y devolver el turno al reportero.
    streamDoneRef.current = true;
    if (!playingRef.current && stateRef.current === 'processing') setCallState('listening');
    return true;
  }

  /** Camino de respaldo: una sola respuesta al final, como antes del streaming. */
  async function sendLegacy(form: FormData, signal: AbortSignal): Promise<void> {
    const response = await fetch(`${AUDIO_SERVICE_URL}/api/incidents/converse`, {
      method: 'POST', body: form, signal,
    });
    const json = await response.json() as ConverseResponse & { error?: { message?: string } };
    if (!response.ok) {
      setErrorMsg(json.error?.message ?? `Error del servicio (${response.status})`);
      setCallState('listening');
      return;
    }
    historyRef.current = json.history;
    setTurns((prev) => [...prev, { role: 'user', content: json.transcript }, { role: 'assistant', content: json.reply }]);
    streamDoneRef.current = true;
    if (json.replyAudioBase64) {
      serverSpokeRef.current = true;
      enqueueAudio(`data:${json.replyAudioMimeType || 'audio/wav'};base64,${json.replyAudioBase64}`);
    } else {
      speakWithBrowser(json.reply);
    }
  }

  async function stopRecorderAndSend() {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    // El estado cambia ANTES de esperar el blob: el VAD sigue muestreando cada
    // 60 ms y volvería a entrar aquí, parando dos veces el mismo recorder.
    setCallState('processing');
    const blob = await new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunksRef.current, { type: recorder.mimeType }));
      recorder.stop();
    });
    if (hungUp()) return; // colgaron mientras esperábamos

    const form = new FormData();
    form.append('audio', blob, 'turno.webm');
    form.append('history', JSON.stringify(historyRef.current));

    const controller = new AbortController();
    abortRef.current = controller;
    streamDoneRef.current = false;
    serverSpokeRef.current = false;
    assistantOpenRef.current = false;
    turnTranscriptRef.current = '';
    turnReplyRef.current = '';

    try {
      const streamed = await sendStreaming(form, controller.signal);
      if (!streamed) await sendLegacy(form, controller.signal);
    } catch {
      // Abortar es lo que hace el barge-in: no es un fallo que reportar.
      if (controller.signal.aborted) {
        commitPartialTurn();
        return;
      }
      if (!hungUp()) {
        setErrorMsg('Sin conexión con el servicio de llamada.');
        setCallState('listening');
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  // ── Detección de voz ───────────────────────────────────────────────────────

  function pollVolume() {
    pollTimerRef.current = window.setInterval(() => {
      const current = stateRef.current;
      const level = currentVolume();
      const now = Date.now();

      // Interrumpir a la IA mientras habla: corta la voz, aborta lo que quede
      // del stream y empieza a grabar en el acto.
      if (current === 'speaking') {
        if (level <= BARGE_THRESHOLD) { bargeSinceRef.current = 0; return; }
        if (bargeSinceRef.current === 0) bargeSinceRef.current = now;
        if (now - bargeSinceRef.current < BARGE_SUSTAIN_MS) return;
        bargeSinceRef.current = 0;
        abortRef.current?.abort();
        stopPlayback();
        commitPartialTurn();
        lastLoudAtRef.current = now;
        speechStartedAtRef.current = now;
        startRecorder();
        setCallState('recording');
        return;
      }

      if (current !== 'listening' && current !== 'recording') return;

      if (level > SPEECH_THRESHOLD) {
        lastLoudAtRef.current = now;
        if (current === 'listening') {
          speechStartedAtRef.current = now;
          startRecorder();
          setCallState('recording');
        }
      }
      if (current === 'recording') {
        const silentFor = now - lastLoudAtRef.current;
        const spokeFor = now - speechStartedAtRef.current;
        if ((silentFor > SILENCE_MS && spokeFor > MIN_SPEECH_MS) || spokeFor > MAX_TURN_MS) {
          void stopRecorderAndSend();
        }
      }
    }, VAD_POLL_MS);
  }

  async function startCall() {
    setErrorMsg(null);
    setTurns([]);
    historyRef.current = [];
    void fetch(`${AUDIO_SERVICE_URL}/health`, { cache: 'no-store' }).catch(() => {});
    try {
      // Cancelación de eco explícita: es lo que permite el barge-in con el
      // teléfono en manos libres sin que la IA se interrumpa a sí misma.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      recorderOptionsRef.current = recorderOptions();
      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      analyserRef.current = analyser;
      dataArrayRef.current = new Uint8Array(analyser.fftSize);

      setCallState('listening');
      pollVolume();
    } catch {
      setErrorMsg('No pudimos acceder al micrófono.');
    }
  }

  function endCall() {
    setCallState('idle');
    if (pollTimerRef.current !== null) window.clearInterval(pollTimerRef.current);
    abortRef.current?.abort();
    abortRef.current = null;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') mediaRecorderRef.current.stop();
    stopPlayback();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    void audioCtxRef.current?.close();
    streamRef.current = null;
    audioCtxRef.current = null;
  }

  if (state === 'unavailable') return null;

  return (
    <div className="rounded-md bg-surface-raised ring-1 ring-edge-subtle p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-[15px]">Orientación por voz</p>
          <p className="text-[13px] text-content-secondary">
            {state === 'idle' ? 'Habla con la IA mientras esperas la ambulancia.' : STATUS_LABEL[state]}
          </p>
        </div>
        {state === 'idle' ? (
          <button
            type="button"
            onClick={() => void startCall()}
            aria-label="Iniciar llamada con la IA"
            className="pressable shrink-0 rounded-full bg-ok hover:brightness-110 text-white
                       flex items-center justify-center"
            style={{ width: 'var(--touch-comfort)', height: 'var(--touch-comfort)' }}
          >
            <PhoneIcon size={22} />
          </button>
        ) : (
          <button
            type="button"
            onClick={endCall}
            aria-label="Colgar"
            className="pressable shrink-0 rounded-full bg-emergency hover:bg-emergency-hover text-white
                       flex items-center justify-center"
            style={{ width: 'var(--touch-comfort)', height: 'var(--touch-comfort)' }}
          >
            <PhoneOffIcon size={22} />
          </button>
        )}
      </div>

      {errorMsg && (
        <p role="alert" className="mt-3 flex items-start gap-2 text-emergency text-[13px]">
          <AlertIcon size={16} /> <span>{errorMsg}</span>
        </p>
      )}

      {turns.length > 0 && (
        <div className="mt-3 flex max-h-64 flex-col gap-2 overflow-y-auto">
          {turns.map((turn, i) => (
            <p
              key={i}
              className={[
                'max-w-[85%] rounded-md px-3 py-2 text-[13px] leading-snug',
                turn.role === 'user'
                  ? 'self-end bg-info-soft text-content'
                  : 'self-start bg-surface-overlay text-content-secondary',
              ].join(' ')}
            >
              {turn.content}
            </p>
          ))}
          <div ref={logEndRef} />
        </div>
      )}

      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={audioElRef} className="hidden" />
    </div>
  );
}
