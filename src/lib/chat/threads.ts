import type { Applicant } from '../types';
import { DAY, MIN } from '../time';
import type { ChatMsg, ChatThread, HandoverReason, Proposal } from './types';
import type { AutoEvent } from '../automation';
import type { ActionOption } from './selfService';

/** Ops answers a handed-over question within this time (staffed hours). */
export const CHAT_SLA_MS = 15 * MIN;
/** Target share of driver questions the assistant answers without a person. */
export const AI_TARGET = 95;

let seq = 0;
const msgId = (at: number) => `m${at.toString(36)}${(seq++).toString(36)}`;

export function threadIdFor(applicantId: string | null): string {
  return `CHAT-${applicantId ?? 'visitor'}`;
}

export function emptyThread(a: Applicant | null): ChatThread {
  return { id: threadIdFor(a?.id ?? null), applicantId: a?.id ?? null, name: a?.name ?? 'Visitor (not applied)', messages: [], status: 'ai' };
}

function add(t: ChatThread, m: Omit<ChatMsg, 'id'>): ChatThread {
  return { ...t, messages: [...t.messages, { id: msgId(m.at), ...m }] };
}

export function addDriverMessage(t: ChatThread, text: string, now: number): ChatThread {
  const next = add(t, { from: 'driver', text, at: now });
  // While a person handles the thread, new messages wait for them too.
  return t.status === 'ops' ? { ...next, status: 'waiting', waitingSince: now } : next;
}

export function addAiAnswer(t: ChatThread, text: string, sources: string[], handover: HandoverReason | null, now: number, option?: ActionOption): ChatThread {
  const proposal: Proposal | undefined = option && !handover ? { optionId: option.id, label: option.label, action: option.action, status: 'open' } : undefined;
  // A newer proposal replaces any older one that is still open.
  const base = proposal ? { ...t, messages: t.messages.map((m) => (m.proposal?.status === 'open' ? { ...m, proposal: { ...m.proposal, status: 'stale' as const } } : m)) } : t;
  const next = add(base, { from: 'ai', text, at: now, ...(sources.length ? { sources } : {}), ...(handover ? { handover } : {}), ...(proposal ? { proposal } : {}) });
  return handover ? { ...next, status: 'waiting', waitingSince: now, reason: handover } : next;
}

/** The driver answered a proposal card. `done` is the confirmation text when the action went through. */
export function resolveProposal(t: ChatThread, msgId: string, outcome: { done: string } | { stale: string } | 'declined', now: number): ChatThread {
  const target = t.messages.find((m) => m.id === msgId);
  if (!target?.proposal || target.proposal.status !== 'open') return t;
  const status: Proposal['status'] = outcome === 'declined' ? 'declined' : 'done' in outcome ? 'done' : 'stale';
  const next: ChatThread = { ...t, messages: t.messages.map((m) => (m.id === msgId ? { ...m, proposal: { ...m.proposal!, status } } : m)) };
  if (outcome === 'declined') return add(next, { from: 'note', text: 'Okay, nothing was changed.', at: now });
  if ('done' in outcome) return add(next, { from: 'note', text: outcome.done, at: now, actionDone: target.proposal.label });
  return add(next, { from: 'note', text: `${outcome.stale} Ask again and I'll find another option.`, at: now });
}

/** The driver tapped a quick reply that does something (the tap is the confirmation). */
export function addSelfService(t: ChatThread, driverText: string, done: string, label: string, now: number): ChatThread {
  return add(add(t, { from: 'driver', text: driverText, at: now }), { from: 'note', text: done, at: now, actionDone: label });
}

/** A quick reply that needs no AI and changes nothing, e.g. "I'll be there". */
export function addAck(t: ChatThread, driverText: string, reply: string, now: number): ChatThread {
  return add(add(t, { from: 'driver', text: driverText, at: now }), { from: 'note', text: reply, at: now });
}

export function markSeen(t: ChatThread, now: number): ChatThread {
  return { ...t, seenAt: now };
}

/**
 * One conversation: the thread plus the automatic messages sent to the driver (reminders,
 * call reminder, decision, first-drive offers), which are derived from timestamps, not stored.
 */
export function chatTimeline(t: ChatThread | undefined, events: AutoEvent[]): ChatMsg[] {
  const autos: ChatMsg[] = events
    .filter((e) => e.audience === 'driver')
    .map((e) => ({ id: `auto-${e.kind}-${e.at}`, from: 'auto' as const, title: e.title, autoKind: e.kind, text: e.body ?? '', at: e.at }));
  // Stable: at the same time, automatic messages come before the conversation.
  return [...autos, ...(t?.messages ?? [])].map((m, i) => ({ m, i })).sort((x, y) => x.m.at - y.m.at || x.i - y.i).map((x) => x.m);
}

