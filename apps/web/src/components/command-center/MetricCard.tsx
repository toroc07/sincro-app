import React, { useEffect, useRef, useState } from 'react';

interface MetricCardProps {
  label: string;
  value: number | string;
  subtext?: string;
  trend?: string;
  variant?: 'emerald' | 'rose' | 'amber' | 'sky' | 'indigo';
  icon?: React.ReactNode;
  index?: number;
}

/** Anima un número de su valor previo al nuevo (tween sin librerías).
 *  El ancho nunca baila porque el número se pinta en el mismo slot. */
function useAnimatedNumber(value: number) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;
    const start = performance.now();
    const duration = 550;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cúbico
      setDisplay(Math.round(from + (to - from) * eased));
      if (t < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [value]);

  // Cuando termina la animación, actualizar el origen para el siguiente cambio.
  useEffect(() => {
    fromRef.current = value;
  }, [value]);

  return display;
}

const VARIANT_STYLES: Record<string, { tint: string; accent: string; badge: string }> = {
  emerald: { tint: 'ok', accent: 'text-ok', badge: 'border border-ok/20 bg-ok/10' },
  rose: { tint: 'emergency', accent: 'text-emergency', badge: 'border border-emergency/20 bg-emergency/10' },
  amber: { tint: 'warn', accent: 'text-warn', badge: 'border border-warn/20 bg-warn/10' },
  sky: { tint: 'info', accent: 'text-info', badge: 'border border-info/20 bg-info/10' },
  indigo: { tint: 'info', accent: 'text-info', badge: 'border border-info/20 bg-info/10' },
};

export function MetricCard({
  label,
  value,
  subtext,
  trend,
  variant = 'sky',
  icon,
  index = 0,
}: MetricCardProps) {
  const styles = VARIANT_STYLES[variant] ?? VARIANT_STYLES.sky;
  const isNumeric = typeof value === 'number' && Number.isFinite(value);
  const animated = isNumeric ? useAnimatedNumber(value) : null;
  const shown = isNumeric ? animated : value;

  return (
    <div
      className={`bg-surface-raised/80 backdrop-blur-sm rounded-xl p-4 border transition-all duration-200 hover:shadow-lg flex flex-col justify-between animate-fade-up ${
        variant === 'emerald'
          ? 'border-ok/20 hover:border-ok/40'
          : variant === 'rose'
            ? 'border-emergency/20 hover:border-emergency/40'
            : variant === 'amber'
              ? 'border-warn/20 hover:border-warn/40'
              : 'border-info/20 hover:border-info/40'
      }`}
      style={{ animationDelay: `${Math.min(index * 45, 220)}ms` }}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-content-secondary tracking-wide uppercase">
          {label}
        </span>
        {icon && (
          <div className={`w-7 h-7 rounded-lg ${styles.tint === 'ok' ? 'bg-ok/10' : styles.tint === 'emergency' ? 'bg-emergency/10' : 'bg-info/10'} ${styles.accent} flex items-center justify-center shrink-0`}>
            {icon}
          </div>
        )}
      </div>

      <div className="flex items-baseline gap-2">
        <span className={`text-2xl sm:text-3xl font-black tracking-tight tnum ${styles.accent}`}>
          {shown}
        </span>
        {trend && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${styles.badge} font-semibold`}>
            {trend}
          </span>
        )}
      </div>

      {subtext && (
        <p className="mt-1 text-[11px] text-content-muted font-medium leading-tight">
          {subtext}
        </p>
      )}
    </div>
  );
}
