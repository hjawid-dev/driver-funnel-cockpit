import type { Applicant, Gig } from '../types';
import { driverStep } from '../driverFlow';
import { formatDateTime } from '../time';
import type { DriverContext } from './types';

/**
 * What the assistant gets to know about the driver: first name and where they are in the flow.
 * Nothing else leaves the app: no ID numbers, no notes, nothing from the extract.
 */
const DOC_LABEL = { id: 'BankID', licence: 'licence photo', photo: 'profile photo', extract: 'criminal-record extract' } as const;

export function driverContext(a: Applicant | null, gigs: Gig[], now: number): DriverContext {
  if (!a) return {};
  const step = driverStep(a);
  const facts: string[] = [];
  const missing = (Object.keys(DOC_LABEL) as (keyof typeof DOC_LABEL)[]).filter((k) => {
    const s = a.docs[k];
    return k === 'extract' ? s !== 'ready' : s === 'missing' || s === 'failed' || s === 'pending';
  });

  const status: Record<typeof step, string> = {
    prequal_review: 'Applied; one basic requirement may not be met, a person is reviewing it',
    id: 'Applying: next step is BankID',
    licence: 'Applying: next step is the licence photo',
    photo: 'Applying: next step is the profile photo',
    extract: a.docs.extract === 'pending' ? 'Applying: has ordered the criminal-record extract, waiting for it to arrive' : 'Applying: next step is ordering the criminal-record extract',
    call: 'Applying: extract has arrived, next step is booking the call',
    decision: 'Applying: call booked, decision is made in the call',
    first_gig: 'Accepted as a driver: can pick a first drive in the app',
    booked: 'Accepted as a driver: first drive booked',
    active: 'Active driver',
    closed: a.decision?.reason === 'no_response_14d' ? 'Application closed because it was not finished' : 'Not accepted (decision made by a person)',
  };

  if (['id', 'licence', 'photo', 'extract'].includes(step) && missing.length) facts.push(`Still missing: ${missing.map((k) => DOC_LABEL[k]).join(', ')}`);
  if (a.callAt && a.callAt > now) facts.push(`Call booked: ${formatDateTime(a.callAt)}`);
  if (a.decision?.type === 'accepted_simple') facts.push('Accepted for simple drives first (licence held 1–2 years)');
  if (a.availability === 'limited') facts.push(`Availability: ${a.availabilityNote ?? 'limited'}`);
  const g = a.firstGig?.gigId ? gigs.find((x) => x.id === a.firstGig?.gigId) : undefined;
  if (g && a.firstGig?.bookedFor) facts.push(`First drive: ${g.from} to ${g.to}, ${formatDateTime(a.firstGig.bookedFor)}, ${g.km} km, ${g.pay} SEK`);
  facts.push(`Area: ${a.area}`);

  return { firstName: a.name.split(' ')[0], status: status[step], facts };
}
