import { Star } from 'lucide-react';
import { kpiDelta, type Kpi, type KpiDelta } from '../lib/kpis';
import { SectionHeader, StatusChip, STATUS_STYLE } from './ui';
import { InfoTip } from './InfoTip';

export function KpiRow({ kpis, baseline }: { kpis: Kpi[]; baseline: Kpi[] }) {
  const north = kpis.find((k) => k.northStar)!;
  const rest = kpis.filter((k) => !k.northStar);
  const delta = (k: Kpi) => kpiDelta(baseline.find((b) => b.key === k.key), k);
  const anyChange = kpis.some((k) => delta(k));

  return (
    <section>
      <SectionHeader
        title="Four metrics, reviewed weekly"
        info={<p>Live from the data. Targets are a starting proposal, to be set with the team. After you click something, ▲▼ shows how a number moved since you opened the page.</p>}
        aside={anyChange ? '▲▼ since you opened the page' : undefined}
      />
      <NorthStar kpi={north} delta={delta(north)} />
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
        {rest.map((k) => (
          <KpiCard key={k.key} kpi={k} delta={delta(k)} />
        ))}
      </div>
    </section>
  );
}

const DELTA_STYLE = {
  light: { good: 'bg-ok-bg text-ok', bad: 'bg-bad-bg text-bad', neutral: 'bg-idle-bg text-idle' },
  dark: { good: 'bg-green/20 text-green', bad: 'bg-white/15 text-[#FFB4AB]', neutral: 'bg-white/15 text-white/80' },
};

/** Small chip showing how far a KPI moved since the page was opened. Re-animates on every change. */
function DeltaChip({ delta, dark = false }: { delta: KpiDelta | null; dark?: boolean }) {
  if (!delta) return null;
  const tone = delta.good === null ? 'neutral' : delta.good ? 'good' : 'bad';
  return (
    <span
      key={delta.text}
      title="Change since you opened this page"
      className={`anim-rise num inline-flex rounded-md px-1.5 py-0.5 text-xs font-semibold whitespace-nowrap ${DELTA_STYLE[dark ? 'dark' : 'light'][tone]}`}
    >
      {delta.text}
    </span>
  );
}

function KpiCard({ kpi, delta }: { kpi: Kpi; delta: KpiDelta | null }) {
  return (
    <article className="relative rounded-xl border border-lavender bg-white p-3 pl-4 sm:p-4 sm:pl-5">
      <span aria-hidden className={`absolute -inset-y-px -left-px w-1 rounded-l-xl ${STATUS_STYLE[kpi.status].bar}`} />
      <h3 className="flex items-center gap-1 text-sm font-semibold leading-tight">
        {kpi.label}
        <KpiInfo kpi={kpi} />
      </h3>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="num text-xl sm:text-2xl font-semibold tracking-tight">{kpi.display}</span>
        <DeltaChip delta={delta} />
        <StatusChip status={kpi.status} className="ml-auto" />
      </div>
      <div className="mt-1 text-xs text-muted leading-snug">{[kpi.target, kpi.sub].filter(Boolean).join(' · ')}</div>
      {/* Who the rate counts, so it can be checked against the tiles above. */}
      <div className="mt-0.5 text-xs text-muted leading-snug">{kpi.caption}</div>
    </article>
  );
}

/** Application → active, emphasised: same intake, more drivers. */
function NorthStar({ kpi, delta }: { kpi: Kpi; delta: KpiDelta | null }) {
  const SCALE = 50; // bar runs 0–50%
  const value = kpi.value ?? 0;
  const fill = Math.min(100, (value / SCALE) * 100);
  const target = (35 / SCALE) * 100;

  return (
    <article className="rounded-xl bg-navy text-white p-4 flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-8">
      <div className="lg:w-72 shrink-0">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-green">
          <Star size={13} aria-hidden fill="currentColor" />
          North star
        </div>
        <h3 className="mt-1 flex items-center gap-1 text-lg font-semibold">
          {kpi.label}
          <KpiInfo kpi={kpi} dark />
        </h3>
        <p className="text-sm text-white/70">Same intake, more drivers</p>
      </div>

      <div className="flex items-end gap-3">
        <span className="num text-5xl font-semibold text-green leading-none">{kpi.display}</span>
        <div className="mb-1 flex flex-col items-start gap-1">
          <DeltaChip delta={delta} dark />
          <StatusChip status={kpi.status} />
        </div>
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
        <p className="mt-2 text-xs text-white/70">{kpi.caption}</p>
      </div>
    </article>
  );
}

function KpiInfo({ kpi, dark = false }: { kpi: Kpi; dark?: boolean }) {
  return (
    <InfoTip label={`About ${kpi.label.toLowerCase()}`} dark={dark}>
      {kpi.info.map((line, i) => (
        <p key={i} className={i > 0 ? 'text-muted' : undefined}>
          {line}
        </p>
      ))}
    </InfoTip>
  );
}
