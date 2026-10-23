import type { WeeklyFacts } from './facts';
import { checkReport, templateReport } from './check';
import type { ReportReply } from './server';

/** Ask the server for this week's report. If it can't be reached, the template is used here. */
export async function requestReport(wf: WeeklyFacts): Promise<ReportReply | { error: string }> {
  try {
    const res = await fetch('/api/report', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ facts: wf }) });
    if (res.status === 429) return { error: ((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'Too many reports. Try again in a few minutes.' };
    if (res.ok) return (await res.json()) as ReportReply;
  } catch {
    // Network error: fall through to the local template.
  }
  const report = templateReport(wf);
  return { source: 'template', report, check: checkReport(report, wf), reason: 'offline', attempts: 0 };
}
