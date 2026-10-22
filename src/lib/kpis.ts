import type { Applicant, RejectReason } from './types';
import { REJECT_REASONS } from './types';
import { deriveStage, isAccepted } from './stage';
import { DAY, HOUR } from './time';

export type KpiStatus = 'on' | 'risk' | 'off' | 'info';

export interface Kpi {
  key: 'docCompletion' | 'timeToDecision' | 'acceptance' | 'activation' | 'appToActive' | 'quality';
  label: string;
  value: number | null; // % or hours
  display: string; // "72%" / "81 h"
  sub?: string; // secondary line, e.g. "27% within 48 h"
  target: string; // "Target 85% · today 70%"
  caption: string; // cohort rule + n
  status: KpiStatus;
  northStar?: boolean;
}

/** Cohort windows: a rate only counts people who have had time to reach the next step. */
export const DOC_COHORT_MS = 7 * DAY;
export const ACTIVATION_COHORT_MS = 14 * DAY;
export const NORTH_STAR_WINDOW_MS = 30 * DAY;

/** Reached "documents submitted" at some point. Closing as no-response means they never did. */
export function reachedDocs(a: Applicant): boolean {
  if (a.docsCompleteAt) return true;
  return !!a.decision && a.decision.reason !== 'no_response_14d';
}

