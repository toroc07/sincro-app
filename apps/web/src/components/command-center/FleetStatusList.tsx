import type { VehicleWithLocation } from '@dispatch/contracts';
import { ArrowRightIcon } from '@/src/components/ui/icons';

interface FleetStatusListProps {
  vehicles: VehicleWithLocation[];
  selectedId: string | null;
  onSelect: (vehicleId: string) => void;
}

export function FleetStatusList({
  vehicles,
  selectedId,
  onSelect,
}: FleetStatusListProps) {
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'AVAILABLE':
        return 'bg-ok/10 text-ok border-ok/20';
      case 'ASSIGNED':
      case 'EN_ROUTE':
      case 'ON_SCENE':
      case 'TRANSPORTING':
        return 'bg-emergency/10 text-emergency border-emergency/20';
      case 'RESERVED':
        return 'bg-warn/10 text-warn border-warn/20';
      default:
        return 'bg-surface-overlay text-content-secondary border-edge-strong';
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden animate-fade-up">
      <div className="p-3.5 border-b border-edge-strong flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-content flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-ok animate-pulse" />
            Flota de Ambulancias Distrital
          </h3>
          <p className="text-[11px] text-content-muted">
            Unidades georreferenciadas en servicio
          </p>
        </div>
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-ok/10 text-ok border border-ok/20 tnum">
          {vehicles.length} móviles
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2.5 custom-scrollbar">
        {vehicles.map((veh, i) => {
          const isSelected = selectedId === veh.id;
          const isAvail = veh.status === 'AVAILABLE';

          return (
            <button
              key={veh.id}
              type="button"
              onClick={() => onSelect(veh.id)}
              aria-pressed={isSelected}
              className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer list-in ${
                isSelected
                  ? 'bg-ok/10 border-ok/50 shadow-md shadow-ok/10'
                  : 'bg-surface-raised/60 border-edge-strong hover:border-ok/30 hover:bg-surface-raised'
              }`}
              style={{ animationDelay: `${Math.min(i * 35, 300)}ms` }}
            >
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center font-black text-xs border shrink-0 ${
                      isAvail
                        ? 'bg-ok/20 text-ok border-ok/30'
                        : 'bg-emergency/20 text-emergency border-emergency/30'
                    }`}
                  >
                    {veh.callsign}
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs font-bold text-content leading-tight truncate">
                      Ambulancia {veh.callsign}
                    </h4>
                    <span className="text-[10px] text-content-secondary">
                      {veh.capabilityLevel}
                    </span>
                  </div>
                </div>

                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded border uppercase tracking-wider shrink-0 ${getStatusBadge(
                    veh.status,
                  )}`}
                >
                  {veh.status}
                </span>
              </div>

              {/* Telemetría básica */}
              <div className="flex items-center gap-3 mt-2 text-[10px] text-content-muted">
                <span>Velocidad: <strong className="text-content-secondary tnum">{veh.location?.speedKmh ?? 0} km/h</strong></span>
                <span className="w-1 h-1 rounded-full bg-edge-strong" aria-hidden="true" />
                <span>{veh.isStale
                  ? <span className="text-warn">GPS: <strong>Atenuado</strong></span>
                  : <span className="text-ok">GPS: <strong>Tiempo real</strong></span>}
                </span>
              </div>

              <div className="mt-2.5 pt-2 border-t border-edge-subtle flex items-center justify-between text-[10px] text-content-muted">
                <span>Zona: Bahía / Cartagena</span>
                <span className="text-ok font-medium hover:underline flex items-center gap-1">
                  Localizar unidad <ArrowRightIcon size={11} />
                </span>
              </div>
            </button>
          );
        })}

        {vehicles.length === 0 && (
          <div className="text-center py-8 text-xs text-content-muted list-in">
            No hay vehículos activos registrados en la red.
          </div>
        )}
      </div>
    </div>
  );
}
