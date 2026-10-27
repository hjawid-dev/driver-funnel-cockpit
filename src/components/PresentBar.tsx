import { ChevronLeft, ChevronRight, LoaderCircle, X } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { getGuideHint, subscribeGuideHint } from '../lib/guideFocus';
import { PRESENT_CHAPTERS, PRESENT_STEPS, type GuideStatus, type guideIntro } from '../lib/present';

export type GuideView = 'target' | 'start' | 'reminders' | 'criteria' | 'job' | 'report' | 'followup_reminder' | 'followup_call' | 'followup_read';
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
  /** The app's latest confirmation, shown here instead of a floating toast during the walkthrough. */
  notice: string | null;
}

/** One guide panel, fixed top left in every step. The app stays usable beside it; the spotlight marks the next control. */
export function PresentBar({ step, onStep, onExit, evidence, status, feedback, reportBusy, intro, visited, needsDecision, firstDriveBooked, incidentClosed, onExplore, jumpLabel, onJump, notice }: Props) {
  const hint = useSyncExternalStore(subscribeGuideHint, getGuideHint);
  const s = PRESENT_STEPS[step], last = PRESENT_STEPS.length - 1;
  const chapters = PRESENT_CHAPTERS.filter(c => c.part === s.part);
  const chapter = chapters.findIndex(c => c.keys.includes(s.key));
  const nextIndex = s.part === 1 && incidentClosed && s.key !== 'prevent' ? PRESENT_STEPS.findIndex(p => p.key === 'prevent') : step + 1;
  const nextStep = PRESENT_STEPS[nextIndex];
  const nextChapter = nextStep && PRESENT_CHAPTERS.find(c => c.keys.includes(nextStep.key));
  const canContinue = status.kind === 'complete' || (s.part === 1 && incidentClosed) || ['prevent', 'measure'].includes(s.key)
    || (s.key === 'reminders' && feedback === 'Manual follow-up logged')
    || (s.key === 'queue' && visited.includes('queue'))
    || (s.key === 'followup' && visited.includes('followup_read') && visited.includes('followup_call'));
  const nextLabel = s.key === 'onboarding' && status.kind === 'complete' ? 'Continue to Nora’s reminder' : step === last ? 'Finish walkthrough' : nextStep.part !== s.part ? 'Continue to Case 2' : nextChapter !== chapters[chapter] ? `Continue to ${nextChapter?.label.toLowerCase()}` : 'Continue';
  const receipt = feedback || (status.kind === 'complete' ? status.text.replace(/^Complete: /, '') : s.key === 'onboarding' && status.text.includes('Registration saved') ? status.text.replace(/^To continue: /, '') : '');
  const button = 'rounded-md border border-lavender px-2.5 py-1.5 text-left text-sm font-semibold text-indigo hover:border-indigo';
  return createPortal(<aside aria-label="Case walkthrough" className="guide-panel">
    <div className="guide-panel-head">
      <nav aria-label="Choose case" className="flex rounded-lg bg-white/10 p-0.5 text-xs font-semibold">
        {([1, 2] as const).map(part => <button key={part} type="button" onClick={() => onStep(PRESENT_STEPS.findIndex(p => p.part === part))} aria-current={part === s.part ? 'true' : undefined} className={`whitespace-nowrap rounded-md px-2 py-1.5 ${part === s.part ? 'bg-white text-navy' : 'text-white/80 hover:text-white'}`}>Case {part} · {part === 1 ? 'Live Ops' : 'Driver Funnel'}</button>)}
      </nav>
      <button type="button" onClick={onExit} aria-label="Exit case walkthrough" title="Exit demo" className="ml-auto rounded p-1 text-white/80 hover:bg-white/10 hover:text-white"><X size={18} /></button>
    </div>
    <div className="guide-panel-body">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Chapter {chapter + 1} of {chapters.length}</p>
        <ol aria-label="Case chapters" className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {chapters.map((c, i) => <li key={c.label}><button type="button" onClick={() => onStep(PRESENT_STEPS.findIndex(p => p.key === c.keys[0]))} aria-current={i === chapter ? 'step' : undefined} className={`border-b-2 pb-0.5 ${i === chapter ? 'border-indigo font-semibold text-indigo' : 'border-transparent text-muted hover:text-indigo'}`}>{c.label}</button></li>)}
        </ol>
      </div>
      <div>
        <h2 className="text-xl font-semibold leading-snug text-navy">{intro.title}</h2>
        <p className="mt-0.5 text-xs text-muted">{intro.role}</p>
        <p className="mt-3 text-[15px] leading-relaxed text-navy/80">{intro.context}</p>
        {receipt && <p role="status" className={`mt-3 text-sm font-semibold ${status.kind === 'complete' || feedback ? 'text-ok' : 'text-indigo'}`}>{status.kind === 'complete' || feedback ? '✓ ' : ''}{receipt}</p>}
        {hint && <p className="guide-hint mt-3" aria-live="polite">→ {hint}</p>}
      </div>
      <div className="flex flex-col items-start gap-2">
        {s.key === 'reminders' && <button data-guide="guide-reminders" type="button" onClick={() => onExplore('reminders')} className={button}>Open Nora’s Ops follow-up</button>}
        {s.key === 'activate' && <>{firstDriveBooked && <button data-guide="guide-job" type="button" onClick={() => onExplore('job')} className={button}>View booked job in Live Ops</button>}{needsDecision && <button data-guide="guide-criteria" type="button" onClick={() => onExplore('criteria')} className={button}>Open Ahmed’s checks</button>}</>}
        {s.key === 'followup' && <>{visited.includes('followup_reminder') && !visited.includes('followup_read') ? <button data-guide="guide-reminder-read" type="button" onClick={() => onExplore('followup_read')} className="rounded-lg bg-indigo px-3 py-2 text-sm font-semibold text-white">Continue to Anton</button> : null}<button data-guide="guide-followup-reminder" type="button" onClick={() => onExplore('followup_reminder')} className={button}>{visited.includes('followup_reminder') ? '✓ ' : ''}Ida: day-7 reminder</button><button data-guide="guide-followup-call" type="button" onClick={() => onExplore('followup_call')} className={button}>{visited.includes('followup_call') ? '✓ ' : ''}Anton: no matching drive</button></>}
        {jumpLabel && <button data-guide="guide-clock" type="button" onClick={onJump} className={button}>{jumpLabel}</button>}
        {s.key === 'measure' && <button data-guide="guide-report" type="button" disabled={reportBusy} aria-busy={reportBusy} onClick={() => onExplore('report')} className={`${button} flex items-center gap-1`}>{reportBusy && <LoaderCircle size={13} className="animate-spin" />}{reportBusy ? 'Preparing report…' : 'Explore weekly report (optional)'}</button>}
        <button data-guide="guide-target" type="button" onClick={() => onExplore('target')} className="text-sm text-indigo underline underline-offset-2">Find the action</button>
      </div>
      <div className="space-y-2 text-sm text-muted">
        <details><summary className="cursor-pointer">Why this matters</summary><p className="mt-1 text-navy"><strong>Solution: </strong>{s.solution}</p><p className="mt-1">{s.instruction}</p>{evidence && <p className="mt-1">{evidence}</p>}</details>
        <details><summary className="cursor-pointer">All steps</summary><ol aria-label="Case steps" className="mt-1 space-y-1">{PRESENT_STEPS.map((p, i) => <li key={p.key}><button type="button" onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); onStep(i); }} aria-current={i === step ? 'step' : undefined} className={`text-left hover:text-indigo ${i === step ? 'font-semibold text-indigo' : ''}`}>Case {p.part} · {p.title}</button></li>)}</ol></details>
      </div>
    </div>
    <div className="guide-panel-foot">
      {notice && <p role="status" className="guide-notice">{notice}</p>}
      <button type="button" disabled={step === 0} onClick={() => onStep(step - 1)} aria-label="Previous step" className="rounded p-1.5 text-muted hover:bg-card disabled:opacity-30"><ChevronLeft size={18} /></button>
      <button data-guide="guide-next" type="button" onClick={step < last ? () => onStep(nextIndex) : onExit} className={canContinue ? 'ml-auto flex items-center gap-1 rounded-lg bg-indigo px-3.5 py-2 text-sm font-semibold text-white' : 'ml-auto text-sm text-muted underline underline-offset-2'}>{canContinue ? nextLabel : 'Skip this step'}{canContinue && <ChevronRight size={15} />}</button>
    </div>
  </aside>, document.body);
}
