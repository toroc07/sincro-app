'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';

/**
 * Mapa real de Cartagena para marcar una ubicación aproximada cuando el GPS
 * falla o el reportero prefiere no usarlo. Antes esto era un `<button>` con un
 * fondo decorativo ("map-paper") y tres etiquetas de barrio fijas — no un
 * mapa de verdad, a diferencia del que ve el ciudadano DESPUÉS de reportar
 * (LiveRouteMap). Mismas teselas OSM/CARTO que ese, para que la experiencia
 * sea consistente.
 *
 * Patrón "pin fijo, mapa se mueve" (como Uber/inDriver): el pin queda
 * centrado en la pantalla y el ciudadano arrastra el MAPA por debajo hasta
 * ubicarlo bajo su posición — evita tener que traducir un tap en pixeles a
 * lat/lng a mano, MapLibre ya sabe cuál es el centro.
 */

const TILE_URL = process.env.NEXT_PUBLIC_MAP_TILES_URL
  ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

export interface LocationPickerBounds {
  minLat: number; maxLat: number; minLng: number; maxLng: number;
}

export function LocationPickerMap({
  initial, bounds, onConfirm, onClose,
}: {
  initial: { lat: number; lng: number };
  bounds: LocationPickerBounds;
  onConfirm: (point: { lat: number; lng: number }) => void;
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const centerRef = useRef(initial);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const { Map } = await import('maplibre-gl');
      if (cancelled || !containerRef.current) return;

      const map = new Map({
        container: containerRef.current,
        style: {
          version: 8,
          sources: {
            osm: { type: 'raster', tiles: [TILE_URL], tileSize: 256, attribution: TILE_ATTRIBUTION },
          },
          layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
        },
        center: [initial.lng, initial.lat],
        zoom: 14,
        attributionControl: { compact: true },
        // Una mano en el mapa y otra en el teléfono: girar o inclinar solo estorba.
        pitchWithRotate: false,
        dragRotate: false,
        // No dejar que el ciudadano arrastre fuera de Cartagena — no hay
        // teselas útiles ni sentido en reportar una emergencia de otra ciudad.
        maxBounds: [[bounds.minLng, bounds.minLat], [bounds.maxLng, bounds.maxLat]],
      });
      map.touchZoomRotate.disableRotation();

      const track = () => {
        const c = map.getCenter();
        centerRef.current = { lat: c.lat, lng: c.lng };
      };
      map.on('move', track);
      map.on('load', () => { if (!cancelled) setReady(true); });

      mapRef.current = map;
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="mt-3 rounded-2xl border border-edge-subtle bg-surface-raised p-3" aria-labelledby="approx-location-title">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 id="approx-location-title" className="font-semibold">Marca una zona aproximada</h2>
          <p className="text-xs text-content-muted">Mueve el mapa hasta ubicar el pin donde estás.</p>
        </div>
        <button type="button" onClick={onClose} className="min-h-touch px-2 text-sm font-semibold text-content-secondary">Cerrar</button>
      </div>

      <div className="relative mt-3 h-56 w-full overflow-hidden rounded-xl ring-1 ring-edge-subtle">
        <div ref={containerRef} className="h-full w-full" aria-label="Mapa de Cartagena para marcar tu ubicación" />
        {!ready && (
          <div className="absolute inset-0 grid place-items-center bg-surface-overlay">
            <span className="text-xs font-semibold text-content-muted">Cargando mapa…</span>
          </div>
        )}
        {/* Pin fijo en el centro de la pantalla: el mapa se mueve por debajo. */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full" aria-hidden>
          <svg width="30" height="38" viewBox="0 0 30 38" fill="none">
            <path d="M15 37C15 37 28 23.5 28 14.5C28 7.04 22.18 1 15 1S2 7.04 2 14.5C2 23.5 15 37 15 37Z"
                  fill="var(--emergency)" stroke="#fff" strokeWidth="2.2" />
            <circle cx="15" cy="14.5" r="5" fill="#fff" />
          </svg>
        </div>
      </div>

      <button
        type="button"
        onClick={() => { onConfirm(centerRef.current); onClose(); }}
        disabled={!ready}
        className="pressable mt-3 w-full min-h-touch rounded-xl bg-emergency font-semibold text-on-emergency disabled:opacity-50"
      >
        Confirmar esta ubicación
      </button>
    </section>
  );
}
