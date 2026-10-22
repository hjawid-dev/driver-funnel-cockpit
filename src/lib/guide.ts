import type { Applicant } from './types';
import { REVIEWER } from './types';

/** The three things the demo guide asks a first-time visitor to try: both sides of the funnel, then automation. */
export interface GuideStep {
  key: 'apply' | 'accept' | 'time';
  title: string;
  hint: string;
  action: 'phone' | 'open' | 'advance';
  targetId: string | null; // applicant to open, for 'open'
  done: boolean;
}

const byMe = (a?: Applicant) => a?.decision?.by === REVIEWER;

export function guideSteps(apps: Applicant[], timeMoved: boolean): GuideStep[] {
  const self = apps.filter((a) => a.source === 'self');
  const elin = apps.find((a) => a.name === 'Elin Johansson');
  const applied = self.length > 0;
  const firstSelf = self[0];

  return [
    {
      key: 'apply',
      title: "Apply on the driver's phone",
      hint: applied
        ? `${firstSelf.name} applied. Finish the steps and book the call: the file appears in the review queue.`
        : 'Four questions, BankID, photo check, extract guide, then book your own call. About two minutes.',
      action: 'phone',
      targetId: null,
      done: applied && !!firstSelf.callAt,
    },
    {
      key: 'accept',
      title: 'Decide in the cockpit',
      hint: applied
        ? `Open ${firstSelf.name} or Elin Johansson, tick the photo and the extract call, then Accept. Watch the phone and the numbers.`
        : 'Elin Johansson: tick the photo and the extract call, then Accept. Watch the numbers move.',
      action: 'open',
      targetId: firstSelf?.docsCompleteAt && !firstSelf.decision ? firstSelf.id : (elin?.id ?? null),
      done: apps.some((a) => byMe(a) && a.decision?.type !== 'rejected'),
    },
    {
      key: 'time',
      title: 'Move time forward a day',
      hint: 'Reminders, SLA alerts, call reminders and tasks run by themselves. Open "Automation" in the demo bar to see what ran.',
      action: 'advance',
      targetId: null,
      done: timeMoved,
    },
  ];
}
