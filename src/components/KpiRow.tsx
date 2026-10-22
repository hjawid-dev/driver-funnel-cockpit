import { Star } from 'lucide-react';
import type { Kpi } from '../lib/kpis';
import { SectionHeader, StatusChip, STATUS_STYLE } from './ui';

export function KpiRow({ kpis }: { kpis: Kpi[] }) {
  const north = kpis.find((k) => k.northStar)!;
  const rest = kpis.filter((k) => !k.northStar);

  return (
    <section>
      <SectionHeader title="Six metrics, reviewed weekly" aside="Live from the data · targets are a starting proposal" />
      <NorthStar kpi={north} />
      <div className="mt-3 grid grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-3 [&>*:last-child]:col-span-2 lg:[&>*:last-child]:col-span-1">
        {rest.map((k) => (
          <KpiCard key={k.key} kpi={k} />
        ))}
      </div>
    </section>
  );
}

function KpiCard({ kpi }: { kpi: Kpi }) {
  return (
    <article className="relative overflow-hidden rounded-xl border border-lavender bg-white p-3 pl-4 sm:p-4 sm:pl-5">
      <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${STATUS_STYLE[kpi.status].bar}`} />
      <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
        <h3 className="text-sm font-semibold leading-tight">{kpi.label}</h3>
        <StatusChip status={kpi.status} />
      </div>
      <div className="num mt-2 text-xl sm:text-2xl font-semibold tracking-tight">{kpi.display}</div>
      {kpi.sub && <div className="text-xs text-muted leading-snug">{kpi.sub}</div>}
      <div className="mt-2 sm:mt-3 border-t border-lavender pt-2 text-xs">
        <div className="font-medium">{kpi.target}</div>
        <div className="text-muted mt-0.5">{kpi.caption}</div>
      </div>
    </article>
  );
}

/** Application → active, emphasised: same intake, more drivers. */
function NorthStar({ kpi }: { kpi: Kpi }) {
  const SCALE = 50; // bar runs 0–50%
  const value = kpi.value ?? 0;
  const fill = Math.min(100, (value / SCALE) * 100);
  const target = (35 / SCALE) * 100;

  return (
    <article className="rounded-xl bg-navy text-white p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-8">
      <div className="lg:w-72 shrink-0">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-green">
          <Star size={13} aria-hidden fill="currentColor" />
          North star
        </div>
        <h3 className="mt-1 text-lg font-semibold">{kpi.label}</h3>
        <p className="text-sm text-white/70">Same intake, more drivers</p>
      </div>

      <div className="flex items-end gap-3">
        <span className="num text-5xl font-semibold text-green leading-none">{kpi.display}</span>
        <StatusChip status={kpi.status} className="mb-1" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="relative h-3 rounded-full bg-white/15" role="img" aria-label={`${kpi.display} of applications become active. Target 35%.`}>
          <div className="absolute inset-y-0 left-0 rounded-full bg-green" style={{ width: `${fill}%` }} />
          <div className="absolute -top-1 -bottom-1 w-0.5 bg-white" style={{ left: `${target}%` }} />
        </div>
        <div className="relative mt-1.5 h-4 text-xs text-white/70">
          <span className="absolute left-0">0%</span>
          <span className="absolute -translate-x-1/2 font-semibold text-white" style={{ left: `${target}%` }}>
            Target 35%
          </span>
          <span className="absolute right-0">50%</span>
        </div>
        <p className="mt-2 text-xs text-white/70">
          {kpi.caption} · baseline 21%
        </p>
      </div>
    </article>
  );
}
