/**
 * 'ready' is used only for the criminal-record extract: the applicant has it and will show it in a call.
 * The extract itself is never uploaded or stored: criminal-record data may not be kept (GDPR art. 10).
 */
export type DocStatus = 'verified' | 'uploaded' | 'missing' | 'pending' | 'ready' | 'failed' | 'remark';
export type DocKey = 'licence' | 'id' | 'extract' | 'photo';
export const DOC_KEYS: DocKey[] = ['licence', 'id', 'extract', 'photo'];

export type Stage = 'registered' | 'review' | 'accepted' | 'active' | 'rejected';

/**
 * Reason codes are deliberately generic: none of them may reveal anything about criminal
 * offences (GDPR art. 10). 'requirements_not_met' covers several grounds and always needs
 * a second reviewer.
 */
export type RejectReason =
  | 'requirements_not_met' // Suitability requirements not met (second reviewer confirms)
  | 'no_valid_licence' // No valid B licence, or held < 1 year
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
  licenceYears: number; // e.g. 1.5 (valid B licence checked with Transportstyrelsen)
  availability: 'full' | 'limited';
  availabilityNote?: string; // e.g. "Weekends only"
  registeredAt: number; // epoch ms
  docs: Record<DocKey, DocStatus>; // id 'verified' = BankID; extract: 'missing' = not ordered, 'pending' = ordered, 'ready' = ready to show
  docTimes?: Partial<Record<DocKey, number>>; // when each document arrived (for the timeline)
  docNote?: Partial<Record<DocKey, string>>; // e.g. why a photo has a remark
  photoApproved?: boolean; // reviewer tick
  /** Reviewer tick: the extract was shown in a call. Nothing from its content is ever recorded. */
  extractShown?: boolean;
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
  { value: 'requirements_not_met', label: 'Suitability requirements not met' },
  { value: 'no_valid_licence', label: 'No valid B licence, or held < 1 year' },
  { value: 'id_unverified', label: "ID can't be verified" },
  { value: 'no_response_14d', label: 'No response after 14 days' },
  { value: 'other', label: 'Other (note required)' },
];

export const REVIEWER = 'Hjalmar';
