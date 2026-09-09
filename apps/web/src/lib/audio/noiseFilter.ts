/**
 * Cadena DSP ligera para limpiar la voz "en la calle" antes de grabar/enviar.
 *
 * No es supresión de ruido "de verdad" (eso pide un modelo de audio, pesado
 * para una pantalla de pánico que debe cargar rápido en datos móviles). Es un
 * highpass + compresor — dos nodos nativos de Web Audio, sin dependencias —
 * que sí ayudan de forma real con el ruido más común en una emergencia:
 *
 * - Highpass ~100 Hz: corta el retumbo grave de tráfico, viento sobre el
 *   micrófono y manipuleo del teléfono. La voz humana mantiene su
 *   inteligibilidad muy por encima de ese corte (el fundamental más bajo de
 *   una voz grave ronda 85 Hz, y lo que hace inteligible el habla vive sobre
 *   todo entre 300 Hz y 3.4 kHz).
 * - Compresor: sube la voz relativa a un fondo ruidoso constante (tráfico,
 *   viento, gente alrededor) en vez de dejar que ambos compitan al mismo
 *   nivel — no separa voz de ruido, pero hace la voz más legible encima de él.
 *
 * Se aplica en AMBOS caminos de audio de la app (reporte inicial y la
 * "llamada" con IA) para que ninguno de los dos dependa solo de las
 * constraints básicas de `getUserMedia`, que varían mucho de soporte entre
 * navegadores (Safari/iOS en particular las ignora parcialmente).
 */
export interface FilteredAudio {
  /** El stream que debe grabar el MediaRecorder — ya filtrado. */
  stream: MediaStream;
  /** Tap del audio YA filtrado, para que el medidor de nivel en pantalla
   *  refleje lo que de verdad se está grabando, no la señal cruda. */
  analyser: AnalyserNode;
  /** El caller es dueño del ciclo de vida: cerrar cuando se libera el mic. */
  audioContext: AudioContext;
}

export function createFilteredAudio(rawStream: MediaStream): FilteredAudio {
  const audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(rawStream);

  const highpass = audioContext.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = 100;
  highpass.Q.value = 0.7;

  // Umbral bajo y ratio alto: sube la voz suave frente a un fondo constante
  // sin aplastar los picos. Ataque rápido para no perder el arranque de una
  // palabra; release moderado para no "bombear" con cada pausa.
  const compressor = audioContext.createDynamicsCompressor();
  compressor.threshold.value = -50;
  compressor.knee.value = 30;
  compressor.ratio.value = 8;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.25;

  const destination = audioContext.createMediaStreamDestination();
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 256;

  source.connect(highpass);
  highpass.connect(compressor);
  compressor.connect(destination);
  compressor.connect(analyser);

  return { stream: destination.stream, analyser, audioContext };
}

/** Constraints compartidas por los dos caminos de audio de la app. Mono:
 *  estándar para voz, y varios navegadores aplican mejor su propia reducción
 *  de ruido nativa sobre una sola pista que sobre estéreo. */
export const VOICE_CAPTURE_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
};
