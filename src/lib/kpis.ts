import type { Applicant, RejectReason } from './types';
import { REJECT_REASONS } from './types';
import { deriveStage, isAccepted } from './stage';
import { firstAcceptance, firstDecision, firstSubmissionAt } from './eligibility';
import { DAY, HOUR } from './time';

export type KpiStatus = 'on' | 'risk' | 'off' | 'info';

export interface Kpi {
  key: 'docCompletion' | 'timeToDecision' | 'acceptance' | 'activation' | 'appToActive' | 'quality' | 'cohortConversion';
  label: string;
  value: number | null; // % or hours
  display: string; // "72%" / "81 h"
  sub?: string; // short secondary line, e.g. "ops part 31 h"
  detail?: string; // a line shown on the card itself
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
  return firstSubmissionAt(a) !== undefined;
}

/** Decided after review (excludes files closed as no-response, which never reached review). */
export function isReviewDecision(a: Applicant): boolean {
  return !!firstDecision(a) && firstDecision(a)!.reason !== 'no_response_14d' && firstSubmissionAt(a) !== undefined;
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
  const docDone = docCohort.filter(a => { const at = firstSubmissionAt(a); return at !== undefined && at >= a.registeredAt && at <= a.registeredAt + DOC_COHORT_MS && at <= now; }).length;
  const docRate = pct(docDone, docCohort.length);

  // 2. Time to decision: registration → decision, as the brief measures it (6 days today, target 48 h).
  //    The ops part, complete file → decision, is shown next to it: total and internal clocks are kept separate.
  const reviewed = apps.filter(a => isReviewDecision(a) && firstDecision(a)!.at >= a.registeredAt && firstDecision(a)!.at <= now);
  const decided = apps.filter(a => firstDecision(a) && firstDecision(a)!.reason !== 'no_response_14d' && firstDecision(a)!.at >= a.registeredAt && firstDecision(a)!.at <= now);
  const hours = decided.map((a) => (firstDecision(a)!.at - a.registeredAt) / HOUR);
  const med = median(hours);
  const within48 = pct(hours.filter((h) => h <= 48).length, hours.length);
  const mean = hours.length ? hours.reduce((n,h) => n+h, 0) / hours.length : null;
  const opsHours = reviewed.map((a) => (firstDecision(a)!.at - firstSubmissionAt(a)!) / HOUR);
  const opsMed = median(opsHours);
  const opsWithin48 = pct(opsHours.filter((h) => h <= 48).length, opsHours.length);
  const queue = apps.filter((a) => deriveStage(a) === 'review');
  const oldest = queue.length ? Math.max(...queue.map((a) => now - a.docsCompleteAt!)) / HOUR : null;

  // 3. Acceptance rate + top reject reasons
  const accepted = reviewed.filter(a => firstDecision(a)!.type !== 'rejected').length;
  const accRate = pct(accepted, reviewed.length);
  const reasons = topRejectReasons(apps);

  // 4. Activation: accepted ≥ 14 d ago → first gig within 14 d of acceptance
  const actCohort = apps.filter((a) => firstAcceptance(a) && now - firstAcceptance(a)!.at >= ACTIVATION_COHORT_MS);
  const activated = actCohort.filter((a) => a.firstGig?.doneAt && a.firstGig.doneAt >= firstAcceptance(a)!.at && a.firstGig.doneAt <= now && a.firstGig.doneAt - firstAcceptance(a)!.at <= ACTIVATION_COHORT_MS).length;
  const actRate = pct(activated, actCohort.length);

  // 5. North star: new active drivers ÷ new applications, last 30 days (a monthly flow, not a cohort)
  const from = now - NORTH_STAR_WINDOW_MS;
  const newApps = apps.filter((a) => a.registeredAt >= from && a.registeredAt <= now).length;
  const newActive = apps.filter((a) => a.firstGig?.doneAt && a.firstGig.doneAt >= from && a.firstGig.doneAt <= now && isAccepted(a) && a.firstGig.doneAt >= a.decision!.at).length;
  const northStar = pct(newActive, newApps);
  const mature = apps.filter(a => a.registeredAt <= now - 30 * DAY);
  const converted = mature.filter(a => a.firstGig?.doneAt !== undefined && a.firstGig.doneAt >= a.registeredAt && a.firstGig.doneAt <= a.registeredAt + 30 * DAY && a.firstGig.doneAt <= now).length;
  const conversion = pct(converted, mature.length);

  // 6. First-gig quality: on time and no incident / customer happy
  const done = apps.filter((a) => a.firstGig?.doneAt && a.firstGig.doneAt <= now && isAccepted(a) && a.firstGig.doneAt >= a.decision!.at);
  const assessed = done.filter(a => a.firstGig!.customerSatisfied !== undefined);
  const good = assessed.filter((a) => a.firstGig!.onTime && a.firstGig!.ok && a.firstGig!.customerSatisfied === true).length;
  const quality = pct(good, assessed.length);

  return [
    {
      key: 'cohortConversion', label: 'Cohort: active within 30 days', value: conversion, display: fmtPct(conversion),
      target: 'Diagnostic · no target', caption: `${converted} of ${mature.length} registrations with 30+ days of follow-up`,
      info: ['Share of applicants completing a first drive within 30 days of registration. Only registrations with at least 30 days of follow-up count; all mature history.', 'Supporting cohort diagnostic, with no assigned target. The 35% target belongs to the separate monthly New active ÷ applications measure.'],
      status: 'info',
    },
    {
      key: 'docCompletion',
      label: 'Document completion',
      value: docRate,
      display: fmtPct(docRate),
      target: 'Target 85%',
      caption: `${docDone} of ${docCohort.length} registered 7+ days ago; completed within 7 days`,
      info: [
        'Share completing documents within 7 calendar days, among everyone registered at least 7 days ago. All available registration history; first submission is preserved.',
        `${docDone} of ${docCohort.length}. Case baseline 70% has no stated completion window; it is not a measured seven-day baseline.`,
      ],
      status: band(docRate, 85, 75),
    },
    {
      key: 'timeToDecision',
      label: 'Mean time to decision',
      value: mean,
      display: fmtHours(mean),
      sub: `Median ${fmtHours(med)} · ${fmtPct(within48)} within 48 h · ops median ${fmtHours(opsMed)}`,
      // Shown on the card: the share that met 48 h, and the part Ops controls (complete file → decision).
      detail: `${fmtPct(within48)} within 48 h · Ops part ${fmtHours(opsMed)} median`,
      target: 'Target < 48 h',
      caption: `${decided.length} decisions${oldest !== null ? ` · oldest in queue ${Math.floor(oldest)} h` : ''}`,
      info: [
        `Mean time from registration to first human decision (case-comparable). Decided within 48 h: ${fmtPct(within48)}. The case gives an average (mean) of about 6 days; the median is available as supporting context. Open overdue cases must also be reviewed, as undecided files are not yet in this duration.`,
        `Ops part, from complete file to decision: median ${opsMed === null ? '–' : Math.round(opsMed)} h, ${fmtPct(opsWithin48)} within 48 h. The rest is the applicant getting documents in, which is why the extract is ordered first.`,
        `${decided.length} decisions${oldest !== null ? ` · oldest in queue ${Math.floor(oldest)} h` : ''}`,
      ],
      status: band(mean, 48, 72, false),
    },
    {
      key: 'acceptance',
      label: 'Acceptance rate',
      value: accRate,
      display: fmtPct(accRate),
      sub: reasons.length ? `top reject: ${reasons[0].short} ×${reasons[0].count}` : 'no rejects yet',
      target: '',
      caption: `${accepted} of ${reviewed.length} reviewed files`,
      info: [
        'Share of reviewed files that were accepted. It shows whether the questions before applying filter well: a low rate means people apply who were never going to qualify.',
        `${accepted} of ${reviewed.length} reviewed files.${reasons.length ? ` Reject reasons: ${reasons.map((r) => `${r.short} ×${r.count}`).join(', ')}.` : ''}`,
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
        'Share completing a first drive within 14 days among initial acceptances with 14+ days of follow-up. No booking: reminder at day 7, Ops contact at day 14. A passed booking without delivery still needs follow-up.',
        `${activated} of ${actCohort.length}`,
      ],
      status: band(actRate, 75, 60),
    },
    {
      key: 'appToActive',
      label: 'Application-to-active',
      value: northStar,
      display: fmtPct(northStar),
      sub: 'North star · new active ÷ applications, a 30-day flow',
      target: 'Target 35%',
      caption: `Last 30 days · ${newActive} new active ÷ ${newApps} applications (a flow, not a cohort)`,
      info: [
        'A flow, like the case\'s "25 of 120 a month": drivers who completed a first gig in the last 30 days, divided by applications in the same 30 days. They are not the same people, so it is throughput, not conversion.',
        '"Cohort: active within 30 days" is the separate cohort measure. A flow ratio can rise when registrations fall, and can exceed 100% while clearing older applications.',
        `${newActive} new active ÷ ${newApps} applications · case baseline 21%`,
      ],
      status: band(northStar, 35, 25), northStar: true,
    },
    {
      key: 'quality',
      label: 'First-drive delivery outcome',
      value: quality,
      display: fmtPct(quality),
      sub: 'on time, no incident',
      target: 'Guardrail ≥ 95%',
      caption: `${good} of ${assessed.length} assessed first gigs · ${done.length - assessed.length} pending customer feedback`,
      info: ['All-history delivery outcome against the original deadline: on time, no reported incident, satisfied customer. This is not a driver fault score: customer-caused incidents also count. Read the logged cause; missing feedback is unknown. The 95% pilot guardrail is unvalidated.', `${good} of ${assessed.length} assessed first gigs; ${done.length - assessed.length} pending customer feedback`],
      status: band(quality, 95, 90),
    },
  ];
}

