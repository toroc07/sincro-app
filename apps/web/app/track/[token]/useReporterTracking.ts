'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Transmite el GPS del ciudadano mientras tiene /track/[token] abierto, para
 * que la tripulación vea DÓNDE ESTÁ AHORA (no dónde estaba al grabar el audio).
 *
 * Adaptado de `app/responder/useVehicleTracking.ts`, pero mucho más simple:
 *  - Sin cola persistente en localStorage. Una emergencia no dura horas; si un
 *    envío falla, el siguiente (en ≤10s) lo cubre.
 *  - Pausa cuando la pestaña se oculta (Page Visibility API): no tiene sentido
 *    gastar batería y datos rastreando a alguien que cambió de app.
 *  - Permiso denegado / no soportado: se queda quieto, nunca lanza.
 */

const SEND_INTERVAL_MS = 10_000;

export type ReporterGpsState = 'idle' | 'waiting' | 'sending' | 'denied' | 'unsupported' | 'hidden';

export function useReporterTracking(token: string, enabled: boolean): ReporterGpsState {
  const [state, setState] = useState<ReporterGpsState>('idle');
  const lastSentAtRef = useRef(0);
  const latestRef = useRef<{ lat: number; lng: number; accuracyM?: number } | null>(null);

  useEffect(() => {
    if (!enabled || !token) {
      setState('idle');
      return;
    }
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setState('unsupported');
      return;
    }

    let watchId: number | null = null;
    let cancelled = false;

    const send = async () => {
      const pos = latestRef.current;
      if (!pos || document.hidden) return;
      if (Date.now() - lastSentAtRef.current < SEND_INTERVAL_MS) return;
      lastSentAtRef.current = Date.now();
      try {
        await fetch(`/api/track/${encodeURIComponent(token)}/location`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(pos),
          keepalive: true,
        });
        if (!cancelled && !document.hidden) setState('sending');
      } catch {
        // Silencioso: el siguiente envío lo reintenta. No hay nada que el
        // ciudadano deba hacer al respecto.
      }
    };

    const startWatch = () => {
      if (watchId !== null) return;
      setState((s) => (s === 'denied' || s === 'unsupported' ? s : 'waiting'));
      watchId = navigator.geolocation.watchPosition(
        (position) => {
          latestRef.current = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            ...(position.coords.accuracy == null ? {} : { accuracyM: position.coords.accuracy }),
          };
          void send();
        },
        (error) => {
          setState(error.code === error.PERMISSION_DENIED ? 'denied' : 'waiting');
        },
        { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
      );
    };

    const stopWatch = () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
      }
    };

    const onVisibility = () => {
      if (document.hidden) {
        stopWatch();
        setState((s) => (s === 'denied' || s === 'unsupported' ? s : 'hidden'));
      } else {
        startWatch();
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    const interval = window.setInterval(() => { void send(); }, SEND_INTERVAL_MS);
    if (!document.hidden) startWatch();

    return () => {
      cancelled = true;
      stopWatch();
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [token, enabled]);

  return state;
}
