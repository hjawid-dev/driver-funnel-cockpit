import { useCallback, useEffect, useRef, useState } from 'react';
import type { Applicant, Gig } from './lib/types';
import { generateSeed } from './lib/seed';
import { generateGigs } from './lib/gigs';
import { restore, serialize, STORAGE_KEY, type DemoData } from './lib/persist';
import { seedThreads } from './lib/chat/threads';
import type { ChatThread } from './lib/chat/types';

export type TabKey = 'review' | 'missing' | 'awaiting' | 'chat' | 'all';

const OFFSET_KEY = 'driver-funnel-cockpit-offset';

function readOffset(): number {
  try {
    const v = Number(localStorage.getItem(OFFSET_KEY));
    return Number.isFinite(v) && v > 0 ? v : 0;
  } catch {
    return 0;
  }
}

/**
 * Demo clock: real time plus a simulated offset, so "+1 day" shows what automation does.
 * Re-renders every 30 s so SLA clocks tick live.
 */
export function useClock(intervalMs = 30_000) {
  const [real, setReal] = useState(() => Date.now());
  // Saved with the data, so a reload after fast-forwarding keeps timestamps consistent.
  const [offset, setOffset] = useState(readOffset);
  useEffect(() => {
    const t = setInterval(() => setReal(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  useEffect(() => {
    try {
      localStorage.setItem(OFFSET_KEY, String(offset));
    } catch {
      // Not critical.
    }
  }, [offset]);
  const now = real + offset;
  /** Move simulated time forward; returns the window that passed. */
  const advance = useCallback((ms: number) => {
    const from = Date.now() + offset;
    setOffset((o) => o + ms);
    setReal(Date.now());
    return { from, to: from + ms };
  }, [offset]);
  const resetTime = useCallback(() => {
    setOffset(0);
    setReal(Date.now());
  }, []);
  return { now, offset, advance, resetTime };
}

function fresh(now: number): DemoData {
  const apps = generateSeed(now);
  return { apps, gigs: generateGigs(now), threads: seedThreads(apps, now) };
}

function load(): DemoData {
  const now = Date.now();
  try {
    const saved = restore(localStorage.getItem(STORAGE_KEY), now);
    if (saved) return saved;
  } catch {
    // Storage blocked (private mode, previews): fall back to fresh demo data.
  }
  return fresh(now);
}

/** Demo state, kept in this browser only. Seed is generated relative to now. */
export function useDemoData() {
  const [data, setData] = useState<DemoData>(load);
  const skipSave = useRef(false);

  useEffect(() => {
    if (skipSave.current) {
      skipSave.current = false;
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, serialize(data, Date.now()));
    } catch {
      // Not critical: the demo still works without saving.
    }
  }, [data]);

  // Another tab (e.g. the driver view opened on its own) changed the data: follow it live.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      const next = restore(e.newValue, Date.now());
      if (next) {
        skipSave.current = true;
        setData(next);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const update = useCallback((next: Applicant) => {
    setData((d) => ({ ...d, apps: d.apps.map((a) => (a.id === next.id ? next : a)) }));
  }, []);

  const add = useCallback((a: Applicant) => {
    setData((d) => ({ ...d, apps: [...d.apps, a] }));
  }, []);

  /** Add or replace a chat thread. */
  const upsertThread = useCallback((t: ChatThread) => {
    setData((d) => ({ ...d, threads: d.threads.some((x) => x.id === t.id) ? d.threads.map((x) => (x.id === t.id ? t : x)) : [...d.threads, t] }));
  }, []);

  /** Fresh demo data; returns the applicants so callers can take a new baseline. */
  const reset = useCallback((): Applicant[] => {
    const next = fresh(Date.now());
    setData(next);
    return next.apps;
  }, []);

  return { apps: data.apps, gigs: data.gigs as Gig[], threads: data.threads, update, add, upsertThread, reset };
}
