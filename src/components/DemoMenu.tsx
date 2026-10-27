import { useEffect, useRef, useState } from 'react';
import { ChevronDown, FlaskConical, Network, RotateCcw } from 'lucide-react';
import { formatDateTime } from '../lib/time';

interface Props {
  now: number;
  onReset: () => void;
  onHubspot: () => void;
}


const clockLabel = (ts: number) => new Date(ts).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' });

/** The simulated clock, the HubSpot mapping and reset. Moving time stays inside the case walkthrough. */
export function DemoMenu({ now, onReset, onHubspot }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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
        title="Demo: simulated time, HubSpot mapping, reset"
        className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-white/85 hover:bg-white/10 hover:text-white"
      >
        <FlaskConical size={15} aria-hidden />
        <span className="num hidden whitespace-nowrap sm:inline">{clockLabel(now)}</span>
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
          <hr className="my-1 border-lavender" />
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
