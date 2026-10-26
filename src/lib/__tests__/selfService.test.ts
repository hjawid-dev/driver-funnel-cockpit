import { describe, expect, it } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import type { Applicant } from '../types';
import { actionOptions, applyChatAction, quickReplies, MOVE_CALL_UNTIL_MS } from '../chat/selfService';
import { addAiAnswer, addDriverMessage, addSelfService, chatStats, chatTimeline, emptyThread, markSeen, resolveProposal, unreadCount } from '../chat/threads';
import { parseMeta } from '../chat/meta';
import { contextText } from '../chat/prompt';
import { validateChatRequest } from '../chat/guard';
import { toTurns } from '../chat/client';
import { createChatHandler, type ModelClient } from '../chat/server';
import { automationEvents, driverInbox } from '../automation';
import { nudgeState } from '../nudges';
import { restore, serialize } from '../persist';
import { generateGigs } from '../gigs';
import { generateSeed } from '../seed';
import { driverStep } from '../driverFlow';
import { DAY, HOUR, MIN } from '../time';
import { mk, NOW } from './helpers';

const gigs = generateGigs(NOW);
const docs = (over: Partial<Applicant['docs']>): Applicant['docs'] => ({ licence: 'verified', id: 'verified', extract: 'missing', photo: 'uploaded', ...over });

// Applicants at each step of the flow.
const atExtract = mk({ id: 'DRV-2001', registeredAt: NOW - 3 * HOUR, docs: docs({ extract: 'missing' }) });
const extractOrdered = mk({ id: 'DRV-2002', registeredAt: NOW - 3 * HOUR, docs: docs({ extract: 'pending' }), docsCompleteAt: NOW - 3 * HOUR });
const atCall = mk({ id: 'DRV-2003', docs: docs({ extract: 'ready' }), docsCompleteAt: NOW - HOUR });
const callBooked = { ...atCall, id: 'DRV-2004', callAt: NOW + 2 * DAY };
const accepted = mk({ id: 'DRV-2005', docs: docs({ extract: 'ready' }), docsCompleteAt: NOW - 3 * DAY, extractShown: true, decision: { type: 'accepted', at: NOW - DAY, by: 'Hjalmar' } });
const apps = [atExtract, extractOrdered, atCall, callBooked, accepted];

describe('action options', () => {
  it('offers only what fits the driver’s step', () => {
    const ids = (a: Applicant) => actionOptions(a, apps, gigs, NOW).map((o) => o.id);
    expect(ids(atExtract)).toEqual(['ORDERED', 'ARRIVED', 'LATER_1D', 'LATER_3D', 'STOP']);
    // Ordered is enough to book the call; "arrived" lets the driver show it in the call.
    expect(ids(extractOrdered)).toEqual(['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10', 'ARRIVED']);
    expect(ids(atCall)).toEqual(['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10']);
    // Spread out: at most two times per review slot, over at least three days.
    const days = new Set(actionOptions(atCall, apps, gigs, NOW).map((o) => new Date((o.action as { at: number }).at).toDateString()));
    expect(days.size).toBeGreaterThanOrEqual(3);
    // Calls are on weekdays only, as the help article says.
    expect([...days].every((d) => ![0, 6].includes(new Date(d).getDay()))).toBe(true);
    expect(ids(callBooked).every((id) => id.startsWith('S'))).toBe(true);
    expect(ids(accepted).every((id) => id.startsWith('G'))).toBe(true);
    expect(ids(accepted).length).toBeGreaterThan(0);
    expect(actionOptions(null, apps, gigs, NOW)).toEqual([]);
  });
  it('never offers anything about a decision', () => {
    const all = apps.flatMap((a) => actionOptions(a, apps, gigs, NOW));
    expect(all.map((o) => o.action.type)).not.toContain('accept');
    expect(all.every((o) => ['book_call', 'extract_ordered', 'extract_arrived', 'pick_gig', 'remind_later', 'stop_reminders'].includes(o.action.type))).toBe(true);
  });
  it('lets a booked call be moved, but not within 2 hours of it', () => {
    const moving = actionOptions(callBooked, apps, gigs, NOW);
    expect(moving[0].label).toMatch(/^Move your call to/);
    expect(moving.some((o) => o.action.type === 'book_call' && o.action.at === callBooked.callAt)).toBe(false);
    const soon = { ...callBooked, callAt: NOW + MOVE_CALL_UNTIL_MS - MIN };
    expect(actionOptions(soon, apps, gigs, NOW)).toEqual([]);
  });
  it('stops offering reminder choices once reminders are stopped', () => {
    const stopped = { ...atExtract, reminders: { offAt: NOW - MIN } };
    expect(actionOptions(stopped, apps, gigs, NOW).map((o) => o.id)).toEqual(['ORDERED', 'ARRIVED']);
  });
});

