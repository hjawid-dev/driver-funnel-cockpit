import type { Applicant, Decision, DocKey, DocStatus } from './types';
import { DOC_KEYS } from './types';
import { DAY, HOUR, MIN } from './time';
import { DECISION_LABEL } from './criteria';
import { REJECT_REASONS } from './types';

/**
 * 44 demo applicants over the last ~40 days, all relative to `now`,
 * so SLA clocks look live whenever the link is opened.
 *
 * Tuned so the KPI cards tell a realistic baseline story:
 * document completion ≈ 70%, application → active ≈ 21%,
 * time to decision ≈ 3 days from complete file (≈ 6 days from registration),
 * activation gap visible (≈ 60% within 14 days).
 */

type Docs = Record<DocKey, DocStatus>;
const ALL_OK: Docs = { licence: 'verified', id: 'verified', extract: 'ready', photo: 'uploaded' };

interface Base {
  name: string;
  area: string;
  lic: number;
  limited?: string; // availability note
  docs?: Partial<Docs>;
  docNote?: Applicant['docNote'];
}

function build(
  b: Base,
  t: {
    reg: number;
    complete?: number;
    decision?: Omit<Decision, 'at' | 'by'> & { at: number };
    welcome?: number;
    booked?: number;
    done?: number;
    onTime?: boolean;
    ok?: boolean;
    nudges?: number[];
  },
  now: number,
): Omit<Applicant, 'id'> {
  const docs: Docs = { ...ALL_OK, ...b.docs };
  const log: Applicant['log'] = [{ at: t.reg, text: 'Registered' }];

  // When each item arrived: ID first (BankID), the extract last (ordered from Polisen, slowest).
  const docTimes: Partial<Record<DocKey, number>> = {};
  const end = t.complete ?? Math.min(now, t.reg + 2 * DAY);
  const span = Math.max(end - t.reg, 30 * MIN);
  const share: Record<DocKey, number> = { id: 0.05, licence: 0.15, photo: 0.4, extract: 1 };
  for (const k of DOC_KEYS) {
    if (docs[k] === 'missing' || docs[k] === 'pending') continue;
    const at = t.complete && k === 'extract' ? t.complete : t.reg + span * Math.min(share[k], 0.9);
    docTimes[k] = Math.min(at, now - MIN);
  }
  for (const k of DOC_KEYS) if (docTimes[k]) log.push({ at: docTimes[k]!, text: k === 'extract' ? 'Extract ready to show (nothing uploaded)' : `Document received: ${k}` });
  if (docs.extract === 'pending') log.push({ at: t.reg + 10 * MIN, text: 'Applicant ordered extract from Polisen' });
  if (t.complete) log.push({ at: t.complete, text: 'File complete, queued for review' });

  let decision: Decision | undefined;
  if (t.decision) {
    decision = {
      ...t.decision,
      by: 'Ops team',
      ...(t.decision.reason === 'requirements_not_met' ? { secondReviewer: 'Sofia (backup)' } : {}),
    };
    const label =
      decision.type === 'rejected'
        ? `Rejected: ${REJECT_REASONS.find((r) => r.value === decision!.reason)!.label}`
        : DECISION_LABEL[decision.type];
    log.push({ at: decision.at, text: `${label} · by Ops team` });
  }
  if (t.welcome) log.push({ at: t.welcome, text: 'Welcome call logged' });
  if (t.booked) log.push({ at: (t.welcome ?? decision!.at) + HOUR, text: 'First gig booked' });
  if (t.done) log.push({ at: t.done, text: `First gig completed (${t.onTime === false ? 'late' : 'on time, no incident'})` });
  for (const n of t.nudges ?? []) log.push({ at: n, text: 'Manual nudge logged' });
  log.sort((x, y) => x.at - y.at);

  return {
    name: b.name,
    area: b.area,
    licenceYears: b.lic,
    availability: b.limited ? 'limited' : 'full',
    ...(b.limited ? { availabilityNote: b.limited } : {}),
    registeredAt: t.reg,
    docs,
    docTimes,
    ...(b.docNote ? { docNote: b.docNote } : {}),
    // Historical decisions were accepted, so their photos were approved.
    ...(decision && decision.type !== 'rejected' ? { photoApproved: true } : {}),
    // Decided files went through the extract call; only the tick is kept, never the content.
    ...(decision && t.complete ? { extractShown: true } : {}),
    nudges: t.nudges ?? [],
    ...(t.complete ? { docsCompleteAt: t.complete } : {}),
    ...(decision ? { decision } : {}),
    ...(t.welcome ? { welcomeCallAt: t.welcome } : {}),
    ...(t.booked || t.done
      ? {
          firstGig: {
            ...(t.booked ? { bookedFor: t.booked } : {}),
            ...(t.done ? { doneAt: t.done, onTime: t.onTime ?? true, ok: t.ok ?? true } : {}),
          },
        }
      : {}),
    log,
  };
}

