import { useCallback, useEffect, useRef, useState } from 'react';
import { Bot, Copy, FileText, RefreshCw, ShieldCheck, TriangleAlert, X } from 'lucide-react';
import type { Applicant } from '../lib/types';
import type { ChatThread } from '../lib/chat/types';
import { weeklyFacts, formatFact, type WeeklyFacts } from '../lib/report/facts';
import { reportToSlack, type ChangeItem } from '../lib/report/check';
import { requestReport } from '../lib/report/client';
import type { ReportReply } from '../lib/report/server';
import { contentGaps } from '../lib/chat/threads';
import { formatDateTime } from '../lib/time';

interface Props {
  apps: Applicant[];
  threads: ChatThread[];
  now: number;
  onClose: () => void;
}

const TONE: Record<ChangeItem['tone'], { icon: string; cls: string; label: string }> = {
  good: { icon: '▲', cls: 'bg-ok-bg text-ok', label: 'Good news' },
  bad: { icon: '▼', cls: 'bg-bad-bg text-bad', label: 'Needs attention' },
  neutral: { icon: '●', cls: 'bg-idle-bg text-idle', label: 'Neutral' },
};

const REASON = {
  offline: 'The AI is unavailable, so the report is written from a template.',
  check_failed: "The AI's text failed the number check twice, so the report is written from a template instead.",
  error: 'The AI call failed, so the report is written from a template.',
};

