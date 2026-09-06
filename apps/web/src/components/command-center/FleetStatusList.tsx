import type { VehicleWithLocation } from '@dispatch/contracts';

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
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'ASSIGNED':
      case 'EN_ROUTE':
      case 'ON_SCENE':
      case 'TRANSPORTING':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
      case 'RESERVED':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      default:
        return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="p-3.5 border-b border-[#1b263b] flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            Flota de Ambulancias Distrital
          </h3>
          <p className="text-[11px] text-[#7286a5]">
            Unidades georreferenciadas en servicio
          </p>
        </div>
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          {vehicles.length} móviles
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2.5 custom-scrollbar">
        {vehicles.map((veh) => {
          const isSelected = selectedId === veh.id;
          const isAvail = veh.status === 'AVAILABLE';

          return (
            <div
              key={veh.id}
              onClick={() => onSelect(veh.id)}
              className={`p-3 rounded-xl border transition-all cursor-pointer ${
                isSelected
                  ? 'bg-emerald-500/10 border-emerald-500/50 shadow-md shadow-emerald-500/10'
                  : 'bg-[#0f1626]/60 border-[#1b263b] hover:border-emerald-500/30 hover:bg-[#0f1626]'
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center font-black text-xs border ${
                      isAvail
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                        : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                    }`}
                  >
                    {veh.callsign}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white leading-tight">
                      Ambulancia {veh.callsign}
                    </h4>
                    <span className="text-[10px] text-[#aebbd4]">
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
              <div className="flex items-center gap-3 mt-2 text-[10px] text-[#7286a5]">
                <span>Velocidad: <strong className="text-slate-300">{veh.location?.speedKmh ?? 0} km/h</strong></span>
                <span>•</span>
                <span>GPS: <strong className="text-slate-300">{veh.isStale ? 'Atenuado' : 'Tiempo real'}</strong></span>
              </div>

              <div className="mt-2.5 pt-2 border-t border-white/5 flex items-center justify-between text-[10px] text-[#7286a5]">
                <span>Zona: Bahía / Cartagena</span>
                <span className="text-emerald-400 font-medium hover:underline flex items-center gap-1">
                  Localizar unidad &rarr;
                </span>
              </div>
            </div>
          );
        })}

        {vehicles.length === 0 && (
          <div className="text-center py-8 text-xs text-[#7286a5]">
            No hay vehículos activos registrados en la red.
          </div>
        )}
      </div>
    </div>
  );
}
