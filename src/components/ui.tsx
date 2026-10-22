import type { ReactNode } from 'react';
import type { KpiStatus } from '../lib/kpis';

export const STATUS_STYLE: Record<KpiStatus, { label: string; chip: string; bar: string }> = {
  on: { label: 'On track', chip: 'bg-ok-bg text-ok', bar: 'bg-ok' },
  risk: { label: 'At risk', chip: 'bg-warn-bg text-warn', bar: 'bg-[#E0A100]' },
  off: { label: 'Off track', chip: 'bg-bad-bg text-bad', bar: 'bg-bad' },
  info: { label: 'Diagnostic', chip: 'bg-idle-bg text-idle', bar: 'bg-sky' },
};

export function StatusChip({ status, className = '' }: { status: KpiStatus; className?: string }) {
  const s = STATUS_STYLE[status];
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${s.chip} ${className}`}>{s.label}</span>;
}

export function SectionHeader({ title, aside }: { title: string; aside?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-3">
      <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">{title}</h2>
      {aside && <div className="text-xs text-muted">{aside}</div>}
    </div>
  );
}

export function DrawerSection({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}
