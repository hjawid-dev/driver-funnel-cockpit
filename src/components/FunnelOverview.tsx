import { ArrowRight, FileText, LoaderCircle, TriangleAlert } from 'lucide-react';
import { kpiDelta, type Funnel, type FunnelKey, type Kpi } from '../lib/kpis';
import { CollapsibleSection, StatusChip } from './ui';
import { InfoTip } from './InfoTip';

export const FUNNEL_KPIS: Kpi['key'][] = ['appToActive', 'docCompletion', 'timeToDecision', 'activation'];
const PERIOD: Partial<Record<Kpi['key'], string>> = { cohortConversion: 'Within 30 days · mature cohorts', docCompletion: 'Within 7 days · mature cohorts', activation: 'Within 14 days · mature cohorts', appToActive: 'North star · new active ÷ applications, last 30 days' };
export function FunnelKpis({ kpis, baseline, onReport, reportBusy = false }: { kpis: Kpi[]; baseline: Kpi[]; onReport: () => void; reportBusy?: boolean }) {
  const card = (k: Kpi) => {
    const d = kpiDelta(baseline.find(b => b.key === k.key), k);
    return <article key={k.key} className={`rounded-xl border p-3 sm:p-4 ${k.northStar ? 'border-indigo/40 bg-lavender/40' : 'border-lavender bg-white'}`}>
      <h3 className="flex items-center gap-1 text-sm font-semibold leading-tight">{k.label}<InfoTip label={`About ${k.label.toLowerCase()}`}>{k.info.map((line, i) => <p key={i}>{line}</p>)}{k.sub && <p>{k.sub}</p>}<p>{k.caption}</p></InfoTip></h3>
      <div className="mt-1.5 flex flex-wrap items-center gap-2"><span className="num whitespace-nowrap text-2xl font-semibold">{k.display}</span>{d && <span title="Change in this demo only" className="num rounded bg-card px-1.5 text-xs">{d.text}</span>}</div>
      {PERIOD[k.key] && <p className="mt-1 text-xs text-muted">{PERIOD[k.key]}</p>}
      {k.detail && <p className="mt-1 text-xs font-medium text-navy/80">{k.detail}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs"><StatusChip status={k.status} /><span className="text-muted">{k.key === 'timeToDecision' ? 'Case target ≤ 48 h' : k.target}</span></div>
    </article>;
  };
  return <section aria-labelledby="kpi-title" data-demo-target="metrics">
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h2 id="kpi-title" className="flex items-center gap-1 text-sm font-semibold">How the funnel performs<InfoTip label="About these numbers"><p>Demo data. Targets and cohort windows are pilot hypotheses, except the case's 48-hour registration-to-decision target.</p><p>Owner and backup review the open queue daily, including missing documents. Arrange an exception before 48 hours if the standard call times (twice a day, once at weekends) do not fit; an incomplete case remains an explicit SLA miss.</p><p>Each week: at most one change per stage, then check over the next weeks whether that stage's number moved. Large queues are work in progress, not proof of the cause.</p></InfoTip><span className="ml-2 text-xs font-normal text-muted">Pilot targets</span></h2><button data-guide="weekly-report" disabled={reportBusy} aria-busy={reportBusy} type="button" onClick={onReport} className="flex items-center gap-1.5 text-sm font-semibold text-indigo">{reportBusy ? <LoaderCircle size={15} className="animate-spin" /> : <FileText size={15} />}{reportBusy ? 'Preparing report…' : 'Weekly report'}</button></div>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{FUNNEL_KPIS.map(key => kpis.find(k => k.key === key)).filter((k): k is Kpi => !!k).map(card)}</div>
    <div className="mt-3"><CollapsibleSection title="Guardrails and cohort detail" summary="Acceptance · delivery outcome · cohort conversion"><div className="grid gap-3 sm:grid-cols-3">{kpis.filter(k => !FUNNEL_KPIS.includes(k.key)).map(card)}</div></CollapsibleSection></div>
  </section>;
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
          <p>All-history stage reach. Ratios include work still in progress; they are not mature cohort drop-off rates.</p>
          <p className="text-muted">Click a stage to see current work. Pending documents and booked first drives are waiting, not lost.</p>
        </InfoTip>
      </h2>
      <p className="mb-2 text-xs text-muted">Reached = all-history total · Waiting now = current work, not confirmed drop-off.</p>
      <ol className="grid grid-cols-1 overflow-hidden rounded-xl border border-lavender sm:grid-cols-5">
        {tiles.map((t, i) => {
          const edge = i > 0 ? edges[i - 1] : null;
          const biggest = !!edge?.biggestDrop;
          const here = t.currentCount ?? (t.key === 'active' ? t.reached : 0);
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
                <span className="mt-0.5 block text-xs text-muted">Reached <strong className="num ml-1 text-2xl font-semibold tracking-tight text-navy group-hover:text-indigo">{t.reached}</strong></span>
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
                  {t.key === 'active' ? 'Now: ' : t.key === 'reviewed' ? 'Decision: ' : 'Waiting now: '}<span className="num">{here}</span>&nbsp;{HERE_NOW[t.key]}
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
