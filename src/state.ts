import { useCallback, useEffect, useState } from 'react';
import type { Applicant } from './lib/types';
import { generateSeed } from './lib/seed';
import { restore, serialize, STORAGE_KEY } from './lib/persist';

export type TabKey = 'review' | 'missing' | 'awaiting' | 'all';

/** Current time, re-rendered every minute so SLA clocks tick live. */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

function load(): Applicant[] {
  const now = Date.now();
  try {
    const saved = restore(localStorage.getItem(STORAGE_KEY), now);
    if (saved) return saved;
  } catch {
    // Storage blocked (private mode, previews): fall back to fresh demo data.
  }
  return generateSeed(now);
}

/** Demo state, kept in this browser only. Seed is generated relative to now. */
export function useApplicants() {
  const [apps, setApps] = useState<Applicant[]>(load);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, serialize(apps, Date.now()));
    } catch {
      // Not critical: the demo still works without saving.
    }
  }, [apps]);

  const update = useCallback((next: Applicant) => {
    setApps((xs) => xs.map((a) => (a.id === next.id ? next : a)));
  }, []);

  /** Fresh demo data; returns it so callers can take a new baseline. */
  const reset = useCallback(() => {
    const fresh = generateSeed(Date.now());
    setApps(fresh);
    return fresh;
  }, []);

  return { apps, update, reset };
}
