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
  sub?: string; // short secondary line, e.g. "ops part 31 h"
  target: string; // "Target 85%"
  caption: string; // cohort rule + n
  info: string[]; // what the number means and how it is counted, shown behind a "?"
  status: KpiStatus;
  northStar?: boolean;
}

/** Cohort windows: a rate only counts people who have had time to reach the next step. */
export const DOC_COHORT_MS = 7 * DAY;
export const ACTIVATION_COHORT_MS = 14 * DAY;
export const NORTH_STAR_WINDOW_MS = 30 * DAY;

/** Reached "documents submitted" at some point. Closing as no-response means they never did. */
export function reachedDocs(a: Applicant): boolean {
  if (deriveStage(a) === 'closed') return false;
  return !!a.docsCompleteAt || !!a.decision;
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
/** Hours up to three days, then days: "31 h", "6.0 days". */
const fmtHours = (h: number | null) => (h === null ? '–' : h < 72 ? `${Math.round(h)} h` : `${(h / 24).toFixed(1)} days`);

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

  // 2. Time to decision: registration → decision, as the brief measures it (6 days today, target 48 h).
  //    The ops part, complete file → decision, is shown next to it: that is what the review queue's SLA controls.
  const decided = apps.filter(isReviewDecision);
  const hours = decided.map((a) => (a.decision!.at - a.registeredAt) / HOUR);
  const med = median(hours);
  const within48 = pct(hours.filter((h) => h <= 48).length, hours.length);
  const opsHours = decided.map((a) => (a.decision!.at - a.docsCompleteAt!) / HOUR);
  const opsMed = median(opsHours);
  const opsWithin48 = pct(opsHours.filter((h) => h <= 48).length, opsHours.length);
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
      target: 'Target 85%',
      caption: `${docDone} of ${docCohort.length} who registered 7+ days ago`,
      info: [
        'Share of applicants who sent in all documents, counting those who registered at least 7 days ago (they have had time to finish).',
        `${docDone} of ${docCohort.length} · baseline 70%`,
      ],
      status: band(docRate, 85, 75),
    },
    {
      key: 'timeToDecision',
      label: 'Median time to decision',
      value: med,
      display: fmtHours(med),
      sub: opsMed === null ? undefined : `ops part ${Math.round(opsMed)} h`,
      target: 'Target < 48 h',
      caption: `${decided.length} decisions${oldest !== null ? ` · oldest in queue ${Math.floor(oldest)} h` : ''}`,
      info: [
        `Median time from registration to decision. Decided within 48 h: ${fmtPct(within48)}. The case gives an average (mean) of about 6 days; the median is shown because a few very slow files pull a mean up.`,
        `Ops part, from complete file to decision: median ${opsMed === null ? '–' : Math.round(opsMed)} h, ${fmtPct(opsWithin48)} within 48 h. The rest is the applicant getting documents in, which is why the extract is ordered first.`,
        `${decided.length} decisions${oldest !== null ? ` · oldest in queue ${Math.floor(oldest)} h` : ''}`,
      ],
      status: band(med, 48, 72, false),
    },
    {
      key: 'acceptance',
      label: 'Acceptance rate',
      value: accRate,
      display: fmtPct(accRate),
      sub: reasons.length ? `top reject: ${reasons[0].short} ×${reasons[0].count}` : 'no rejects yet',
      target: '',
      caption: `${accepted} of ${decided.length} reviewed files`,
      info: [
        'Share of reviewed files that were accepted. It shows whether the questions before applying filter well: a low rate means people apply who were never going to qualify.',
        `${accepted} of ${decided.length} reviewed files.${reasons.length ? ` Reject reasons: ${reasons.map((r) => `${r.short} ×${r.count}`).join(', ')}.` : ''}`,
      ],
      status: 'info',
    },
    {
      key: 'activation',
      label: 'Activation rate',
      value: actRate,
      display: fmtPct(actRate),
      sub: 'first gig within 14 days',
      target: 'Target 75%',
      caption: `${activated} of ${actCohort.length} accepted 14+ days ago`,
      info: [
        'Share of accepted drivers who completed a first gig within 14 days, counting those accepted at least 14 days ago. After 7 days without a booking, ops follows up.',
        `${activated} of ${actCohort.length}`,
      ],
      status: band(actRate, 75, 60),
    },
    {
      key: 'appToActive',
      label: 'New active ÷ applications',
      value: northStar,
      display: fmtPct(northStar),
      sub: 'North star · a 30-day flow',
      target: 'Target 35%',
      caption: `Last 30 days · ${newActive} new active ÷ ${newApps} applications (a flow, not a cohort)`,
      info: [
        'A flow, like the case\'s "25 of 120 a month": drivers who completed a first gig in the last 30 days, divided by applications in the same 30 days. They are not the same people, so it is throughput, not conversion.',
        'With 60+ days of history, add the cohort version: of those who applied in a month, how many became active within 30 days.',
        `${newActive} new active ÷ ${newApps} applications · case baseline 21%`,
      ],
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
      info: ['Share of first gigs on time, with no incident and a satisfied customer. The guardrail: going faster must not lower the bar.', `${good} of ${done.length} first gigs`],
      status: band(quality, 95, 90),
    },
  ];
}

