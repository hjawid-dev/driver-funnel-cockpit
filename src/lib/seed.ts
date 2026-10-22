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
const ALL_OK: Docs = { licence: 'verified', id: 'verified', background: 'verified', photo: 'uploaded' };

interface Base {
  name: string;
  area: string;
  age: number;
  lic: number;
  minor?: string; // violation note
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

  // When each received document arrived: ID first (BankID), background check last (slowest).
  const docTimes: Partial<Record<DocKey, number>> = {};
  const end = t.complete ?? Math.min(now, t.reg + 2 * DAY);
  const span = Math.max(end - t.reg, 30 * MIN);
  const share: Record<DocKey, number> = { id: 0.05, licence: 0.15, photo: 0.4, background: 1 };
  for (const k of DOC_KEYS) {
    if (docs[k] === 'missing' || docs[k] === 'pending') continue;
    const at = t.complete && k === 'background' ? t.complete : t.reg + span * Math.min(share[k], 0.9);
    docTimes[k] = Math.min(at, now - MIN);
  }
  for (const k of DOC_KEYS) if (docTimes[k]) log.push({ at: docTimes[k]!, text: `Document received: ${k}` });
  if (docs.background === 'pending') log.push({ at: t.reg + 10 * MIN, text: 'Applicant ordered background check from Polisen' });
  if (t.complete) log.push({ at: t.complete, text: 'File complete, queued for review' });

  let decision: Decision | undefined;
  if (t.decision) {
    decision = { ...t.decision, by: 'Ops team' };
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
    age: b.age,
    licenceYears: b.lic,
    violations: b.minor ? 'minor' : 'none',
    ...(b.minor ? { violationNote: b.minor } : {}),
    availability: b.limited ? 'limited' : 'full',
    ...(b.limited ? { availabilityNote: b.limited } : {}),
    registeredAt: t.reg,
    docs,
    docTimes,
    ...(b.docNote ? { docNote: b.docNote } : {}),
    // Historical decisions were accepted, so their photos were approved.
    ...(decision && decision.type !== 'rejected' ? { photoApproved: true } : {}),
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
    [{ name: 'Elin Johansson', area: 'Solna', age: 29, lic: 6 }, 3, 2],
    [{ name: 'Ahmed Hassan', area: 'Sundbyberg', age: 23, lic: 1.5 }, 9, 4],
    [{ name: 'Sara Lindqvist', area: 'Nacka', age: 34, lic: 9, minor: 'Speeding fine (2025)' }, 20, 3],
    [{ name: 'Johan Berg', area: 'Bromma', age: 46, lic: 22, limited: 'Weekends only' }, 27, 5],
    [
      {
        name: 'Maja Karlsson',
        area: 'Huddinge',
        age: 28,
        lic: 7,
        docs: { background: 'remark' },
        docNote: { background: 'Extract from Polisen shows a remark (2024)' },
      },
      35,
      6,
    ],
    [
      {
        name: 'Oskar Nilsson',
        area: 'Kungsholmen',
        age: 25,
        lic: 5,
        docs: { photo: 'remark' },
        docNote: { photo: 'Blurry, face partly hidden by sunglasses' },
      },
      44,
      4,
    ],
    [{ name: 'Fatima Ali', area: 'Järfälla', age: 37, lic: 12 }, 51, 5],
    [{ name: 'Erik Svensson', area: 'Täby', age: 19, lic: 0.8 }, 76, 7],
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
    [{ name: 'Lucas Andersson', area: 'Haninge', age: 24, lic: 3, docs: { licence: U, id: M, background: M, photo: M } }, 2 * HOUR, []],
    [{ name: 'Wilma Eriksson', area: 'Södermalm', age: 31, lic: 8, docs: { licence: U, background: P, photo: M } }, 6 * HOUR, []],
    [{ name: 'Hugo Larsson', area: 'Sollentuna', age: 27, lic: 6, docs: { licence: U, background: P } }, 14 * HOUR, []],
    [{ name: 'Alva Olsson', area: 'Lidingö', age: 42, lic: 20, docs: { licence: M, background: M } }, 1 * DAY, []],
    [{ name: 'Liam Persson', area: 'Solna', age: 22, lic: 2.5, docs: { licence: U, background: P } }, 2 * DAY, []],
    [{ name: 'Ebba Gustafsson', area: 'Nacka', age: 35, lic: 15, docs: { licence: U, id: M, background: P } }, 3 * DAY, []],
    [{ name: 'Noah Pettersson', area: 'Huddinge', age: 26, lic: 4, docs: { licence: U, background: P, photo: M } }, 5 * DAY, []],
    [{ name: 'Astrid Jonsson', area: 'Bromma', age: 39, lic: 18, docs: { licence: U, background: P } }, 8 * DAY, [5]],
    [{ name: 'Ali Mohammed', area: 'Järfälla', age: 30, lic: 9, docs: { licence: U, background: M, photo: M } }, 9 * DAY, []],
    [{ name: 'Freja Lundberg', area: 'Täby', age: 24, lic: 5, docs: { licence: U, id: M, background: P } }, 11 * DAY, []],
    [{ name: 'William Lindström', area: 'Sundbyberg', age: 51, lic: 30, docs: { licence: U, background: M } }, 12 * DAY, [6]],
    [{ name: 'Nora Axelsson', area: 'Kungsholmen', age: 28, lic: 7, docs: { licence: M, background: P } }, 13 * DAY, [8]],
    [{ name: 'Adam Jakobsson', area: 'Haninge', age: 21, lic: 2, docs: { licence: U, id: M, background: M, photo: M } }, 16 * DAY, []],
    [{ name: 'Selma Holm', area: 'Sollentuna', age: 33, lic: 11, docs: { licence: U, background: M, photo: M } }, 19 * DAY, [6]],
    [{ name: 'Elias Sandberg', area: 'Södermalm', age: 45, lic: 25, docs: { licence: M, id: M, background: M, photo: M } }, 25 * DAY, []],
  ];
  for (const [b, regAgo, nudgeDays] of missing) {
    const reg = ago(regAgo);
    out.push(build(b, { reg, nudges: nudgeDays.map((d) => reg + d * DAY) }, now));
  }

