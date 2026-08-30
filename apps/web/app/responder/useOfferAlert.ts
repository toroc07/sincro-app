'use client';

import { useEffect, useRef } from 'react';
import { INCIDENT_TYPE_LABEL } from '@/src/lib/incidentLabels';

// Ritmo de un timbre de llamada real: dos tonos cortos y una pausa, en loop
// mientras la oferta siga sin respuesta — igual que una llamada entrante de
// Didi/InDriver, no una notificación silenciosa que se puede pasar por alto.
const RING_TONE_MS = 350;
const RING_GAP_MS = 220;
const RING_CYCLE_MS = 2 * (RING_TONE_MS + RING_GAP_MS) + 1_400;
// Repetir la locución cada dos ciclos de timbre: suficiente para que se oiga
// completa antes de repetirse, sin quedar en silencio mientras espera respuesta.
const SPEECH_REPEAT_MS = RING_CYCLE_MS * 2;

export interface OfferAlertReport {
  readonly type: string;
  readonly address: string | null;
  readonly patientCount: number;
  readonly priority: string | null;
}

function buildAnnouncement(report: OfferAlertReport): string {
  const typeLabel = INCIDENT_TYPE_LABEL[report.type as keyof typeof INCIDENT_TYPE_LABEL] ?? report.type;
  const place = report.address ?? 'ubicación sin confirmar';
  const patients = report.patientCount === 1 ? '1 paciente' : `${report.patientCount} pacientes`;
  const priority = report.priority ? `, prioridad ${report.priority}` : '';
  return `Nueva emergencia. ${typeLabel} en ${place}. ${patients}${priority}.`;
}

/**
 * Notificación del sistema, además del timbre: si el conductor tiene la app
 * en segundo plano (mapa, radio, pantalla apagada con el navegador vivo) el
 * timbre puede no bastar. Va por el service worker cuando lo hay —
 * `showNotification` del SW admite `vibrate` y sobrevive a que la pestaña
 * pierda el foco, cosa que `new Notification()` no garantiza.
 *
 * NO cubre la app cerrada del todo: eso exige Web Push con claves VAPID y
 * suscripción guardada en servidor. Aquí no se finge que sí.
 */
async function notifySystem(offerId: string, report: OfferAlertReport): Promise<void> {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const typeLabel = INCIDENT_TYPE_LABEL[report.type as keyof typeof INCIDENT_TYPE_LABEL] ?? report.type;
  const options: NotificationOptions & { vibrate?: number[]; renotify?: boolean } = {
    body: `${typeLabel} · ${report.address ?? 'ubicación sin confirmar'}`,
    // Mismo tag por oferta: reabrir la app o revalidar no apila diez avisos.
    tag: `offer-${offerId}`,
    renotify: true,
    requireInteraction: true,
    vibrate: [500, 180, 500, 180, 900],
  };
  try {
    const registration = await navigator.serviceWorker?.getRegistration('/responder/');
    if (registration) {
      await registration.showNotification('Emergencia asignada', options);
      return;
    }
    new Notification('Emergencia asignada', options);
  } catch {
    // Sin notificación el timbre sigue sonando: no es el canal crítico.
  }
}

function ring(ctx: AudioContext, startAt: number) {
  // Dos tonos tipo teléfono (dual-tone) en vez de un solo pitido: se
  // reconoce como "llamada entrante" incluso sin mirar la pantalla.
  for (const offset of [0, RING_TONE_MS + RING_GAP_MS]) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 950;
    gain.gain.setValueAtTime(0.0001, startAt + offset);
    gain.gain.exponentialRampToValueAtTime(0.35, startAt + offset + 0.02);
    gain.gain.setValueAtTime(0.35, startAt + offset + RING_TONE_MS / 1_000 - 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + offset + RING_TONE_MS / 1_000);
    osc.connect(gain).connect(ctx.destination);
    osc.start(startAt + offset);
    osc.stop(startAt + offset + RING_TONE_MS / 1_000);
  }
}

/**
 * Alerta de oferta entrante estilo Didi/InDriver: timbra el teléfono en loop
 * (Web Audio, sin asset de audio — coherente con el resto del proyecto
 * offline-first) y un asistente de voz lee el reporte, mientras la oferta
 * siga sin aceptar/rechazar/expirar. `active` controla el ciclo de vida
 * completo: al pasar a `false` se detiene todo de inmediato.
 */
export function useOfferAlert(active: boolean, offerId: string | null, report: OfferAlertReport | null) {
  const reportRef = useRef(report);
  reportRef.current = report;

  useEffect(() => {
    // Depende de offerId (estable mientras la misma oferta siga viva), no del
    // objeto `report` — este se reconstruye en cada render y reiniciaría el
    // timbre/la locución sin parar si fuera parte de las dependencias.
    if (!active || !offerId || !reportRef.current || typeof window === 'undefined') return;

    let cancelled = false;
    let ringTimer: number | undefined;
    let speechTimer: number | undefined;
    const AudioContextCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    const audioCtx = AudioContextCtor ? new AudioContextCtor() : null;

    const scheduleRing = () => {
      if (cancelled || !audioCtx) return;
      // Autoplay puede llegar "suspended" si aún no hubo gesto del usuario en
      // esta carga de página; reintenta el resume en cada ciclo en vez de
      // fallar en silencio para siempre.
      void audioCtx.resume().then(() => { if (!cancelled) ring(audioCtx, audioCtx.currentTime); }).catch(() => {});
      navigator.vibrate?.([RING_TONE_MS, RING_GAP_MS, RING_TONE_MS, RING_GAP_MS * 4]);
      ringTimer = window.setTimeout(scheduleRing, RING_CYCLE_MS);
    };

    const speak = () => {
      if (cancelled || !('speechSynthesis' in window) || !reportRef.current) return;
      window.speechSynthesis.cancel(); // no encimar locuciones si el reporte cambió a mitad de lectura
      const utterance = new SpeechSynthesisUtterance(buildAnnouncement(reportRef.current));
      utterance.lang = 'es-ES';
      utterance.rate = 1.05;
      window.speechSynthesis.speak(utterance);
      speechTimer = window.setTimeout(speak, SPEECH_REPEAT_MS);
    };

    scheduleRing();
    speak();
    void notifySystem(offerId, reportRef.current);

    return () => {
      cancelled = true;
      if (ringTimer) window.clearTimeout(ringTimer);
      if (speechTimer) window.clearTimeout(speechTimer);
      navigator.vibrate?.(0);
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      void audioCtx?.close().catch(() => {});
      // La notificación es `requireInteraction`: sin cerrarla a mano se
      // quedaría pegada después de que el conductor ya salió en camino.
      void navigator.serviceWorker?.getRegistration('/responder/')
        .then((registration) => registration?.getNotifications({ tag: `offer-${offerId}` }))
        .then((notifications) => notifications?.forEach((notification) => notification.close()))
        .catch(() => {});
    };
  }, [active, offerId]);
}
