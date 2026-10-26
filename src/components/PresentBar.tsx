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

/** The script and explicit demo actions remain reachable while a file or report is open. */
export function PresentBar({ step, onStep, onExit, action, completed, blocked, evidence, error, onRun, onPrepare, onInspect }: Props) {
  const s = PRESENT_STEPS[step];
  const last = PRESENT_STEPS.length - 1;
  return (
    <section aria-label="Guided case demonstration" className="border-b border-indigo/20 bg-white shadow-sm">
      <div className="mx-auto max-w-7xl px-4 py-2">
        <div className="flex flex-wrap items-center gap-3">
          <ol aria-label="Presentation steps" className="flex items-center gap-3">
            {([1, 2] as const).map(part => <li key={part} className="flex items-center gap-1"><span className="mr-1 text-[11px] font-semibold uppercase text-indigo">Case {part}</span>{PRESENT_STEPS.map((p, i) => p.part === part ? <button key={p.key} type="button" onClick={() => onStep(i)} aria-current={i === step ? 'step' : undefined} aria-label={`Step ${i + 1}: ${p.title}`} title={p.title} className={`num h-7 w-7 rounded-full text-xs font-semibold ${i === step ? 'bg-indigo text-white' : 'bg-lavender/50 text-indigo hover:bg-lavender'}`}>{i + 1}</button> : null)}</li>)}
          </ol>
          <span className="text-xs text-muted">6–8 min · demo clock paused · explicit time jumps</span>
          <div className="ml-auto flex items-center gap-1">
            <button type="button" disabled={step === 0} onClick={() => onStep(step - 1)} aria-label="Previous step" className="rounded p-1.5 text-navy hover:bg-card disabled:opacity-30"><ChevronLeft size={18} /></button>
            <button type="button" onClick={step < last ? () => onStep(step + 1) : onExit} className="flex items-center gap-1 rounded-lg bg-indigo px-3 py-1.5 text-sm font-semibold text-white">{step < last ? 'Next' : 'Finish'}<ChevronRight size={15} /></button>
            <button type="button" onClick={onExit} aria-label="Exit presentation" className="rounded p-1.5 text-muted hover:bg-card"><X size={18} /></button>
          </div>
        </div>
        <p className="mt-2 text-sm"><span className={`mr-2 rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase ${s.kind === 'Problem' ? 'bg-bad-bg text-bad' : 'bg-ok-bg text-ok'}`}>{s.kind}</span><strong>{s.title}</strong></p>
        <details className="mt-1 text-xs text-muted"><summary className="cursor-pointer font-semibold text-indigo">Presenter guide: say, do, prove</summary><div className="mt-2 grid gap-2 md:grid-cols-3"><p><strong className="text-navy">Say: </strong>{s.say}</p><p><strong className="text-navy">Do: </strong>{s.do}</p><p><strong className="text-navy">Prove: </strong>{s.proof}</p></div></details>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {action && !completed && (blocked ? <button type="button" onClick={onPrepare} className="rounded-md border border-indigo px-3 py-1.5 text-xs font-semibold text-indigo">Prepare earlier demo actions · keep this session</button> : <button type="button" onClick={onRun} className="rounded-md bg-indigo px-3 py-1.5 text-xs font-semibold text-white">{PRESENT_ACTION_LABEL[action]}</button>)}
          {action && completed && <span className="rounded bg-ok-bg px-2 py-1 text-xs font-semibold text-ok">Demo action recorded</span>}
          {s.key === 'prevent' && <button type="button" onClick={() => onInspect('prevention')} className="rounded border border-lavender px-2 py-1 text-xs font-semibold text-indigo">Open next new-site check</button>}
          {['docs', 'activate', 'deliver'].includes(s.key) && <button type="button" onClick={() => onInspect('phone')} className="rounded border border-lavender px-2 py-1 text-xs font-semibold text-indigo">Open {s.key === 'docs' ? 'Nora' : 'Elin'}’s phone</button>}
          {s.key === 'measure' && <button type="button" onClick={() => onInspect('report')} className="rounded-md bg-indigo px-3 py-1.5 text-xs font-semibold text-white">Open weekly report</button>}
        </div>
        {evidence && <p role="status" className="mt-2 text-xs font-medium text-ok">{evidence}</p>}
        {error && <p role="alert" className="mt-2 text-xs font-semibold text-bad">{error}</p>}
        {s.key === 'prevent' && <details className="mt-2 text-xs text-muted"><summary className="cursor-pointer font-semibold text-indigo">If the keys are still missing at 10:15</summary><p className="mt-1">The customer chooses later today, a new date or cancellation. Rescheduling stays an owned task until a replacement is booked. After the last departure time, keys alone are not enough: agree a feasible revised deadline. Waiting is compensated; a cancelled or new-date drive adds 250 SEK under the proposed policy.</p></details>}
        {s.key === 'review' && <details className="mt-2 text-xs text-muted"><summary className="cursor-pointer font-semibold text-indigo">Borderline cases and no suitable first job</summary><p className="mt-1">A licence held 1–2 years means simple drives. Suitability rejection requires owner plus a separate backup review. With no matching job, record why the driver waits and follow up; never create activation without delivery.</p></details>}
      </div>
    </section>
  );
}
