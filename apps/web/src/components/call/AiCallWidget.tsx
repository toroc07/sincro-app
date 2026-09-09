'use client';

/**
 * "Nota de voz" con la IA — orientación de primeros auxilios mientras el
 * reportero espera la ambulancia. Habla contra el audio-service (servicio
 * aparte, NEXT_PUBLIC_AUDIO_SERVICE_URL), no contra esta app: no crea ni
 * modifica incidentes, eso lo sigue haciendo POST /api/incidents/audio.
 *
 * MODELO PULSAR-PARA-HABLAR (no llamada en vivo). Antes había detección de voz
 * automática (VAD): el micrófono quedaba abierto y decidía solo cuándo cortar
 * el turno. En la calle, con pánico y ruido de fondo, eso fallaba por los dos
 * lados — no arrancaba porque la voz no pasaba el umbral, o no cerraba nunca
 * porque el ruido lo mantenía "hablando". Ahora el reportero MANTIENE PULSADO
 * el botón mientras habla y lo SUELTA para enviar: el micrófono solo graba con
 * el dedo encima, así que el ruido de fondo solo entra en esa ventana y, en
 * silencio, no se está escuchando nada.
 *
 * TIEMPO DE REACCIÓN — la respuesta llega en streaming (NDJSON): se oye la
 * PRIMERA frase sin esperar a que el modelo termine la última ni a que se
 * sintetice toda la voz. Ver POST /api/incidents/converse/stream. El servicio
 * se calienta al montar el widget, no al primer toque.
 */

import { useEffect, useRef, useState } from 'react';
import { AlertIcon, MicIcon, SpinnerIcon, StopIcon } from '@/src/components/ui/icons';
import { createFilteredAudio, VOICE_CAPTURE_CONSTRAINTS } from '@/src/lib/audio/noiseFilter';

const AUDIO_SERVICE_URL = process.env.NEXT_PUBLIC_AUDIO_SERVICE_URL ?? '';
/** Toque demasiado corto: fue un roce, no una frase. Se descarta sin enviar
 *  para no gastar un turno en audio vacío que el modelo transcribe como ruido. */
const MIN_HOLD_MS = 350;
/** Corte por seguridad si alguien deja el dedo puesto: un turno de emergencia
 *  es una o dos frases, no un monólogo. */
const MAX_RECORD_MS = 25_000;

type VoiceState = 'idle' | 'recording' | 'processing' | 'speaking' | 'unavailable';

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

