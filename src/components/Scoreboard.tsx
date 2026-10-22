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
    registered: `${tiles[0].now} still missing documents`,
    docs: 'Complete files are auto-queued',
    review: `${tiles[2].now} in queue · Rejected: ${rejected}`,
    accepted: `${tiles[3].now} awaiting first gig`,
    active: 'Completed a first gig',
  };

  return (
    <section>
      <SectionHeader title="Funnel scoreboard" aside="Everyone who reached each stage · % = step conversion" />
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
                className={`group w-full h-full text-left rounded-xl px-4 py-3 sm:p-4 transition-colors border ${
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
                        <TriangleAlert size={12} aria-hidden /> Biggest drop-off: {lost} lost
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {edge && edge.rate !== null && <RateChip rate={edge.rate} biggest={biggest} auto={!!edge.autoQueued} />}
                    <span className="num w-10 text-right text-2xl font-semibold">{t.reached}</span>
                  </div>
                </div>

                {/* Tablet and up: tile */}
                <div className="hidden sm:block">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-semibold leading-tight">{t.label}</span>
                    {edge && edge.rate !== null && <RateChip rate={edge.rate} biggest={biggest} auto={!!edge.autoQueued} />}
                  </div>
                  <div className="num mt-3 text-3xl font-semibold tracking-tight">{t.reached}</div>
                  <div className="mt-1 text-xs text-muted leading-snug">{subline[t.key]}</div>
                  {biggest && (
                    <div className="mt-2 flex items-center gap-1 text-xs font-semibold text-bad">
                      <TriangleAlert size={13} aria-hidden />
                      Biggest drop-off: {lost} lost
                    </div>
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

function RateChip({ rate, biggest, auto }: { rate: number; biggest: boolean; auto: boolean }) {
  return (
    <span
      title={auto ? 'Complete files go straight to review' : `${Math.round(rate)}% of the previous stage`}
      className={`num shrink-0 rounded-md px-1.5 py-0.5 text-xs font-medium ${biggest ? 'bg-bad text-white' : auto ? 'bg-white text-muted' : 'bg-lavender text-navy'}`}
    >
      {Math.round(rate)}%{auto ? ' auto' : ''}
    </span>
  );
}
