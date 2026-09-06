import type { HTMLAttributes } from 'react';

export function Card({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`rounded-xl border border-edge-subtle bg-surface-raised p-5 shadow-sm ${className}`} {...props} />;
}
