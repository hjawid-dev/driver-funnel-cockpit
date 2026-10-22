import type { Applicant } from './types';
import { REVIEWER } from './types';
import { isNoResponse } from './nudges';

/** The three things the demo guide asks a first-time visitor to try. */
export interface GuideStep {
  key: 'accept' | 'second' | 'close';
  title: string;
  hint: string;
  targetId: string | null; // applicant to open
  done: boolean;
}

const byMe = (a?: Applicant) => a?.decision?.by === REVIEWER;

export function guideSteps(apps: Applicant[], now: number): GuideStep[] {
  const find = (name: string) => apps.find((a) => a.name === name);
  const elin = find('Elin Johansson');
  const sara = find('Sara Lindqvist');
  const stale = apps.find((a) => isNoResponse(a, now));
  const closed = apps.some((a) => a.decision?.reason === 'no_response_14d' && byMe(a));

  return [
    {
      key: 'accept',
      title: 'Accept a clean file',
      hint: 'Elin Johansson: tick the photo, then Accept. Watch the numbers move.',
      targetId: elin?.id ?? null,
      done: byMe(elin),
    },
    {
      key: 'second',
      title: 'Hit a borderline rule',
      hint: 'Sara Lindqvist has a minor violation: Accept stays locked until a second reviewer confirms.',
      targetId: sara?.id ?? null,
      done: byMe(sara),
    },
    {
      key: 'close',
      title: 'Close a silent applicant',
      hint: closed
        ? 'Closed with reason code "No response after 14 days". It now counts in the reject reasons.'
        : `${stale ? stale.name : 'An applicant'} has not answered in 14 days: close with a reason code.`,
      targetId: stale?.id ?? null,
      done: closed,
    },
  ];
}
