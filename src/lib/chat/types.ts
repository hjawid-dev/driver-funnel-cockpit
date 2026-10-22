/**
 * The driver chat: an AI assistant that answers from the help articles and hands over to a
 * person in ops when it should. Shared by the app and the server function (types only).
 */

/** Why a question went to a person instead of being answered by the assistant. */
export type HandoverReason =
  | 'asked' // the driver asked for a person
  | 'unsure' // not covered by the help articles: a content gap
  | 'personal' // needs a person to act on the driver's own account (move a call, a payout)
  | 'sensitive' // complaint, a decision, health, or anything that shouldn't be handled by AI
  | 'urgent'; // something is wrong on an ongoing drive

export const HANDOVER_LABEL: Record<HandoverReason, string> = {
  asked: 'Asked for a person',
  unsure: 'Not in the help articles',
  personal: 'Needs action on their account',
  sensitive: 'Sensitive, needs a person',
  urgent: 'Urgent: ongoing drive',
};

export interface ChatMsg {
  id: string;
  from: 'driver' | 'ai' | 'ops' | 'note';
  text: string;
  at: number;
  /** Help articles the answer is based on. */
  sources?: string[];
  /** Set on the reply to a question that went to a person. */
  handover?: HandoverReason;
  /** Answered from the offline article search because the AI was unavailable. */
  offline?: boolean;
  /** Ops marked this content gap as covered by a new or updated article. */
  gapClosed?: boolean;
  /** Ops sender name. */
  by?: string;
}

export interface ChatThread {
  id: string;
  /** null for a visitor who hasn't applied yet. */
  applicantId: string | null;
  name: string;
  messages: ChatMsg[];
  /** 'ai': the assistant answers. 'waiting': a person has been asked. 'ops': a person is handling it. */
  status: 'ai' | 'waiting' | 'ops';
  waitingSince?: number;
  reason?: HandoverReason;
}

/**
 * What the assistant may know about the driver: first name and application status only.
 * No ID numbers, contact details or anything from the criminal-record extract.
 */
export interface DriverContext {
  firstName?: string;
  /** e.g. "extract: ordered, waiting for it to arrive" */
  status?: string;
  /** Short facts, e.g. "Call booked: Fri 24 Oct, 09:15". */
  facts?: string[];
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  messages: ChatTurn[];
  context: DriverContext;
}

/** One line of the streamed reply (newline-delimited JSON). */
export type ChatEvent =
  | { t: 'delta'; text: string }
  | { t: 'done'; sources: string[]; handover: HandoverReason | null }
  | { t: 'error'; message: string };

/** Returned as plain JSON when the AI is switched off or not configured: the app falls back to article search. */
export interface OfflineReply {
  mode: 'offline';
  reason: 'disabled' | 'not_configured' | 'busy';
}
