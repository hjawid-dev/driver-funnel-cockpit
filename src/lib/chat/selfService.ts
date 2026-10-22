import type { Applicant, Gig } from '../types';
import type { ChatMsg } from './types';
import { bookCall, bookOffer, driverStep } from '../driverFlow';
import { receiveDocument } from '../actions';
import { callSlots } from '../booking';
import { firstGigOffers } from '../gigs';
import { deriveStage } from '../stage';
import { HOUR, atLocal, formatDateTime } from '../time';
export { reminderSilenced } from '../nudges';

/**
 * What a driver can do from the chat. The assistant only proposes one of these options;
 * the driver confirms with a tap and this code carries it out, after checking it is still valid.
 * There is no action that touches a decision: those stay with a person.
 */
export type ChatAction =
  | { type: 'book_call'; at: number }
  | { type: 'extract_ordered' }
  | { type: 'extract_arrived' }
  | { type: 'pick_gig'; gigId: string }
  | { type: 'remind_later'; until: number }
  | { type: 'stop_reminders' };

export interface ActionOption {
  /** Short id the assistant refers to, e.g. "S2". */
  id: string;
  /** What happens, in the driver's words: "Book your call for Fri 24 Oct, 09:15". */
  label: string;
  action: ChatAction;
}

/** A booked call can be moved until this long before it starts. */
export const MOVE_CALL_UNTIL_MS = 2 * HOUR;
/** Call times offered in the chat: two per review slot, spread over the coming days. */
const SLOT_OPTIONS = 10;
const PER_SESSION = 2;

function spreadSlots(free: number[]): number[] {
  const seen = new Map<string, number>();
  return free
    .filter((t) => {
      const d = new Date(t);
      const key = `${d.toDateString()}-${d.getHours() < 12 ? 'am' : 'pm'}`;
      const n = seen.get(key) ?? 0;
      seen.set(key, n + 1);
      return n < PER_SESSION;
    })
    .slice(0, SLOT_OPTIONS);
}

/** The applicant's file is incomplete, so reminders are running. */
export function remindersApply(a: Applicant): boolean {
  return deriveStage(a) === 'registered' && !a.prequalIssue;
}

/** Everything the driver can do from the chat right now. */
export function actionOptions(a: Applicant | null, apps: Applicant[], gigs: Gig[], now: number): ActionOption[] {
  if (!a) return [];
  const out: ActionOption[] = [];
  const step = driverStep(a);
  const others = apps.filter((x) => x.id !== a.id);

  if (step === 'call' || (step === 'decision' && a.callAt && a.callAt - now > MOVE_CALL_UNTIL_MS)) {
    const moving = step === 'decision';
    spreadSlots(callSlots(now, others, 60).filter((t) => t !== a.callAt)).forEach((t, i) => out.push({ id: `S${i + 1}`, label: `${moving ? 'Move your call to' : 'Book your call for'} ${formatDateTime(t)}`, action: { type: 'book_call', at: t } }));
  }
  if (step === 'extract') {
    if (a.docs.extract === 'missing') out.push({ id: 'ORDERED', label: "Mark your extract as ordered", action: { type: 'extract_ordered' } });
    out.push({ id: 'ARRIVED', label: 'Mark your extract as arrived, then book your call', action: { type: 'extract_arrived' } });
  }
  if (step === 'first_gig') {
    firstGigOffers(a, gigs, apps, now).forEach((g, i) =>
      out.push({ id: `G${i + 1}`, label: `Take your first drive: ${g.from} to ${g.to}, ${formatDateTime(g.at)}, ${g.km} km, ${g.pay} SEK`, action: { type: 'pick_gig', gigId: g.id } }),
    );
  }
  if (remindersApply(a) && !a.reminders?.offAt) {
    const tomorrow = atLocal(now, 1, 10);
    const in3 = atLocal(now, 3, 10);
    out.push({ id: 'LATER_1D', label: `Remind you tomorrow (${formatDateTime(tomorrow)})`, action: { type: 'remind_later', until: tomorrow } });
    out.push({ id: 'LATER_3D', label: `Remind you in 3 days (${formatDateTime(in3)})`, action: { type: 'remind_later', until: in3 } });
    out.push({ id: 'STOP', label: 'Stop the reminders (your application stays open)', action: { type: 'stop_reminders' } });
  }
  return out;
}

const same = (x: ChatAction, y: ChatAction) => JSON.stringify(x) === JSON.stringify(y);

export type SelfServiceResult = { ok: true; applicant: Applicant; done: string } | { ok: false; reason: string };