  // ---------- Awaiting first gig: 6 (accepted ~1, 4, 9, 12, 18, 34 days ago) ----------
  const awaiting: [Base, number /* accepted d ago */, number /* decision h */, number /* reg→complete d */, Partial<{ welcome: boolean; bookedTomorrow: boolean; type: Decision['type'] }>][] = [
    [{ name: 'Viktor Engström', area: 'Solna', age: 30, lic: 10 }, 20 / 24, 30, 3, {}], // accepted 20 h ago: welcome call still due
    [{ name: 'Klara Forsberg', area: 'Nacka', age: 27, lic: 6 }, 4, 80, 3, { welcome: true, bookedTomorrow: true }],
    [{ name: 'Mohammed Yusuf', area: 'Sundbyberg', age: 22, lic: 1.4 }, 9, 72, 2, { welcome: true, type: 'accepted_simple' }],
    [{ name: 'Ida Sjöberg', area: 'Lidingö', age: 41, lic: 19, limited: 'Evenings and weekends' }, 12, 90, 4, { welcome: true, type: 'accepted_flagged' }],
    [{ name: 'Anton Wallin', area: 'Bromma', age: 36, lic: 14 }, 18, 96, 3, { welcome: true }],
    [{ name: 'Lova Hedlund', area: 'Huddinge', age: 25, lic: 4 }, 34, 120, 3, {}],
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
    [{ name: 'Isak Bergström', area: 'Solna', age: 32, lic: 11 }, 40, 2, 30, 3, true],
    [{ name: 'Julia Lindgren', area: 'Täby', age: 29, lic: 8 }, 38, 3, 50, 2, true],
    [{ name: 'Filip Nyström', area: 'Haninge', age: 44, lic: 24 }, 36, 4, 96, 20, true],
    [{ name: 'Emma Holmberg', area: 'Kungsholmen', age: 26, lic: 5 }, 33, 3, 120, 5, true],
    [{ name: 'Leo Mattsson', area: 'Järfälla', age: 38, lic: 17 }, 29, 2, 72, 16, true],
    [{ name: 'Agnes Ekström', area: 'Södermalm', age: 31, lic: 9 }, 27, 3, 20, 4, true],
    [{ name: 'Theo Danielsson', area: 'Sollentuna', age: 23, lic: 3 }, 24, 2, 110, 6, false],
    [{ name: 'Linnea Björk', area: 'Nacka', age: 35, lic: 13 }, 21, 3, 60, 3, true],
    [{ name: 'Omar Khalil', area: 'Sundbyberg', age: 28, lic: 7 }, 18, 2, 88, 7, true],
    [{ name: 'Saga Fransson', area: 'Lidingö', age: 40, lic: 20 }, 15, 2, 45, 2, true],
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
    [{ name: 'Rasmus Lund', area: 'Bromma', age: 33, lic: 10, docs: { background: 'failed' } }, 28, 5, 70, 'background_failed'],
    [
      { name: 'Moa Sundström', area: 'Solna', age: 27, lic: 6, docs: { background: 'remark' }, docNote: { background: 'Extract shows a remark (2023)' } },
      20,
      4,
      100,
      'background_failed',
    ],
    [{ name: 'Albin Åberg', area: 'Täby', age: 18, lic: 0.6 }, 34, 2, 130, 'licence_too_new'],
    [{ name: 'Hanna Strand', area: 'Haninge', age: 30, lic: 8, docs: { id: 'failed' } }, 12, 3, 26, 'id_unverified'],
    [{ name: 'Daniel Nordin', area: 'Sollentuna', age: 24, lic: 4, docs: { id: 'missing', background: 'missing', photo: 'missing' } }, 23, 0, 0, 'no_response_14d'],
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
