import type { Job } from './liveOps';

/**
 * Automated texts to the pickup contact: the only message that leaves the company without a person
 * writing it. The guardrails, so nothing the driver or the AI writes can reach a customer:
 * - fixed, approved templates, one per reason; the AI never writes or edits a text
 * - the fields come from the booking only, cleaned and capped (no links, no line breaks)
 * - recipients only the booking's contact and backup, at most one text each per incident
 * - the driver sees the exact text and taps Send; the sender says it is automated
 * - a switch in Live ops turns the texts off, and a text that can't go out hands the pickup to a person
 */

export type PickupReason = 'keys_missing' | 'no_contact' | 'car_missing' | 'damage' | 'unsafe' | 'other';
/** Reasons a text can help with. Damage and safety go straight to a person, "something else" to the chat. */
export type TextReason = 'keys_missing' | 'no_contact' | 'car_missing';
export const TEXT_REASONS: TextReason[] = ['keys_missing', 'no_contact', 'car_missing'];
export const isTextReason = (r: PickupReason | undefined): r is TextReason => !!r && (TEXT_REASONS as string[]).includes(r);

export const REASON_LABEL: Record<PickupReason, string> = {
  keys_missing: "Keys aren't where the job says",
  no_contact: "Nobody here, or the contact isn't answering",
  car_missing: "The car isn't here or isn't ready",
  damage: "Damage, an accident, or the car won't start",
  unsafe: 'I feel unsafe',
  other: 'Something else',
};

export const SENDER = 'Driver Ops';
export const OPS_PHONE = '08-520 100 00';
export const MAX_FIELD = 60;
export const MAX_TEXT = 320; // two SMS segments

/** A booking field made safe for a text: letters, digits and plain punctuation, no links or line breaks, capped. */
export function cleanField(s: string): string {
  return s
    .normalize('NFC')
    .replace(/https?:\/\/\S+|www\.\S+/gi, ' ')
    .replace(/[^\p{L}\p{N} .,:\-/()]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_FIELD);
}

const hm = (ts: number) => new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

interface Fields {
  place: string;
  job: string;
  time: string;
  keys: string;
}

/** The approved templates. Changing one is a change to customer communication, reviewed like one. */
const TEMPLATES: Record<TextReason, (f: Fields) => string> = {
  keys_missing: (f) => `Our driver is at ${f.place} for pickup ${f.job} (${f.time}), but the keys are not at the agreed place (${f.keys}). Where are they?`,
  no_contact: (f) => `Our driver is at ${f.place} for pickup ${f.job} (${f.time}) and can't reach anyone on site. Who can hand over the car?`,
  car_missing: (f) => `Our driver is at ${f.place} for pickup ${f.job} (${f.time}) but can't find the car. Where is it?`,
};

export function composeText(j: Job, reason: TextReason): string {
  const f: Fields = { place: cleanField(j.from), job: cleanField(j.id), time: hm(j.pickupAt), keys: cleanField(j.keyLocation) };
  return `${SENDER}: ${TEMPLATES[reason](f)} Reply here or call ${OPS_PHONE}. (Automated message)`;
}

export interface Recipient {
  role: string;
  phone: string;
}

const PHONE = /^\+?[0-9][0-9 -]{5,18}$/;

/** Only the people the booking names for this pickup, never a number from a chat. */
export function recipients(j: Job): Recipient[] {
  const out: Recipient[] = [];
  for (const c of [j.contact, j.backup]) if (PHONE.test(c.phone) && !out.some((r) => r.phone === c.phone)) out.push({ role: c.role, phone: c.phone });
  return out;
}

export interface SentText {
  at: number;
  role: string;
  phone: string;
  reason: TextReason;
  body: string;
}

export type TextResult = { ok: true; texts: SentText[] } | { ok: false; error: string };

/** The texts to send now, or why none can go out. Pure: the caller records them on the job. */
export function prepareTexts(j: Job, reason: PickupReason, now: number, enabled: boolean): TextResult {
  if (!enabled) return { ok: false, error: 'Automated texts are switched off' };
  if (!isTextReason(reason)) return { ok: false, error: 'No text for this reason' };
  const sent = new Set((j.texts ?? []).map((t) => t.phone));
  const to = recipients(j).filter((r) => !sent.has(r.phone));
  if (!to.length) return { ok: false, error: 'The contacts were already texted' };
  const body = composeText(j, reason);
  if (body.length > MAX_TEXT) return { ok: false, error: 'The text is too long' };
  return { ok: true, texts: to.map((r) => ({ at: now, role: r.role, phone: r.phone, reason, body })) };
}

const MAX_REPLY = 300;

/** A reply from the contact, made safe to show: plain text, capped. It is shown to people, never given to the AI. */
export function cleanReply(s: string): string {
  return s.replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_REPLY);
}