/** Carry out a confirmed action, but only if it is still one of the driver's options. */
export function applyChatAction(a: Applicant, action: ChatAction, apps: Applicant[], gigs: Gig[], now: number): SelfServiceResult {
  const option = actionOptions(a, apps, gigs, now).find((o) => same(o.action, action));
  if (!option) {
    return { ok: false, reason: action.type === 'book_call' ? 'That time is no longer free.' : action.type === 'pick_gig' ? 'That drive is no longer available.' : "That can't be done right now." };
  }
  const via = ' (via chat, confirmed by the driver)';
  const log = (x: Applicant): Applicant => ({ ...x, log: x.log.map((e, i) => (i === x.log.length - 1 && e.at === now ? { ...e, text: e.text + via } : e)) });

  switch (action.type) {
    case 'book_call': {
      const moved = !!a.callAt;
      const next = bookCall(a, action.at, now);
      return { ok: true, applicant: log(next), done: `${moved ? 'Your call is moved to' : 'Your call is booked for'} ${formatDateTime(action.at)}. You'll get a reminder 1 hour before.` };
    }
    case 'extract_ordered':
      return { ok: true, applicant: log(receiveDocument(a, 'extract', 'pending', now)), done: "Noted: your extract is ordered. Tell me when it arrives and we'll book your call." };
    case 'extract_arrived':
      return { ok: true, applicant: log(receiveDocument(a, 'extract', 'ready', now)), done: 'Great, your extract has arrived. Pick a time for your call below or in the app.' };
    case 'pick_gig': {
      const g = gigs.find((x) => x.id === action.gigId)!;
      return { ok: true, applicant: log(bookOffer(a, g, now)), done: `Your first drive is booked: ${g.from} to ${g.to}, ${formatDateTime(g.at)}. Ops calls you before it.` };
    }
    case 'remind_later':
      return {
        ok: true,
        applicant: { ...a, reminders: { ...a.reminders, snooze: { at: now, until: action.until } }, log: [...a.log, { at: now, text: `Reminders paused until ${formatDateTime(action.until)}${via}` }] },
        done: `Sure, I'll remind you ${formatDateTime(action.until)}.`,
      };
    case 'stop_reminders':
      return {
        ok: true,
        applicant: { ...a, reminders: { ...a.reminders, offAt: now }, log: [...a.log, { at: now, text: `Reminders stopped${via}` }] },
        done: 'Done, no more reminders. Your application stays open, and you can continue any time.',
      };
  }
}

export type QuickReply =
  | { kind: 'action'; label: string; option: ActionOption; driverText: string }
  | { kind: 'ask'; label: string; text: string }
  | { kind: 'ack'; label: string; reply: string }
  | { kind: 'steps'; label: string };

/**
 * Buttons under the latest message, so the driver can answer a reminder with one tap.
 * Actions are carried out directly (the tap is the confirmation); questions go to the assistant.
 */
export function quickReplies(last: ChatMsg | undefined, a: Applicant | null, options: ActionOption[]): QuickReply[] {
  if (!a || !last) return [];
  const opt = (id: string) => options.find((o) => o.id === id);
  const act = (id: string, label: string): QuickReply[] => {
    const o = opt(id);
    return o ? [{ kind: 'action', label, option: o, driverText: label }] : [];
  };
  const step = driverStep(a);

  if (last.from === 'auto') {
    switch (last.autoKind) {
      case 'nudge':
        return [
          ...act('ORDERED', "I've ordered my extract"),
          ...act('ARRIVED', 'My extract has arrived'),
          ...(['id', 'licence', 'photo'].includes(step) ? [{ kind: 'steps', label: 'Continue my application' } as const] : []),
          ...act('LATER_1D', 'Remind me tomorrow'),
          ...act('STOP', 'Stop reminders'),
        ];
      case 'call_reminder':
        return [
          { kind: 'ack', label: "I'll be there", reply: 'Great, see you then! Have your extract and driving licence ready.' },
          { kind: 'ask', label: "I can't make it", text: "I can't make my call, can I move it?" },
        ];
      case 'decision':
        return a.decision?.type === 'rejected'
          ? [
              { kind: 'ask', label: 'Why?', text: 'Why was I not accepted?' },
              { kind: 'ask', label: 'Ask for a review', text: "I'd like a review of the decision." },
            ]
          : [{ kind: 'steps', label: 'Show my first drives' }];
      case 'offers':
        return step === 'first_gig'
          ? [
              { kind: 'steps', label: 'Show my first drives' },
              { kind: 'ask', label: 'Which one is easiest?', text: 'Which of my first drives is the easiest?' },
            ]
          : [];
      case 'gig_reminder':
        return [
          { kind: 'ask', label: 'What should I bring?', text: 'What should I bring on my first drive?' },
          { kind: 'ask', label: 'What if I am late?', text: 'What do I do if I am running late?' },
        ];
      default:
        return [];
    }
  }
  // Right after the extract arrived: offer the first free call times.
  if (last.from === 'note' && last.actionDone && step === 'call') {
    const slots = options.filter((o) => o.action.type === 'book_call').slice(0, 3);
    return [
      ...slots.map((o): QuickReply => {
        const t = formatDateTime((o.action as { at: number }).at);
        return { kind: 'action', label: t, option: o, driverText: `Book ${t}` };
      }),
      { kind: 'ask', label: 'Other times', text: 'Which other times are free for my call?' },
    ];
  }
  return [];
}
