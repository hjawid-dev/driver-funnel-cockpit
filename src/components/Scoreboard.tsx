import { ArrowRight, ChevronRight, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Funnel, FunnelKey } from '../lib/kpis';
import { SectionHeader } from './ui';

/** Where a tile's second line leads: a work list, or All filtered on rejected. */
export type FunnelLink = 'missing' | 'review' | 'awaiting' | 'rejected';

interface Props {
  funnel: Funnel;
  /** The tile: everyone who reached the stage, the same number as on the tile. */
  onSelect: (key: FunnelKey) => void;
  /** The second line: the people sitting in the stage now, the same number as on the line. */
  onLink: (to: FunnelLink) => void;
}

function StageLink({ to, onLink, children }: { to: FunnelLink; onLink: Props['onLink']; children: ReactNode }) {
  return (
    <button type="button" onClick={() => onLink(to)} className="inline-flex items-center gap-0.5 font-semibold text-indigo hover:underline">
      {children}
      <ArrowRight size={11} aria-hidden />
    </button>
  );
}

export function Scoreboard({ funnel, onSelect, onLink }: Props) {
  const { tiles, edges, rejected } = funnel;
  const now = (k: FunnelKey) => tiles.find((t) => t.key === k)!.now;

  const subline: Record<FunnelKey, ReactNode> = {
    registered: <StageLink onLink={onLink} to="missing">{now('registered')} missing documents</StageLink>,
    docs: 'Auto-queued for review',
    review: (
      <span className="flex flex-wrap gap-x-2">
        <StageLink onLink={onLink} to="review">{now('review')} in queue</StageLink>
        <StageLink onLink={onLink} to="rejected">{rejected} rejected</StageLink>
      </span>
    ),
    accepted: <StageLink onLink={onLink} to="awaiting">{now('accepted')} awaiting first gig</StageLink>,
    active: 'First gig done',
  };

  return (
    <section>
      <SectionHeader
        title="Funnel scoreboard"
        info={
          <>
            <p>Everyone who has reached each stage, the same stages as the HubSpot pipeline. Click a number to see exactly those people.</p>
            <p>The line under it is where people are now, and opens that work list.</p>
            <p className="text-muted">The rates are in the metrics below. They only count people who have had time to move on, so they don't mix in someone who registered yesterday.</p>
          </>
        }
      />
      <ol className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3 lg:gap-5">
        {tiles.map((t, i) => {
          const edge = i > 0 ? edges[i - 1] : null;
          const lost = edge ? tiles[i - 1].reached - t.reached : 0;
          const biggest = !!edge?.biggestDrop;
          return (
            <li
              key={t.key}
              className={`relative h-full rounded-xl border px-4 py-3 transition-colors ${
                biggest ? 'bg-bad-bg/50 border-bad/40 hover:border-bad' : 'bg-card border-transparent hover:border-indigo/40'
              }`}
            >
              {edge && (
                <span
                  aria-hidden
                  className="hidden lg:flex absolute -left-[17px] top-1/2 -translate-y-1/2 z-10 h-6 w-6 items-center justify-center rounded-full bg-white border border-lavender text-muted"
                >
                  <ChevronRight size={14} />
                </span>
              )}
              <button
                type="button"
                onClick={() => onSelect(t.key)}
                aria-label={`${t.reached} reached ${t.label}: show them`}
                className="group flex w-full items-center justify-between gap-3 text-left sm:block"
              >
                <span className="text-sm font-semibold leading-tight">{t.label}</span>
                <span className="num block text-2xl font-semibold tracking-tight group-hover:text-indigo sm:mt-1 sm:text-3xl">{t.reached}</span>
              </button>
              {biggest && (
                <div title={`${lost} fewer than the stage before`} className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-bad">
                  <TriangleAlert size={12} aria-hidden /> Biggest drop-off
                </div>
              )}
              <div className="mt-0.5 text-xs leading-snug text-muted">{subline[t.key]}</div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