/** Decided after review (excludes files closed as no-response, which never reached review). */
export function isReviewDecision(a: Applicant): boolean {
  return !!a.decision && a.decision.reason !== 'no_response_14d' && !!a.docsCompleteAt;
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const pct = (num: number, den: number) => (den ? (num / den) * 100 : null);
const fmtPct = (v: number | null) => (v === null ? '–' : `${Math.round(v)}%`);

function band(v: number | null, on: number, risk: number, higherIsBetter = true): KpiStatus {
  if (v === null) return 'info';
  if (higherIsBetter) return v >= on ? 'on' : v >= risk ? 'risk' : 'off';
  return v <= on ? 'on' : v <= risk ? 'risk' : 'off';
}

export function computeKpis(apps: Applicant[], now: number): Kpi[] {
  // 1. Document completion: registered ≥ 7 d ago → reached documents submitted
  const docCohort = apps.filter((a) => now - a.registeredAt >= DOC_COHORT_MS);
  const docDone = docCohort.filter(reachedDocs).length;
  const docRate = pct(docDone, docCohort.length);

  // 2. Time to decision: complete file → decision
  const decided = apps.filter(isReviewDecision);
  const hours = decided.map((a) => (a.decision!.at - a.docsCompleteAt!) / HOUR);
  const med = median(hours);
  const within48 = pct(hours.filter((h) => h <= 48).length, hours.length);
  const queue = apps.filter((a) => deriveStage(a) === 'review');
  const oldest = queue.length ? Math.max(...queue.map((a) => now - a.docsCompleteAt!)) / HOUR : null;

  // 3. Acceptance rate + top reject reasons
  const accepted = decided.filter(isAccepted).length;
  const accRate = pct(accepted, decided.length);
  const reasons = topRejectReasons(apps);

  // 4. Activation: accepted ≥ 14 d ago → first gig within 14 d of acceptance
  const actCohort = apps.filter((a) => isAccepted(a) && now - a.decision!.at >= ACTIVATION_COHORT_MS);
  const activated = actCohort.filter((a) => a.firstGig?.doneAt && a.firstGig.doneAt - a.decision!.at <= ACTIVATION_COHORT_MS).length;
  const actRate = pct(activated, actCohort.length);

  // 5. North star: new active drivers ÷ new applications, last 30 days (a monthly flow, not a cohort)
  const from = now - NORTH_STAR_WINDOW_MS;
  const newApps = apps.filter((a) => a.registeredAt >= from).length;
  const newActive = apps.filter((a) => a.firstGig?.doneAt && a.firstGig.doneAt >= from).length;
  const northStar = pct(newActive, newApps);

  // 6. First-gig quality: on time and no incident / customer happy
  const done = apps.filter((a) => a.firstGig?.doneAt);
  const good = done.filter((a) => a.firstGig!.onTime && a.firstGig!.ok).length;
  const quality = pct(good, done.length);

  return [
    {
      key: 'docCompletion',
      label: 'Document completion',
      value: docRate,
      display: fmtPct(docRate),
      target: 'Target 85% · baseline 70%',
      caption: `Registered ≥ 7 d ago · ${docDone} of ${docCohort.length}`,
      status: band(docRate, 85, 75),
    },
    {
      key: 'timeToDecision',
      label: 'Time to decision',
      value: med,
      display: med === null ? '–' : `${Math.round(med)} h`,
      sub: `median · ${fmtPct(within48)} within 48 h`,
      target: 'Target < 48 h · baseline ~6 days',
      caption: `${decided.length} decisions${oldest !== null ? ` · oldest in queue ${Math.floor(oldest)} h` : ''}`,
      status: band(med, 48, 72, false),
    },
    {
      key: 'acceptance',
      label: 'Acceptance rate',
      value: accRate,
      display: fmtPct(accRate),
      sub: reasons.length ? `Top rejects: ${reasons.slice(0, 2).map((r) => `${r.short} ×${r.count}`).join(', ')}` : 'No rejects yet',
      target: 'Shows if pre-qualifying works',
      caption: `${accepted} of ${decided.length} reviewed files`,
      status: 'info',
    },
    {
      key: 'activation',
      label: 'Activation rate',
      value: actRate,
      display: fmtPct(actRate),
      sub: 'first gig within 14 d',
      target: 'Target 75%',
      caption: `Accepted ≥ 14 d ago · ${activated} of ${actCohort.length}`,
      status: band(actRate, 75, 60),
    },
    {
      key: 'appToActive',
      label: 'Application → active',
      value: northStar,
      display: fmtPct(northStar),
      sub: 'North star: same intake, more drivers',
      target: 'Target ~35% · baseline 21%',
      caption: `Last 30 d · ${newActive} new active ÷ ${newApps} applications`,
      status: band(northStar, 35, 25),
      northStar: true,
    },
    {
      key: 'quality',
      label: 'First-gig quality',
      value: quality,
      display: fmtPct(quality),
      sub: 'on time, no incident',
      target: 'Guardrail ≥ 95%',
      caption: `${good} of ${done.length} first gigs`,
      status: band(quality, 95, 90),
    },
  ];
}

const SHORT_REASON: Record<RejectReason, string> = {
  background_failed: 'Background',
  licence_too_new: 'Licence',
  id_unverified: 'ID',
  no_response_14d: 'No response',
  other: 'Other',
};

export function topRejectReasons(apps: Applicant[]) {
  const counts = new Map<RejectReason, number>();
  for (const a of apps) {
    if (a.decision?.type === 'rejected' && a.decision.reason) {
      counts.set(a.decision.reason, (counts.get(a.decision.reason) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([reason, count]) => ({
      reason,
      count,
      short: SHORT_REASON[reason],
      label: REJECT_REASONS.find((r) => r.value === reason)!.label,
    }))
    .sort((a, b) => b.count - a.count);
}

// ---------- Funnel scoreboard ----------

export type FunnelKey = 'registered' | 'docs' | 'review' | 'accepted' | 'active';

export interface FunnelTile {
  key: FunnelKey;
  label: string;
  reached: number; // cumulative: everyone who ever got this far
  now: number; // currently sitting in this stage
}

export interface FunnelEdge {
  from: FunnelKey;
  to: FunnelKey;
  rate: number | null; // %
  biggestDrop: boolean;
  autoQueued?: boolean;
}

export interface Funnel {
  tiles: FunnelTile[];
  edges: FunnelEdge[];
  rejected: number;
}

export function computeFunnel(apps: Applicant[]): Funnel {
  const stages = apps.map(deriveStage);
  const count = (s: string) => stages.filter((x) => x === s).length;
  const docs = apps.filter(reachedDocs).length;

  const tiles: FunnelTile[] = [
    { key: 'registered', label: 'Registered', reached: apps.length, now: count('registered') },
    { key: 'docs', label: 'Docs submitted', reached: docs, now: count('review') },
    { key: 'review', label: 'Under review', reached: docs, now: count('review') },
    { key: 'accepted', label: 'Accepted', reached: apps.filter(isAccepted).length, now: count('accepted') },
    { key: 'active', label: 'Active', reached: count('active'), now: count('active') },
  ];

  const edges: FunnelEdge[] = tiles.slice(1).map((t, i) => ({
    from: tiles[i].key,
    to: t.key,
    rate: pct(t.reached, tiles[i].reached),
    biggestDrop: false,
    ...(t.key === 'review' ? { autoQueued: true } : {}),
  }));

  // Biggest drop-off: the edge that loses the most people (complete files are auto-queued, so skip that edge).
  let worst: FunnelEdge | null = null;
  let worstLost = 0;
  edges.forEach((e, i) => {
    if (e.autoQueued) return;
    const lost = tiles[i].reached - tiles[i + 1].reached;
    if (lost > worstLost) {
      worstLost = lost;
      worst = e;
    }
  });
  if (worst) (worst as FunnelEdge).biggestDrop = true;

  return { tiles, edges, rejected: count('rejected') };
}