const STATUS_LABEL: Partial<Record<VoiceState, string>> = {
  idle: 'Mantén pulsado el botón para hablar y suéltalo para enviar.',
  recording: 'Grabando… suelta para enviar.',
  processing: 'Enviando y esperando respuesta…',
  speaking: 'Reproduciendo respuesta… (pulsa para responder)',
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
  const [state, setState] = useState<VoiceState>(AUDIO_SERVICE_URL ? 'idle' : 'unavailable');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const historyRef = useRef<Turn[]>([]);
  const stateRef = useRef<VoiceState>(state);
  const streamRef = useRef<MediaStream | null>(null);
  /** Stream ya limpiado (highpass + compresor, ver noiseFilter.ts) — es el
   *  que de verdad graba el MediaRecorder, no el crudo del micrófono. */
  const filteredStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recorderOptionsRef = useRef<MediaRecorderOptions>({});
  const chunksRef = useRef<BlobPart[]>([]);
  /** El dedo sigue sobre el botón. Se consulta tras el `await` del permiso de
   *  micrófono: si para entonces ya se soltó, no se empieza a grabar. */
  const holdingRef = useRef(false);
  const pressStartAtRef = useRef(0);
  const maxTimerRef = useRef<number | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  /** Cola de voz del turno en curso: cada frase que llega se reproduce en
   *  orden mientras el servidor sigue generando las siguientes. */
  const queueRef = useRef<string[]>([]);
  const playingRef = useRef(false);
  const streamDoneRef = useRef(false);
  const serverSpokeRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const assistantOpenRef = useRef(false);

  const setVoiceState = (next: VoiceState) => { stateRef.current = next; setState(next); };

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [turns]);

  // Despertar el servicio al montar: en capa gratuita el contenedor dormido
  // tarda unos segundos, y ese tiempo hay que gastarlo mientras la persona lee
  // la pantalla, no cuando ya está esperando su respuesta.
  useEffect(() => {
    if (!AUDIO_SERVICE_URL) return;
    void fetch(`${AUDIO_SERVICE_URL}/health`, { cache: 'no-store' }).catch(() => {});
  }, []);

  useEffect(() => () => { teardown(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, []);

  // ── Micrófono ──────────────────────────────────────────────────────────────

  /** Pide el micrófono la primera vez y reutiliza el stream en los toques
   *  siguientes (no vuelve a preguntar el permiso ya concedido). El
   *  MediaRecorder solo corre con el dedo puesto, así que tener el track
   *  abierto no graba nada por sí mismo. Si el track quedó muerto (otra
   *  pestaña/app tomó el micro, o una interrupción del sistema), se pide de
   *  nuevo — un `readyState === 'ended'` no se recupera. */
  async function acquireMic(): Promise<MediaStream | null> {
    const live = streamRef.current?.getAudioTracks()[0]?.readyState === 'live';
    if (streamRef.current && streamRef.current.active && live) return streamRef.current;
    releaseMic();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: VOICE_CAPTURE_CONSTRAINTS });
      streamRef.current = stream;
      const filtered = createFilteredAudio(stream);
      filteredStreamRef.current = filtered.stream;
      audioCtxRef.current = filtered.audioContext;
      recorderOptionsRef.current = recorderOptions();
      return stream;
    } catch {
      setErrorMsg('No pudimos usar el micrófono. Revisa el permiso del navegador y vuelve a intentarlo.');
      return null;
    }
  }

  function releaseMic() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close().catch(() => { /* ya cerrado */ });
    audioCtxRef.current = null;
    filteredStreamRef.current = null;
  }

  // ── Reproducción encolada ──────────────────────────────────────────────────

  function playNext() {
    const el = audioElRef.current;
    const next = queueRef.current.shift();
    if (!el || !next) {
      playingRef.current = false;
      // El turno solo termina cuando ya no queda voz por reproducir: volver a
      // "listo" antes cortaría a la IA a media frase.
      if (streamDoneRef.current && stateRef.current === 'speaking') setVoiceState('idle');
      return;
    }
    playingRef.current = true;
    if (stateRef.current !== 'speaking') setVoiceState('speaking');
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
    if (!('speechSynthesis' in window)) { setVoiceState('idle'); return; }
    setVoiceState('speaking');
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'es-ES';
    utterance.onend = () => { if (stateRef.current === 'speaking') setVoiceState('idle'); };
    utterance.onerror = () => { if (stateRef.current === 'speaking') setVoiceState('idle'); };
    speechSynthesis.speak(utterance);
  }

  // ── Turno de conversación ──────────────────────────────────────────────────

  function pushUserTurn(text: string) {
    setTurns((prev) => [...prev, { role: 'user', content: text }]);
  }

  function appendAssistant(text: string) {
    setTurns((prev) => {
      const last = prev[prev.length - 1];
      if (assistantOpenRef.current && last?.role === 'assistant') {
        return [...prev.slice(0, -1), { role: 'assistant', content: `${last.content} ${text}`.trim() }];
      }
      assistantOpenRef.current = true;
      return [...prev, { role: 'assistant', content: text }];
    });
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
        streamDoneRef.current = true;
        if (!serverSpokeRef.current) speakWithBrowser(event.reply);
        else if (!playingRef.current && stateRef.current !== 'recording') setVoiceState('idle');
        break;
      case 'error':
        setErrorMsg(event.message);
        streamDoneRef.current = true;
        if (!playingRef.current) setVoiceState('idle');
        break;
    }
  }

  /**
   * Camino rápido. Devuelve false si el servicio desplegado todavía no tiene
   * la ruta de streaming, para caer al camino de una sola respuesta en vez de
   * dejar al reportero sin orientación.
   */
  async function sendStreaming(form: FormData, signal: AbortSignal): Promise<boolean> {
    const response = await fetch(`${AUDIO_SERVICE_URL}/api/incidents/converse/stream`, {
      method: 'POST', body: form, signal,
    });
    if (response.status === 404 || response.status === 405) return false;
    if (!response.ok || !response.body) {
      const json = await response.json().catch(() => null) as { error?: { message?: string } } | null;
      setErrorMsg(json?.error?.message ?? `Error del servicio (${response.status})`);
      setVoiceState('idle');
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
    // igual debe poder terminar y devolver el control al reportero.
    streamDoneRef.current = true;
    if (!playingRef.current && stateRef.current === 'processing') setVoiceState('idle');
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
      setVoiceState('idle');
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

  async function sendTurn(audio: File) {
    setVoiceState('processing');
    const form = new FormData();
    form.append('audio', audio, audio.name);
    form.append('history', JSON.stringify(historyRef.current));

    const controller = new AbortController();
    abortRef.current = controller;
    streamDoneRef.current = false;
    serverSpokeRef.current = false;
    assistantOpenRef.current = false;
    // Sin corte, un audio-service colgado deja el botón en "Enviando…" para
    // siempre. 30 s es de sobra: un turno real responde en 2-5 s.
    let timedOut = false;
    const killSwitch = window.setTimeout(() => { timedOut = true; controller.abort(); }, 30_000);

    try {
      const streamed = await sendStreaming(form, controller.signal);
      if (!streamed) await sendLegacy(form, controller.signal);
    } catch {
      if (timedOut) {
        setErrorMsg('El servicio tardó demasiado. Intenta de nuevo.');
        setVoiceState('idle');
        return;
      }
      // Abortar por pulsar de nuevo mientras responde no es un fallo.
      if (controller.signal.aborted) return;
      setErrorMsg('Sin conexión con el servicio de orientación. Vuelve a intentarlo.');
      setVoiceState('idle');
    } finally {
      window.clearTimeout(killSwitch);
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  // ── Pulsar para hablar ─────────────────────────────────────────────────────

  function beginRecording(stream: MediaStream) {
    chunksRef.current = [];
    let recorder: MediaRecorder;
    try {
      // Algunos navegadores aceptan el mimeType en isTypeSupported pero fallan
      // al construir con opciones; sin opciones siempre funciona.
      recorder = new MediaRecorder(stream, recorderOptionsRef.current);
    } catch {
      try { recorder = new MediaRecorder(stream); } catch {
        setErrorMsg('Tu navegador no permite grabar audio aquí. Usa el botón "Llamar al 123".');
        setVoiceState('idle');
        return;
      }
    }
    recorder.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
    recorder.onerror = () => { setErrorMsg('Se cortó la grabación. Intenta de nuevo.'); setVoiceState('idle'); };
    // timeslice de 250 ms: fuerza a volcar audio mientras se graba, en vez de
    // un único bloque al final que algunos navegadores entregan incompleto.
    recorder.start(250);
    recorderRef.current = recorder;
    pressStartAtRef.current = Date.now();
    setVoiceState('recording');
    maxTimerRef.current = window.setTimeout(() => { void finishRecording(); }, MAX_RECORD_MS);
  }

  /** Pide micro (si hace falta) y arranca a grabar, salvo que el gesto se haya
   *  cancelado durante el permiso. `holdingRef` marca "el reportero quiere
   *  grabar ahora": con puntero lo pone `handlePressStart` y lo quita
   *  `handlePressEnd`; con teclado lo pone `handleKeyDown` y lo quita
   *  `finishRecording`. */
  async function beginTurn() {
    setErrorMsg(null);
    // Pulsar mientras responde = interrumpir y tomar el turno.
    if (stateRef.current === 'speaking') { abortRef.current?.abort(); stopPlayback(); }

    try {
      const stream = await acquireMic();
      if (!stream) { holdingRef.current = false; return; }
      // El permiso pudo tardar; si ya se soltó el botón, o si otro gesto ya
      // arrancó una grabación, no empezamos otra.
      if (!holdingRef.current) return;
      if (recorderRef.current && recorderRef.current.state === 'recording') return;
      // Graba el stream ya filtrado (highpass + compresor); el crudo solo se
      // usa para pedir permiso y comprobar que el track sigue vivo.
      beginRecording(filteredStreamRef.current ?? stream);
    } catch {
      holdingRef.current = false;
      setErrorMsg('No se pudo iniciar la grabación. Intenta de nuevo.');
      setVoiceState('idle');
    }
  }

  function handlePressStart(e: React.PointerEvent<HTMLButtonElement>) {
    e.preventDefault();
    if (stateRef.current === 'processing' || stateRef.current === 'recording') return;
    holdingRef.current = true;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* no soportado: da igual */ }
    void beginTurn();
  }

  /** Teclado (accesibilidad): sin "mantener" posible, se alterna — una
   *  pulsación arranca, la siguiente envía. Espacio/Enter. */
  function handleKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault(); // evita el scroll y el click sintético del botón
    if (e.repeat) return;
    if (stateRef.current === 'recording') { void finishRecording(); return; }
    if (stateRef.current === 'processing') return;
    holdingRef.current = true;
    void beginTurn();
  }

  async function finishRecording() {
    holdingRef.current = false;
    if (maxTimerRef.current !== null) { window.clearTimeout(maxTimerRef.current); maxTimerRef.current = null; }

    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      if (stateRef.current === 'recording') setVoiceState('idle');
      return;
    }
    const heldMs = Date.now() - pressStartAtRef.current;
    const mimeType = recorder.mimeType || 'audio/webm';
    const blob = await new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunksRef.current, { type: mimeType }));
      recorder.stop();
    });
    recorderRef.current = null;

    if (heldMs < MIN_HOLD_MS || blob.size < 1200) {
      setVoiceState('idle');
      setErrorMsg('No se grabó nada. Mantén pulsado el botón mientras hablas.');
      return;
    }
    const ext = mimeType.includes('mp4') || mimeType.includes('mpeg') ? 'mp4' : mimeType.includes('ogg') ? 'ogg' : 'webm';
    await sendTurn(new File([blob], `turno.${ext}`, { type: mimeType }));
  }

  function handlePressEnd(e: React.PointerEvent<HTMLButtonElement>) {
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ya liberado */ }
    if (holdingRef.current || stateRef.current === 'recording') void finishRecording();
    else holdingRef.current = false;
  }

  function resetConversation() {
    abortRef.current?.abort();
    stopPlayback();
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
    recorderRef.current = null;
    if (maxTimerRef.current !== null) { window.clearTimeout(maxTimerRef.current); maxTimerRef.current = null; }
    holdingRef.current = false;
    historyRef.current = [];
    setTurns([]);
    setErrorMsg(null);
    setVoiceState('idle');
    releaseMic();
  }

  function teardown() {
    abortRef.current?.abort();
    abortRef.current = null;
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
    recorderRef.current = null;
    if (maxTimerRef.current !== null) { window.clearTimeout(maxTimerRef.current); maxTimerRef.current = null; }
    stopPlayback();
    releaseMic();
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (state === 'unavailable') {
    return (
      <div className="rounded-md bg-surface-raised ring-1 ring-edge-subtle p-4" role="status">
        <div className="flex items-start gap-2 text-warn text-[13px]">
          <AlertIcon size={16} className="shrink-0 mt-0.5" />
          <span>La orientación por voz no está disponible en este momento.</span>
        </div>
      </div>
    );
  }

  const recording = state === 'recording';
  const processing = state === 'processing';

  const buttonTone = recording
    ? 'bg-emergency text-on-emergency animate-pulse'
    : processing
      ? 'bg-surface-overlay text-content-secondary cursor-wait'
      : 'bg-ok text-on-ok';

  return (
    <div className="rounded-md bg-surface-raised ring-1 ring-edge-subtle p-4">
      <div className="flex items-center justify-between gap-3">
        <div aria-live="polite">
          <p className="font-semibold text-[15px]">Orientación por voz</p>
          <p className="text-[13px] text-content-secondary">{STATUS_LABEL[state]}</p>
        </div>
        {turns.length > 0 && !recording && !processing && (
          <button
            type="button"
            onClick={resetConversation}
            className="pressable shrink-0 text-[13px] text-content-secondary underline underline-offset-2"
          >
            Terminar
          </button>
        )}
      </div>

      <button
        type="button"
        disabled={processing}
        onPointerDown={handlePressStart}
        onPointerUp={handlePressEnd}
        onPointerCancel={handlePressEnd}
        onKeyDown={handleKeyDown}
        onContextMenu={(e) => e.preventDefault()}
        aria-label={recording ? 'Grabando: suelta o pulsa para enviar' : 'Mantén pulsado para hablar'}
        aria-pressed={recording}
        className={`pressable mt-3 w-full select-none rounded-md px-4 flex items-center justify-center gap-2
                    font-semibold text-[14px] disabled:opacity-100 ${buttonTone}`}
        style={{ minHeight: 'var(--touch-comfort)', touchAction: 'none' }}
      >
        {processing ? (
          <><SpinnerIcon size={20} className="animate-spin" /> Esperando respuesta…</>
        ) : recording ? (
          <><StopIcon size={20} /> Suelta para enviar</>
        ) : (
          <><MicIcon size={20} /> Mantén pulsado para hablar</>
        )}
      </button>

      {errorMsg && (
        <p role="alert" className="mt-3 flex items-start gap-2 text-emergency text-[13px]">
          <AlertIcon size={16} className="shrink-0 mt-0.5" /> <span>{errorMsg}</span>
        </p>
      )}

      {turns.length > 0 && (
        <div className="mt-3 flex max-h-64 flex-col gap-2 overflow-y-auto" role="log" aria-live="polite" aria-relevant="additions">
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
