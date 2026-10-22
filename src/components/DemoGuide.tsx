import { Check, ChevronRight, Network, X } from 'lucide-react';
import type { GuideStep } from '../lib/guide';

interface Props {
  steps: GuideStep[];
  onOpen: (id: string) => void;
  onPhone: () => void;
  onAdvance: () => void;
  onHubspot: () => void;
  onHide: () => void;
}

/** First-visit guide: what this is, and three things to try. */
export function DemoGuide({ steps, onOpen, onPhone, onAdvance, onHubspot, onHide }: Props) {
  const done = steps.filter((s) => s.done).length;

  return (
    <section aria-labelledby="guide-title" className="anim-fade relative rounded-2xl border border-lavender bg-card p-4 sm:p-5">
      <button
        type="button"
        onClick={onHide}
        aria-label="Hide the guide"
        className="absolute right-2 top-2 rounded-md p-1.5 text-muted hover:bg-white hover:text-navy"
      >
        <X size={18} />
      </button>

      <div className="pr-8">
        <div className="text-xs font-semibold uppercase tracking-[0.08em] text-indigo">Demo guide · {done}/3 tried</div>
        <h2 id="guide-title" className="mt-1 text-lg font-bold leading-snug">
          Two sides of one funnel: the driver's phone and the ops cockpit.
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Drivers finish their application on the phone and book their own call. Ops decides in the call, using written rules. Reminders,
          alerts and tasks run by themselves, and every click writes a timestamp or reason code, so the numbers below come straight out of the
          work. Try three things:
        </p>
      </div>

      <ol className="mt-4 grid gap-2 sm:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.key}>
            <button
              type="button"
              disabled={s.action === 'open' && !s.targetId}
              onClick={() => (s.action === 'phone' ? onPhone() : s.action === 'advance' ? onAdvance() : s.targetId && onOpen(s.targetId))}
              className={`group flex h-full w-full items-start gap-3 rounded-xl border bg-white p-3 text-left transition-colors ${
                s.done ? 'border-ok/40' : 'border-lavender hover:border-indigo'
              } disabled:cursor-default`}
            >
              <span
                aria-hidden
                className={`num mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  s.done ? 'bg-ok text-white' : 'bg-indigo text-white'
                }`}
              >
                {s.done ? <Check size={14} /> : i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1 text-sm font-semibold">
                  {s.title}
                  {s.done ? <span className="sr-only">(done)</span> : <ChevronRight size={14} className="text-indigo transition-transform group-hover:translate-x-0.5" aria-hidden />}
                </span>
                <span className="mt-0.5 block text-xs text-muted leading-snug">{s.hint}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <button type="button" onClick={onHubspot} className="inline-flex items-center gap-1 font-semibold text-indigo hover:underline">
          <Network size={13} aria-hidden /> How this maps to HubSpot
        </button>
        <span>Demo data, nothing is sent. Reset demo (top right) starts over.</span>
      </div>
    </section>
  );
}
