import type { Fact, WeeklyFacts } from './facts';

/**
 * This file only imports types, so the server function can bundle it on its own.
 */

/** "21%", "56 h", "12" */
export function formatFact(value: number, unit: Fact['unit']): string {
  return unit === '%' ? `${value}%` : unit ? `${value} ${unit}` : String(value);
}

/**
 * The weekly report as the AI writes it. Every item names the facts it is based on, so the
 * number check can hold each sentence to exactly those numbers.
 */
export interface ReportItem {
  text: string;
  facts: string[];
}
export interface ChangeItem extends ReportItem {
  tone: 'good' | 'bad' | 'neutral';
}
export interface WeeklyReport {
  headline: ReportItem;
  changes: ChangeItem[];
  leak: ReportItem;
  actions: ReportItem[];
}

const item = {
  type: 'object',
  properties: { text: { type: 'string' }, facts: { type: 'array', items: { type: 'string' } } },
  required: ['text', 'facts'],
  additionalProperties: false,
};

/** JSON schema for the model's structured output. */
export const REPORT_SCHEMA = {
  type: 'object',
  properties: {
    headline: item,
    changes: {
      type: 'array',
      items: {
        type: 'object',
        properties: { ...item.properties, tone: { type: 'string', enum: ['good', 'bad', 'neutral'] } },
        required: ['text', 'facts', 'tone'],
        additionalProperties: false,
      },
    },
    leak: item,
    actions: { type: 'array', items: item },
  },
  required: ['headline', 'changes', 'leak', 'actions'],
  additionalProperties: false,
};

const MAX_TEXT = 300;

function isItem(x: unknown): x is ReportItem {
  const i = x as ReportItem;
  return !!i && typeof i.text === 'string' && i.text.trim().length > 0 && i.text.length <= MAX_TEXT && Array.isArray(i.facts) && i.facts.every((f) => typeof f === 'string');
}

/** Shape check of the model's JSON. Null when it is not a usable report. */
export function parseReport(raw: unknown): WeeklyReport | null {
  const r = raw as WeeklyReport;
  if (!r || !isItem(r.headline) || !isItem(r.leak)) return null;
  if (!Array.isArray(r.changes) || r.changes.length < 2 || r.changes.length > 4) return null;
  if (!r.changes.every((c) => isItem(c) && ['good', 'bad', 'neutral'].includes(c.tone))) return null;
  if (!Array.isArray(r.actions) || r.actions.length < 2 || r.actions.length > 4 || !r.actions.every(isItem)) return null;
  return r;
}

/** Numbers written in a text: "21", "6.5", "6,5". */
export function numbersIn(text: string): number[] {
  return [...text.matchAll(/(?<![\p{L}\d])\d+(?:[.,]\d+)?/gu)].map((m) => Number(m[0].replace(',', '.')));
}

/** The numbers a sentence may use when it cites these facts. */
function allowedNumbers(facts: Fact[], week: number): Set<number> {
  const out = new Set<number>([week]);
  for (const f of facts) {
    out.add(f.value);
    if (f.previous !== undefined) out.add(f.previous);
    if (f.change !== undefined) out.add(Math.abs(f.change));
    if (f.target !== undefined) {
      out.add(f.target);
      out.add(Math.abs(f.value - f.target)); // "14 points below target"
    }
    for (const n of numbersIn(f.label)) out.add(n);
  }
  return out;
}

export interface CheckResult {
  ok: boolean;
  /** How many numbers the report contains, all checked against the data. */
  numbers: number;
  errors: string[];
}

