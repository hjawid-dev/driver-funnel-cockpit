import { ArrowRight, ChevronRight, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Funnel, FunnelLink, FunnelPart } from '../lib/kpis';
import { SectionHeader } from './ui';

export type { FunnelLink };

interface Props {
  funnel: Funnel;
  /** A part under a tile: the people sitting there now, the same number as on the line. */
  onLink: (to: FunnelLink) => void;
}

/** The parts with a work list in this version: the three lists under the funnel. */
const LISTED: FunnelLink[] = ['missing', 'review', 'awaiting'];

function StageLink({ to, onLink, children }: { to: FunnelLink; onLink: Props['onLink']; children: ReactNode }) {
  return (
    <button type="button" onClick={() => onLink(to)} className="text-left font-semibold text-indigo hover:underline">
      {children}
      <ArrowRight size={11} aria-hidden className="ml-0.5 inline align-[-1px]" />
    </button>
  );
}

/** The tile's arithmetic: who stopped here (a link to their list) and who moved on to the next tile. */
function Parts({ parts, onLink }: { parts: FunnelPart[]; onLink: Props['onLink'] }) {
  if (!parts.length) return <span>First gig done</span>;
  return (
    <ul className="space-y-0.5">
      {parts.map((p) => (
        <li key={p.label}>
          {p.to && !p.movedOn && LISTED.includes(p.to) ? (
            <StageLink to={p.to} onLink={onLink}>
              <span className="num">{p.count}</span> {p.label}
            </StageLink>
          ) : (
            <span>
              <span className="num">{p.count}</span> {p.label}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

export function Scoreboard({ funnel, onLink }: Props) {
  const { tiles, edges } = funnel;

  return (
    <section>
      <SectionHeader
        title="Funnel scoreboard"
        info={
          <>
            <p>Everyone who has reached each stage, the same stages as the HubSpot pipeline.</p>
            <p>The lines under a number always add up to it: who stopped at that stage (a link to their list) and who moved on to the next.</p>
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
                biggest ? 'bg-bad-bg/50 border-bad/40' : 'bg-card border-transparent'
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
              <div className="flex w-full items-center justify-between gap-3 sm:block">
                <span className="text-sm font-semibold leading-tight">{t.label}</span>
                <span className="num block text-2xl font-semibold tracking-tight sm:mt-1 sm:text-3xl">{t.reached}</span>
              </div>
              {biggest && (
                <div title={`${lost} fewer than the stage before`} className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-bad">
                  <TriangleAlert size={12} aria-hidden /> Biggest drop-off
                </div>
              )}
              <div className="mt-1 text-xs leading-snug text-muted">
                <Parts parts={t.parts} onLink={onLink} />
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