export function generateSeed(now: number): Applicant[] {
  const ago = (ms: number) => now - ms;
  const out: Omit<Applicant, 'id'>[] = [];

  // ---------- Review queue: 8 hand-crafted cases ----------
  const review: [Base, number /* docs complete h ago */, number /* reg→complete days */][] = [
    [{ name: 'Elin Johansson', area: 'Solna', lic: 6 }, 3, 2],
    [{ name: 'Ahmed Hassan', area: 'Sundbyberg', lic: 1.5 }, 9, 4],
    [{ name: 'Sara Lindqvist', area: 'Nacka', lic: 9 }, 20, 3],
    [{ name: 'Johan Berg', area: 'Bromma', lic: 22, limited: 'Weekends only' }, 27, 5],
    // Maja uploaded a scanned ID instead of verifying with BankID.
    [{ name: 'Maja Karlsson', area: 'Huddinge', lic: 7, docs: { id: 'uploaded' } }, 35, 6],
    [
      {
        name: 'Oskar Nilsson',
        area: 'Kungsholmen',
        lic: 5,
        docs: { photo: 'remark' },
        docNote: { photo: 'Face partly hidden by sunglasses' },
      },
      44,
      4,
    ],
    [{ name: 'Fatima Ali', area: 'Järfälla', lic: 12 }, 51, 5],
    [{ name: 'Erik Svensson', area: 'Täby', lic: 0.8 }, 76, 7],
  ];
  for (const [b, hAgo, regDays] of review) {
    const complete = ago(hAgo * HOUR);
    out.push(build(b, { reg: complete - regDays * DAY, complete }, now));
  }

  // ---------- Missing documents: 15 ----------
  const P = 'pending' as const;
  const M = 'missing' as const;
  const U = 'uploaded' as const;
  const missing: [Base, number /* registered ago ms */, number[] /* manual nudges, days after reg */][] = [
    [{ name: 'Lucas Andersson', area: 'Haninge', lic: 3, docs: { licence: U, id: M, extract: M, photo: M } }, 2 * HOUR, []],
    [{ name: 'Wilma Eriksson', area: 'Södermalm', lic: 8, docs: { licence: U, extract: P, photo: M } }, 6 * HOUR, []],
    [{ name: 'Hugo Larsson', area: 'Sollentuna', lic: 6, docs: { licence: U, extract: P } }, 14 * HOUR, []],
    [{ name: 'Alva Olsson', area: 'Lidingö', lic: 20, docs: { licence: M, extract: M } }, 1 * DAY, []],
    [{ name: 'Liam Persson', area: 'Solna', lic: 2.5, docs: { licence: U, extract: P } }, 2 * DAY, []],
    [{ name: 'Ebba Gustafsson', area: 'Nacka', lic: 15, docs: { licence: U, id: M, extract: P } }, 3 * DAY, []],
    [{ name: 'Noah Pettersson', area: 'Huddinge', lic: 4, docs: { licence: U, extract: P, photo: M } }, 5 * DAY, []],
    [{ name: 'Astrid Jonsson', area: 'Bromma', lic: 18, docs: { licence: U, extract: P } }, 8 * DAY, [5]],
    [{ name: 'Ali Mohammed', area: 'Järfälla', lic: 9, docs: { licence: U, extract: M, photo: M } }, 9 * DAY, []],
    [{ name: 'Freja Lundberg', area: 'Täby', lic: 5, docs: { licence: U, id: M, extract: P } }, 11 * DAY, []],
    [{ name: 'William Lindström', area: 'Sundbyberg', lic: 30, docs: { licence: U, extract: M } }, 12 * DAY, [6]],
    [{ name: 'Nora Axelsson', area: 'Kungsholmen', lic: 7, docs: { licence: M, extract: P } }, 13 * DAY, [8]],
    [{ name: 'Adam Jakobsson', area: 'Haninge', lic: 2, docs: { licence: U, id: M, extract: M, photo: M } }, 16 * DAY, []],
    [{ name: 'Selma Holm', area: 'Sollentuna', lic: 11, docs: { licence: U, extract: M, photo: M } }, 19 * DAY, [6]],
    [{ name: 'Elias Sandberg', area: 'Södermalm', lic: 25, docs: { licence: M, id: M, extract: M, photo: M } }, 25 * DAY, []],
  ];
  for (const [b, regAgo, nudgeDays] of missing) {
    const reg = ago(regAgo);
    out.push(build(b, { reg, nudges: nudgeDays.map((d) => reg + d * DAY) }, now));
  }

  // ---------- Awaiting first gig: 6 (accepted ~1, 4, 9, 12, 18, 34 days ago) ----------
  const awaiting: [Base, number /* accepted d ago */, number /* decision h */, number /* reg→complete d */, Partial<{ welcome: boolean; bookedTomorrow: boolean; type: Decision['type'] }>][] = [
    [{ name: 'Viktor Engström', area: 'Solna', lic: 10 }, 20 / 24, 30, 3, {}], // accepted 20 h ago: welcome call still due
    [{ name: 'Klara Forsberg', area: 'Nacka', lic: 6 }, 4, 80, 3, { welcome: true, bookedTomorrow: true }],
    [{ name: 'Mohammed Yusuf', area: 'Sundbyberg', lic: 1.4 }, 9, 72, 2, { welcome: true, type: 'accepted_simple' }],
    [{ name: 'Ida Sjöberg', area: 'Lidingö', lic: 19, limited: 'Evenings and weekends' }, 12, 90, 4, { welcome: true, type: 'accepted_flagged' }],
    [{ name: 'Anton Wallin', area: 'Bromma', lic: 14 }, 18, 96, 3, { welcome: true }],
    [{ name: 'Lova Hedlund', area: 'Huddinge', lic: 4 }, 34, 120, 3, {}],
  ];
  for (const [b, accAgo, decH, regDays, o] of awaiting) {
    const at = ago(accAgo * DAY);
    const complete = at - decH * HOUR;
    out.push(
      build(
        b,
        {
          reg: complete - regDays * DAY,
          complete,
          decision: { type: o.type ?? 'accepted', at },
          ...(o.welcome ? { welcome: at + 6 * HOUR } : {}),
          ...(o.bookedTomorrow ? { booked: startOfDay(now + DAY) + 9 * HOUR } : {}),
        },
        now,
      ),
    );
  }

  // ---------- Active: 10 (old, slow process: 20–130 h to decision) ----------
  // Two activated late (16 and 20 days after acceptance) to show the activation gap.
  const active: [Base, number /* reg d ago */, number /* reg→complete d */, number /* decision h */, number /* gig d after decision */, boolean /* on time */][] = [
    [{ name: 'Isak Bergström', area: 'Solna', lic: 11 }, 40, 2, 30, 3, true],
    [{ name: 'Julia Lindgren', area: 'Täby', lic: 8 }, 38, 3, 50, 2, true],
    [{ name: 'Filip Nyström', area: 'Haninge', lic: 24 }, 36, 4, 96, 20, true],
    [{ name: 'Emma Holmberg', area: 'Kungsholmen', lic: 5 }, 33, 3, 120, 5, true],
    [{ name: 'Leo Mattsson', area: 'Järfälla', lic: 17 }, 29, 2, 72, 16, true],
    [{ name: 'Agnes Ekström', area: 'Södermalm', lic: 9 }, 27, 3, 20, 4, true],
    [{ name: 'Theo Danielsson', area: 'Sollentuna', lic: 3 }, 24, 2, 110, 6, false],
    [{ name: 'Linnea Björk', area: 'Nacka', lic: 13 }, 21, 3, 60, 3, true],
    [{ name: 'Omar Khalil', area: 'Sundbyberg', lic: 7 }, 18, 2, 88, 7, true],
    [{ name: 'Saga Fransson', area: 'Lidingö', lic: 20 }, 15, 2, 45, 2, true],
  ];
  for (const [b, regAgo, regDays, decH, gigD, onTime] of active) {
    const reg = ago(regAgo * DAY);
    const complete = reg + regDays * DAY;
    const at = complete + decH * HOUR;
    out.push(
      build(
        b,
        {
          reg,
          complete,
          decision: { type: 'accepted', at },
          welcome: at + 8 * HOUR,
          booked: at + gigD * DAY,
          done: at + gigD * DAY,
          onTime,
          ok: true,
        },
        now,
      ),
    );
  }

  // ---------- Rejected: 5 ----------
  const rejected: [Base, number /* reg d ago */, number /* reg→complete d, 0 = never */, number /* decision h */, Decision['reason']][] = [
    [{ name: 'Rasmus Lund', area: 'Bromma', lic: 10 }, 28, 5, 70, 'requirements_not_met'],
    [{ name: 'Moa Sundström', area: 'Solna', lic: 6 }, 20, 4, 100, 'requirements_not_met'],
    [{ name: 'Albin Åberg', area: 'Täby', lic: 0.6 }, 34, 2, 130, 'no_valid_licence'],
    [{ name: 'Hanna Strand', area: 'Haninge', lic: 8, docs: { id: 'failed' } }, 12, 3, 26, 'id_unverified'],
    [{ name: 'Daniel Nordin', area: 'Sollentuna', lic: 4, docs: { id: 'missing', extract: 'missing', photo: 'missing' } }, 23, 0, 0, 'no_response_14d'],
  ];
  for (const [b, regAgo, regDays, decH, reason] of rejected) {
    const reg = ago(regAgo * DAY);
    if (regDays === 0) {
      out.push(build(b, { reg, decision: { type: 'rejected', reason, at: reg + 15 * DAY } }, now));
    } else {
      const complete = reg + regDays * DAY;
      out.push(build(b, { reg, complete, decision: { type: 'rejected', reason, at: complete + decH * HOUR } }, now));
    }
  }

  return out
    .sort((a, b) => a.registeredAt - b.registeredAt)
    .map((a, i) => ({ id: `DRV-${1001 + i}`, ...a }));
}

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