describe('carrying out a confirmed action', () => {
  it('books, then moves, the call and writes it to the log as confirmed by the driver', () => {
    const [s1, s2] = actionOptions(atCall, apps, gigs, NOW);
    const r = applyChatAction(atCall, s1.action, apps, gigs, NOW);
    expect(r.ok && r.applicant.callAt).toBe((s1.action as { at: number }).at);
    expect(r.ok && r.applicant.log.at(-1)!.text).toContain('confirmed by the driver');
    expect(r.ok && driverStep(r.applicant)).toBe('decision');
    if (!r.ok) return;
    const moved = applyChatAction(r.applicant, s2.action, apps, gigs, NOW);
    expect(moved.ok && moved.applicant.callAt).toBe((s2.action as { at: number }).at);
    expect(moved.ok && moved.done).toMatch(/^Your call is moved to/);
  });
  it('refuses a time someone else has taken in the meantime', () => {
    const s1 = actionOptions(atCall, apps, gigs, NOW)[0];
    const taken = { ...callBooked, id: 'DRV-2999', callAt: (s1.action as { at: number }).at };
    const r = applyChatAction(atCall, s1.action, [...apps, taken], gigs, NOW);
    expect(r).toEqual({ ok: false, reason: 'That time is no longer free.' });
  });
  it('refuses an action that is not one of the driver’s options', () => {
    expect(applyChatAction(atExtract, { type: 'book_call', at: NOW + DAY }, apps, gigs, NOW).ok).toBe(false);
    expect(applyChatAction(atCall, { type: 'pick_gig', gigId: gigs[0].id }, apps, gigs, NOW).ok).toBe(false);
  });
  it('marks the extract as ordered, which completes the file; arriving later changes nothing in the queue', () => {
    const o = applyChatAction(atExtract, { type: 'extract_ordered' }, apps, gigs, NOW);
    expect(o.ok && o.applicant.docs.extract).toBe('pending');
    expect(o.ok && o.applicant.docsCompleteAt).toBe(NOW);
    if (!o.ok) return;
    const r = applyChatAction(o.applicant, { type: 'extract_arrived' }, apps, gigs, NOW + MIN);
    expect(r.ok && r.applicant.docs.extract).toBe('ready');
    expect(r.ok && r.applicant.docsCompleteAt).toBe(NOW);
  });
  it('picks a first drive from the offers', () => {
    const g1 = actionOptions(accepted, apps, gigs, NOW)[0];
    const r = applyChatAction(accepted, g1.action, apps, gigs, NOW);
    expect(r.ok && r.applicant.firstGig?.gigId).toBe((g1.action as { gigId: string }).gigId);
    expect(r.ok && driverStep(r.applicant)).toBe('booked');
  });
});

