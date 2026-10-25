import type { Applicant } from './types';
import { REVIEWER } from './types';

/** What the demo guide asks a first-time visitor to try: both sides of the funnel, the assistant, automation and the report. */
export interface GuideStep {
  key: 'apply' | 'chat' | 'accept' | 'live' | 'time' | 'report';
  title: string;
  hint: string;
  action: 'phone' | 'chat' | 'open' | 'live' | 'advance' | 'report';
  targetId: string | null; // applicant to open, for 'open' and 'chat'
  done: boolean;
}

/** What the visitor has tried this session (not stored in the demo data). */
export interface GuideProgress {
  timeMoved: boolean;
  chatTried: boolean;
  reportOpened: boolean;
  /** Ops made a call on a stuck driver in Live ops. */
  liveHandled?: boolean;
}

const byMe = (a?: Applicant) => a?.decision?.by === REVIEWER;

export function guideSteps(apps: Applicant[], progress: GuideProgress): GuideStep[] {
  const self = apps.filter((a) => a.source === 'self');
  const elin = apps.find((a) => a.name === 'Elin Johansson');
  const applied = self.length > 0;
  const firstSelf = self[0];

  return [
    {
      key: 'apply',
      title: 'Apply',
      hint: applied
        ? `${firstSelf.name} applied. Finish the steps and book the call: the file appears in the review queue.`
        : 'Four questions, BankID, photo check, extract guide, then book your own onboarding call. About two minutes.',
      action: 'phone',
      targetId: null,
      done: applied && !!firstSelf.callAt,
    },
    {
      key: 'chat',
      title: 'Ask the assistant',
      hint: `Open Messages on ${applied ? `${firstSelf.name.split(' ')[0]}'s` : "Elin's"} phone. Ask anything, or write "Can we take the call on an afternoon?" and tap Confirm.`,
      action: 'chat',
      targetId: applied ? firstSelf.id : (elin?.id ?? null),
      done: progress.chatTried,
    },
    {
      key: 'accept',
      title: 'Decide',
      hint: applied
        ? `Open ${firstSelf.name} or Elin Johansson, tick the photo (and the extract, if it was shown in the call), then Accept. Watch the phone and the numbers.`
        : 'Elin Johansson: tick the photo (and the extract, if it was shown in the call), then Accept. Watch the numbers move.',
      action: 'open',
      targetId: firstSelf?.docsCompleteAt && !firstSelf.decision ? firstSelf.id : (elin?.id ?? null),
      done: apps.some((a) => byMe(a) && a.decision?.type !== 'rejected'),
    },
    {
      key: 'live',
      title: 'Stuck driver',
      hint: 'Open Live ops: Julia has no keys at the pickup. Mark "Called Julia", then let the customer pick a new date. Julia sees it in her chat.',
      action: 'live',
      targetId: null,
      done: !!progress.liveHandled,
    },
    {
      key: 'time',
      title: 'Move time a day',
      hint: 'Reminders, SLA alerts, chat alerts and tasks run by themselves. Open "Automation" in the demo bar to see what ran.',
      action: 'advance',
      targetId: null,
      done: progress.timeMoved,
    },
    {
      key: 'report',
      title: 'Weekly report',
      hint: 'Code counts, the AI writes, and a check verifies every number against the data.',
      action: 'report',
      targetId: null,
      done: progress.reportOpened,
    },
  ];
}
