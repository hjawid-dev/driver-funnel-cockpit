import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { PRESENT_STEPS, type GuideStatus } from '../lib/present';

export type GuideView = 'target' | 'start' | 'reminders' | 'criteria' | 'job' | 'report' | 'followup_reminder' | 'followup_call';
interface Props {
  step: number;
  onStep: (i: number) => void;
  onExit: () => void;
  evidence: string;
  status: GuideStatus;
  onExplore: (view: GuideView) => void;
  jumpLabel: string | null;
  onJump: () => void;
}
/** Explain the case problem, then lead to the existing solution. Contains no business-action buttons. */
export function PresentBar({ step, onStep, onExit, evidence, status, onExplore, jumpLabel, onJump }: Props) {
  const s = PRESENT_STEPS[step], last = PRESENT_STEPS.length - 1;
  return <section aria-label="Case walkthrough" className="border-b border-indigo/20 bg-white shadow-sm">
    <div className="mx-auto max-w-7xl px-4 py-2">
      <div className="flex flex-wrap items-center gap-3">
        <ol aria-label="Case steps" className="flex flex-wrap items-center gap-3">
          {([1, 2] as const).map(part => <li key={part} className="flex items-center gap-1"><span className="mr-1 text-[11px] font-semibold uppercase text-indigo">Case {part}</span>{PRESENT_STEPS.map((p, i) => p.part === part ? <button key={p.key} type="button" onClick={() => onStep(i)} aria-current={i === step ? 'step' : undefined} aria-label={`Step ${i + 1}: ${p.title}`} title={p.title} className={`num h-7 w-7 rounded-full text-xs font-semibold ${i === step ? 'bg-indigo text-white' : 'bg-lavender/50 text-indigo hover:bg-lavender'}`}>{i + 1}</button> : null)}</li>)}
        </ol>
        <span className="text-xs text-muted">Step {step + 1} of {PRESENT_STEPS.length}</span>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" disabled={step === 0} onClick={() => onStep(step - 1)} aria-label="Previous step" className="rounded p-1.5 text-navy hover:bg-card disabled:opacity-30"><ChevronLeft size={18} /></button>
          <button type="button" onClick={step < last ? () => onStep(step + 1) : onExit} className="flex items-center gap-1 rounded-lg bg-indigo px-3 py-1.5 text-sm font-semibold text-white">{step < last ? 'Next' : 'Finish'}<ChevronRight size={15} /></button>
          <button type="button" onClick={onExit} aria-label="Exit case walkthrough" className="rounded p-1.5 text-muted hover:bg-card"><X size={18} /></button>
        </div>
      </div>
      <h2 className="mt-2 text-sm font-semibold text-navy">{s.title}</h2>
      <p className="mt-1 text-sm text-navy"><strong className="text-indigo">Solution: </strong>{s.solution}</p>
      <p className="mt-1 text-sm text-navy">{status.kind === 'pending' ? status.text.replace('To continue: ', '') : s.instruction}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <button type="button" onClick={() => onExplore('target')} className="rounded-md border border-indigo px-2.5 py-1.5 font-semibold text-indigo">Show: {s.location}</button>
        {s.key === 'onboarding' && <button type="button" onClick={() => onExplore('start')} className="rounded border border-lavender px-2 py-1.5 font-semibold text-indigo">View application start</button>}
        {s.key === 'reminders' && <button type="button" onClick={() => onExplore('reminders')} className="rounded border border-lavender px-2 py-1.5 font-semibold text-indigo">Open Ops reminder schedule</button>}
        {s.key === 'activate' && <button type="button" onClick={() => onExplore('job')} className="rounded border border-lavender px-2 py-1.5 font-semibold text-indigo">Track same job in Live Ops</button>}
        {['activate'].includes(s.key) && <button type="button" onClick={() => onExplore('criteria')} className="rounded border border-lavender px-2 py-1.5 font-semibold text-indigo">Open Ahmed’s checks</button>}
        {s.key === 'followup' && <><button type="button" onClick={() => onExplore('followup_reminder')} className="rounded border border-lavender px-2 py-1.5 font-semibold text-indigo">See 7-day reminder</button><button type="button" onClick={() => onExplore('followup_call')} className="rounded border border-lavender px-2 py-1.5 font-semibold text-indigo">See demand blocker</button></>}
        {s.key === 'measure' && <button type="button" onClick={() => onExplore('report')} className="rounded-md bg-indigo px-3 py-1.5 font-semibold text-white">Open weekly report</button>}
        {jumpLabel && <button type="button" onClick={onJump} className="rounded border border-lavender px-2 py-1.5 font-semibold text-muted">{jumpLabel}</button>}
      </div>
      {status.kind === 'complete' && <p role="status" className={`mt-2 rounded-md px-2.5 py-1.5 text-xs font-semibold ${status.kind === 'complete' ? 'bg-ok-bg text-ok' : status.kind === 'pending' ? 'bg-lavender/50 text-indigo' : 'bg-card text-muted'}`}>{status.kind === 'complete' ? '✓ ' : ''}{status.text}</p>}
      {evidence && <details className="mt-1 text-xs text-muted"><summary className="cursor-pointer">Current record</summary>{evidence}</details>}
    </div>
  </section>;
}