describe('reminders the driver controls', () => {
  // Registered 3 h ago: the 2 h reminder has gone out, the 24 h and 72 h ones are ahead.
  it('"Remind me tomorrow" pauses the scheduled reminders and sends one at the chosen time', () => {
    const later = actionOptions(atExtract, apps, gigs, NOW).find((o) => o.id === 'LATER_1D')!;
    const r = applyChatAction(atExtract, later.action, apps, gigs, NOW);
    if (!r.ok) throw new Error('expected ok');
    const until = (later.action as { until: number }).until;
    const events = automationEvents([r.applicant], NOW, NOW + 5 * DAY).filter((e) => e.audience === 'driver' && e.kind === 'nudge');
    expect(events.map((e) => e.at)).toEqual([until, atExtract.registeredAt + 72 * HOUR].sort((x, y) => x - y));
    expect(events.some((e) => e.title === 'The reminder you asked for')).toBe(true);
    expect(nudgeState(r.applicant, NOW).label).toMatch(/^Driver asked for a reminder/);
  });
  it('"Stop reminders" stops every later reminder, and ops sees it', () => {
    const r = applyChatAction(atExtract, { type: 'stop_reminders' }, apps, gigs, NOW);
    if (!r.ok) throw new Error('expected ok');
    expect(automationEvents([r.applicant], NOW, NOW + 5 * DAY).filter((e) => e.kind === 'nudge')).toEqual([]);
    expect(nudgeState(r.applicant, NOW).label).toBe('Driver stopped reminders in the chat');
    // Reminders sent before stopping still show in the driver's history.
    expect(driverInbox(r.applicant, NOW).some((e) => e.kind === 'nudge')).toBe(true);
  });
  it('keeps the choice when an old save is moved forward in time', () => {
    const later3 = actionOptions(atExtract, apps, gigs, NOW).find((o) => o.id === 'LATER_3D')!;
    const r = applyChatAction(atExtract, later3.action, apps, gigs, NOW);
    if (!r.ok) throw new Error('expected ok');
    const data = { apps: [r.applicant], gigs, threads: [], jobs: [] };
    const out = restore(serialize(data, NOW), NOW + 2 * DAY)!;
    expect(out.apps[0].reminders!.snooze!.until).toBe(r.applicant.reminders!.snooze!.until);
  });
});

describe('the chat timeline', () => {
  it('merges automatic messages with the conversation, oldest first, and counts unread', () => {
    let t = addDriverMessage(emptyThread(atExtract), 'hi', NOW - MIN);
    const tl = chatTimeline(t, driverInbox(atExtract, NOW));
    expect(tl[0]).toMatchObject({ from: 'auto', autoKind: 'nudge' });
    expect(tl.at(-1)).toMatchObject({ from: 'driver', text: 'hi' });
    expect(unreadCount(tl, undefined)).toBe(1);
    t = markSeen(t, NOW);
    expect(unreadCount(chatTimeline(t, driverInbox(atExtract, NOW)), t.seenAt)).toBe(0);
  });
  it('shows one-tap answers under a reminder', () => {
    const tl = chatTimeline(undefined, driverInbox(atExtract, NOW));
    const q = quickReplies(tl.at(-1), atExtract, actionOptions(atExtract, apps, gigs, NOW));
    expect(q.map((x) => x.label)).toEqual(["I've ordered my extract", 'My extract has arrived', 'Remind me tomorrow', 'Stop reminders']);
  });
  it('offers call times right after the extract arrived', () => {
    const r = applyChatAction(extractOrdered, { type: 'extract_arrived' }, apps, gigs, NOW);
    if (!r.ok) throw new Error('expected ok');
    const t = addSelfService(emptyThread(r.applicant), 'My extract has arrived', r.done, 'Mark your extract as arrived', NOW);
    const q = quickReplies(t.messages.at(-1), r.applicant, actionOptions(r.applicant, apps, gigs, NOW));
    expect(q.filter((x) => x.kind === 'action')).toHaveLength(3);
    expect(q.at(-1)).toMatchObject({ kind: 'ask', label: 'Other times' });
  });
  it('gives the assistant the reminders and done actions as context', () => {
    const t = addSelfService(emptyThread(atExtract), "I've ordered my extract", 'Noted: your extract is ordered.', 'Mark your extract as ordered', NOW);
    const turns = toTurns(chatTimeline(t, driverInbox(atExtract, NOW)), 'and now?');
    expect(turns[0]).toEqual({ role: 'user', content: '(Opened the chat)' });
    expect(turns[1]).toEqual({ role: 'assistant', content: expect.stringContaining('(Automatic message) Reminder 1 of 3') });
    expect(validateChatRequest({ messages: turns }).ok).toBe(true);
    expect(turns.some((x) => x.content.includes('(Done in the app) Noted'))).toBe(true);
    expect(t.messages).toHaveLength(2);
  });
});

