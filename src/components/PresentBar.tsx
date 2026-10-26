import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { PRESENT_STEPS } from '../lib/present';

interface Props {
  step: number;
  onStep: (i: number) => void;
  onExit: () => void;
}

const PART_LABEL = { 1: 'Part 1 · Live Ops', 2: 'Part 2 · Driver Funnel' } as const;

/** Presentation mode: which part and step is on screen, one line to say, and a way to move on. Never locks the app. */
export function PresentBar({ step, onStep, onExit }: Props) {
  const s = PRESENT_STEPS[step];
  const last = PRESENT_STEPS.length - 1;
  const parts = [1, 2] as const;
  return (
    <div className="border-b border-indigo/20 bg-white">
      <div className="bg-lavender/60">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
        <ol aria-label="Presentation steps" className="flex items-center gap-3">
          {parts.map((part) => (
            <li key={part} className="flex items-center gap-1">
              <span className={`mr-0.5 text-[11px] font-semibold uppercase tracking-wide ${s.part === part ? 'text-indigo' : 'text-muted'}`}>Part {part}</span>
              {PRESENT_STEPS.map((p, i) =>
                p.part !== part ? null : (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => onStep(i)}
                    aria-current={i === step ? 'step' : undefined}
                    title={`${PART_LABEL[p.part]} · ${p.kind}: ${p.title}`}
                    className={`num flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${i === step ? 'bg-indigo text-white' : i < step ? 'bg-white text-indigo' : 'bg-white/70 text-muted hover:text-navy'}`}
                  >
                    {i + 1}
                  </button>
                ),
              )}
            </li>
          ))}
        </ol>
        <p className="min-w-0 flex-1 basis-80 text-sm">
          <span className={`mr-2 rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${s.kind === 'Problem' ? 'bg-bad-bg text-bad' : 'bg-ok-bg text-ok'}`}>{s.kind}</span>
          <strong className="font-semibold">{s.title}.</strong> <span className="text-muted">{s.say}</span>
        </p>
        <div className="flex items-center gap-1">
          <button type="button" disabled={step === 0} onClick={() => onStep(step - 1)} aria-label="Previous step" className="rounded-md p-1.5 text-navy hover:bg-white disabled:opacity-30">
            <ChevronLeft size={18} />
          </button>
          {step < last ? (
            <button type="button" onClick={() => onStep(step + 1)} className="flex items-center gap-1 rounded-lg bg-indigo px-3 py-1.5 text-sm font-semibold text-white hover:bg-navy">
              Next <ChevronRight size={15} aria-hidden />
            </button>
          ) : (
            <button type="button" onClick={onExit} className="rounded-lg bg-indigo px-3 py-1.5 text-sm font-semibold text-white hover:bg-navy">
              Finish
            </button>
          )}
          <button type="button" onClick={onExit} aria-label="Exit presentation" title="Exit presentation" className="ml-1 rounded-md p-1.5 text-muted hover:bg-white hover:text-navy">
            <X size={18} />
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}
