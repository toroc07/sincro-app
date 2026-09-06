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
        return 'bg-emergency/20 text-emergency border-emergency/40';
      case 'P2':
        return 'bg-warn/20 text-warn border-warn/40';
      case 'P3':
        return 'bg-ok/20 text-ok border-ok/40';
      default:
        return 'bg-info/20 text-info border-info/40';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'OPEN':
      case 'ASSIGNING':
        return 'bg-warn/10 text-warn border-warn/20';
      case 'ASSIGNED':
      case 'EN_ROUTE':
        return 'bg-info/10 text-info border-info/20';
      case 'ON_SCENE':
      case 'TRANSPORTING':
        return 'bg-info/10 text-info border-info/20';
      default:
        return 'bg-surface-overlay text-content-secondary border-edge-strong';
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden animate-fade-up">
      <div className="p-3.5 border-b border-edge-strong flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-content flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emergency animate-pulse" />
            Emergencias en Curso
          </h3>
          <p className="text-[11px] text-content-muted">
            Incidentes activos reportados en el distrito
          </p>
        </div>
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emergency/10 text-emergency border border-emergency/20 tnum">
          {incidents.length} activas
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2.5 custom-scrollbar">
        {incidents.map((inc, i) => {
          const isSelected = selectedId === inc.id;
          const minsAgo = Math.floor((Date.now() - inc.createdAt) / 60000);

          return (
            <div
              key={inc.id}
              onClick={() => onSelect(inc.id)}
              className={`p-3 rounded-xl border transition-all cursor-pointer list-in ${
                isSelected
                  ? 'bg-emergency/10 border-emergency/50 shadow-md shadow-emergency/10'
                  : 'bg-surface-raised/60 border-edge-strong hover:border-emergency/30 hover:bg-surface-raised'
              }`}
              style={{ animationDelay: `${Math.min(i * 35, 300)}ms` }}
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
                    <h4 className="text-xs font-bold text-content leading-tight">
                      {inc.type}
                    </h4>
                    <span className="text-[10px] font-mono text-content-muted tnum">
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
                <div className="text-[11px] text-content-secondary flex items-center gap-1.5 mt-1">
                  <svg className="w-3.5 h-3.5 shrink-0 text-content-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="truncate">{inc.address}</span>
                </div>
              )}

              <div className="mt-2.5 pt-2 border-t border-edge-subtle flex items-center justify-between text-[10px] text-content-muted">
                <span>Hace {minsAgo > 0 ? `${minsAgo} min` : 'un momento'}</span>
                <span className="text-emergency font-medium hover:underline flex items-center gap-1">
                  Enfocar en mapa &rarr;
                </span>
              </div>
            </div>
          );
        })}

        {incidents.length === 0 && (
          <div className="text-center py-10 text-xs text-content-muted list-in">
            <div className="w-8 h-8 rounded-full bg-ok/10 text-ok mx-auto flex items-center justify-center mb-2">
              ✓
            </div>
            Sin emergencias críticas pendientes en este momento.
          </div>
        )}
      </div>
    </div>
  );
}
