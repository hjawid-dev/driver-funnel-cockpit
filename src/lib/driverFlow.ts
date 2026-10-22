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
}

/** A new applicant from the driver view. Nobody is rejected here: an unmet requirement is flagged for a person. */
export function createApplicant(input: Application, apps: Applicant[], now: number): Applicant {
  const maxId = Math.max(2000, ...apps.map((a) => Number(a.id.replace(/\D/g, '')) || 0));
  const prequalIssue = input.licenceYears < 1 ? 'licence' : !input.meetsMinAge ? 'age' : undefined;
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
    docs: { licence: 'missing', id: 'missing', extract: 'missing', photo: 'missing' },
    nudges: [],
    log,
    source: 'self',
    ...(prequalIssue ? { prequalIssue } : {}),
  };
}

export type DriverStep = 'prequal_review' | 'id' | 'licence' | 'photo' | 'extract' | 'call' | 'decision' | 'first_gig' | 'booked' | 'active' | 'closed';

/** Where the driver is in the flow. Everything is derived from the applicant record. */
export function driverStep(a: Applicant): DriverStep {
  const stage = deriveStage(a);
  if (stage === 'rejected') return 'closed';
  if (stage === 'active') return 'active';
  if (stage === 'accepted') return a.firstGig?.bookedFor ? 'booked' : 'first_gig';
  if (a.prequalIssue) return 'prequal_review';
  if (a.docs.id !== 'verified') return 'id';
  if (a.docs.licence === 'missing' || a.docs.licence === 'pending') return 'licence';
  if (a.docs.photo === 'missing' || a.docs.photo === 'pending') return 'photo';
  if (a.docs.extract !== 'ready') return 'extract';
  if (!a.callAt) return 'call';
  return 'decision';
}

export const STEP_ORDER: { key: DriverStep; label: string }[] = [
  { key: 'id', label: 'ID' },
  { key: 'licence', label: 'Licence' },
  { key: 'photo', label: 'Photo' },
  { key: 'extract', label: 'Extract' },
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
  return { ...a, callAt: at, log: [...a.log, { at: now, text: `Extract call booked by applicant for ${formatDateTime(at)}` }] };
}

export function bookOffer(a: Applicant, gig: Gig, now: number): Applicant {
  return {
    ...a,
    firstGig: { ...a.firstGig, gigId: gig.id, bookedFor: gig.at },
    log: [...a.log, { at: now, text: `First gig picked by driver: ${gig.from} → ${gig.to}, ${formatDateTime(gig.at)}` }],
  };
}