const SHORT_REASON: Record<RejectReason, string> = {
  requirements_not_met: 'Requirements',
  no_valid_licence: 'Licence',
  id_unverified: 'ID',
  no_response_14d: 'Paused (incomplete)',
  other: 'Other',
};

export function topRejectReasons(apps: Applicant[]) {
  const counts = new Map<RejectReason, number>();
  for (const a of apps) {
    const decision = firstDecision(a);
    if (isReviewDecision(a) && decision?.type === 'rejected' && decision.reason) {
      counts.set(decision.reason, (counts.get(decision.reason) ?? 0) + 1);
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
  currentCount?: number;
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
  if (key === 'reviewed') return isReviewDecision(a);
  if (key === 'accepted') return !!firstAcceptance(a);
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
      reached: reached('registered'), currentCount: now('registered'),
      parts: [
        { label: 'missing documents', count: apps.filter(a => deriveStage(a) === 'registered' && !reachedDocs(a)).length, to: 'missing' },
        { label: 'pre-qualifying exit', count: apps.filter(a => deriveStage(a) === 'rejected' && !reachedDocs(a)).length, to: 'rejected' },
        { label: 'paused, not finished', count: apps.filter(a => deriveStage(a) === 'closed' && !reachedDocs(a)).length, to: 'closed' },
        { label: 'submitted', count: reached('docs'), movedOn: true },
      ],
    },
    {
      key: 'docs',
      label: 'Docs submitted',
      reached: reached('docs'), currentCount: now('review'),
      parts: [
        { label: 'in review', count: now('review'), to: 'review' },
        { label: 'complement requested', count: apps.filter(a => deriveStage(a) === 'registered' && reachedDocs(a)).length, to: 'missing' },
        { label: 'paused after submission', count: apps.filter(a => deriveStage(a) === 'closed' && reachedDocs(a) && !isReviewDecision(a)).length, to: 'closed' },
        { label: 'reviewed', count: reached('reviewed'), movedOn: true },
      ],
    },
    {
      key: 'reviewed',
      label: 'Reviewed',
      reached: reached('reviewed'), currentCount: apps.filter(a => deriveStage(a) === 'rejected' && reachedDocs(a)).length,
      parts: [
        { label: 'rejected at review', count: apps.filter(a => reachedDocs(a) && isReviewDecision(a) && !firstAcceptance(a)).length, to: 'rejected' },
        { label: 'accepted', count: reached('accepted'), movedOn: true },
      ],
    },
    {
      key: 'accepted',
      label: 'Accepted',
      reached: reached('accepted'), currentCount: now('accepted'),
      parts: [
        { label: 'awaiting first gig', count: now('accepted'), to: 'awaiting' },
        { label: 'closed after acceptance', count: apps.filter(a => firstAcceptance(a) && ['rejected', 'closed'].includes(deriveStage(a))).length, to: 'rejected' },
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

  // Stage differences include work in progress, so they are never labelled lost.

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
  cohortConversion: true,
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
