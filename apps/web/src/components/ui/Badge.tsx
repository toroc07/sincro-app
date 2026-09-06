import type { HTMLAttributes } from 'react';

type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';
export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> { tone?: Tone }

const tones: Record<Tone, string> = {
  neutral: 'bg-surface-overlay text-content-muted ring-1 ring-inset ring-edge-subtle',
  info: 'bg-info-soft text-info ring-1 ring-inset ring-info/20',
  success: 'bg-ok-soft text-ok ring-1 ring-inset ring-ok/20',
  warning: 'bg-warn-soft text-warn ring-1 ring-inset ring-warn/20',
  danger: 'bg-emergency-soft text-emergency ring-1 ring-inset ring-emergency/20',
};

export function Badge({ className = '', tone = 'neutral', ...props }: BadgeProps) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${tones[tone]} ${className}`} {...props} />;
}
