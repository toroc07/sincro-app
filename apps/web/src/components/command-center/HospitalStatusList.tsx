import type { Facility } from '@dispatch/contracts';

interface HospitalStatusListProps {
  facilities: Facility[];
  selectedId: string | null;
  onSelect: (facilityId: string) => void;
}

export function HospitalStatusList({
  facilities,
  selectedId,
  onSelect,
}: HospitalStatusListProps) {
  const hospitals = facilities.filter(
    (f) => f.type === 'HOSPITAL' || f.type === 'TRAUMA_CENTER',
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="p-3.5 border-b border-[#1b263b] flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-sky-400" />
            Red Hospitalaria y Centros de Trauma
          </h3>
          <p className="text-[11px] text-[#7286a5]">
            Nodos receptores de urgencias distritales
          </p>
        </div>
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20">
          {hospitals.length} centros
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2.5 custom-scrollbar">
        {hospitals.map((hosp) => {
          const isSelected = selectedId === hosp.id;
          const isTrauma = hosp.type === 'TRAUMA_CENTER';

          return (
            <div
              key={hosp.id}
              onClick={() => onSelect(hosp.id)}
              className={`p-3 rounded-xl border transition-all cursor-pointer ${
                isSelected
                  ? 'bg-sky-500/10 border-sky-500/50 shadow-md shadow-sky-500/10'
                  : 'bg-[#0f1626]/60 border-[#1b263b] hover:border-sky-500/30 hover:bg-[#0f1626]'
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${
                      isTrauma ? 'bg-indigo-500/20 text-indigo-400' : 'bg-sky-500/20 text-sky-400'
                    }`}
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m-8-8h16" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white leading-tight">
                      {hosp.name}
                    </h4>
                    <span className="text-[10px] text-[#aebbd4]">
                      {isTrauma ? 'Centro de Trauma Nivel III/IV' : 'Hospital Distrital Nivel II'}
                    </span>
                  </div>
                </div>

                <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                  RECEPTOR ACTIVO
                </span>
              </div>

              {/* Capacidades clínicas */}
              <div className="flex flex-wrap gap-1 mt-2">
                {hosp.capabilities.map((cap) => (
                  <span
                    key={cap}
                    className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-[#16203a] text-[#aebbd4] border border-white/5"
                  >
                    {cap}
                  </span>
                ))}
              </div>

              <div className="mt-2.5 pt-2 border-t border-white/5 flex items-center justify-between text-[10px] text-[#7286a5]">
                <span>Ubicación: Bahía / Cartagena</span>
                <span className="text-sky-400 font-medium hover:underline flex items-center gap-1">
                  Ubicar en mapa &rarr;
                </span>
              </div>
            </div>
          );
        })}

        {hospitals.length === 0 && (
          <div className="text-center py-8 text-xs text-[#7286a5]">
            No hay hospitales registrados en el sistema.
          </div>
        )}
      </div>
    </div>
  );
}
