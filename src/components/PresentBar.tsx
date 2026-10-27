import { ChevronLeft, ChevronRight, LoaderCircle, X } from 'lucide-react';
import { PRESENT_STEPS, type GuideStatus } from '../lib/present';

export type GuideView = 'target' | 'start' | 'reminders' | 'criteria' | 'job' | 'report' | 'followup_reminder' | 'followup_call';
interface Props {
  step: number;
  onStep: (i: number) => void;
  onExit: () => void;
  evidence: string;
  status: GuideStatus;
  feedback: string;
  reportBusy: boolean;
  onExplore: (view: GuideView) => void;
  jumpLabel: string | null;
  onJump: () => void;
}

/** Short context above; the actual next action is marked on the existing control below. */
export function PresentBar({ step, onStep, onExit, evidence, status, feedback, reportBusy, onExplore, jumpLabel, onJump }: Props) {
  const s = PRESENT_STEPS[step], last = PRESENT_STEPS.length - 1;
  const button = 'rounded-md border border-lavender px-2.5 py-1.5 text-xs font-semibold text-indigo hover:border-indigo';
  return <section aria-label="Case walkthrough" className="border-b border-indigo/20 bg-white shadow-sm">
    <div className="mx-auto max-w-7xl space-y-2 px-4 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <ol aria-label="Case steps" className="flex flex-wrap items-center gap-2">
          {([1, 2] as const).map(part => <li key={part} className="flex items-center gap-1"><span className="mr-1 text-[11px] font-semibold uppercase text-indigo">Case {part}</span>{PRESENT_STEPS.map((p, i) => p.part === part ? <button key={p.key} type="button" onClick={() => onStep(i)} aria-current={i === step ? 'step' : undefined} aria-label={`Step ${i + 1}: ${p.title}`} title={p.title} className={`num h-7 w-7 rounded-full text-xs font-semibold ${i === step ? 'bg-indigo text-white' : 'bg-lavender/50 text-indigo hover:bg-lavender'}`}>{i + 1}</button> : null)}</li>)}
        </ol>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" disabled={step === 0} onClick={() => onStep(step - 1)} aria-label="Previous step" className="rounded p-1.5 text-navy hover:bg-card disabled:opacity-30"><ChevronLeft size={18} /></button>
          <button data-guide="guide-next" type="button" onClick={step < last ? () => onStep(step + 1) : onExit} className="flex items-center gap-1 rounded-lg bg-indigo px-3 py-1.5 text-sm font-semibold text-white">{step < last ? 'Continue' : 'Finish'}<ChevronRight size={15} /></button>
          <button type="button" onClick={onExit} aria-label="Exit case walkthrough" className="rounded p-1.5 text-muted hover:bg-card"><X size={18} /></button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="text-sm font-semibold text-navy">{s.title}</h2>
        <span role="status" className={`text-xs ${feedback || status.kind === 'complete' ? 'font-semibold text-ok' : 'text-muted'}`}>{feedback ? `✓ ${feedback}` : status.kind === 'complete' ? '✓ Done' : 'Follow the marked control'}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button data-guide="guide-target" type="button" onClick={() => onExplore('target')} className={button}>Show me</button>
        {s.key === 'reminders' && <button data-guide="guide-reminders" type="button" onClick={() => onExplore('reminders')} className={button}>Open Ops follow-up</button>}
        {s.key === 'activate' && <><button data-guide="guide-job" type="button" onClick={() => onExplore('job')} className={button}>View job in Live Ops</button><button data-guide="guide-criteria" type="button" onClick={() => onExplore('criteria')} className={button}>Open Ahmed’s checks</button></>}
        {s.key === 'followup' && <><button data-guide="guide-followup-reminder" type="button" onClick={() => onExplore('followup_reminder')} className={button}>See 7-day reminder</button><button data-guide="guide-followup-call" type="button" onClick={() => onExplore('followup_call')} className={button}>See demand blocker</button></>}
        {s.key === 'measure' && <button data-guide="guide-report" type="button" disabled={reportBusy} aria-busy={reportBusy} onClick={() => onExplore('report')} className={`${button} flex items-center gap-1`}>{reportBusy && <LoaderCircle size={14} className="animate-spin" />}{reportBusy ? 'Preparing report…' : 'Open weekly report'}</button>}
        {jumpLabel && <button data-guide="guide-clock" type="button" onClick={onJump} className={button}>{jumpLabel}</button>}
        <details className="text-xs text-muted"><summary className="cursor-pointer">Why this matters</summary><p className="mt-1 max-w-2xl text-navy"><strong>Solution: </strong>{s.solution}</p><p className="mt-1 max-w-2xl">{s.instruction}</p>{evidence && <p className="mt-1 max-w-2xl">{evidence}</p>}</details>
      </div>
    </div>
  </section>;
}