/** Automatic messages and ops replies the driver hasn't seen yet. */
export function unreadCount(timeline: ChatMsg[], seenAt: number | undefined): number {
  return timeline.filter((m) => (m.from === 'auto' || m.from === 'ops') && m.at > (seenAt ?? 0)).length;
}

export function addOfflineAnswer(t: ChatThread, text: string, sources: string[], now: number): ChatThread {
  return add(t, { from: 'ai', text, at: now, offline: true, ...(sources.length ? { sources } : {}) });
}

/** The driver tapped "Talk to a person". */
export function askForPerson(t: ChatThread, now: number): ChatThread {
  if (t.status !== 'ai') return t;
  const next = add(t, { from: 'note', text: 'You asked to talk to a person. Someone from ops replies here, usually within 15 minutes.', at: now, handover: 'asked' });
  return { ...next, status: 'waiting', waitingSince: now, reason: 'asked' };
}

export function opsReply(t: ChatThread, text: string, by: string, now: number): ChatThread {
  const { waitingSince: _w, ...rest } = add(t, { from: 'ops', text, at: now, by });
  return { ...rest, status: 'ops' };
}

/** Ops is done: the assistant answers again. */
export function backToAi(t: ChatThread, now: number): ChatThread {
  const { waitingSince: _w, reason: _r, ...rest } = add(t, { from: 'note', text: 'The assistant is answering again. Ask for a person any time.', at: now });
  return { ...rest, status: 'ai' };
}

export function closeGap(t: ChatThread, msgIdToClose: string): ChatThread {
  return { ...t, messages: t.messages.map((m) => (m.id === msgIdToClose ? { ...m, gapClosed: true } : m)) };
}

export function waitingThreads(threads: ChatThread[]): ChatThread[] {
  return threads.filter((t) => t.status === 'waiting').sort((a, b) => (a.waitingSince ?? 0) - (b.waitingSince ?? 0));
}

/** The driver question just before a message (what was asked). */
export function questionBefore(t: ChatThread, msgIdx: number): string {
  for (let i = msgIdx - 1; i >= 0; i--) if (t.messages[i].from === 'driver') return t.messages[i].text;
  return '';
}

export interface ChatStats {
  /** Things drivers did themselves in the chat (booked or moved a call, marked the extract, picked a drive, reminders). */
  selfService: number;
  questions: number; // answered by AI + handed over (offline answers excluded)
  byAi: number;
  handedOver: number;
  rate: number | null; // % answered by AI
  byReason: Partial<Record<HandoverReason, number>>;
  medianOpsReplyMin: number | null;
}

/**
 * "Answered by AI": of the driver questions in the window, the share the assistant answered
 * without a person. A question answered while the AI was offline counts for neither side.
 */
export function chatStats(threads: ChatThread[], now: number, windowMs = 7 * DAY): ChatStats {
  let byAi = 0;
  let handedOver = 0;
  let selfService = 0;
  const byReason: ChatStats['byReason'] = {};
  const replyMins: number[] = [];
  for (const t of threads) {
    let waitingFrom: number | null = null;
    for (const m of t.messages) {
      const inWindow = now - m.at <= windowMs && m.at <= now;
      if (m.actionDone && inWindow) selfService++;
      if (m.handover) {
        if (inWindow) {
          handedOver++;
          byReason[m.handover] = (byReason[m.handover] ?? 0) + 1;
        }
        waitingFrom ??= m.at;
      } else if (m.from === 'ai' && !m.offline && inWindow) byAi++;
      if (m.from === 'ops' && waitingFrom !== null) {
        if (inWindow) replyMins.push((m.at - waitingFrom) / MIN);
        waitingFrom = null;
      }
    }
  }
  const questions = byAi + handedOver;
  replyMins.sort((a, b) => a - b);
  return {
    selfService,
    questions,
    byAi,
    handedOver,
    rate: questions ? (byAi / questions) * 100 : null,
    byReason,
    medianOpsReplyMin: replyMins.length ? replyMins[Math.floor(replyMins.length / 2)] : null,
  };
}

export interface Gap {
  threadId: string;
  msgId: string;
  name: string;
  question: string;
  at: number;
}

/** Questions the help articles didn't cover: the list of articles to write next. */
export function contentGaps(threads: ChatThread[]): Gap[] {
  const out: Gap[] = [];
  for (const t of threads)
    t.messages.forEach((m, i) => {
      if (m.handover === 'unsure' && !m.gapClosed) out.push({ threadId: t.id, msgId: m.id, name: t.name, question: questionBefore(t, i), at: m.at });
    });
  return out.sort((a, b) => b.at - a.at);
}

