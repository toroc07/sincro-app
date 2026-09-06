'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { Facility, Incident, VehicleWithLocation } from '@dispatch/contracts';
import { CommandCenterMap } from '@/src/components/command-center/CommandCenterMap';
import { MetricCard } from '@/src/components/command-center/MetricCard';
import { HospitalStatusList } from '@/src/components/command-center/HospitalStatusList';
import { ActiveIncidentsList } from '@/src/components/command-center/ActiveIncidentsList';
import { FleetStatusList } from '@/src/components/command-center/FleetStatusList';

interface OverviewData {
  metrics: {
    totalVehicles: number;
    availableVehicles: number;
    busyVehicles: number;
    offlineVehicles: number;
    activeIncidents: number;
    criticalIncidents: number;
    hospitalsCount: number;
    totalFacilities: number;
  };
  vehicles: VehicleWithLocation[];
  incidents: Incident[];
  facilities: Facility[];
  timestamp: number;
}

type SideTab = 'incidents' | 'fleet' | 'hospitals';

export default function CommandCenterPage() {
  const router = useRouter();
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SideTab>('incidents');
  const [selectedEntity, setSelectedEntity] = useState<{
    type: 'vehicle' | 'incident' | 'facility';
    id: string;
  } | null>(null);

  // Verificar sesión y cargar datos de resumen
  const fetchOverview = useCallback(async () => {
    try {
      // 1. Verificar sesión primero
      const authRes = await fetch('/api/command-center/auth/me');
      if (!authRes.ok) {
        router.replace('/command-center/login');
        return;
      }

      // 2. Cargar datos del centro de mando
      const res = await fetch('/api/command-center/overview', { cache: 'no-store' });
      if (!res.ok) throw new Error('Error al cargar datos del centro de mando');
      const json: OverviewData = await res.json();
      setData(json);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchOverview();
    // Refresco periódico cada 5 segundos para mantener la telemetría viva
    const interval = setInterval(fetchOverview, 5000);
    return () => clearInterval(interval);
  }, [fetchOverview]);

  // Conexión SSE adicional para eventos en tiempo real
  useEffect(() => {
    const es = new EventSource('/api/stream?topics=incidents,vehicles');
    es.onmessage = () => {
      // Al recibir cualquier evento del bus de despacho, refrescar datos
      fetchOverview();
    };
    return () => {
      es.close();
    };
  }, [fetchOverview]);

  if (loading && !data) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <div className="w-12 h-12 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center mb-4">
          <svg className="animate-spin h-6 w-6 text-sky-400" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        </div>
        <h2 className="text-lg font-bold text-white mb-1">Iniciando Centro de Mando Distrital</h2>
        <p className="text-xs text-[#7286a5]">Sincronizando telemetría de ambulancias y red hospitalaria...</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <div className="p-4 rounded-2xl bg-red-950/40 border border-red-500/30 max-w-md">
          <h2 className="text-sm font-bold text-red-300 mb-1">Error de enlace operativo</h2>
          <p className="text-xs text-red-400/80 mb-4">{error}</p>
          <button
            onClick={() => fetchOverview()}
            className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold"
          >
            Reintentar enlace
          </button>
        </div>
      </div>
    );
  }

  const metrics = data?.metrics ?? {
    totalVehicles: 0,
    availableVehicles: 0,
    busyVehicles: 0,
    offlineVehicles: 0,
    activeIncidents: 0,
    criticalIncidents: 0,
    hospitalsCount: 0,
    totalFacilities: 0,
  };

  return (
    <div className="flex-1 flex flex-col p-3 sm:p-4 lg:p-6 gap-4 overflow-hidden max-w-[1920px] w-full mx-auto">
      {/* ── BARRA SUPERIOR DE MÉTRICAS EJECUTIVAS (KPIS) ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 shrink-0">
        <MetricCard
          label="Flota de Ambulancias"
          value={metrics.totalVehicles}
          subtext="Unidades en red distrital"
          variant="sky"
          trend="Total"
          icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          }
        />

        <MetricCard
          label="Ambulancias Disponibles"
          value={metrics.availableVehicles}
          subtext="Listas para despacho inmediato"
          variant="emerald"
          trend="En guardia"
          icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          }
        />

        <MetricCard
          label="Unidades en Misión"
          value={metrics.busyVehicles}
          subtext="En ruta, escena o traslado"
          variant="amber"
          trend="Ocupadas"
          icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />

        <MetricCard
          label="Emergencias Activas"
          value={metrics.activeIncidents}
          subtext="Incidentes en curso en la ciudad"
          variant="rose"
          trend="Reportadas"
          icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          }
        />

        <MetricCard
          label="Casos Críticos (P1)"
          value={metrics.criticalIncidents}
          subtext="Prioridad vital con soporte ALS"
          variant="rose"
          trend="P1 Rojo"
          icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
          }
        />

        <MetricCard
          label="Red Hospitalaria"
          value={metrics.hospitalsCount}
          subtext="Hospitales y centros de trauma"
          variant="indigo"
          trend="Receptores"
          icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          }
        />
      </div>

      {/* ── CUERPO PRINCIPAL: MAPA EN VIVO + PANEL LATERAL OPERATIVO ── */}
      <div className="flex-1 flex flex-col lg:flex-row gap-4 overflow-hidden min-h-[500px]">
        {/* Lado Izquierdo: Mapa de Monitoreo Georreferenciado */}
        <div className="flex-1 flex flex-col h-full min-h-[400px]">
          <CommandCenterMap
            vehicles={data?.vehicles ?? []}
            incidents={data?.incidents ?? []}
            facilities={data?.facilities ?? []}
            selectedEntity={selectedEntity}
            onSelectEntity={setSelectedEntity}
          />
        </div>

        {/* Lado Derecho: Pestañas Operativas del Centro de Mando */}
        <div className="w-full lg:w-[420px] xl:w-[460px] flex flex-col bg-[#0c1220] rounded-2xl border border-[#1b263b] overflow-hidden shrink-0 shadow-xl">
          {/* Navegación de pestañas */}
          <div className="flex border-b border-[#1b263b] bg-[#090e1a] p-1.5 gap-1 shrink-0">
            <button
              onClick={() => setActiveTab('incidents')}
              className={`flex-1 py-2 px-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'incidents'
                  ? 'bg-[#16203a] text-rose-400 shadow-sm border border-white/10'
                  : 'text-[#7286a5] hover:text-[#aebbd4]'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${activeTab === 'incidents' ? 'bg-rose-400' : 'bg-slate-600'}`} />
              <span>Emergencias</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-rose-500/10 text-rose-300 font-mono">
                {data?.incidents.length ?? 0}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('fleet')}
              className={`flex-1 py-2 px-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'fleet'
                  ? 'bg-[#16203a] text-emerald-400 shadow-sm border border-white/10'
                  : 'text-[#7286a5] hover:text-[#aebbd4]'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${activeTab === 'fleet' ? 'bg-emerald-400' : 'bg-slate-600'}`} />
              <span>Ambulancias</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-500/10 text-emerald-300 font-mono">
                {data?.vehicles.length ?? 0}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('hospitals')}
              className={`flex-1 py-2 px-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'hospitals'
                  ? 'bg-[#16203a] text-sky-400 shadow-sm border border-white/10'
                  : 'text-[#7286a5] hover:text-[#aebbd4]'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${activeTab === 'hospitals' ? 'bg-sky-400' : 'bg-slate-600'}`} />
              <span>Hospitales</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-sky-500/10 text-sky-300 font-mono">
                {data?.facilities.filter((f) => f.type !== 'BASE').length ?? 0}
              </span>
            </button>
          </div>

          {/* Contenido de la pestaña activa */}
          <div className="flex-1 overflow-hidden">
            {activeTab === 'incidents' && (
              <ActiveIncidentsList
                incidents={data?.incidents ?? []}
                selectedId={selectedEntity?.type === 'incident' ? selectedEntity.id : null}
                onSelect={(id) => setSelectedEntity({ type: 'incident', id })}
              />
            )}

            {activeTab === 'fleet' && (
              <FleetStatusList
                vehicles={data?.vehicles ?? []}
                selectedId={selectedEntity?.type === 'vehicle' ? selectedEntity.id : null}
                onSelect={(id) => setSelectedEntity({ type: 'vehicle', id })}
              />
            )}

            {activeTab === 'hospitals' && (
              <HospitalStatusList
                facilities={data?.facilities ?? []}
                selectedId={selectedEntity?.type === 'facility' ? selectedEntity.id : null}
                onSelect={(id) => setSelectedEntity({ type: 'facility', id })}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
