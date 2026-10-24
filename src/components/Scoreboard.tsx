import { ArrowRight, ChevronRight, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Funnel, FunnelKey, FunnelLink, FunnelPart } from '../lib/kpis';
import { SectionHeader } from './ui';

export type { FunnelLink };

interface Props {
  funnel: Funnel;
  /** The number: everyone who reached the stage, the same number as on the tile. */
  onSelect: (key: FunnelKey) => void;
  /** A part under it: the people sitting there now, the same number as on the line. */
  onLink: (to: FunnelLink) => void;
}

function StageLink({ to, onLink, children }: { to: FunnelLink; onLink: Props['onLink']; children: ReactNode }) {
  return (
    <button type="button" onClick={() => onLink(to)} className="inline-flex items-center gap-0.5 text-left font-semibold text-indigo hover:underline">
      {children}
      <ArrowRight size={11} aria-hidden />
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
          {p.to && !p.movedOn ? (
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

export function Scoreboard({ funnel, onSelect, onLink }: Props) {
  const { tiles, edges } = funnel;

  return (
    <section>
      <SectionHeader
        title="Funnel scoreboard"
        info={
          <>
            <p>Everyone who has reached each stage, the same stages as the HubSpot pipeline. Click a number to see exactly those people.</p>
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
