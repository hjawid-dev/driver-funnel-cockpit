import { Check, Network, X } from 'lucide-react';
import type { GuideStep } from '../lib/guide';
import { InfoTip } from './InfoTip';

interface Props {
  steps: GuideStep[];
  onOpen: (id: string) => void;
  onPhone: () => void;
  onChat: (id: string | null) => void;
  onAdvance: () => void;
  onReport: () => void;
  onLive: () => void;
  onHubspot: () => void;
  onHide: () => void;
}

/** First-visit guide: five things to try, one row, with only the next step spelled out. */
export function DemoGuide({ steps, onOpen, onPhone, onChat, onAdvance, onReport, onLive, onHubspot, onHide }: Props) {
  const done = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done);
  const run = (s: GuideStep) =>
    s.action === 'phone' ? onPhone() : s.action === 'chat' ? onChat(s.targetId) : s.action === 'advance' ? onAdvance() : s.action === 'report' ? onReport() : s.action === 'live' ? onLive() : s.targetId && onOpen(s.targetId);

  return (
    <section aria-labelledby="guide-title" className="anim-fade relative rounded-2xl border border-lavender bg-card px-4 py-3 sm:px-5">
      <button
        type="button"
        onClick={onHide}
        aria-label="Hide the guide"
        className="absolute right-2 top-2 rounded-md p-1.5 text-muted hover:bg-white hover:text-navy"
      >
        <X size={18} />
      </button>

      <div className="flex flex-col gap-3 pr-8 lg:flex-row lg:items-center lg:gap-4">
        <h2 id="guide-title" className="flex shrink-0 items-center gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-indigo">
          Demo guide · {done}/{steps.length}
          <InfoTip label="About this demo">
            <p className="font-semibold">Two sides of one funnel: the driver's phone and the ops cockpit.</p>
            <p>
              Drivers apply on the phone, and an AI assistant answers their questions and books their call when they confirm. Ops decides in the
              call with written rules and gets only the questions the AI can't handle. Every click logs a timestamp or a reason code, and a weekly
              report writes itself from those numbers.
            </p>
            <p className="text-muted">Demo data, nothing is sent. Reset demo in the demo bar starts over.</p>
            <button type="button" onClick={onHubspot} className="inline-flex items-center gap-1 font-semibold text-indigo hover:underline">
              <Network size={13} aria-hidden /> How this maps to HubSpot
            </button>
          </InfoTip>
        </h2>

        <ol className="flex flex-wrap gap-2">
          {steps.map((s, i) => (
            <li key={s.key}>
              <button
                type="button"
                disabled={s.action === 'open' && !s.targetId}
                onClick={() => run(s)}
                aria-current={s === next ? 'step' : undefined}
                className={`flex items-center gap-2 rounded-full border bg-white py-1 pl-1 pr-3 text-sm font-semibold transition-colors disabled:cursor-default ${
                  s.done ? 'border-ok/40 text-ok' : s === next ? 'border-indigo text-navy' : 'border-lavender text-navy hover:border-indigo'
                }`}
              >
                <span
                  aria-hidden
                  className={`num flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${s.done ? 'bg-ok text-white' : s === next ? 'bg-indigo text-white' : 'bg-lavender text-navy'}`}
                >
                  {s.done ? <Check size={14} /> : i + 1}
                </span>
                {s.title}
                {s.done && <span className="sr-only">(done)</span>}
              </button>
            </li>
          ))}
        </ol>
      </div>

      {next ? (
        <p className="mt-2 text-sm text-muted">
          <span className="font-semibold text-navy">Next:</span> {next.hint}
        </p>
      ) : (
        <p className="mt-2 text-sm text-ok font-semibold">All six tried. Hide the guide with ✕, or Reset demo to start over.</p>
      )}
    </section>
  );
}
