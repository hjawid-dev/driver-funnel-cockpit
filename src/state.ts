import { useCallback, useEffect, useRef, useState } from 'react';
import type { Applicant, Gig } from './lib/types';
import { generateSeed } from './lib/seed';
import { generateGigs } from './lib/gigs';
import { restore, serialize, STORAGE_KEY, type DemoData } from './lib/persist';
import { seedThreads } from './lib/chat/threads';
import type { ChatThread } from './lib/chat/types';
import { seedJobs, type Job } from './lib/liveOps';
import { MIN } from './lib/time';

export type TabKey = 'live' | 'review' | 'missing' | 'awaiting' | 'chat' | 'all';

const OFFSET_KEY = 'driver-funnel-cockpit-offset';

function readOffset(): number {
  try {
    // Negative when "Play the case" went back to Tuesday 09:30.
    const v = Number(localStorage.getItem(OFFSET_KEY));
    return Number.isFinite(v) ? v : 0;
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
  /** Jump to a moment (the Part 1 case). Only on a fresh demo, so no automation window is skipped. */
  const setTo = useCallback((ts: number) => {
    const t = Date.now();
    setOffset(ts - t);
    setReal(t);
  }, []);
  return { now, offset, advance, resetTime, setTo };
}

function fresh(now: number, asInCase = false): DemoData {
  const apps = generateSeed(now);
  const gigs = generateGigs(now);
  return { apps, gigs, threads: seedThreads(apps, now, asInCase ? null : 9 * MIN), jobs: seedJobs(apps, now, { asInCase }) };
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

  const updateJob = useCallback((next: Job) => {
    setData((d) => ({ ...d, jobs: d.jobs.map((j) => (j.id === next.id ? next : j)) }));
  }, []);

  /** Change the job list as a whole (e.g. a first drive was booked). */
  const updateJobs = useCallback((f: (jobs: Job[]) => Job[]) => {
    setData((d) => ({ ...d, jobs: f(d.jobs) }));
  }, []);

  /** Fresh demo data; returns the applicants so callers can take a new baseline. */
  const reset = useCallback((at = Date.now(), asInCase = false): Applicant[] => {
    const next = fresh(at, asInCase);
    setData(next);
    return next.apps;
  }, []);

  return { apps: data.apps, gigs: data.gigs as Gig[], threads: data.threads, jobs: data.jobs, update, add, upsertThread, updateJob, updateJobs, reset };
}