const SHORT_REASON: Record<RejectReason, string> = {
  requirements_not_met: 'Requirements',
  no_valid_licence: 'Licence',
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
      short: SHORT_REASON[reason] ?? 'Other',
      label: REJECT_REASONS.find((r) => r.value === reason)?.label ?? reason,
    }))
    .sort((a, b) => b.count - a.count);
}

// ---------- Funnel scoreboard ----------

export type FunnelKey = 'registered' | 'docs' | 'reviewed' | 'accepted' | 'active';

/** A work list a part of a tile opens: four lists, or All filtered on a stage. */
export type FunnelLink = 'missing' | 'review' | 'awaiting' | 'rejected' | 'closed';

/** One piece of a tile: who stopped here (with the list they are in), or who moved on to the next tile. */
export interface FunnelPart {
  label: string;
  count: number;
  to?: FunnelLink;
  movedOn?: boolean;
}

export interface FunnelTile {
  key: FunnelKey;
  label: string;
  reached: number; // cumulative: everyone who ever got this far
  /** Always adds up to `reached`: the tile shows its own arithmetic. */
  parts: FunnelPart[];
}

export interface FunnelEdge {
  from: FunnelKey;
  to: FunnelKey;
  rate: number | null; // %
  biggestDrop: boolean;
  /** People between these tiles are waiting in a queue, not lost. */
  pending?: boolean;
}

export interface Funnel {
  tiles: FunnelTile[];
  edges: FunnelEdge[];
}

/** Got this far at some point. A tile's number and the list it opens both use this, so they always match. */
export function reachedStage(a: Applicant, key: FunnelKey): boolean {
  if (key === 'registered') return true;
  if (key === 'docs') return reachedDocs(a);
  if (key === 'reviewed') return reachedDocs(a) && !!a.decision;
  if (key === 'accepted') return isAccepted(a);
  return deriveStage(a) === 'active';
}

/**
 * Five tiles, each split into who stopped there and who moved on, so every number adds up:
 * registered = missing documents + closed + submitted, submitted = in review + reviewed,
 * reviewed = rejected + accepted, accepted = awaiting first gig + active.
 */
export function computeFunnel(apps: Applicant[]): Funnel {
  const stages = apps.map(deriveStage);
  const now = (s: string) => stages.filter((x) => x === s).length;
  const reached = (key: FunnelKey) => apps.filter((a) => reachedStage(a, key)).length;

  const tiles: FunnelTile[] = [
    {
      key: 'registered',
      label: 'Registered',
      reached: reached('registered'),
      parts: [
        { label: 'missing documents', count: now('registered'), to: 'missing' },
        { label: 'closed, not finished', count: now('closed'), to: 'closed' },
        { label: 'submitted', count: reached('docs'), movedOn: true },
      ],
    },
    {
      key: 'docs',
      label: 'Docs submitted',
      reached: reached('docs'),
      parts: [
        { label: 'in review', count: now('review'), to: 'review' },
        { label: 'reviewed', count: reached('reviewed'), movedOn: true },
      ],
    },
    {
      key: 'reviewed',
      label: 'Reviewed',
      reached: reached('reviewed'),
      parts: [
        { label: 'rejected', count: now('rejected'), to: 'rejected' },
        { label: 'accepted', count: reached('accepted'), movedOn: true },
      ],
    },
    {
      key: 'accepted',
      label: 'Accepted',
      reached: reached('accepted'),
      parts: [
        { label: 'awaiting first gig', count: now('accepted'), to: 'awaiting' },
        { label: 'active', count: reached('active'), movedOn: true },
      ],
    },
    { key: 'active', label: 'Active', reached: reached('active'), parts: [] },
  ];

  const edges: FunnelEdge[] = tiles.slice(1).map((t, i) => ({
    from: tiles[i].key,
    to: t.key,
    rate: pct(t.reached, tiles[i].reached),
    biggestDrop: false,
    ...(t.key === 'reviewed' ? { pending: true } : {}),
  }));

  // Biggest drop-off: the edge that loses the most people (files waiting in the review queue are not lost).
  let worst: FunnelEdge | null = null;
  let worstLost = 0;
  edges.forEach((e, i) => {
    if (e.pending) return;
    const lost = tiles[i].reached - tiles[i + 1].reached;
    if (lost > worstLost) {
      worstLost = lost;
      worst = e;
    }
  });
  if (worst) (worst as FunnelEdge).biggestDrop = true;

  return { tiles, edges };
}

// ---------- Change since the page was opened ----------

/** true = up is good, false = down is good, null = neither (diagnostic). */
export const HIGHER_IS_BETTER: Record<Kpi['key'], boolean | null> = {
  docCompletion: true,
  timeToDecision: false,
  acceptance: null,
  activation: true,
  appToActive: true,
  quality: true,
};

export interface KpiDelta {
  text: string; // "▼ 6 h" / "▲ 3 pp"
  good: boolean | null;
}

/** Change of one KPI against a baseline. Null when there is no visible change. */
export function kpiDelta(base: Kpi | undefined, cur: Kpi): KpiDelta | null {
  if (!base || base.value === null || cur.value === null) return null;
  const diff = Math.round(cur.value - base.value);
  if (diff === 0) return null;
  const unit = cur.key === 'timeToDecision' ? 'h' : 'pp';
  const pref = HIGHER_IS_BETTER[cur.key];
  return {
    text: `${diff > 0 ? '▲' : '▼'} ${Math.abs(diff)} ${unit}`,
    good: pref === null ? null : diff > 0 === pref,
  };
}
