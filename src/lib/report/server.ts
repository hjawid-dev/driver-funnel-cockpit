import Anthropic from '@anthropic-ai/sdk';
import { RateLimiter, sameOrigin } from '../chat/guard.js';
import { REPORT_SCHEMA, checkReport, parseReport, templateReport, type CheckResult, type WeeklyReport } from './check.js';
import type { Fact, WeeklyFacts } from './facts';

/**
 * POST /api/report: the weekly report. Code computed the facts; the model writes the text;
 * the number check decides whether that text is shown. Two attempts, then a template.
 */
export const REPORT_MODEL = 'claude-haiku-5-5';

export interface ReportReply {
  source: 'ai' | 'template';
  report: WeeklyReport;
  check: CheckResult;
  /** Why the template was used. */
  reason?: 'offline' | 'check_failed' | 'error';
  attempts: number;
}

export interface ReportModel {
  create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message>;
}

export interface ReportEnv {
  ANTHROPIC_API_KEY?: string;
  CHAT_ENABLED?: string;
}

const SYSTEM = `You write the weekly driver-funnel update for the ops team of a car-relocation service in Stockholm. Drivers apply, send documents, have a short onboarding call where they also show a criminal-record extract, get a decision, and then do a first drive.

You get this week's facts as JSON, one per line: id, label, value, unit, previous (the week before), change, target, and good (true = good news, false = bad news, null = neither).

Write in English, plain and specific, like a teammate posting in Slack:
- headline: one sentence with the most important thing this week.
- changes: exactly 3 items: the biggest movements, or statuses that matter most. Give each a tone that matches its facts: "good" only if every fact it cites is good news or neither, and at least one is good; "bad" the same way for bad news; "neutral" when the facts are mixed or neither.
- leak: one sentence on where the funnel loses the most people right now.
- actions: exactly 3 concrete things ops can do this week, each tied to the facts.

Rules for numbers (a check rejects the report otherwise):
- Use only numbers that belong to the facts you cite in that same item: its value, previous, change (written as a positive number), target, or the gap between value and target.
- Never calculate new numbers: no percentage changes, sums, ratios or averages. Never write dates or times of day.
- List the id of every fact you use in "facts".
Keep each text under 220 characters. No names of people. Do not mention this check.`;

const UNITS = new Set(['', '%', 'h', 'min']);
const ID = /^[a-z0-9_]{1,40}$/;
const num = (v: unknown, max = 100_000) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= max;

/** Validate facts sent by the app: bounded numbers and short labels only. */
export function validateFacts(body: unknown): WeeklyFacts | null {
  const wf = (body as { facts?: WeeklyFacts })?.facts;
  if (!wf || !Number.isInteger(wf.week) || wf.week < 1 || wf.week > 53 || !num(wf.from, 1e13) || !num(wf.to, 1e13)) return null;
  if (!Array.isArray(wf.facts) || wf.facts.length < 1 || wf.facts.length > 40) return null;
  const facts: Fact[] = [];
  for (const f of wf.facts) {
    if (!f || typeof f.id !== 'string' || !ID.test(f.id) || typeof f.label !== 'string' || f.label.length > 120) return null;
    if (!num(f.value) || !UNITS.has(f.unit) || ![true, false, null].includes(f.good)) return null;
    for (const k of ['previous', 'change', 'target'] as const) if (f[k] !== undefined && !num(f[k])) return null;
    facts.push({ id: f.id, label: f.label.replace(/[\r\n<>]+/g, ' '), value: f.value, unit: f.unit, good: f.good, ...(f.previous !== undefined ? { previous: f.previous } : {}), ...(f.change !== undefined ? { change: f.change } : {}), ...(f.target !== undefined ? { target: f.target } : {}) });
  }
  return { week: wf.week, from: wf.from, to: wf.to, facts };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

function fallback(wf: WeeklyFacts, reason: ReportReply['reason'], attempts: number): ReportReply {
  const report = templateReport(wf);
  return { source: 'template', report, check: checkReport(report, wf), reason, attempts };
}

function textOf(m: Anthropic.Message): string {
  return m.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
}

export function createReportHandler(opts: { env: ReportEnv; model?: ReportModel; now?: () => number }) {
  const now = opts.now ?? Date.now;
  const perIp = new RateLimiter(6, 10 * 60_000);
  const global = new RateLimiter(60, 60 * 60_000);
  let model = opts.model;

  return async function handle(req: Request): Promise<Response> {
    if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
    const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
    if (!sameOrigin(req.headers.get('origin'), host)) return json({ error: 'Requests must come from the app.' }, 403);

    const raw = await req.text();
    if (raw.length > 20_000) return json({ error: 'Request too large.' }, 413);
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return json({ error: 'Invalid JSON.' }, 400);
    }
    const wf = validateFacts(body);
    if (!wf) return json({ error: 'Invalid facts.' }, 400);

    if (opts.env.CHAT_ENABLED === 'off' || (!opts.env.ANTHROPIC_API_KEY && !model)) return json(fallback(wf, 'offline', 0));
    const ip = (req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown').split(',')[0].trim();
    if (!perIp.take(ip, now())) return json({ error: 'Too many reports. Try again in a few minutes.' }, 429);
    if (!global.take('all', now())) return json(fallback(wf, 'offline', 0));

    model ??= { create: (p) => new Anthropic({ apiKey: opts.env.ANTHROPIC_API_KEY }).messages.create(p) };
    const factLines = wf.facts.map((f) => JSON.stringify(f)).join('\n');
    const messages: Anthropic.MessageParam[] = [{ role: 'user', content: `Week ${wf.week}, the last 7 days.\nFacts:\n${factLines}` }];

    let attempts = 0;
    try {
      while (attempts < 2) {
        attempts++;
        const res = await model.create({
          model: REPORT_MODEL,
          max_tokens: 4000,
          output_config: { effort: 'low', format: { type: 'json_schema', schema: REPORT_SCHEMA } },
          system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
          messages,
        });
        console.log(`report attempt=${attempts} in=${res.usage.input_tokens} out=${res.usage.output_tokens} stop=${res.stop_reason}`);
        let parsed: WeeklyReport | null = null;
        try {
          parsed = parseReport(JSON.parse(textOf(res)));
        } catch {
          parsed = null;
        }
        const check = parsed ? checkReport(parsed, wf) : { ok: false, numbers: 0, errors: ['The report did not have the required shape.'] };
        if (parsed && check.ok) return json({ source: 'ai', report: parsed, check, attempts } satisfies ReportReply);
        // The errors only contain numbers and fact ids, never personal data.
        console.log(`report check failed: ${check.errors.join(' | ')}`);
        // Second attempt: the model sees its own report and exactly what failed.
        messages.push({ role: 'assistant', content: res.content as Anthropic.ContentBlockParam[] });
        messages.push({ role: 'user', content: `The number check failed:\n${check.errors.map((e) => `- ${e}`).join('\n')}\nWrite the whole report again and fix only these problems.` });
      }
      return json(fallback(wf, 'check_failed', attempts));
    } catch (err) {
      console.error(`report failed status=${err instanceof Anthropic.APIError ? err.status : 'none'}`);
      return json(fallback(wf, 'error', attempts));
    }
  };
}
