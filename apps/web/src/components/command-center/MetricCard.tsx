import React from 'react';

interface MetricCardProps {
  label: string;
  value: number | string;
  subtext?: string;
  trend?: string;
  variant?: 'emerald' | 'rose' | 'amber' | 'sky' | 'indigo';
  icon?: React.ReactNode;
}

export function MetricCard({
  label,
  value,
  subtext,
  trend,
  variant = 'sky',
  icon,
}: MetricCardProps) {
  const variantStyles = {
    emerald: {
      border: 'border-emerald-500/20 hover:border-emerald-500/40',
      badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      iconBg: 'bg-emerald-500/10 text-emerald-400',
      valueColor: 'text-emerald-400',
    },
    rose: {
      border: 'border-rose-500/20 hover:border-rose-500/40',
      badge: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
      iconBg: 'bg-rose-500/10 text-rose-400',
      valueColor: 'text-rose-400',
    },
    amber: {
      border: 'border-amber-500/20 hover:border-amber-500/40',
      badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      iconBg: 'bg-amber-500/10 text-amber-400',
      valueColor: 'text-amber-400',
    },
    sky: {
      border: 'border-sky-500/20 hover:border-sky-500/40',
      badge: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
      iconBg: 'bg-sky-500/10 text-sky-400',
      valueColor: 'text-sky-400',
    },
    indigo: {
      border: 'border-indigo-500/20 hover:border-indigo-500/40',
      badge: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
      iconBg: 'bg-indigo-500/10 text-indigo-400',
      valueColor: 'text-indigo-400',
    },
  }[variant];

  return (
    <div
      className={`bg-[#0f1626]/80 backdrop-blur-sm rounded-xl p-4 border ${variantStyles.border} transition-all duration-200 hover:shadow-lg hover:shadow-black/30 flex flex-col justify-between`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-[#aebbd4] tracking-wide uppercase">
          {label}
        </span>
        {icon && (
          <div className={`w-7 h-7 rounded-lg ${variantStyles.iconBg} flex items-center justify-center shrink-0`}>
            {icon}
          </div>
        )}
      </div>

      <div className="flex items-baseline gap-2">
        <span className={`text-2xl sm:text-3xl font-black tracking-tight ${variantStyles.valueColor}`}>
          {value}
        </span>
        {trend && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${variantStyles.badge} font-semibold`}>
            {trend}
          </span>
        )}
      </div>

      {subtext && (
        <p className="mt-1 text-[11px] text-[#7286a5] font-medium leading-tight">
          {subtext}
        </p>
      )}
    </div>
  );
}