/** Move every timestamp of a thread by `delta` ms (used when an old save is restored). */
export function shiftThread(t: ChatThread, delta: number): ChatThread {
  return {
    ...t,
    messages: t.messages.map((m) => ({ ...m, at: m.at + delta })),
    ...(t.waitingSince !== undefined ? { waitingSince: t.waitingSince + delta } : {}),
  };
}

// ---------------- Demo history ----------------

type Line = [from: ChatMsg['from'], text: string, minutesAfterStart: number, extra?: Partial<ChatMsg>];

/** Past conversations, so the queue, the AI metric and the gap list have something to show. */
const HISTORY: { name: string; daysAgo: number; lines: Line[]; waiting?: HandoverReason }[] = [
  { name: 'Lucas Andersson', daysAgo: 0.05, lines: [
    ['driver', 'Do I need my own company to drive with you?', 0],
    ['ai', "No, you don't. Pay goes through our payroll partner, which deducts tax, and you get a payslip each time. If you already have a company with F-tax, you can invoice instead.", 0.2, { sources: ['payouts'] }],
  ] },
  { name: 'Wilma Eriksson', daysAgo: 0.04, lines: [
    ['driver', 'hur lång tid tar det att få utdraget?', 0],
    ['ai', 'Det brukar ta några dagar, ibland upp till två veckor. Säg till här när du har beställt det, så påminner vi dig att boka samtalet när det har kommit.', 0.2, { sources: ['extract-order', 'extract-delay'] }],
    ['driver', 'jag har beställt det nu', 1],
    ['ai', 'Toppen! Bekräfta med knappen nedan så noterar jag att utdraget är beställt.', 1.2, { proposal: { optionId: 'ORDERED', label: 'Mark your extract as ordered', action: { type: 'extract_ordered' }, status: 'done' } }],
    ['note', "Noted: your extract is ordered. Tell me when it arrives and we'll book your call.", 1.4, { actionDone: 'Mark your extract as ordered' }],
    ['driver', 'Can I do the other steps while I wait?', 3],
    ['ai', 'Yes. BankID, the licence photo and the profile photo can all be done while you wait for the extract.', 3.2, { sources: ['extract-delay'] }],
  ] },
  { name: 'Hugo Larsson', daysAgo: 0.008, waiting: 'unsure', lines: [
    ['driver', 'Do you also have jobs driving vans or cars with a trailer?', 0],
    ['ai', "Good question, but I don't have an answer to that in our help articles. I've passed it to a person in ops; they usually reply within 15 minutes.", 0.2, { handover: 'unsure' }],
  ] },
  { name: 'Viktor Engström', daysAgo: 0.004, waiting: 'asked', lines: [
    ['driver', 'Which of the three first drives is easiest?', 0],
    ['ai', 'All three are picked to be easy: short, with a standard car and near you. The shortest one is usually the simplest start. Ops also calls you within 24 hours to go through it.', 0.2, { sources: ['first-drive'] }],
    ['note', 'You asked to talk to a person. Someone from ops replies here, usually within 15 minutes.', 1, { handover: 'asked' }],
  ] },
  { name: 'Liam Persson', daysAgo: 1.2, lines: [
    ['driver', 'what do you pay per job', 0],
    ['ai', 'Every job shows its pay before you accept it. Short city drives pay around 300–350 SEK and longer ones like Stockholm–Uppsala around 650–700 SEK. Public transport to and from the job is refunded on top.', 0.2, { sources: ['pay', 'travel-costs'] }],
    ['driver', "I've ordered it", 30],
    ['note', "Noted: your extract is ordered. Tell me when it arrives and we'll book your call.", 30, { actionDone: 'Mark your extract as ordered' }],
  ] },
  { name: 'Ebba Gustafsson', daysAgo: 1.6, lines: [
    ['driver', 'Is there a bonus if I refer a friend?', 0],
    ['ai', "I don't have an answer to that in our help articles, so I've passed it to a person in ops. They usually reply within 15 minutes.", 0.2, { handover: 'unsure' }],
    ['ops', "Not right now, but we're looking into it. Your friend is very welcome to apply in the app!", 9, { by: 'Sofia' }],
    ['note', 'The assistant is answering again. Ask for a person any time.', 10],
  ] },
  { name: 'Klara Forsberg', daysAgo: 2.1, lines: [
    ['driver', 'What should I bring on my first drive?', 0],
    ['ai', 'Bring your driving licence and a charged phone. You get a reminder the day before with the address and time, and ops is on standby in the chat during the whole drive.', 0.2, { sources: ['first-drive'] }],
  ] },
  { name: 'Noah Pettersson', daysAgo: 2.5, lines: [
    ['driver', 'Måste jag ha egen försäkring?', 0],
    ['ai', 'Nej. Varje bil är försäkrad när du kör den på ett uppdrag, och du betalar ingen självrisk vid vanliga olyckor (undantaget grov vårdslöshet).', 0.2, { sources: ['insurance'] }],
  ] },
  { name: 'Ali Mohammed', daysAgo: 3, lines: [
    ['driver', 'I have had my licence for 18 months, can I still apply?', 0],
    ['ai', 'Yes. With 1–2 years you can be accepted for simple drives first: shorter drives with standard cars. After a few drives without remarks you get the full range.', 0.2, { sources: ['licence-years', 'simple-drives'] }],
  ] },
  { name: 'Ida Sjöberg', daysAgo: 3.4, lines: [
    ['driver', 'I can only drive weekends, is that a problem?', 0],
    ['ai', "Not at all. You choose your jobs, and there are weekend jobs every week. Limited availability is never a reason to say no.", 0.2, { sources: ['availability'] }],
  ] },
  { name: 'Mohammed Yusuf', daysAgo: 3.9, lines: [
    ['driver', 'I need to move my call on Thursday', 0],
    ['ai', "I can't move a booked call myself, so I've passed this to a person in ops. Tell them which times suit you; they usually reply within 15 minutes.", 0.2, { sources: ['call-reschedule'], handover: 'personal' }],
    ['ops', 'Moved to Friday 09:15. See you then!', 6, { by: 'Hjalmar' }],
    ['note', 'The assistant is answering again. Ask for a person any time.', 7],
  ] },
  { name: 'Selma Holm', daysAgo: 4.4, lines: [
    ['driver', 'Do you refund SL tickets?', 0],
    ['ai', 'Yes. SL and train tickets that are part of a job are refunded: add the receipt to the job in the app within 7 days.', 0.2, { sources: ['travel-costs'] }],
  ] },
  { name: 'Astrid Jonsson', daysAgo: 4.8, lines: [
    ['driver', 'what happens if I get a speeding ticket', 0],
    ['ai', 'Speeding tickets and other traffic fines are your own responsibility. Parking fines caused by the job itself are handled by us: send a photo of the fine in the chat.', 0.2, { sources: ['fines'] }],
  ] },
  { name: 'Anton Wallin', daysAgo: 5.2, lines: [
    ['driver', 'When do I get paid?', 0],
    ['ai', 'Twice a month, on the 10th and the 25th, for jobs done up to 5 days earlier. You get a payslip each time.', 0.2, { sources: ['payouts'] }],
  ] },
  { name: 'Freja Lundberg', daysAgo: 5.6, lines: [
    ['driver', 'Do you pay extra for electric cars?', 0],
    ['ai', "I don't have an answer to that in our help articles, so I've passed it to a person in ops. They usually reply within 15 minutes.", 0.2, { handover: 'unsure' }],
    ['ops', 'No, pay is the same; it depends on distance and time.', 14, { by: 'Sofia' }],
    ['note', 'The assistant is answering again. Ask for a person any time.', 15],
  ] },
  { name: 'Lova Hedlund', daysAgo: 6, lines: [
    ['driver', 'Can my friend come along on the drive?', 0],
    ['ai', 'No passengers and no personal errands during a job, sorry. Short stops for fuel, charging or a break on longer drives are fine.', 0.2, { sources: ['passengers'] }],
    ['driver', 'ok thanks', 1],
    ['ai', 'You are welcome! Have a good first drive.', 1.2],
  ] },
  { name: 'Nora Axelsson', daysAgo: 6.4, lines: [
    ['driver', 'Is this a bot?', 0],
    ['ai', "Yes, I'm an AI assistant. I answer from our help articles and your application status, and I can't make decisions. You can talk to a person any time.", 0.2, { sources: ['ai-assistant'] }],
  ] },
  { name: 'Isak Bergström', daysAgo: 0.6, lines: [
    ['driver', 'Do I need to fill up the car before delivery?', 0],
    ['ai', 'Only if the job says so or ops asks you to. If you do, keep the receipt and add it to the job; it is refunded with your next payout.', 0.2, { sources: ['fuel-tolls'] }],
    ['driver', 'And the congestion charge?', 2],
    ['ai', 'Congestion charges and bridge tolls are billed to the car owner, so you pay nothing.', 2.2, { sources: ['fuel-tolls'] }],
  ] },
  { name: 'Julia Lindgren', daysAgo: 0.9, lines: [
    ['driver', 'The customer is not home, what do I do?', 0],
    ['ai', 'Wait 15 minutes and message ops here in the chat. Never leave the keys anywhere the job doesn\'t say.', 0.2, { sources: ['delivery'] }],
  ] },
  { name: 'Emma Holmberg', daysAgo: 1.4, lines: [
    ['driver', 'Can I cancel a job I took for Saturday?', 0],
    ['ai', 'Yes, you can cancel it in the app up to 24 hours before it starts. Later than that, tell ops in the chat as soon as you can.', 0.2, { sources: ['cancel-job'] }],
  ] },
  { name: 'Leo Mattsson', daysAgo: 1.8, lines: [
    ['driver', 'Hur många bilder ska jag ta vid hämtning?', 0],
    ['ai', 'Fotografera bilen från alla fyra sidor plus instrumentbrädan (mätarställning och bränsle eller batteri), och närbilder på eventuella skador. Bilderna skyddar dig.', 0.2, { sources: ['pickup-checklist'] }],
  ] },
  { name: 'Agnes Ekström', daysAgo: 2.3, lines: [
    ['driver', 'Can I take a few weeks off in summer?', 0],
    ['ai', 'Of course. Just don\'t take jobs while you\'re away; nothing happens to your account.', 0.2, { sources: ['pause-quit'] }],
  ] },
  { name: 'Linnea Björk', daysAgo: 2.8, lines: [
    ['driver', 'Is taxi refunded if the job ends late at night?', 0],
    ['ai', 'Only if ops has approved it first. Ask in the chat before you book the taxi; SL and train tickets are refunded as usual.', 0.2, { sources: ['travel-costs'] }],
  ] },
  { name: 'Omar Khalil', daysAgo: 3.6, lines: [
    ['driver', 'I got a parking fine at the customer address', 0],
    ['ai', 'Parking fines caused by the job itself are handled by us. Send a photo of the fine here in the chat.', 0.2, { sources: ['fines'] }],
    ['driver', 'Ok sent', 2],
    ['ai', 'Thanks! Ops takes it from here; you don\'t need to do anything else.', 2.2, { sources: ['fines'] }],
  ] },
  { name: 'Saga Fransson', daysAgo: 4.2, lines: [
    ['driver', 'Which languages can I write in here?', 0],
    ['ai', 'Any language: I answer in the same one. Ops answers in Swedish or English.', 0.2, { sources: ['languages'] }],
  ] },
  { name: 'Alva Olsson', daysAgo: 5, lines: [
    ['driver', 'My licence photo looks blurry, is that ok?', 0],
    ['ai', 'Please take a new one: the whole card should be visible, the text sharp and without glare. Front and back.', 0.2, { sources: ['licence-photo'] }],
  ] },
  { name: 'Adam Jakobsson', daysAgo: 5.4, lines: [
    ['driver', 'Can I use a digital licence?', 0],
    ['ai', 'Not yet, please use the physical card. A temporary licence (körkortstillstånd) can\'t be used either.', 0.2, { sources: ['licence-photo'] }],
  ] },
  { name: 'Elin Johansson', daysAgo: 6.2, lines: [
    ['driver', 'What do you do with my data if I stop?', 0],
    ['ai', 'We keep what the law requires for pay and accounting and delete the rest. You can ask to see, correct or delete your data here in the chat.', 0.2, { sources: ['data-retention', 'pause-quit'] }],
  ] },
];

/** Demo conversations for applicants in the seed (matched by name). */
export function seedThreads(apps: Applicant[], now: number): ChatThread[] {
  const out: ChatThread[] = [];
  for (const h of HISTORY) {
    const a = apps.find((x) => x.name === h.name);
    if (!a) continue;
    const start = now - h.daysAgo * DAY;
    let t: ChatThread = { ...emptyThread(a), messages: [] };
    for (const [from, text, mins, extra] of h.lines) t = add(t, { from, text, at: Math.round(start + mins * MIN), ...extra });
    if (h.waiting) {
      const last = t.messages[t.messages.length - 1];
      t = { ...t, status: 'waiting', waitingSince: last.at, reason: h.waiting };
    }
    out.push(t);
  }
  return out;
}

/** True when a saved thread has the shape this version expects. */
export function isThread(t: unknown): t is ChatThread {
  const x = t as ChatThread;
  return !!x && typeof x.id === 'string' && typeof x.name === 'string' && Array.isArray(x.messages) && ['ai', 'waiting', 'ops'].includes(x.status);
}

