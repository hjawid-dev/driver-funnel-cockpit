import type { ReactNode } from 'react';
import type { KpiStatus } from '../lib/kpis';
import { InfoTip } from './InfoTip';

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

export function SectionHeader({ title, aside, info }: { title: string; aside?: ReactNode; info?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 mb-3">
      <h2 className="flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted">
        {title}
        {info && <InfoTip label={`About ${title.toLowerCase()}`}>{info}</InfoTip>}
      </h2>
      {aside && <div className="text-xs text-muted">{aside}</div>}
    </div>
  );
}

export function DrawerSection({ title, children, aside, info }: { title: string; children: ReactNode; aside?: ReactNode; info?: ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted">
          {title}
          {info && <InfoTip label={`About ${title.toLowerCase()}`}>{info}</InfoTip>}
        </h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** One short line above a work list, with the longer explanation behind a "?". */
export function ListIntro({ children, info }: { children: ReactNode; info?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-1 text-sm text-muted">
      <span>{children}</span>
      {info && <InfoTip label="About this list">{info}</InfoTip>}
    </div>
  );
}

/** A drawer section that starts closed: for history you look at now and then. */
export function CollapsibleSection({ title, summary, children }: { title: string; summary?: ReactNode; children: ReactNode }) {
  return (
    <details className="group">
      <summary className="mb-2 flex cursor-pointer list-none items-baseline justify-between gap-2 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted group-hover:text-navy">
          <span aria-hidden className="inline-block transition-transform group-open:rotate-90">›</span>
          {title}
        </span>
        {summary && <span className="text-xs text-muted">{summary}</span>}
      </summary>
      {children}
    </details>
  );
}
