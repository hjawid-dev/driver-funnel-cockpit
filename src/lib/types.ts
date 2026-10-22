export type DocStatus = 'verified' | 'uploaded' | 'missing' | 'pending' | 'failed' | 'remark';
export type DocKey = 'licence' | 'id' | 'background' | 'photo';
export const DOC_KEYS: DocKey[] = ['licence', 'id', 'background', 'photo'];

export type Stage = 'registered' | 'review' | 'accepted' | 'active' | 'rejected';

export type RejectReason =
  | 'background_failed' // Background check missing or failed
  | 'licence_too_new' // Licence < 1 year or revoked
  | 'id_unverified' // ID can't be verified
  | 'no_response_14d' // No response after 14 days
  | 'other'; // requires note

export type DecisionType = 'accepted' | 'accepted_simple' | 'accepted_flagged' | 'rejected';

export interface Decision {
  type: DecisionType;
  reason?: RejectReason;
  note?: string;
  secondReviewer?: string;
  at: number;
  by: string;
}

export interface FirstGig {
  bookedFor?: number;
  doneAt?: number;
  onTime?: boolean;
  ok?: boolean; // no incident, customer happy
}

export interface Applicant {
  id: string; // "DRV-1041"
  name: string;
  area: string; // Stockholm area
  age: number;
  licenceYears: number; // e.g. 1.5
  violations: 'none' | 'minor';
  violationNote?: string; // e.g. "Speeding fine (2025)"
  availability: 'full' | 'limited';
  availabilityNote?: string; // e.g. "Weekends only"
  registeredAt: number; // epoch ms
  docs: Record<DocKey, DocStatus>; // id 'verified' = BankID; background 'pending' = ordered from Polisen by applicant
  docTimes?: Partial<Record<DocKey, number>>; // when each document arrived (for the timeline)
  docNote?: Partial<Record<DocKey, string>>; // e.g. why a photo has a remark
  photoApproved?: boolean; // reviewer tick
  /**
   * Manual nudges only ("Send nudge now"). The scheduled 2/24/72 h nudges are
   * a HubSpot workflow in production, so here they are derived from registeredAt.
   */
  nudges: number[];
  docsCompleteAt?: number;
  decision?: Decision;
  welcomeCallAt?: number;
  firstGig?: FirstGig;
  log: { at: number; text: string }[];
}

export const REJECT_REASONS: { value: RejectReason; label: string }[] = [
  { value: 'background_failed', label: 'Background check missing or failed' },
  { value: 'licence_too_new', label: 'Licence < 1 year or revoked' },
  { value: 'id_unverified', label: "ID can't be verified" },
  { value: 'no_response_14d', label: 'No response after 14 days' },
  { value: 'other', label: 'Other (note required)' },
];

export const REVIEWER = 'Hjalmar';
