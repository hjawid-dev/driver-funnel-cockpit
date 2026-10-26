import { bookFirstGig } from './actions';
import type { Applicant, Gig } from './types';
import { deriveStage } from './stage';
import { formatDateTime } from './time';

/** Minimum age set by the insurance (example value, to be confirmed with the insurer). */
export const MIN_AGE = 20;

export interface Application {
  name: string;
  area: string;
  licenceYears: number;
  meetsMinAge: boolean;
  availability: 'full' | 'limited';
  availabilityNote?: string;
  availabilitySlots?: Slot[];
}

/** A new applicant from the driver view. Nobody is rejected here: an unmet requirement is flagged for a person. */
export function createApplicant(input: Application, apps: Applicant[], now: number): Applicant {
  const maxId = Math.max(2000, ...apps.map((a) => Number(a.id.replace(/\D/g, '')) || 0));
  const prequalIssue = issueFor(input.licenceYears, input.meetsMinAge);
  const log: Applicant['log'] = [{ at: now, text: 'Registered via the driver app' }];
  if (prequalIssue) log.push({ at: now, text: `Pre-qualifying: ${prequalIssue === 'licence' ? 'licence held under 1 year' : `under ${MIN_AGE}`}. A person reviews and closes.` });
  return {
    id: `DRV-${maxId + 1}`,
    name: input.name.trim(),
    area: input.area,
    licenceYears: input.licenceYears,
    availability: input.availability,
    ...(input.availability === 'limited' && input.availabilityNote ? { availabilityNote: input.availabilityNote } : {}),
    registeredAt: now,
    owner: 'Hjalmar', backup: 'Sofia',
    ...(input.availabilitySlots ? { availabilitySlots: input.availabilitySlots } : {}),
    docs: { licence: 'missing', id: 'missing', extract: 'missing', photo: 'missing' },
    nudges: [],
    log,
    source: 'self',
    ...(prequalIssue ? { prequalIssue } : {}),
  };
}

/** When the applicant can drive. Weekday daytime counts as full availability; anything else is limited, and never a reason to reject. */
export type Slot = 'weekday_day' | 'weekday_evening' | 'weekend';

export const SLOT_LABEL: Record<Slot, string> = {
  weekday_day: 'Weekdays, daytime',
  weekday_evening: 'Weekday evenings',
  weekend: 'Weekends',
};

export function availabilityFrom(slots: Slot[]): Pick<Application, 'availability' | 'availabilityNote' | 'availabilitySlots'> {
  if (slots.includes('weekday_day')) return { availability: 'full', availabilitySlots: [...slots] };
  const order: Slot[] = ['weekday_evening', 'weekend'];
  const note = order.filter((s) => slots.includes(s)).map((s) => SLOT_LABEL[s].toLowerCase()).join(' and ');
  return { availability: 'limited', availabilitySlots: [...slots], availabilityNote: note.charAt(0).toUpperCase() + note.slice(1) };
}

const issueFor = (licenceYears: number, meetsMinAge: boolean) => (licenceYears < 1 ? 'licence' : !meetsMinAge ? 'age' : undefined);

/**
 * The applicant changes their answers to the first questions (a wrong tap happens). If the requirement
 * is now met, they carry on; a person still sees the change in the log. Not possible once a person has decided.
 */
export function changePrequal(a: Applicant, answers: { licenceYears: number; meetsMinAge: boolean }, now: number): Applicant {
  if (a.decision) return a;
  const issue = issueFor(answers.licenceYears, answers.meetsMinAge);
  const { prequalIssue: _old, ...rest } = a;
  const text = issue
    ? `Pre-qualifying answers changed by applicant: still ${issue === 'licence' ? 'licence held under 1 year' : `under ${MIN_AGE}`}`
    : 'Pre-qualifying answers changed by applicant: requirements now met';
  return { ...rest, licenceYears: answers.licenceYears, ...(issue ? { prequalIssue: issue } : {}), log: [...a.log, { at: now, text }] };
}

/** "Remind me when I qualify": logged only, nothing is decided. */
export function remindWhenQualified(a: Applicant, now: number): Applicant {
  if (a.remindWhenQualifiedAt) return a;
  return { ...a, remindWhenQualifiedAt: now, log: [...a.log, { at: now, text: 'Asked to be reminded when they meet the requirement' }] };
}