/** The weekly report: numbers from code, text from AI, and a check that the two agree. */
export function ReportModal({ apps, threads, now, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [wf, setWf] = useState<WeeklyFacts>(() => weeklyFacts(apps, threads, now));
  const [reply, setReply] = useState<ReportReply | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const gaps = contentGaps(threads).slice(0, 5).map((g) => g.question);

  const generate = useCallback(async (facts: WeeklyFacts) => {
    setReply(null);
    setError(null);
    const r = await requestReport(facts);
    if ('error' in r) setError(r.error);
    else setReply(r);
  }, []);

  useEffect(() => {
    generate(wf);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const copy = async () => {
    if (!reply) return;
    try {
      await navigator.clipboard.writeText(reportToSlack(reply.report, wf, { gaps, source: reply.source, numbers: reply.check.numbers }));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy to the clipboard in this browser.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-0 sm:p-6">
      <div className="anim-fade fixed inset-0 bg-navy/40" onClick={onClose} aria-hidden />
      <div role="dialog" aria-modal="true" aria-labelledby="report-title" className="anim-rise relative min-h-full w-full max-w-3xl bg-white shadow-2xl sm:min-h-0 sm:rounded-2xl">
        <header className="flex items-start gap-3 border-b border-lavender px-5 py-4">
          <FileText size={20} className="mt-0.5 shrink-0 text-indigo" aria-hidden />
          <div className="min-w-0 flex-1">
            <h2 id="report-title" className="text-lg font-bold">
              Weekly report · week {wf.week}
            </h2>
            <p className="text-sm text-muted">
              Last 7 days ({formatDateTime(wf.from)} – {formatDateTime(wf.to)}), compared with the week before. Posted every Monday at 08:00.
            </p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close the weekly report" className="rounded-md p-1.5 text-muted hover:bg-card hover:text-navy">
            <X size={18} />
          </button>
        </header>

        <div className="space-y-5 px-5 py-5">
          {!reply && !error && (
            <p className="flex items-center gap-2 rounded-xl bg-card p-4 text-sm text-muted" aria-live="polite">
              <Bot size={16} className="text-indigo" aria-hidden /> Writing the report from this week's numbers…
            </p>
          )}
          {error && <p className="rounded-xl bg-warn-bg p-4 text-sm text-warn">{error}</p>}

          {reply && (
            <>
              <CheckBadge reply={reply} />
              <p className="text-lg font-semibold leading-snug">{reply.report.headline.text}</p>

              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted">What changed</h3>
                <ul className="space-y-2">
                  {reply.report.changes.map((c, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm">
                      <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${TONE[c.tone].cls}`} title={TONE[c.tone].label}>
                        {TONE[c.tone].icon}
                      </span>
                      <span>{c.text}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="rounded-xl bg-warn-bg/60 p-4">
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-warn">Biggest leak</h3>
                <p className="text-sm">{reply.report.leak.text}</p>
              </section>

              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted">Suggested this week</h3>
                <ol className="space-y-1.5 text-sm">
                  {reply.report.actions.map((a, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="num font-semibold text-indigo">{i + 1}.</span> {a.text}
                    </li>
                  ))}
                </ol>
              </section>

              {gaps.length > 0 && (
                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted">Questions the help articles don't cover yet</h3>
                  <ul className="space-y-1 text-sm text-muted">
                    {gaps.map((g, i) => (
                      <li key={i}>“{g}”</li>
                    ))}
                  </ul>
                  <p className="mt-1 text-xs text-muted">Listed by code from the chat. The AI never sees what drivers wrote.</p>
                </section>
              )}
            </>
          )}

          <details className="rounded-xl border border-lavender">
            <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">The numbers behind it ({wf.facts.length} facts, computed by code)</summary>
            <div className="overflow-x-auto px-4 pb-4">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted">
                  <tr>
                    <th className="py-2 pr-3 font-semibold">Fact</th>
                    <th className="py-2 pr-3 font-semibold">This week / now</th>
                    <th className="py-2 pr-3 font-semibold">Week before</th>
                    <th className="py-2 font-semibold">Target</th>
                  </tr>
                </thead>
                <tbody>
                  {wf.facts.map((f) => (
                    <tr key={f.id} className="border-t border-lavender">
                      <td className="py-2 pr-3">{f.label}</td>
                      <td className={`num py-2 pr-3 font-semibold ${f.good === true ? 'text-ok' : f.good === false ? 'text-bad' : ''}`}>{formatFact(f.value, f.unit)}</td>
                      <td className="num py-2 pr-3 text-muted">{f.previous !== undefined ? formatFact(f.previous, f.unit) : '–'}</td>
                      <td className="num py-2 text-muted">{f.target !== undefined ? formatFact(f.target, f.unit) : '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>

        <footer className="flex flex-wrap items-center gap-2 border-t border-lavender px-5 py-4">
          <button
            type="button"
            onClick={copy}
            disabled={!reply}
            className="flex items-center gap-1.5 rounded-lg bg-indigo px-3 py-2 text-sm font-semibold text-white hover:bg-navy disabled:bg-lavender disabled:text-muted"
          >
            <Copy size={15} aria-hidden /> {copied ? 'Copied' : 'Copy for Slack'}
          </button>
          <button
            type="button"
            onClick={() => {
              const next = weeklyFacts(apps, threads, now);
              setWf(next);
              generate(next);
            }}
            disabled={!reply && !error}
            className="flex items-center gap-1.5 rounded-lg border border-lavender px-3 py-2 text-sm font-semibold text-indigo hover:border-indigo disabled:text-muted"
          >
            <RefreshCw size={15} aria-hidden /> Write again
          </button>
          <span className="ml-auto text-xs text-muted">In production: posted to Slack or HubSpot by itself.</span>
        </footer>
      </div>
    </div>
  );
}

function CheckBadge({ reply }: { reply: ReportReply }) {
  if (reply.source === 'ai')
    return (
      <p className="flex items-start gap-2 rounded-xl bg-ok-bg px-3.5 py-2.5 text-sm text-ok">
        <ShieldCheck size={16} className="mt-0.5 shrink-0" aria-hidden />
        <span>
          <strong>Written by AI, number check passed:</strong> all {reply.check.numbers} numbers in the text match the facts below
          {reply.attempts > 1 ? ' (on the second try)' : ''}.
        </span>
      </p>
    );
  return (
    <p className="flex items-start gap-2 rounded-xl bg-warn-bg px-3.5 py-2.5 text-sm text-warn">
      <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden />
      <span>
        <strong>Written by template.</strong> {REASON[reply.reason ?? 'error']}
      </span>
    </p>
  );
}
