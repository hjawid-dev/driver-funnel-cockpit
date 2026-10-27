import { ChevronLeft, ChevronRight, LoaderCircle, X } from 'lucide-react';
import { PRESENT_CHAPTERS, PRESENT_STEPS, type GuideStatus, type guideIntro } from '../lib/present';

export type GuideView = 'target' | 'start' | 'reminders' | 'criteria' | 'job' | 'report' | 'followup_reminder' | 'followup_call';
interface Props {
  step: number;
  onStep: (i: number) => void;
  onExit: () => void;
  evidence: string;
  status: GuideStatus;
  feedback: string;
  reportBusy: boolean;
  intro: ReturnType<typeof guideIntro>;
  visited: string[];
  needsDecision: boolean;
  firstDriveBooked: boolean;
  incidentClosed: boolean;
  onExplore: (view: GuideView) => void;
  jumpLabel: string | null;
  onJump: () => void;
}

/** Process chapters above; the ordinary app control is the primary action during a task. */
export function PresentBar({ step, onStep, onExit, evidence, status, feedback, reportBusy, intro, visited, needsDecision, firstDriveBooked, incidentClosed, onExplore, jumpLabel, onJump }: Props) {
  const s = PRESENT_STEPS[step], last = PRESENT_STEPS.length - 1;
  const chapters = PRESENT_CHAPTERS.filter(c => c.part === s.part);
  const chapter = chapters.findIndex(c => c.keys.includes(s.key));
  const nextIndex = s.part === 1 && incidentClosed && s.key !== 'prevent' ? PRESENT_STEPS.findIndex(p => p.key === 'prevent') : step + 1;
  const nextStep = PRESENT_STEPS[nextIndex];
  const nextChapter = nextStep && PRESENT_CHAPTERS.find(c => c.keys.includes(nextStep.key));
  const canContinue = status.kind === 'complete' || (s.part === 1 && incidentClosed) || ['prevent', 'measure'].includes(s.key)
    || (s.key === 'reminders' && feedback === 'Manual follow-up logged')
    || (s.key === 'queue' && visited.includes('queue'))
    || (s.key === 'followup' && visited.includes('followup_reminder') && visited.includes('followup_call'));
  const nextLabel = step === last ? 'Finish walkthrough' : nextStep.part !== s.part ? 'Continue to Case 2' : nextChapter !== chapters[chapter] ? `Continue to ${nextChapter?.label.toLowerCase()}` : 'Continue';
  const receipt = feedback || (status.kind === 'complete' ? status.text.replace(/^Complete: /, '') : s.key === 'onboarding' && status.text.includes('Registration saved') ? status.text.replace(/^To continue: /, '') : '');
  const button = 'rounded-md border border-lavender px-2.5 py-1.5 text-xs font-semibold text-indigo hover:border-indigo';
  return <section aria-label="Case walkthrough" className="border-b border-indigo/20 bg-white shadow-sm">
    <div className="mx-auto max-w-7xl space-y-2 px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <nav aria-label="Choose case" className="flex gap-1">
          {([1, 2] as const).map(part => <button key={part} type="button" onClick={() => onStep(PRESENT_STEPS.findIndex(p => p.part === part))} aria-current={part === s.part ? 'true' : undefined} className={`rounded px-2 py-1 font-semibold ${part === s.part ? 'bg-indigo text-white' : 'bg-card text-muted hover:text-indigo'}`}>Case {part} · {part === 1 ? 'Live Ops' : 'Driver Funnel'}</button>)}
        </nav>
        <span className="ml-auto text-muted">Chapter {chapter + 1} of {chapters.length}</span>
        <button type="button" onClick={onExit} aria-label="Exit case walkthrough" className="rounded p-1 text-muted hover:bg-card"><X size={16} /></button>
      </div>
      <ol aria-label="Case chapters" className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
        {chapters.map((c, i) => <li key={c.label}><button type="button" onClick={() => onStep(PRESENT_STEPS.findIndex(p => p.key === c.keys[0]))} aria-current={i === chapter ? 'step' : undefined} className={`border-b-2 pb-1 ${i === chapter ? 'border-indigo font-semibold text-indigo' : 'border-transparent text-muted hover:text-indigo'}`}>{c.label}</button></li>)}
      </ol>
      <div>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5"><h2 className="text-sm font-semibold text-navy">{intro.title}</h2><span className="text-[11px] text-muted">{intro.role}</span></div>
        <p className="mt-0.5 max-w-3xl text-xs leading-relaxed text-muted">{intro.context}</p>
        {receipt && <p role="status" className={`mt-1 text-xs font-semibold ${status.kind === 'complete' || feedback ? 'text-ok' : 'text-indigo'}`}>{status.kind === 'complete' || feedback ? '✓ ' : ''}{receipt}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {s.key === 'reminders' && <button data-guide="guide-reminders" type="button" onClick={() => onExplore('reminders')} className={button}>Open Nora’s Ops follow-up</button>}
        {s.key === 'activate' && <>{firstDriveBooked && <button data-guide="guide-job" type="button" onClick={() => onExplore('job')} className={button}>View booked job in Live Ops</button>}{needsDecision && <button data-guide="guide-criteria" type="button" onClick={() => onExplore('criteria')} className={button}>Open Ahmed’s checks</button>}</>}
        {s.key === 'followup' && <><button data-guide="guide-followup-reminder" type="button" onClick={() => onExplore('followup_reminder')} className={button}>{visited.includes('followup_reminder') ? '✓ ' : ''}Ida: day-7 reminder</button><button data-guide="guide-followup-call" type="button" onClick={() => onExplore('followup_call')} className={button}>{visited.includes('followup_call') ? '✓ ' : ''}Anton: no matching drive</button></>}
        {jumpLabel && <button data-guide="guide-clock" type="button" onClick={onJump} className={button}>{jumpLabel}</button>}
        <button data-guide="guide-target" type="button" onClick={() => onExplore('target')} className="text-xs text-indigo underline underline-offset-2">Find the action</button>
        <details className="text-xs text-muted"><summary className="cursor-pointer">Why this matters</summary><p className="mt-1 max-w-2xl text-navy"><strong>Solution: </strong>{s.solution}</p><p className="mt-1 max-w-2xl">{s.instruction}</p>{evidence && <p className="mt-1 max-w-2xl">{evidence}</p>}</details>
        <details className="text-xs text-muted"><summary className="cursor-pointer">All steps</summary><ol aria-label="Case steps" className="mt-1 space-y-1">{PRESENT_STEPS.map((p, i) => <li key={p.key}><button type="button" onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); onStep(i); }} aria-current={i === step ? 'step' : undefined} className={`text-left hover:text-indigo ${i === step ? 'font-semibold text-indigo' : ''}`}>Case {p.part} · {p.title}</button></li>)}</ol></details>
        {s.key === 'measure' && <button data-guide="guide-report" type="button" disabled={reportBusy} aria-busy={reportBusy} onClick={() => onExplore('report')} className="flex items-center gap-1 text-xs text-indigo underline underline-offset-2">{reportBusy && <LoaderCircle size={13} className="animate-spin" />}{reportBusy ? 'Preparing report…' : 'Explore weekly report (optional)'}</button>}
        <div className="ml-auto flex items-center gap-2">
          <button type="button" disabled={step === 0} onClick={() => onStep(step - 1)} aria-label="Previous step" className="rounded p-1 text-muted hover:bg-card disabled:opacity-30"><ChevronLeft size={17} /></button>
          <button data-guide="guide-next" type="button" onClick={step < last ? () => onStep(nextIndex) : onExit} className={canContinue ? 'flex items-center gap-1 rounded-lg bg-indigo px-3 py-1.5 text-xs font-semibold text-white' : 'text-xs text-muted underline underline-offset-2'}>{canContinue ? nextLabel : 'Skip this step'}{canContinue && <ChevronRight size={14} />}</button>
        </div>
      </div>
    </div>
  </section>;
}
