import { describe, expect, it } from 'vitest';
import { todayItems } from '../today';
import type { ChatThread } from '../chat/types';
import { generateSeed } from '../seed';
import { seedThreads } from '../chat/threads';
import { seedJobs } from '../liveOps';
import { DAY, HOUR } from '../time';
import { mk, NOW } from './helpers';

const thread = (over: Partial<ChatThread>): ChatThread => ({ id: 't', applicantId: null, name: 'A', messages: [], status: 'ai', ...over });

describe('todayItems', () => {
  it('is empty when nothing needs a person', () => {
    expect(todayItems([], [], NOW)).toEqual([]);
  });

  it('lists urgent things first and only what has a count', () => {
    const apps = [
      mk({ docsCompleteAt: NOW - 60 * HOUR, docs: { licence: 'verified', id: 'verified', extract: 'ready', photo: 'uploaded' } }),
      mk({ decision: { type: 'accepted', at: NOW - 10 * DAY, by: 'x' } }),
    ];
    const threads = [thread({ id: '1', status: 'waiting', reason: 'urgent' }), thread({ id: '2', status: 'waiting', reason: 'asked' }), thread({ id: '3' })];
    const items = todayItems(apps, threads, NOW);
    expect(items.map((i) => i.key)).toEqual(['urgent', 'overdue', 'questions', 'activation']);
    expect(items[0]).toMatchObject({ tab: 'chat', label: '1 urgent, on a drive', urgent: true });
    expect(items[1]).toMatchObject({ tab: 'review', label: '1 review overdue' });
  });

  it('counts files with no response for 14 days', () => {
    const items = todayItems([mk({ registeredAt: NOW - 20 * DAY }), mk({ registeredAt: NOW - 20 * DAY })], [], NOW);
    expect(items).toEqual([{ key: 'close', tab: 'missing', count: 2, label: '2 files to close', urgent: false }]);
  });

  it('the demo data opens with overdue reviews to act on', () => {
    const items = todayItems(generateSeed(NOW), [], NOW);
    expect(items.some((i) => i.key === 'overdue')).toBe(true);
  });

  it("the demo day: Julia's drive is one urgent item that opens Live ops, and one pickup isn't confirmed", () => {
    const apps = generateSeed(NOW);
    const items = todayItems(apps, seedThreads(apps, NOW), NOW, seedJobs(apps, NOW));
    expect(items.find((i) => i.key === 'urgent')).toMatchObject({ count: 1, tab: 'live' });
    expect(items.find((i) => i.key === 'pickups')).toMatchObject({ count: 1, label: '1 pickup not confirmed', tab: 'live' });
  });
});
