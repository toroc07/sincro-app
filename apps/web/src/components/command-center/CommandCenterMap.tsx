'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import type { Facility, Incident, VehicleWithLocation } from '@dispatch/contracts';
import type { Map as MapLibreMap, Marker, Popup } from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';

const TILE_URL =
  process.env.NEXT_PUBLIC_MAP_TILES_URL ??
  'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

export interface CommandCenterMapProps {
  vehicles: VehicleWithLocation[];
  incidents: Incident[];
  facilities: Facility[];
  selectedEntity: { type: 'vehicle' | 'incident' | 'facility'; id: string } | null;
  onSelectEntity: (entity: { type: 'vehicle' | 'incident' | 'facility'; id: string } | null) => void;
}

export function CommandCenterMap({
  vehicles,
  incidents,
  facilities,
  selectedEntity,
  onSelectEntity,
}: CommandCenterMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);

  const [ready, setReady] = useState(false);
  const [showVehicles, setShowVehicles] = useState(true);
  const [showIncidents, setShowIncidents] = useState(true);
  const [showFacilities, setShowFacilities] = useState(true);

  // Inicializar mapa centrado en Cartagena
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const { Map, NavigationControl } = await import('maplibre-gl');
      if (cancelled || !containerRef.current) return;

      const map = new Map({
        container: containerRef.current,
        style: {
          version: 8,
          sources: {
            osm: {
              type: 'raster',
              tiles: [TILE_URL],
              tileSize: 256,
              attribution: TILE_ATTRIBUTION,
            },
          },
          layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
        },
        center: [-75.52, 10.42], // Bahía / Centro de Cartagena
        zoom: 12.2,
        attributionControl: { compact: true },
      });

      map.addControl(new NavigationControl({ showCompass: false }), 'bottom-right');

      map.on('load', () => {
        if (cancelled) return;
        setReady(true);
      });

      mapRef.current = map;
    })();

    return () => {
      cancelled = true;
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, []);

  // Actualizar marcadores reactivos
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;

    let cancelled = false;

    void (async () => {
      const { Marker, Popup } = await import('maplibre-gl');
      if (cancelled || !mapRef.current) return;

      // Limpiar marcadores anteriores
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];

      // 1. Hospitales y Bases
      if (showFacilities) {
        facilities.forEach((fac) => {
          const isSelected = selectedEntity?.type === 'facility' && selectedEntity?.id === fac.id;
          const el = document.createElement('div');
          el.className = 'cursor-pointer group';
          el.innerHTML = `
            <div style="position:relative;display:flex;align-items:center;justify-content:center;">
              <div style="width:${isSelected ? '36px' : '30px'};height:${isSelected ? '36px' : '30px'};border-radius:8px;background:${fac.type === 'TRAUMA_CENTER' ? '#4f46e5' : 'var(--info)'};display:flex;align-items:center;justify-content:center;box-shadow:0 3px 12px rgba(0,0,0,0.35);border:2px solid #ffffff;transition:transform 0.2s;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round">
                  <path d="M12 4v16m-8-8h16" />
                </svg>
              </div>
              <div style="position:absolute;bottom:-20px;white-space:nowrap;font-size:10px;font-weight:700;background:var(--surface-overlay);color:var(--text-secondary);padding:1px 6px;border-radius:4px;border:1px solid var(--border-subtle);pointer-events:none;">
                ${fac.name}
              </div>
            </div>
          `;

          const popup = new Popup({ offset: 18, closeButton: false, maxWidth: '240px' }).setHTML(`
            <div style="font-family:var(--font-sans);color:#0f172a;padding:4px;min-width:160px;">
              <div style="font-weight:800;font-size:13px;margin-bottom:2px;">${fac.name}</div>
              <div style="font-size:11px;color:#64748b;margin-bottom:6px;">${fac.type === 'TRAUMA_CENTER' ? 'Centro de Trauma / Alta Complejidad' : 'Hospital Distrital'}</div>
              <div style="display:flex;gap:4px;flex-wrap:wrap;">
                ${fac.capabilities.map((c) => `<span style="background:#e0f2fe;color:#0369a1;font-size:9px;font-weight:700;padding:2px 6px;border-radius:4px;">${c}</span>`).join('')}
              </div>
            </div>
          `);

          el.onclick = () => onSelectEntity({ type: 'facility', id: fac.id });

          const marker = new Marker({ element: el, anchor: 'center' })
            .setLngLat([fac.lng, fac.lat])
            .setPopup(popup)
            .addTo(map);

          markersRef.current.push(marker);
        });
      }

      // 2. Ambulancias / Flota
      if (showVehicles) {
        vehicles.forEach((veh) => {
          if (!veh.location) return;
          const isSelected = selectedEntity?.type === 'vehicle' && selectedEntity?.id === veh.id;
          const isAvail = veh.status === 'AVAILABLE';
          const isBusy = ['ASSIGNED', 'EN_ROUTE', 'ON_SCENE', 'TRANSPORTING'].includes(veh.status);
          const color = isAvail ? 'var(--ok)' : isBusy ? 'var(--emergency)' : 'var(--surface-pressed)';

          const el = document.createElement('div');
          el.className = 'cursor-pointer';
          el.innerHTML = `
            <div style="position:relative;width:${isSelected ? '38px' : '32px'};height:${isSelected ? '38px' : '32px'};display:flex;align-items:center;justify-content:center;">
              ${isAvail || isBusy ? `<span style="position:absolute;inset:0;border-radius:50%;background:${color};opacity:0.25;animation:dispatch-pulse 1.6s cubic-bezier(0.4, 0, 0.6, 1) infinite;"></span>` : ''}
              <div style="width:${isSelected ? '28px' : '24px'};height:${isSelected ? '28px' : '24px'};border-radius:50%;background:${color};border:2px solid #ffffff;box-shadow:0 3px 8px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round">
                  <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1 .4-1 1v9c0 .6.4 1 1 1h2m0 0a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0M7 11h4"/>
                </svg>
              </div>
              <div style="position:absolute;top:-16px;white-space:nowrap;font-size:9px;font-weight:800;background:var(--surface-overlay);color:#ffffff;padding:0px 4px;border-radius:3px;border:1px solid var(--border-subtle);">
                ${veh.callsign}
              </div>
            </div>
          `;

          const popup = new Popup({ offset: 16, closeButton: false }).setHTML(`
            <div style="font-family:sans-serif;color:#0f172a;padding:4px;min-width:150px;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px;">
                <span style="font-weight:800;font-size:14px;">Unidad ${veh.callsign}</span>
                <span style="font-size:9px;font-weight:800;background:${isAvail ? '#dcfce7' : '#fee2e2'};color:${isAvail ? '#15803d' : '#b91c1c'};padding:2px 6px;border-radius:4px;">${veh.status}</span>
              </div>
              <div style="font-size:11px;color:#64748b;margin-bottom:4px;">Nivel: <strong>${veh.capabilityLevel}</strong></div>
              <div style="font-size:10px;color:#94a3b8;">Velocidad: ${veh.location.speedKmh ?? 0} km/h</div>
            </div>
          `);

          el.onclick = () => onSelectEntity({ type: 'vehicle', id: veh.id });

          const marker = new Marker({ element: el, anchor: 'center' })
            .setLngLat([veh.location.lng, veh.location.lat])
            .setPopup(popup)
            .addTo(map);

          markersRef.current.push(marker);
        });
      }

      // 3. Incidentes Activos
      if (showIncidents) {
        incidents.forEach((inc) => {
          const isSelected = selectedEntity?.type === 'incident' && selectedEntity?.id === inc.id;
          const isP1 = inc.priority === 'P1';

          const el = document.createElement('div');
          el.className = 'cursor-pointer';
          el.innerHTML = `
            <div style="position:relative;width:${isSelected ? '36px' : '30px'};height:${isSelected ? '36px' : '30px'};display:flex;align-items:center;justify-content:center;">
              <span style="position:absolute;inset:0;border-radius:50%;background:var(--emergency);opacity:0.35;animation:dispatch-pulse 1.4s cubic-bezier(0, 0, 0.2, 1) infinite;"></span>
              <div style="width:${isSelected ? '26px' : '22px'};height:${isSelected ? '26px' : '22px'};border-radius:50%;background:var(--emergency);border:2px solid #ffffff;box-shadow:0 3px 10px rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;">
                <span style="color:#ffffff;font-size:10px;font-weight:900;">!</span>
              </div>
              <div style="position:absolute;top:-18px;white-space:nowrap;font-size:9px;font-weight:800;background:var(--emergency);color:#ffffff;padding:1px 5px;border-radius:3px;box-shadow:0 2px 4px rgba(0,0,0,0.3);">
                ${inc.priority || 'EMG'} · ${inc.code}
              </div>
            </div>
          `;

          const popup = new Popup({ offset: 16, closeButton: false, maxWidth: '240px' }).setHTML(`
            <div style="font-family:sans-serif;color:#0f172a;padding:4px;min-width:170px;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px;">
                <span style="font-weight:800;font-size:13px;color:#e11d48;">Incidente ${inc.code}</span>
                <span style="font-size:9px;font-weight:800;background:#ffe4e6;color:#9f1239;padding:2px 5px;border-radius:4px;">${inc.priority || 'P2'}</span>
              </div>
              <div style="font-size:12px;font-weight:600;margin-bottom:2px;">${inc.type}</div>
              <div style="font-size:11px;color:#64748b;margin-bottom:4px;">${inc.address || 'Ubicación GPS'}</div>
              <div style="font-size:10px;color:#0369a1;font-weight:600;">Estado: ${inc.status}</div>
            </div>
          `);

          el.onclick = () => onSelectEntity({ type: 'incident', id: inc.id });

          const marker = new Marker({ element: el, anchor: 'center' })
            .setLngLat([inc.lng, inc.lat])
            .setPopup(popup)
            .addTo(map);

          markersRef.current.push(marker);
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    ready,
    vehicles,
    incidents,
    facilities,
    selectedEntity,
    showVehicles,
    showIncidents,
    showFacilities,
    onSelectEntity,
  ]);

  // Centrar mapa si se selecciona una entidad
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !selectedEntity) return;

    let targetCoords: [number, number] | null = null;
    if (selectedEntity.type === 'vehicle') {
      const v = vehicles.find((x) => x.id === selectedEntity.id);
      if (v?.location) targetCoords = [v.location.lng, v.location.lat];
    } else if (selectedEntity.type === 'incident') {
      const i = incidents.find((x) => x.id === selectedEntity.id);
      if (i) targetCoords = [i.lng, i.lat];
    } else if (selectedEntity.type === 'facility') {
      const f = facilities.find((x) => x.id === selectedEntity.id);
      if (f) targetCoords = [f.lng, f.lat];
    }

    if (targetCoords) {
      map.flyTo({ center: targetCoords, zoom: 14, speed: 1.2 });
    }
  }, [selectedEntity, ready, vehicles, incidents, facilities]);

  return (
    <div className="relative w-full h-full min-h-[420px] rounded-2xl overflow-hidden border border-edge-strong shadow-inner">
      {/* Contenedor del mapa */}
      <div ref={containerRef} className="w-full h-full" />

      {/* Barra de Filtros Flotante */}
      <div className="absolute top-3 left-3 z-10 flex flex-wrap gap-2 bg-surface-base/90 backdrop-blur-md p-2 rounded-xl border border-edge-subtle shadow-md text-xs">
        <button
          type="button"
          onClick={() => setShowVehicles((v) => !v)}
          aria-pressed={showVehicles}
          className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
            showVehicles
              ? 'bg-ok/20 text-ok border border-ok/40'
              : 'bg-surface-pressed/40 text-content-muted border border-transparent'
          }`}
        >
          <span className={`w-2 h-2 rounded-full ${showVehicles ? 'bg-ok' : 'bg-content-muted'}`} />
          Ambulancias ({vehicles.length})
        </button>

        <button
          type="button"
          onClick={() => setShowIncidents((v) => !v)}
          aria-pressed={showIncidents}
          className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
            showIncidents
              ? 'bg-emergency/20 text-emergency border border-emergency/40'
              : 'bg-surface-pressed/40 text-content-muted border border-transparent'
          }`}
        >
          <span className={`w-2 h-2 rounded-full ${showIncidents ? 'bg-emergency' : 'bg-content-muted'}`} />
          Emergencias ({incidents.length})
        </button>

        <button
          type="button"
          onClick={() => setShowFacilities((v) => !v)}
          aria-pressed={showFacilities}
          className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
            showFacilities
              ? 'bg-info/20 text-info border border-info/40'
              : 'bg-surface-pressed/40 text-content-muted border border-transparent'
          }`}
        >
          <span className={`w-2 h-2 rounded-full ${showFacilities ? 'bg-info' : 'bg-content-muted'}`} />
          Hospitales ({facilities.length})
        </button>
      </div>

      {/* Indicador de coordenadas o ciudad */}
      <div className="absolute bottom-3 left-3 z-10 hidden sm:block bg-surface-base/80 backdrop-blur-sm px-2.5 py-1 rounded-md border border-edge-subtle text-[10px] text-content-muted font-mono">
        Cartagena de Indias D.T. y C. · Cuadrante de Monitoreo
      </div>
    </div>
  );
}
