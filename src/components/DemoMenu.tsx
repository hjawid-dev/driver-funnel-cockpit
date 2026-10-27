import { useEffect, useRef, useState } from 'react';
import { ChevronDown, FastForward, FlaskConical, History, Network, RotateCcw, Smartphone } from 'lucide-react';
import type { AutoEvent } from '../lib/automation';
import { summarize } from '../lib/automation';
import { formatDateTime } from '../lib/time';

interface Props {
  now: number;
  onAdvance: (ms: number) => void;
  onReset: () => void;
  onPhone: () => void;
  onHubspot: () => void;
  textsEnabled: boolean;
  onTexts: (on: boolean) => void;
  lastRun: { from: number; to: number; events: AutoEvent[] } | null;
}

const H = 3_600_000;
const STEPS: [string, number][] = [
  ['+2 h', 2 * H],
  ['+1 day', 24 * H],
  ['+3 days', 72 * H],
];

const clockLabel = (ts: number) => new Date(ts).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' });

/** Everything that makes the prototype demonstrable, in one compact menu: the simulated clock, the driver's phone, reset. */
export function DemoMenu({ now, onAdvance, onReset, onPhone, onHubspot, textsEnabled, onTexts, lastRun }: Props) {
  const [open, setOpen] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const ops = lastRun?.events.filter((e) => e.audience === 'ops') ?? [];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const run = (f: () => void) => {
    f();
    setOpen(false);
  };
  const item = 'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-semibold hover:bg-card';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        title="Demo controls: simulated time, the driver's phone, reset"
        className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-white/85 hover:bg-white/10 hover:text-white"
      >
        <FlaskConical size={15} aria-hidden />
        <span className="num hidden sm:inline">{clockLabel(now)}</span>
        <span className="hidden rounded-full bg-white/15 px-1.5 text-[11px] font-semibold uppercase tracking-wide md:inline">Demo</span>
        <span className="sr-only">Demo menu</span>
        <ChevronDown size={14} aria-hidden className={open ? 'rotate-180' : ''} />
      </button>
      {open && (
        <div role="menu" className="anim-fade absolute right-0 top-full z-40 mt-1.5 w-[19rem] max-w-[calc(100vw-2rem)] rounded-xl border border-lavender bg-white p-2 text-navy shadow-xl">
          <p className="px-2.5 pb-1 pt-1 text-xs text-muted">
            Simulated environment · demo data only
            <span className="num block font-semibold text-navy">{formatDateTime(now)}</span>
          </p>
          <div className="flex items-center gap-1.5 px-2.5 py-1.5">
            <FastForward size={14} className="text-muted" aria-hidden />
            <span className="mr-auto text-xs text-muted">Move time</span>
            {STEPS.map(([label, ms]) => (
              <button
                key={label}
                type="button"
                onClick={() => onAdvance(ms)}
                className="num whitespace-nowrap rounded-md border border-lavender px-2 py-1 text-xs font-semibold hover:border-indigo hover:text-indigo"
              >
                {label}
              </button>
            ))}
          </div>
          {lastRun && (
            <div className="px-2.5 pb-1">
              <button type="button" onClick={() => setShowLog((v) => !v)} aria-expanded={showLog} className="flex items-center gap-1 text-xs font-semibold text-indigo hover:underline">
                <History size={13} aria-hidden /> What ran by itself: {summarize(lastRun.events)}
              </button>
              {showLog && (
                <ol className="mt-1 max-h-40 space-y-0.5 overflow-y-auto text-xs">
                  {ops.length === 0 ? (
                    <li className="text-muted">Nothing was due in this window.</li>
                  ) : (
                    ops.map((e, i) => (
                      <li key={i}>
                        <span className="num text-muted">{formatDateTime(e.at)}</span> {e.title}
                      </li>
                    ))
                  )}
                </ol>
              )}
            </div>
          )}
          <hr className="my-1 border-lavender" />
          <button type="button" role="menuitem" onClick={() => run(onPhone)} className={item}>
            <Smartphone size={15} className="text-indigo" aria-hidden /> Open the driver's phone
          </button>
          <label className="flex items-start gap-2 rounded-lg px-2.5 py-2 text-sm hover:bg-card">
            <input type="checkbox" checked={textsEnabled} onChange={(e) => onTexts(e.target.checked)} className="mt-0.5 h-4 w-4 accent-indigo" />
            <span>
              <span className="font-semibold">Automated texts to pickup contacts</span>
              <span className="block text-xs text-muted">Fixed templates the driver sends. Off: every stuck pickup goes straight to a person.</span>
            </span>
          </label>
          <button type="button" role="menuitem" onClick={() => run(onHubspot)} className={item}>
            <Network size={15} className="text-indigo" aria-hidden /> Implementation: how this maps to HubSpot
          </button>
          <hr className="my-1 border-lavender" />
          <button type="button" role="menuitem" onClick={() => run(onReset)} className={item}>
            <RotateCcw size={15} className="text-muted" aria-hidden />
            <span>
              Reset demo
              <span className="block text-xs font-normal text-muted">Fresh data · Explore cases · Case 1, step 1</span>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
