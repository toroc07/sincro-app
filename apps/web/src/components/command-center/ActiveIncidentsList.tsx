import type { Incident } from '@dispatch/contracts';

interface ActiveIncidentsListProps {
  incidents: Incident[];
  selectedId: string | null;
  onSelect: (incidentId: string) => void;
}

export function ActiveIncidentsList({
  incidents,
  selectedId,
  onSelect,
}: ActiveIncidentsListProps) {
  const getPriorityBadge = (priority?: string | null) => {
    switch (priority) {
      case 'P1':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
      case 'P2':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      case 'P3':
        return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40';
      default:
        return 'bg-sky-500/20 text-sky-300 border-sky-500/40';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'OPEN':
      case 'ASSIGNING':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'ASSIGNED':
      case 'EN_ROUTE':
        return 'bg-sky-500/10 text-sky-400 border-sky-500/20';
      case 'ON_SCENE':
      case 'TRANSPORTING':
        return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
      default:
        return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="p-3.5 border-b border-[#1b263b] flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
            Emergencias en Curso
          </h3>
          <p className="text-[11px] text-[#7286a5]">
            Incidentes activos reportados en el distrito
          </p>
        </div>
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">
          {incidents.length} activas
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2.5 custom-scrollbar">
        {incidents.map((inc) => {
          const isSelected = selectedId === inc.id;
          const minsAgo = Math.floor((Date.now() - inc.createdAt) / 60000);

          return (
            <div
              key={inc.id}
              onClick={() => onSelect(inc.id)}
              className={`p-3 rounded-xl border transition-all cursor-pointer ${
                isSelected
                  ? 'bg-rose-500/10 border-rose-500/50 shadow-md shadow-rose-500/10'
                  : 'bg-[#0f1626]/60 border-[#1b263b] hover:border-rose-500/30 hover:bg-[#0f1626]'
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] font-black px-1.5 py-0.5 rounded border ${getPriorityBadge(
                      inc.priority,
                    )}`}
                  >
                    {inc.priority || 'P2'}
                  </span>
                  <div>
                    <h4 className="text-xs font-bold text-white leading-tight">
                      {inc.type}
                    </h4>
                    <span className="text-[10px] font-mono text-slate-400">
                      Código: {inc.code}
                    </span>
                  </div>
                </div>

                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded border uppercase tracking-wider shrink-0 ${getStatusBadge(
                    inc.status,
                  )}`}
                >
                  {inc.status}
                </span>
              </div>

              {inc.address && (
                <div className="text-[11px] text-[#aebbd4] flex items-center gap-1.5 mt-1">
                  <svg className="w-3.5 h-3.5 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="truncate">{inc.address}</span>
                </div>
              )}

              <div className="mt-2.5 pt-2 border-t border-white/5 flex items-center justify-between text-[10px] text-[#7286a5]">
                <span>Hace {minsAgo > 0 ? `${minsAgo} min` : 'un momento'}</span>
                <span className="text-rose-400 font-medium hover:underline flex items-center gap-1">
                  Enfocar en mapa &rarr;
                </span>
              </div>
            </div>
          );
        })}

        {incidents.length === 0 && (
          <div className="text-center py-10 text-xs text-[#7286a5]">
            <div className="w-8 h-8 rounded-full bg-emerald-500/10 text-emerald-400 mx-auto flex items-center justify-center mb-2">
              ✓
            </div>
            Sin emergencias críticas pendientes en este momento.
          </div>
        )}
      </div>
    </div>
  );
}
