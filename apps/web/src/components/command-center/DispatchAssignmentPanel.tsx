'use client';

import type { DispatchCandidate, Incident } from '@dispatch/contracts';
import { useEffect, useState } from 'react';
import { AmbulanceIcon, CheckIcon, LocationIcon } from '@/src/components/ui/icons';

interface CandidatePayload { candidates: DispatchCandidate[]; excluded: DispatchCandidate[]; assignment: { id: string; vehicleId: string; status: string } | null }
interface ReportMedia { transcript: string | null; audioBase64: string | null; mimeType: string | null }

const TYPE_LABELS: Record<string, string> = {
  TRAFFIC_ACCIDENT: 'Accidente de tránsito', CARDIAC: 'Emergencia cardíaca', UNCONSCIOUS: 'Persona inconsciente',
  FALL: 'Caída o lesión', RESPIRATORY: 'Dificultad para respirar', OBSTETRIC: 'Emergencia obstétrica', OTHER: 'Otra emergencia', TRAUMA: 'Trauma',
};

export function DispatchAssignmentPanel({ incident, transcript, onAssigned, onBack }: {
  incident: Incident; transcript?: string | null; onAssigned: () => void; onBack: () => void;
}) {
  const [payload, setPayload] = useState<CandidatePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [media, setMedia] = useState<ReportMedia | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setPayload(null); setMessage(null);
    fetch(`/api/incidents/${encodeURIComponent(incident.id)}/candidates`, { cache: 'no-store' })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error?.message ?? 'No se pudieron cargar las ambulancias cercanas.');
        return data as CandidatePayload;
      })
      .then((data) => { if (!cancelled) setPayload(data); })
      .catch((error: unknown) => { if (!cancelled) setMessage(error instanceof Error ? error.message : 'Error de conexión.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [incident.id]);

  useEffect(() => {
    let cancelled = false;
    setMedia(null);
    fetch(`/api/incidents/${encodeURIComponent(incident.id)}/reports`, { cache: 'no-store' })
      .then((res) => res.ok ? res.json() as Promise<ReportMedia> : null)
      .then((data) => { if (!cancelled && data) setMedia(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [incident.id]);

  const assign = async (vehicleId: string) => {
    setBusyId(vehicleId); setMessage(null);
    try {
      const res = await fetch(`/api/incidents/${encodeURIComponent(incident.id)}/dispatch`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'AUTO_ASSIGN', overrideVehicleId: vehicleId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? 'No se pudo enviar la unidad.');
      setPayload((current) => current ? { ...current, assignment: data.assignment } : current);
      onAssigned();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo enviar la unidad.');
    } finally { setBusyId(null); }
  };

  const alreadyAssigned = payload?.assignment !== null && payload?.assignment !== undefined;
  return (
    <section className="flex h-full min-h-0 flex-col" aria-label="Despacho de ambulancia">
      <header className="flex items-start justify-between gap-2 border-b border-edge-strong p-4">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[.16em] text-emergency">Asignación de unidad</p>
          <h3 className="mt-1 truncate text-sm font-bold text-content">{TYPE_LABELS[incident.type] ?? 'Emergencia'} · {incident.code}</h3>
          <p className="mt-1 flex items-center gap-1 text-xs text-content-secondary"><LocationIcon size={13} />{incident.address ?? 'Ubicación marcada en el mapa'}</p>
        </div>
        <button type="button" onClick={onBack} className="min-h-10 rounded-lg px-3 text-xs font-semibold text-content-secondary hover:bg-surface-overlay">Reportes</button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-3 custom-scrollbar">
        {(transcript || media?.transcript) ? <blockquote className="mb-3 rounded-xl border-l-4 border-emergency bg-emergency-soft p-3 text-sm leading-relaxed text-content"><p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-emergency">Transcripción del audio</p>“{media?.transcript || transcript}”</blockquote> : <div className="mb-3 rounded-xl border border-edge-subtle bg-surface-raised p-3 text-sm text-content-secondary"><p className="font-semibold text-content">{media?.audioBase64 ? 'No se pudo generar la transcripción automática.' : 'Este reporte no tiene transcripción disponible.'}</p><p className="mt-1 text-xs">{media?.audioBase64 ? 'Escucha el audio original para conocer lo ocurrido.' : 'Confirma los detalles con quien reportó antes de asignar la unidad.'}</p></div>}
        {media?.audioBase64 && <audio className="mb-3 w-full" controls preload="none" aria-label="Audio original del reporte" src={`data:${media.mimeType || 'audio/webm'};base64,${media.audioBase64}`} />}
        <p className="mb-3 text-xs text-content-secondary">{alreadyAssigned ? 'Unidad enviada al reporte.' : 'Unidades disponibles, ordenadas por cercanía aproximada.'}</p>
        {loading && <p className="rounded-xl bg-surface-raised p-4 text-sm text-content-secondary">Buscando unidades cercanas…</p>}
        {!loading && payload?.candidates.map((candidate, index) => (
          <article key={candidate.vehicleId} className="mb-2 rounded-xl border border-edge-subtle bg-surface-raised p-3">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-overlay text-content"><AmbulanceIcon size={21} /></span>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-content">Ambulancia {candidate.callsign}{index === 0 && <span className="ml-2 rounded-full bg-ok-soft px-2 py-0.5 text-[10px] text-ok">Más cercana</span>}</p>
                <p className="mt-0.5 text-xs text-content-secondary">{(candidate.distanceM / 1000).toFixed(1)} km · ETA aprox. {Math.max(1, Math.round(candidate.etaSeconds / 60))} min · {candidate.explanation}</p>
              </div>
            </div>
            <button type="button" disabled={Boolean(busyId) || alreadyAssigned} onClick={() => void assign(candidate.vehicleId)}
              className="mt-3 min-h-11 w-full rounded-lg bg-emergency px-3 text-sm font-bold text-on-emergency transition hover:bg-emergency-hover disabled:cursor-not-allowed disabled:opacity-55">
              {busyId === candidate.vehicleId ? 'Enviando…' : alreadyAssigned
                ? candidate.vehicleId === payload?.assignment?.vehicleId
                  ? <span className="inline-flex items-center gap-1.5"><CheckIcon size={15} /> Unidad enviada</span>
                  : 'Ya hay una unidad asignada'
                : `Enviar unidad ${candidate.callsign}`}
            </button>
          </article>
        ))}
        {!loading && !payload?.candidates.length && <p className="rounded-xl border border-warn/30 bg-warn-soft p-4 text-sm text-warn">No hay ambulancias disponibles en este momento.</p>}
        {message && <p role="alert" className="mt-3 rounded-xl bg-emergency-soft p-3 text-sm text-emergency">{message}</p>}
        {payload?.excluded?.length ? <p className="mt-3 text-[11px] text-content-muted">{payload.excluded.length} unidad(es) ocupada(s) o no disponibles.</p> : null}
      </div>
    </section>
  );
}
