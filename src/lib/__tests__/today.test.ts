import { describe, expect, it } from 'vitest';
import { isOverdueReview, isToChase, isToClose, todayItems } from '../today';
import { deriveStage } from '../stage';
import { openIncidents } from '../liveOps';
import { computeFunnel, reachedStage } from '../kpis';
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
    expect(items.map((i) => i.key)).toEqual(['urgentchat', 'overdue', 'questions']);
    expect(items[0]).toMatchObject({ tab: 'chat', label: '1 urgent question', urgent: true, ids: ['1'] });
    expect(items[1]).toMatchObject({ tab: 'review', label: '1 review overdue' });
  });

  it('counts files with no response for 14 days', () => {
    const items = todayItems([mk({ registeredAt: NOW - 20 * DAY }), mk({ registeredAt: NOW - 20 * DAY })], [], NOW);
    expect(items).toMatchObject([{ key: 'close', tab: 'missing', count: 2, label: '2 files to close', urgent: false }]);
    expect(items[0].ids).toHaveLength(2);
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

  // The rule behind every Today button: the number on it is the number of rows the list opens on.
  it.each([0, 1, 3])('the number on each item is exactly who its list shows (day %i of the demo)', (days) => {
    const at = NOW + days * DAY;
    const apps = generateSeed(NOW);
    const threads = seedThreads(apps, NOW);
    const jobs = seedJobs(apps, NOW);
    const items = todayItems(apps, threads, at, jobs);
    expect(items.length).toBeGreaterThan(0);
    for (const i of items) {
      expect(new Set(i.ids).size, i.key).toBe(i.count);
      expect(i.label.startsWith(`${i.count} `), i.key).toBe(true);
      // Every id is a row of the tab the item opens.
      const rows =
        i.tab === 'live' ? jobs.map((j) => j.id)
        : i.tab === 'chat' ? threads.filter((t) => t.status === 'waiting').map((t) => t.id)
        : apps.filter((a) => deriveStage(a) === ({ review: 'review', missing: 'registered', awaiting: 'accepted' } as Record<string, string>)[i.tab]).map((a) => a.id);
      for (const id of i.ids) expect(rows, `${i.key} ${id}`).toContain(id);
    }
    const ids = (key: string) => items.find((i) => i.key === key)?.ids ?? [];
    expect(ids('overdue')).toEqual(apps.filter((a) => isOverdueReview(a, at)).map((a) => a.id));
    expect(ids('activation')).toEqual(apps.filter((a) => isToChase(a, at)).map((a) => a.id));
    expect(ids('close')).toEqual(apps.filter((a) => isToClose(a, at)).map((a) => a.id));
    expect(ids('urgent').every((id) => openIncidents(jobs, at).some((j) => j.id === id))).toBe(true);
  });

  it('a funnel tile and the list it opens count the same people', () => {
    const apps = generateSeed(NOW);
    for (const t of computeFunnel(apps).tiles) expect(apps.filter((a) => reachedStage(a, t.key)).length, t.key).toBe(t.reached);
  });
});