const EXTRACT_SENT = /(?<!\b(?:never|not|n't)\s)\b(send|email|upload|attach|forward|submit|keep|store|copy)\b[^.]{0,40}\bextracts?\b/i;

/**
 * The number check. Every number in a sentence must be one of the numbers of the facts that
 * sentence cites, every cited fact must exist, and the tone of a change must match the data.
 */
export function checkReport(r: WeeklyReport, wf: WeeklyFacts): CheckResult {
  const byId = new Map(wf.facts.map((f) => [f.id, f]));
  const errors: string[] = [];
  let numbers = 0;
  const items: [string, ReportItem][] = [
    ['headline', r.headline],
    ...r.changes.map((c, i): [string, ReportItem] => [`changes[${i}]`, c]),
    ['leak', r.leak],
    ...r.actions.map((a, i): [string, ReportItem] => [`actions[${i}]`, a]),
  ];

  for (const [where, it] of items) {
    const unknown = it.facts.filter((id) => !byId.has(id));
    if (unknown.length) errors.push(`${where} cites facts that don't exist: ${unknown.join(', ')}.`);
    const cited = it.facts.map((id) => byId.get(id)).filter((f): f is Fact => !!f);
    if (!cited.length) {
      errors.push(`${where} cites no facts.`);
      continue;
    }
    const allowed = allowedNumbers(cited, wf.week);
    for (const n of numbersIn(it.text)) {
      numbers++;
      if (!allowed.has(n)) errors.push(`${where} says ${n}, which is not in the facts it cites (${it.facts.join(', ')}).`);
    }
    // The extract is only shown on video: a report must never tell anyone to send, upload or keep it.
    if (EXTRACT_SENT.test(it.text)) errors.push(`${where} suggests sending or keeping the extract; it is only shown, never sent or stored.`);
    if ('tone' in it) {
      const tone = (it as ChangeItem).tone;
      const good = cited.some((f) => f.good === true);
      const bad = cited.some((f) => f.good === false);
      if (tone === 'good' && (bad || !good)) errors.push(`${where} is marked good, but the data says otherwise.`);
      if (tone === 'bad' && (good || !bad)) errors.push(`${where} is marked bad, but the data says otherwise.`);
    }
  }
  return { ok: errors.length === 0, numbers, errors };
}

// ---------------- Fallback written by code ----------------

const get = (wf: WeeklyFacts, id: string) => wf.facts.find((f) => f.id === id);
const fmt = (f: Fact) => formatFact(f.value, f.unit);

/** A plain report written by code, used when the AI is unavailable or its text fails the check. */
export function templateReport(wf: WeeklyFacts): WeeklyReport {
  const north = get(wf, 'application_to_active');
  const drives = get(wf, 'first_drives');
  const headline: ReportItem = {
    text: `Week ${wf.week}: ${drives?.value ?? 0} new active drivers${north ? `; application to active is ${fmt(north)} against a target of ${north.target}%` : ''}.`,
    facts: ['first_drives', ...(north ? ['application_to_active'] : [])].filter((id) => get(wf, id)),
  };

  const changes: ChangeItem[] = wf.facts
    .filter((f) => f.change !== undefined && f.change !== 0)
    .sort((a, b) => Math.abs(b.change!) / Math.max(1, b.previous!) - Math.abs(a.change!) / Math.max(1, a.previous!))
    .slice(0, 3)
    .map((f) => ({
      text: `${f.label}: ${fmt(f)} this week, ${formatFact(f.previous!, f.unit)} the week before.`,
      facts: [f.id],
      tone: f.good === true ? 'good' : f.good === false ? 'bad' : 'neutral',
    }));
  // A quiet week: fill up with statuses against targets, then with the current queues.
  const unused = (x: Fact) => !changes.some((c) => c.facts.includes(x.id));
  const spare = [...wf.facts.filter((x) => x.target !== undefined && unused(x)), ...wf.facts.filter((x) => x.target === undefined && x.change === undefined && unused(x))];
  for (const f of spare) {
    if (changes.length >= 2) break;
    changes.push(
      f.target !== undefined
        ? { text: `${f.label}: ${fmt(f)}, target ${formatFact(f.target, f.unit)}.`, facts: [f.id], tone: f.good ? 'good' : 'bad' }
        : { text: `${f.label}: ${fmt(f)}.`, facts: [f.id], tone: 'neutral' },
    );
  }

  const rate = get(wf, 'biggest_drop_rate');
  const lost = get(wf, 'biggest_drop_lost');
  const leak: ReportItem = rate && lost
    ? { text: `${rate.label.split(', share')[0]}: ${fmt(rate)} get through, ${lost.value} people lost so far.`, facts: [rate.id, lost.id] }
    : { text: `Files waiting for a decision: ${get(wf, 'review_queue')?.value ?? 0}.`, facts: ['review_queue'] };

  const actions: ReportItem[] = [];
  const add = (id: string, text: (n: number) => string) => {
    const f = get(wf, id);
    if (f && f.value > 0) actions.push({ text: text(f.value), facts: [id] });
  };
  add('review_overdue', (n) => `Clear the ${n} overdue files in today's review slots.`);
  add('awaiting_over_7_days', (n) => `Call the ${n} accepted drivers who have not booked a first drive.`);
  add('open_content_gaps', (n) => `Write help articles for the ${n} driver questions the assistant could not answer.`);
  if (actions.length < 2) actions.push({ text: 'Go through the reminder texts with the team.', facts: ['new_applications'] });
  if (actions.length < 2) actions.push({ text: 'Check the first-drive offers with the team.', facts: ['awaiting_first_drive'] });

  return { headline, changes, leak, actions: actions.slice(0, 3) };
}

// ---------------- Slack ----------------

const TONE_ICON = { good: '✅', bad: '⚠️', neutral: '➖' } as const;

/** The report as a Slack message (Slack's own markdown). Lists come from code, not the AI. */
export function reportToSlack(r: WeeklyReport, wf: WeeklyFacts, extras: { gaps: string[]; source: 'ai' | 'template'; numbers: number }): string {
  const lines = [
    `*Driver funnel · week ${wf.week}*`,
    r.headline.text,
    '',
    '*What changed*',
    ...r.changes.map((c) => `${TONE_ICON[c.tone]} ${c.text}`),
    '',
    `*Biggest leak*\n${r.leak.text}`,
    '',
    '*Suggested this week*',
    ...r.actions.map((a) => `• ${a.text}`),
  ];
  if (extras.gaps.length) lines.push('', '*Questions the help articles don’t cover yet*', ...extras.gaps.map((g) => `• “${g}”`));
  lines.push(
    '',
    extras.source === 'ai'
      ? `_Written by AI from the cockpit's numbers. Number check: all ${extras.numbers} numbers match the data._`
      : `_Written from the cockpit's numbers by a template._`,
  );
  return lines.join('\n');
}
