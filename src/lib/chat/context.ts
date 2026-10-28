import type { Applicant, Gig } from '../types';
import { driverStep } from '../driverFlow';
import { HOUR, formatDateTime } from '../time';
import type { DriverContext } from './types';
import { currentJob, jobFact, type Job } from '../liveOps';
import { extractState, needsExtract, showBy } from '../extract';

/**
 * What the assistant gets to know about the driver: first name and where they are in the flow.
 * Nothing else leaves the app: no ID numbers, no notes, nothing from the extract.
 */
const DOC_LABEL = { id: 'identity check', licence: 'licence photo', photo: 'profile photo', extract: 'criminal-record extract' } as const;

export function driverContext(a: Applicant | null, gigs: Gig[], now: number, jobs: Job[] = []): DriverContext {
  if (!a) return {};
  const step = driverStep(a);
  const facts: string[] = [];
  const missing = (Object.keys(DOC_LABEL) as (keyof typeof DOC_LABEL)[]).filter((k) => {
    const s = a.docs[k];
    if (k === 'id' && a.idMethod === 'manual' && s === 'uploaded') return false;
    return k === 'extract' ? s === 'missing' : s === 'missing' || s === 'failed' || s === 'pending';
  });

  const status: Record<typeof step, string> = {
    prequal_review: 'Applied; one basic requirement may not be met, a person is reviewing it',
    id: 'Applying: verify identity with BankID or submit ID for manual review',
    licence: 'Applying: next step is the licence photo',
    photo: 'Applying: next step is the profile photo',
    extract: 'Applying: next step is ordering the criminal-record extract',
    call: `Applying: extract ${a.docs.extract === 'ready' ? 'has arrived' : 'ordered, not arrived yet (no need to wait)'}, next step is booking the onboarding call`,
    decision: 'Applying: onboarding call booked, decision is made in the call',
    first_gig: 'Accepted as a driver: can pick a first drive in the app',
    booked: 'Accepted as a driver: first drive booked',
    active: 'Active driver',
    closed: a.decision?.reason === 'no_response_14d' ? 'Application paused because it was not finished; the team opens it again when the applicant wants to continue' : 'Not accepted (decision made by a person)',
  };

  if (['id', 'licence', 'photo', 'extract'].includes(step) && missing.length) facts.push(`Still missing: ${missing.map((k) => DOC_LABEL[k]).join(', ')}`);
  if (a.callAt && a.callAt > now) facts.push(`Onboarding call booked: ${formatDateTime(a.callAt)}`);
  if (!a.decision && a.docs.extract === 'pending' && step !== 'extract') facts.push('Extract ordered, not arrived: shown before the first drive, not needed for the call');
  if (needsExtract(a)) {
    const st = extractState(a, now);
    const by = showBy(a);
    const where = st === 'check_booked' ? `5-minute check booked ${formatDateTime(a.extractCheckAt!)}` : st === 'ready' ? 'arrived, 5-minute check not booked yet' : 'ordered, not arrived yet';
    facts.push(`Extract not shown yet (${where}). No drive until it is shown${by ? `, by ${formatDateTime(by)}` : ''}; a first drive can be booked before`);
  }
  if (a.decision?.type === 'accepted_simple') facts.push('Accepted for simple drives first (licence held 1 to <2 years)');
  if (a.availability === 'limited') facts.push(`Availability: ${a.availabilityNote ?? 'limited'}`);
  const g = a.firstGig?.gigId ? gigs.find((x) => x.id === a.firstGig?.gigId) : undefined;
  const start = a.firstGig?.bookedFor;
  if (start && !a.firstGig?.doneAt && now >= start - HOUR && now <= start + (g?.minutes ?? 60) * 60_000 + 2 * HOUR) facts.push('On a drive right now (their first drive)');
  if (g && a.firstGig?.bookedFor) facts.push(`First drive: ${g.from} to ${g.to}, ${formatDateTime(a.firstGig.bookedFor)}, ${g.km} km, ${g.pay} SEK`);
  // A job today: where and when the pickup is and how far along the driver is. No customer, address or price.
  const job = currentJob(jobs, a.id, now);
  if (job) facts.push(jobFact(job, now));
  facts.push(`Area: ${a.area}`);

  return { firstName: a.name.split(' ')[0], status: status[step], facts };
}
