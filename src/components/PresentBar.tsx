import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, LoaderCircle, X } from 'lucide-react';
import { PRESENT_CHAPTERS, PRESENT_STEPS, type GuideStatus, type guideIntro } from '../lib/present';

export type GuideView = 'target' | 'start' | 'reminders' | 'criteria' | 'job' | 'report' | 'followup_reminder' | 'followup_call' | 'followup_read';
interface Props {
  step: number;
  sidePanelWidth: number;
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
export function PresentBar({ sidePanelWidth, step, onStep, onExit, evidence, status, feedback, reportBusy, intro, visited, needsDecision, firstDriveBooked, incidentClosed, onExplore, jumpLabel, onJump }: Props) {
  const [expanded, setExpanded] = useState(true);
  const popup = useRef<HTMLElement>(null);
  const showAction = useRef<HTMLButtonElement>(null);
  const openGuide = useRef<HTMLButtonElement>(null);
  useEffect(() => setExpanded(true), [step]);
  useEffect(() => { document.dispatchEvent(new Event('guide-visibility')); }, [expanded]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => (expanded ? showAction : openGuide).current?.focus());
    if (!expanded) return () => cancelAnimationFrame(frame);
    const root = document.getElementById('root')!;
    root.inert = true;
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); setExpanded(false); }
      if (event.key !== 'Tab') return;
      const controls = [...(popup.current?.querySelectorAll<HTMLElement>('button:not(:disabled), summary, a[href]') ?? [])].filter(el => el.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', key, true);
    return () => { root.inert = false; cancelAnimationFrame(frame); document.removeEventListener('keydown', key, true); };
  }, [expanded, step]);
  const explore = (view: GuideView) => { setExpanded(false); onExplore(view); };
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
  const button = 'rounded-md border border-lavender px-2.5 py-1.5 text-xs font-semibold text-indigo hover:border-indigo';
  return createPortal(<div className={expanded ? 'guide-modal-backdrop' : 'guide-dock'} style={{ '--guide-side': `${sidePanelWidth}px` } as CSSProperties}>
    <section ref={popup} data-guide-popup={expanded ? '' : undefined} aria-label="Case walkthrough" role={expanded ? 'dialog' : undefined} aria-modal={expanded ? true : undefined} className={expanded ? 'guide-modal space-y-4' : 'space-y-2'}>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {!expanded && <button ref={openGuide} type="button" onClick={() => setExpanded(true)} className="rounded-lg bg-indigo px-3 py-2 text-sm font-semibold text-white">Open guide</button>}
        <nav aria-label="Choose case" className="flex gap-1">
          {([1, 2] as const).map(part => <button key={part} type="button" onClick={() => { setExpanded(true); onStep(PRESENT_STEPS.findIndex(p => p.part === part)); }} aria-current={part === s.part ? 'true' : undefined} className={`rounded px-2 py-1 font-semibold ${part === s.part ? 'bg-indigo text-white' : 'bg-card text-muted hover:text-indigo'}`}>Case {part} · {part === 1 ? 'Live Ops' : 'Driver Funnel'}</button>)}
        </nav>
        <span className="ml-auto text-muted">Chapter {chapter + 1} of {chapters.length}</span>
        <button type="button" onClick={() => expanded ? setExpanded(false) : onExit()} aria-label={expanded ? "Minimise guide" : "Exit case walkthrough"} className="rounded p-1 text-muted hover:bg-card"><X size={16} /></button>
      </div>
      {expanded && <ol aria-label="Case chapters" className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
        {chapters.map((c, i) => <li key={c.label}><button type="button" onClick={() => { setExpanded(true); onStep(PRESENT_STEPS.findIndex(p => p.key === c.keys[0])); }} aria-current={i === chapter ? 'step' : undefined} className={`border-b-2 pb-1 ${i === chapter ? 'border-indigo font-semibold text-indigo' : 'border-transparent text-muted hover:text-indigo'}`}>{c.label}</button></li>)}
      </ol>}
      <div>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5"><h2 className={`${expanded ? 'text-2xl' : 'text-base'} font-semibold text-navy`}>{intro.title}</h2><span className="text-[11px] text-muted">{intro.role}</span></div>
        {expanded && <p className="mt-2 text-base leading-relaxed text-muted">{intro.context}</p>}
        {receipt && <p role="status" className={`mt-1 text-xs font-semibold ${status.kind === 'complete' || feedback ? 'text-ok' : 'text-indigo'}`}>{status.kind === 'complete' || feedback ? '✓ ' : ''}{receipt}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {s.key === 'reminders' && <button data-guide="guide-reminders" type="button" onClick={() => explore('reminders')} className={button}>Open Nora’s Ops follow-up</button>}
        {s.key === 'activate' && <>{firstDriveBooked && <button data-guide="guide-job" type="button" onClick={() => explore('job')} className={button}>View booked job in Live Ops</button>}{needsDecision && <button data-guide="guide-criteria" type="button" onClick={() => explore('criteria')} className={button}>Open Ahmed’s checks</button>}</>}
        {s.key === 'followup' && <>{visited.includes('followup_reminder') && !visited.includes('followup_read') ? <button data-guide="guide-reminder-read" type="button" onClick={() => explore('followup_read')} className="rounded-lg bg-indigo px-3 py-2 text-sm font-semibold text-white">Continue to Anton</button> : null}<button data-guide="guide-followup-reminder" type="button" onClick={() => explore('followup_reminder')} className={button}>{visited.includes('followup_reminder') ? '✓ ' : ''}Ida: day-7 reminder</button><button data-guide="guide-followup-call" type="button" onClick={() => explore('followup_call')} className={button}>{visited.includes('followup_call') ? '✓ ' : ''}Anton: no matching drive</button></>}
        {jumpLabel && <button data-guide="guide-clock" type="button" onClick={() => { setExpanded(false); onJump(); }} className={button}>{jumpLabel}</button>}
        <button ref={showAction} data-guide="guide-target" type="button" onClick={() => { setExpanded(false); if (!expanded) onExplore('target'); }} className={expanded ? 'rounded-lg bg-indigo px-4 py-2.5 text-base font-semibold text-white' : 'text-sm text-indigo underline underline-offset-2'}>{expanded ? 'Show the action' : 'Find the action'}</button>
        <details className="text-xs text-muted"><summary className="cursor-pointer">Why this matters</summary><p className="mt-1 max-w-2xl text-navy"><strong>Solution: </strong>{s.solution}</p><p className="mt-1 max-w-2xl">{s.instruction}</p>{evidence && <p className="mt-1 max-w-2xl">{evidence}</p>}</details>
        <details className="text-xs text-muted"><summary className="cursor-pointer">All steps</summary><ol aria-label="Case steps" className="mt-1 space-y-1">{PRESENT_STEPS.map((p, i) => <li key={p.key}><button type="button" onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); onStep(i); }} aria-current={i === step ? 'step' : undefined} className={`text-left hover:text-indigo ${i === step ? 'font-semibold text-indigo' : ''}`}>Case {p.part} · {p.title}</button></li>)}</ol></details>
        {s.key === 'measure' && <button data-guide="guide-report" type="button" disabled={reportBusy} aria-busy={reportBusy} onClick={() => explore('report')} className="flex items-center gap-1 text-xs text-indigo underline underline-offset-2">{reportBusy && <LoaderCircle size={13} className="animate-spin" />}{reportBusy ? 'Preparing report…' : 'Explore weekly report (optional)'}</button>}
        <div className="ml-auto flex items-center gap-2">
          <button type="button" disabled={step === 0} onClick={() => onStep(step - 1)} aria-label="Previous step" className="rounded p-1 text-muted hover:bg-card disabled:opacity-30"><ChevronLeft size={17} /></button>
          <button data-guide="guide-next" type="button" onClick={step < last ? () => onStep(nextIndex) : onExit} className={canContinue ? 'flex items-center gap-1 rounded-lg bg-indigo px-3 py-1.5 text-xs font-semibold text-white' : 'text-xs text-muted underline underline-offset-2'}>{canContinue ? nextLabel : 'Skip this step'}{canContinue && <ChevronRight size={14} />}</button>
        </div>
      </div>
      {expanded && <button type="button" onClick={onExit} className="text-sm text-muted underline">Exit demo</button>}
    </section>
  </div>, document.body);
}