describe('proposals', () => {
  const s1 = actionOptions(atCall, apps, gigs, NOW)[0];
  const asked = addDriverMessage(emptyThread(atCall), 'Book me tomorrow morning', NOW);
  it('adds a proposal to the answer; confirming it counts as done in the chat', () => {
    const t = addAiAnswer(asked, 'Tomorrow 09:00 is free. Confirm below.', [], null, NOW, s1);
    const msg = t.messages.at(-1)!;
    expect(msg.proposal).toMatchObject({ optionId: 'S1', status: 'open' });
    const done = resolveProposal(t, msg.id, { done: 'Your call is booked.' }, NOW);
    expect(done.messages.find((m) => m.id === msg.id)!.proposal!.status).toBe('done');
    expect(done.messages.at(-1)).toMatchObject({ from: 'note', actionDone: s1.label });
    expect(chatStats([done], NOW).selfService).toBe(1);
    // A second answer to the same card does nothing.
    expect(resolveProposal(done, msg.id, 'declined', NOW)).toBe(done);
  });
  it('declining changes nothing; a newer proposal replaces an older open one', () => {
    let t = addAiAnswer(asked, 'S1?', [], null, NOW, s1);
    const first = t.messages.at(-1)!.id;
    t = addAiAnswer(addDriverMessage(t, 'later?', NOW), 'S2?', [], null, NOW, actionOptions(atCall, apps, gigs, NOW)[1]);
    expect(t.messages.find((m) => m.id === first)!.proposal!.status).toBe('stale');
    const declined = resolveProposal(t, t.messages.at(-1)!.id, 'declined', NOW);
    expect(declined.messages.at(-1)).toMatchObject({ from: 'note', text: 'Okay, nothing was changed.' });
    expect(chatStats([declined], NOW).selfService).toBe(0);
  });
  it('gets no proposal when the answer hands over to a person', () => {
    const t = addAiAnswer(asked, 'A person will help.', [], 'personal', NOW, s1);
    expect(t.messages.at(-1)!.proposal).toBeUndefined();
  });
});

describe('the assistant’s side of actions', () => {
  it('lists the options in the driver status and accepts only listed ids back', () => {
    const text = contextText({ status: 'Applying', options: [{ id: 'S1', label: 'Book your call for Fri 24 Oct, 09:00' }] });
    expect(text).toContain('- S1: Book your call for Fri 24 Oct, 09:00');
    expect(contextText({})).toContain('Actions you can offer: none right now.');
    const ids = new Set(['S1', 'STOP']);
    expect(parseMeta('{"sources":[],"handover":null,"action":"S1"}', new Set(), ids).action).toBe('S1');
    expect(parseMeta('{"sources":[],"handover":null,"action":"ACCEPT"}', new Set(), ids).action).toBeNull();
    expect(parseMeta('{"sources":[],"handover":"personal","action":"S1"}', new Set(), ids).action).toBeNull();
  });
  it('drops malformed options from the request', () => {
    const r = validateChatRequest({
      messages: [{ role: 'user', content: 'hi' }],
      context: { options: [{ id: 'S1', label: 'ok' }, { id: 's1; drop', label: 'x' }, { id: 'S2', label: 'x'.repeat(200) }, 'junk'] },
    });
    expect(r.ok && r.value.context.options).toEqual([{ id: 'S1', label: 'ok' }]);
  });
  it('passes on an action only when it was in the options sent', async () => {
    const reply = (action: string) => {
      const client: ModelClient = {
        stream() {
          async function* ev() {
            yield { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: `Sure.<meta>{"sources":[],"handover":null,"action":"${action}"}</meta>` } } as Anthropic.MessageStreamEvent;
          }
          return Object.assign(ev(), { finalMessage: async () => ({ stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }) as Anthropic.Message, abort: () => {} });
        },
      };
      return createChatHandler({ env: {}, client })(
        new Request('https://x.app/api/chat', {
          method: 'POST',
          headers: { origin: 'https://x.app', host: 'x.app', 'content-type': 'application/json' },
          body: JSON.stringify({ messages: [{ role: 'user', content: 'book it' }], context: { options: [{ id: 'S1', label: 'Book your call' }] } }),
        }),
      );
    };
    const last = async (res: Response) => JSON.parse((await res.text()).trim().split('\n').at(-1)!);
    expect((await last(await reply('S1'))).action).toBe('S1');
    expect((await last(await reply('S9'))).action).toBeNull();
  });
});

describe('demo history', () => {
  it('includes things drivers did in the chat', async () => {
    const { seedThreads } = await import('../chat/threads');
    const seed = generateSeed(NOW);
    expect(chatStats(seedThreads(seed, NOW), NOW).selfService).toBeGreaterThanOrEqual(2);
  });
});
