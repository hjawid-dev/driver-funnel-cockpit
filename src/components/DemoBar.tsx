import { useState } from 'react';
import { ChevronDown, FastForward, History, Smartphone } from 'lucide-react';
import type { AutoEvent } from '../lib/automation';
import { summarize } from '../lib/automation';
import { formatDateTime, formatDuration } from '../lib/time';

interface Props {
  now: number;
  offset: number;
  phoneOpen: boolean;
  onTogglePhone: () => void;
  onAdvance: (ms: number) => void;
  lastRun: { from: number; to: number; events: AutoEvent[] } | null;
}

const H = 3_600_000;
const STEPS: [string, number][] = [
  ['+2 h', 2 * H],
  ['+1 day', 24 * H],
  ['+3 days', 72 * H],
];

/** Demo controls: open the driver's phone and move time forward to watch automation run. */
export function DemoBar({ now, offset, phoneOpen, onTogglePhone, onAdvance, lastRun }: Props) {
  const [showLog, setShowLog] = useState(false);
  const ops = lastRun?.events.filter((e) => e.audience === 'ops') ?? [];

  return (
    <div className="border-b border-lavender bg-card">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-2 text-sm">
        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Demo</span>
        <button
          type="button"
          onClick={onTogglePhone}
          aria-pressed={phoneOpen}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-semibold ${phoneOpen ? 'bg-indigo text-white' : 'border border-lavender bg-white text-indigo hover:border-indigo'}`}
        >
          <Smartphone size={15} aria-hidden /> Driver's phone
        </button>
        <span className="mx-1 hidden h-5 w-px bg-lavender sm:block" aria-hidden />
        <span className="flex items-center gap-1 text-xs text-muted">
          <FastForward size={14} aria-hidden /> Move time
        </span>
        {STEPS.map(([label, ms]) => (
          <button
            key={label}
            type="button"
            onClick={() => onAdvance(ms)}
            className="num rounded-lg border border-lavender bg-white px-2.5 py-1.5 text-xs font-semibold hover:border-indigo hover:text-indigo"
          >
            {label}
          </button>
        ))}
        <span className="text-xs text-muted">
          <span className="num">{formatDateTime(now)}</span>
          {offset > 0 && <span className="ml-1 rounded-full bg-warn-bg px-1.5 py-0.5 font-semibold text-warn">simulated +{formatDuration(offset)}</span>}
        </span>
        {lastRun && (
          <button
            type="button"
            onClick={() => setShowLog((v) => !v)}
            aria-expanded={showLog}
            className="ml-auto flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-navy hover:bg-white"
          >
            <History size={14} aria-hidden /> Automation: {summarize(lastRun.events)}
            <ChevronDown size={14} className={showLog ? 'rotate-180' : ''} aria-hidden />
          </button>
        )}
      </div>
      {lastRun && showLog && (
        <div className="mx-auto max-w-7xl px-4 pb-3">
          <div className="max-h-64 overflow-y-auto rounded-xl border border-lavender bg-white p-3">
            <p className="mb-2 text-xs text-muted">
              What ran by itself from {formatDateTime(lastRun.from)} to {formatDateTime(lastRun.to)}. In production: HubSpot workflows and the driver chat.
            </p>
            {ops.length === 0 ? (
              <p className="text-sm text-muted">Nothing was due in this window.</p>
            ) : (
              <ol className="space-y-1 text-sm">
                {ops.map((e, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="num w-36 shrink-0 text-xs text-muted pt-0.5">{formatDateTime(e.at)}</span>
                    <span>{e.title}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
