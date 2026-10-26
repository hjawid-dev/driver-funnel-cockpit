import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { PRESENT_ACTION_LABEL, PRESENT_STEPS, type PresentAction } from '../lib/present';

interface Props {
  step: number;
  onStep: (i: number) => void;
  onExit: () => void;
  action: PresentAction | null;
  completed: boolean;
  blocked: boolean;
  evidence: string;
  error: string | null;
  onRun: () => void;
  onPrepare: () => void;
  onInspect: (view: 'phone' | 'prevention' | 'report') => void;
}

/** User walkthrough: navigate the two cases, do the task and see the recorded result. */
export function PresentBar({ step, onStep, onExit, action, completed, blocked, evidence, error, onRun, onPrepare, onInspect }: Props) {
  const s = PRESENT_STEPS[step];
  const last = PRESENT_STEPS.length - 1;
  return (
    <section aria-label="Case walkthrough" className="border-b border-indigo/20 bg-white shadow-sm">
      <div className="mx-auto max-w-7xl px-4 py-2">
        <div className="flex flex-wrap items-center gap-3">
          <ol aria-label="Case steps" className="flex items-center gap-3">
            {([1, 2] as const).map(part => <li key={part} className="flex items-center gap-1"><span className="mr-1 text-[11px] font-semibold uppercase text-indigo">Case {part}</span>{PRESENT_STEPS.map((p, i) => p.part === part ? <button key={p.key} type="button" onClick={() => onStep(i)} aria-current={i === step ? 'step' : undefined} aria-label={`Step ${i + 1}: ${p.title}`} title={p.title} className={`num h-7 w-7 rounded-full text-xs font-semibold ${i === step ? 'bg-indigo text-white' : 'bg-lavender/50 text-indigo hover:bg-lavender'}`}>{i + 1}</button> : null)}</li>)}
          </ol>
          <span className="text-xs text-muted">Step {step + 1} of {PRESENT_STEPS.length}</span>
          <div className="ml-auto flex items-center gap-1">
            <button type="button" disabled={step === 0} onClick={() => onStep(step - 1)} aria-label="Previous step" className="rounded p-1.5 text-navy hover:bg-card disabled:opacity-30"><ChevronLeft size={18} /></button>
            <button type="button" onClick={step < last ? () => onStep(step + 1) : onExit} className="flex items-center gap-1 rounded-lg bg-indigo px-3 py-1.5 text-sm font-semibold text-white">{step < last ? 'Next' : 'Finish'}<ChevronRight size={15} /></button>
            <button type="button" onClick={onExit} aria-label="Exit case walkthrough" className="rounded p-1.5 text-muted hover:bg-card"><X size={18} /></button>
          </div>
        </div>
        <p className="mt-2 text-sm"><span className={`mr-2 rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase ${s.kind === 'Problem' ? 'bg-bad-bg text-bad' : 'bg-ok-bg text-ok'}`}>{s.kind}</span><strong>{s.title}</strong></p>
        <p className="mt-1 text-xs text-muted">{s.instruction}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {action && !completed && (blocked ? <button type="button" onClick={onPrepare} className="rounded-md border border-indigo px-3 py-1.5 text-xs font-semibold text-indigo">Load missing prerequisites for this step</button> : <button type="button" onClick={onRun} className="rounded-md bg-indigo px-3 py-1.5 text-xs font-semibold text-white">{PRESENT_ACTION_LABEL[action]}</button>)}
          {action && completed && <span className="rounded bg-ok-bg px-2 py-1 text-xs font-semibold text-ok">Action recorded</span>}
          {s.key === 'prevent' && <button type="button" onClick={() => onInspect('prevention')} className="rounded border border-lavender px-2 py-1 text-xs font-semibold text-indigo">Open next new-site check</button>}
          {['docs', 'activate', 'deliver'].includes(s.key) && <button type="button" onClick={() => onInspect('phone')} className="rounded border border-lavender px-2 py-1 text-xs font-semibold text-indigo">Open {s.key === 'docs' ? 'Nora' : 'Elin'}’s phone</button>}
          {s.key === 'measure' && <button type="button" onClick={() => onInspect('report')} className="rounded-md bg-indigo px-3 py-1.5 text-xs font-semibold text-white">Open weekly report</button>}
        </div>
        {evidence && <p role="status" className="mt-2 text-xs font-medium text-ok">{evidence}</p>}
        {error && <p role="alert" className="mt-2 text-xs font-semibold text-bad">{error}</p>}
      </div>
    </section>
  );
}