// ---------- Going back during the application ----------

/** What an applicant can look back at: their answers, and every step before the one they're on. */
export type ReviewKey = 'answers' | 'id' | 'licence' | 'photo' | 'extract' | 'call';
const APPLY_STEPS = ['extract', 'id', 'licence', 'photo', 'call', 'decision'] as const;

export function reviewableSteps(a: Applicant): ReviewKey[] {
  const i = (APPLY_STEPS as readonly string[]).indexOf(driverStep(a));
  if (i < 0) return [];
  return ['answers', ...(APPLY_STEPS.slice(0, i) as ReviewKey[])];
}

/** Answers and photos can be changed until the file is complete; after that a person is reviewing them. */
export function canChangeAnswers(a: Applicant): boolean {
  return !a.decision && !a.docsCompleteAt;
}

export function canRetake(a: Applicant, k: 'licence' | 'photo'): boolean {
  return canChangeAnswers(a) && !['missing', 'pending'].includes(a.docs[k]);
}

/** A new licence or profile photo. BankID and anything a person has already checked can't be undone this way. */
export function retakeDocument(a: Applicant, k: 'licence' | 'photo', now: number): Applicant {
  if (!canRetake(a, k)) return a;
  const { [k]: _t, ...docTimes } = a.docTimes ?? {};
  return {
    ...a,
    docs: { ...a.docs, [k]: 'missing' },
    docTimes,
    log: [...a.log, { at: now, text: `Applicant is retaking the ${k === 'licence' ? 'licence photo' : 'profile photo'}` }],
  };
}

/** A booked call can be moved until two hours before it starts. */
export function canMoveCall(a: Applicant, now: number): boolean {
  return !!a.callAt && !a.decision && a.callAt - now > 2 * 60 * 60_000;
}

export type DriverStep = 'prequal_review' | 'id' | 'licence' | 'photo' | 'extract' | 'call' | 'decision' | 'first_gig' | 'booked' | 'active' | 'closed';

/** Where the driver is in the flow. Everything is derived from the applicant record. */
export function driverStep(a: Applicant): DriverStep {
  const stage = deriveStage(a);
  if (stage === 'rejected' || stage === 'closed') return 'closed';
  if (stage === 'active') return 'active';
  if (stage === 'accepted') return a.firstGig?.bookedFor ? 'booked' : 'first_gig';
  if (a.prequalIssue) return 'prequal_review';
  if (a.docs.extract === 'missing') return 'extract';
  if (a.docs.id !== 'verified' && !(a.idMethod === 'manual' && a.docs.id === 'uploaded')) return 'id';
  if (a.docs.licence === 'missing' || a.docs.licence === 'pending') return 'licence';
  if (a.docs.photo === 'missing' || a.docs.photo === 'pending') return 'photo';
  // Ordered is enough: the decision does not wait for the post.
  if (!a.callAt) return 'call';
  return 'decision';
}

export const STEP_ORDER: { key: DriverStep; label: string }[] = [
  { key: 'extract', label: 'Extract' },
  { key: 'id', label: 'ID' },
  { key: 'licence', label: 'Licence' },
  { key: 'photo', label: 'Photo' },
  { key: 'call', label: 'Call' },
  { key: 'decision', label: 'Decision' },
  { key: 'first_gig', label: 'First drive' },
];

/** Progress 0–100 for the bar at the top of the driver view. */
export function progress(step: DriverStep): number {
  if (step === 'active') return 100;
  if (step === 'booked') return 95;
  const i = STEP_ORDER.findIndex((s) => s.key === step);
  return i < 0 ? 0 : Math.round((i / STEP_ORDER.length) * 100);
}

export function bookCall(a: Applicant, at: number, now: number): Applicant {
  return { ...a, callAt: at, log: [...a.log, { at: now, text: `Onboarding call booked by applicant for ${formatDateTime(at)}` }] };
}

export function bookOffer(a: Applicant, gig: Gig, now: number, apps: Applicant[] = [a]): Applicant {
  const result = bookFirstGig(a, gig, now, apps);
  return result.ok ? result.applicant : a;
}
