import { ArrowRight, FileText, TriangleAlert } from 'lucide-react';
import { kpiDelta, type Funnel, type FunnelKey, type Kpi } from '../lib/kpis';
import { Proposed, StatusChip } from './ui';
import { InfoTip } from './InfoTip';

/** The four metrics the case asks about, in this order. Acceptance and first-gig quality are in the weekly report. */
export const FUNNEL_KPIS: Kpi['key'][] = ['appToActive', 'docCompletion', 'timeToDecision', 'activation'];

const LABEL: Partial<Record<Kpi['key'], string>> = { activation: 'First-gig activation' };

/** The case's own numbers, kept apart from the demo sample so the two are never mixed. */
const CASE_BASELINE: Partial<Record<Kpi['key'], string>> = {
  appToActive: 'Case: 25 of 120 ≈ 21%',
  docCompletion: 'Case: ~70%',
  timeToDecision: 'Case: 6 days (mean)',
  activation: 'Case: not measured',
};

export function FunnelKpis({ kpis, baseline, onReport }: { kpis: Kpi[]; baseline: Kpi[]; onReport: () => void }) {
  const shown = FUNNEL_KPIS.map((k) => kpis.find((x) => x.key === k)!).filter(Boolean);
  return (
    <section aria-labelledby="kpi-title">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 id="kpi-title" className="flex items-center gap-1 text-sm font-semibold">
          How the funnel performs
          <InfoTip label="About these numbers">
            <p>The big number is the demo sample, live from the data: it moves when you act. The grey line under it is the case's own baseline.</p>
            <p className="text-muted">Rates only count people who have had time to move on, so someone who registered yesterday isn't counted as lost. Targets are a starting proposal.</p>
          </InfoTip>
        </h2>
        <button type="button" onClick={onReport} className="flex items-center gap-1.5 text-sm font-semibold text-indigo hover:underline">
          <FileText size={15} aria-hidden /> Weekly report
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        {shown.map((k) => {
          const d = kpiDelta(baseline.find((b) => b.key === k.key), k);
          return (
            <article key={k.key} className={`rounded-xl border p-3 sm:p-4 ${k.northStar ? 'border-indigo/40 bg-lavender/40' : 'border-lavender bg-white'}`}>
              <h3 className="flex items-center gap-1 text-sm font-semibold leading-tight">
                {LABEL[k.key] ?? k.label}
                <InfoTip label={`About ${(LABEL[k.key] ?? k.label).toLowerCase()}`}>
                  {k.info.map((line, i) => (
                    <p key={i} className={i > 0 ? 'text-muted' : undefined}>
                      {line}
                    </p>
                  ))}
                  {k.northStar && <p className="text-muted">{k.sub}.</p>}
                  <p className="text-muted">{k.caption}</p>
                </InfoTip>
              </h3>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="num text-2xl font-semibold tracking-tight">{k.display}</span>
                {d && (
                  <span key={d.text} title="Change since the demo started" className={`anim-rise num rounded-md px-1.5 py-0.5 text-xs font-semibold ${d.good === null ? 'bg-idle-bg text-idle' : d.good ? 'bg-ok-bg text-ok' : 'bg-bad-bg text-bad'}`}>
                    {d.text}
                  </span>
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                <StatusChip status={k.status} />
                {k.key === 'timeToDecision' ? (
                  <span className="text-muted">Case target &lt; 48 h</span>
                ) : (
                  <span className="flex items-center gap-1 text-muted">
                    {k.target} <Proposed title="My proposed target, not given in the case: to set with the team." />
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-muted">{CASE_BASELINE[k.key]}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}

/** Who sits at each stage now: the list a click on the stage opens. */
const HERE_NOW: Record<FunnelKey, string> = {
  registered: 'missing documents',
  docs: 'in review',
  reviewed: 'rejected',
  accepted: 'awaiting first gig',
  active: 'active drivers',
};

/** The five stages in one compact row. Each shows how many reached it, the step rate, and who is stuck there now. */
export function FunnelStages({ funnel, onStage }: { funnel: Funnel; onStage: (k: FunnelKey) => void }) {
  const { tiles, edges } = funnel;
  const top = tiles[0]?.reached || 1;
  return (
    <section aria-labelledby="funnel-title">
      <h2 id="funnel-title" className="mb-2 flex items-center gap-1 text-sm font-semibold">
        Where candidates get stuck
        <InfoTip label="About the funnel">
          <p>Everyone who has reached each stage. The rate between two stages is the share who moved on.</p>
          <p className="text-muted">Click a stage to see who is there now. Files waiting in the review queue are not counted as lost.</p>
        </InfoTip>
      </h2>
      <ol className="grid grid-cols-1 overflow-hidden rounded-xl border border-lavender sm:grid-cols-5">
        {tiles.map((t, i) => {
          const edge = i > 0 ? edges[i - 1] : null;
          const biggest = !!edge?.biggestDrop;
          const here = t.key === 'active' ? t.reached : (t.parts.find((p) => !p.movedOn && p.to)?.count ?? 0);
          return (
            <li key={t.key} className={`relative border-lavender sm:border-l first:sm:border-l-0 ${i > 0 ? 'border-t sm:border-t-0' : ''} ${biggest ? 'bg-bad-bg/50' : ''}`}>
              <button type="button" onClick={() => onStage(t.key)} className="group block h-full w-full px-4 py-3 text-left hover:bg-card/60">
                <span className="flex items-center justify-between gap-2 text-xs font-semibold text-muted">
                  {t.label}
                  {edge && (
                    <span className={`num rounded px-1 ${biggest ? 'bg-bad text-white' : 'bg-card text-muted'}`} title="Share who moved on from the stage before">
                      {edge.rate === null ? '–' : `${Math.round(edge.rate)}%`}
                    </span>
                  )}
                </span>
                <span className="num mt-0.5 block text-2xl font-semibold tracking-tight group-hover:text-indigo">{t.reached}</span>
                <span aria-hidden className="mt-1 block h-1.5 rounded-full bg-card">
                  <span className={`block h-full rounded-full ${biggest ? 'bg-bad' : 'bg-indigo'}`} style={{ width: `${Math.max(4, (t.reached / top) * 100)}%` }} />
                </span>
                {biggest ? (
                  <span className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-bad">
                    <TriangleAlert size={12} aria-hidden /> Biggest drop-off
                  </span>
                ) : (
                  <span className="mt-1.5 block text-xs text-muted">&nbsp;</span>
                )}
                <span className="mt-0.5 flex items-center gap-0.5 text-xs font-semibold text-indigo group-hover:underline">
                  <span className="num">{here}</span>&nbsp;{HERE_NOW[t.key]}
                  <ArrowRight size={11} aria-hidden />
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
