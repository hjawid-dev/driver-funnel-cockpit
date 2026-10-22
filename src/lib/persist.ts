import type { Applicant } from './types';
import { DOC_KEYS, REJECT_REASONS } from './types';
import { HOUR } from './time';

export const STORAGE_KEY = 'driver-funnel-cockpit-v1';
/** Bump when the data model changes. Saves from another version are discarded, not migrated. */
export const DATA_VERSION = 2;
/** If the saved demo is older than this, move every timestamp forward so clocks still look live. */
export const REBASE_AFTER_MS = 12 * HOUR;

export interface Saved {
  version: number;
  savedAt: number;
  apps: Applicant[];
}

const REASONS = new Set(REJECT_REASONS.map((r) => r.value));

/** True when an applicant has the shape this version of the app expects. */
export function isCurrentShape(a: unknown): a is Applicant {
  if (!a || typeof a !== 'object') return false;
  const x = a as Applicant;
  if (typeof x.id !== 'string' || typeof x.name !== 'string' || typeof x.registeredAt !== 'number') return false;
  if (!x.docs || !DOC_KEYS.every((k) => typeof x.docs[k] === 'string')) return false;
  if (!Array.isArray(x.nudges) || !Array.isArray(x.log)) return false;
  if (x.decision?.reason && !REASONS.has(x.decision.reason)) return false;
  return true;
}

/** Move every timestamp of an applicant by `delta` ms. */
export function shiftApplicant(a: Applicant, delta: number): Applicant {
  const s = (t: number | undefined) => (t === undefined ? undefined : t + delta);
  const docTimes = a.docTimes ? Object.fromEntries(Object.entries(a.docTimes).map(([k, t]) => [k, t! + delta])) : undefined;
  return {
    ...a,
    registeredAt: a.registeredAt + delta,
    ...(docTimes ? { docTimes } : {}),
    nudges: a.nudges.map((t) => t + delta),
    ...(a.docsCompleteAt !== undefined ? { docsCompleteAt: s(a.docsCompleteAt) } : {}),
    ...(a.decision ? { decision: { ...a.decision, at: a.decision.at + delta } } : {}),
    ...(a.welcomeCallAt !== undefined ? { welcomeCallAt: s(a.welcomeCallAt) } : {}),
    ...(a.firstGig
      ? {
          firstGig: {
            ...a.firstGig,
            ...(a.firstGig.bookedFor !== undefined ? { bookedFor: s(a.firstGig.bookedFor) } : {}),
            ...(a.firstGig.doneAt !== undefined ? { doneAt: s(a.firstGig.doneAt) } : {}),
          },
        }
      : {}),
    log: a.log.map((e) => ({ ...e, at: e.at + delta })),
  };
}

/** Parse saved state; returns null when missing or malformed. Old saves are moved forward in time. */
export function restore(raw: string | null, now: number): Applicant[] | null {
  if (!raw) return null;
  try {
    const saved = JSON.parse(raw) as Saved;
    if (saved?.version !== DATA_VERSION || !Array.isArray(saved.apps) || typeof saved.savedAt !== 'number') return null;
    if (!saved.apps.every(isCurrentShape)) return null;
    const gap = now - saved.savedAt;
    return gap > REBASE_AFTER_MS ? saved.apps.map((a) => shiftApplicant(a, gap)) : saved.apps;
  } catch {
    return null;
  }
}

export function serialize(apps: Applicant[], now: number): string {
  return JSON.stringify({ version: DATA_VERSION, savedAt: now, apps } satisfies Saved);
}
