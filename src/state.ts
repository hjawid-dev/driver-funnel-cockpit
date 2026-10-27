import { useCallback, useEffect, useRef, useState } from 'react';
import type { Applicant, Gig } from './lib/types';
import { generateSeed } from './lib/seed';
import { firstGigOffers } from './lib/gigs';
import { firstDriveResult, replacementJob, syncFirstDrive } from './lib/liveOps';
import { materializeAutomation } from './lib/automation';
import { completeFirstGig } from './lib/actions';
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
  const [paused, setPaused] = useState(false);
  // Saved with the data, so a reload after fast-forwarding keeps timestamps consistent.
  const [offset, setOffset] = useState(readOffset);
  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setReal(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs, paused]);
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
    const t = Date.now();
    const from = (paused ? real : t) + offset;
    setOffset(from + ms - t);
    setReal(t);
    return { from, to: from + ms };
  }, [offset, paused, real]);
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
  const pause = useCallback(() => { setReal(Date.now()); setPaused(true); }, []);
  const resume = useCallback(() => { const t = Date.now(); setOffset(o => o + real - t); setReal(t); setPaused(false); }, [real]);
  return { now, offset, advance, resetTime, setTo, pause, resume };
}

function fresh(now: number, asInCase = false): DemoData {
  const apps = generateSeed(now).map(a => materializeAutomation(a, now));
  const gigs = generateGigs(now);
  for (let i = 0; i < apps.length; i++) {
    const a = apps[i];
    if (a.firstGig?.bookedFor && !a.firstGig.doneAt) {
      const available = firstGigOffers(a, gigs, apps, now)[0];
      apps[i] = { ...a, firstGig: available ? { gigId: available.id, bookedFor: available.at, bookedAt: now - MIN } : undefined };
    }
  }
  return { apps, gigs, threads: seedThreads(apps, now, asInCase ? null : 9 * MIN), jobs: apps.reduce((jobs, a) => syncFirstDrive(jobs, a, gigs), seedJobs(apps, now, { asInCase })) };
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
    setData((d) => {
      const prev = d.apps.find(a => a.id === next.id);
      const at = next.log.at(-1)?.at ?? next.registeredAt;
      const before = prev ? materializeAutomation(prev, at) : next;
      next = materializeAutomation({ ...next, automationHistory: before.automationHistory, automationRecordedUntil: before.automationRecordedUntil }, at, true);
      if (next.firstGig?.gigId && next.firstGig.gigId !== prev?.firstGig?.gigId && d.apps.some(a => a.id !== next.id && a.firstGig?.gigId === next.firstGig?.gigId)) return d;
      return { ...d, apps: d.apps.map(a => a.id === next.id ? next : a), jobs: syncFirstDrive(d.jobs, next, d.gigs) };
    });
  }, []);

  const add = useCallback((a: Applicant) => {
    setData((d) => ({ ...d, apps: [...d.apps, a] }));
  }, []);

  const recordThrough = useCallback((now: number) => {
    setData(d => d.apps.every(a => a.automationRecordedUntil === now) ? d : { ...d, apps: d.apps.map(a => materializeAutomation(a, now)) });
  }, []);

  /** Add or replace a chat thread. */
  const upsertThread = useCallback((t: ChatThread) => {
    setData((d) => ({ ...d, threads: d.threads.some((x) => x.id === t.id) ? d.threads.map((x) => (x.id === t.id ? t : x)) : [...d.threads, t] }));
  }, []);

  const updateJob = useCallback((next: Job) => {
    setData((d) => {
      let apps = d.apps;
      const driver = next.firstDrive ? apps.find(a => a.id === next.driverId) : undefined;
      if (driver && next.deliveredAt && !driver.firstGig?.doneAt) {
        const result = completeFirstGig(driver, { ...firstDriveResult(next), delivery: { jobId: next.id, at: next.deliveredAt } }, next.deliveredAt);
        if (!result.ok) return d;
        apps = apps.map(a => a.id === driver.id ? result.applicant : a);
      } else if (driver?.firstGig?.doneAt && next.deliveredAt && next.customerSatisfied !== undefined) {
        apps = apps.map(a => a.id === driver.id ? { ...a, firstGig: { ...a.firstGig, customerSatisfied: next.customerSatisfied } } : a);
      }
      let jobs = d.jobs.map(j => j.id === next.id ? next : j);
      const replacement = replacementJob(next);
      if (replacement?.firstDrive && driver && !driver.firstGig?.doneAt && driver.firstGig?.gigId === next.id) {
        apps = apps.map(a => a.id !== driver.id ? a : { ...a, firstGig: { ...a.firstGig, gigId: replacement.id, bookedFor: replacement.pickupAt, bookedAt: next.incident!.rebooking!.bookedAt }, events: [...(a.events ?? []), { kind: 'booked', at: next.incident!.rebooking!.bookedAt!, by: 'Hjalmar', reason: replacement.id }] });
      }
      if (replacement && !jobs.some(j => j.id === replacement.id)) jobs = [...jobs, replacement];
      return { ...d, apps, jobs, gigs: next.incident?.outcome && next.incident.outcome.type !== 'keys_found' ? d.gigs.filter(g => g.id !== next.id) : d.gigs };
    });
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

  const replaceDemo = useCallback((next: DemoData) => setData(next), []);

  return { replaceDemo, apps: data.apps, gigs: data.gigs as Gig[], threads: data.threads, jobs: data.jobs, update, add, upsertThread, updateJob, updateJobs, reset, recordThrough };
}
