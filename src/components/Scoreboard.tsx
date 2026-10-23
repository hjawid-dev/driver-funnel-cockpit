import { ChevronRight, TriangleAlert } from 'lucide-react';
import type { Funnel, FunnelKey } from '../lib/kpis';
import { SectionHeader } from './ui';

interface Props {
  funnel: Funnel;
  onSelect: (key: FunnelKey) => void;
}

export function Scoreboard({ funnel, onSelect }: Props) {
  const { tiles, edges, rejected } = funnel;

  const subline: Record<FunnelKey, string> = {
    registered: `${tiles[0].now} missing documents`,
    docs: 'auto-queued for review',
    review: `${tiles[2].now} in queue · ${rejected} rejected`,
    accepted: `${tiles[3].now} awaiting first gig`,
    active: 'first gig done',
  };

  return (
    <section>
      <SectionHeader
        title="Funnel scoreboard"
        info={
          <>
            <p>Everyone who has reached each stage, the same stages as the HubSpot pipeline. Click a stage to open its list.</p>
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
            <li key={t.key} className="relative">
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
                className={`group w-full h-full text-left rounded-xl px-4 py-3 transition-colors border ${
                  biggest ? 'bg-bad-bg/50 border-bad/40 hover:border-bad' : 'bg-card border-transparent hover:border-indigo/40'
                }`}
              >
                {/* Phone: one compact row per stage */}
                <div className="flex items-center justify-between gap-3 sm:hidden">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">{t.label}</div>
                    <div className="text-xs text-muted">{subline[t.key]}</div>
                    {biggest && (
                      <div className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-bad">
                        <TriangleAlert size={12} aria-hidden /> Biggest drop-off
                      </div>
                    )}
                  </div>
                  <span className="num w-10 shrink-0 text-right text-2xl font-semibold">{t.reached}</span>
                </div>

                {/* Tablet and up: tile */}
                <div className="hidden sm:block">
                  <span className="text-sm font-semibold leading-tight">{t.label}</span>
                  <div className="num mt-1 text-3xl font-semibold tracking-tight">{t.reached}</div>
                  {biggest ? (
                    <div title={`${lost} fewer than the stage before`} className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-bad">
                      <TriangleAlert size={12} aria-hidden /> Biggest drop-off
                    </div>
                  ) : (
                    <div className="mt-0.5 text-xs text-muted leading-snug">{subline[t.key]}</div>
                  )}
                </div>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
