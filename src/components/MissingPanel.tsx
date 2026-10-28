import { useState } from 'react';
import { Ban, Check, FlaskConical, Send } from 'lucide-react';
import type { Applicant, DocKey, DocStatus } from '../lib/types';
import { isNoResponse, nudgeMessage, nudgeState, outstandingDocs, reminderTimes } from '../lib/nudges';
import { applyDecision, closeNoResponse, logNudge, receiveDocument, type ActionResult } from '../lib/actions';
import { MIN_AGE } from '../lib/driverFlow';
import { formatDateTime } from '../lib/time';
import { DOC_LABEL, DocStatusPill } from './chips';
import { DrawerSection } from './ui';

/** What a document becomes when it arrives (demo). */
const RECEIVED_AS: Record<DocKey, DocStatus> = { licence: 'uploaded', id: 'verified', extract: 'ready', photo: 'uploaded' };

interface Props {
  a: Applicant;
  now: number;
  onResult: (r: ActionResult, close?: boolean) => void;
}

export function MissingPanel({ a, now, onResult }: Props) {
  const [justLogged, setJustLogged] = useState<number | null>(null);
  const nudge = nudgeState(a, now);
  const stale = isNoResponse(a, now);
  const outstanding = outstandingDocs(a);

  const receive = (k: DocKey) => {
    const next = receiveDocument(a, k, RECEIVED_AS[k], now);
    const complete = !!next.docsCompleteAt;
    onResult({
      ok: true,
      applicant: next,
      message: complete
        ? `File complete: ${a.name}. Auto-queued for review.`
        : k === 'extract'
          ? `${a.name} has the extract ready to show in the onboarding call.`
          : `${DOC_LABEL[k]} received: ${a.name}.`,
    });
  };

  const closePrequal = () =>
    onResult(
      a.prequalIssue === 'licence'
        ? applyDecision(a, { type: 'rejected', reason: 'no_valid_licence' }, now)
        : applyDecision(a, { type: 'rejected', reason: 'other', note: `Below the proposed minimum insurance age (${MIN_AGE})` }, now),
      true,
    );

  return (
    <>
      {a.prequalIssue && (
        <DrawerSection title="Pre-qualifying">
          <div className="rounded-lg bg-warn-bg p-3 text-sm">
            <p className="font-semibold text-warn">
              {a.prequalIssue === 'licence' ? 'Says the B licence is held under 1 year' : `Says they are under ${MIN_AGE} (proposed insurance threshold)`}
            </p>
            <p className="mt-1 text-xs text-muted">
              Nothing was decided automatically. Check the answer with the applicant if needed, then close the file. They get the reason and can ask for a review.
            </p>
            <button
              type="button"
              onClick={closePrequal}
              className="mt-2 rounded-lg border border-bad bg-white px-3 py-1.5 text-xs font-semibold text-bad hover:bg-bad hover:text-white"
            >
              Close: requirement not met
            </button>
          </div>
        </DrawerSection>
      )}
      <DrawerSection
        title="What's missing"
        info={<p>"Mark received" is a demo shortcut for a document arriving. When the last one arrives, the file goes to the review queue by itself.</p>}
      >
        <ul className="divide-y divide-lavender rounded-lg border border-lavender">
          {outstanding.map((k) => (
            <li key={k} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
              <span className="font-medium">{DOC_LABEL[k]}</span>
              <span className="flex items-center gap-2">
                <DocStatusPill docKey={k} status={a.docs[k]} />
                <button
                  type="button"
                  onClick={() => receive(k)}
                  title="Demo only: simulate the document arriving"
                  className="inline-flex items-center gap-1 rounded-md border border-dashed border-lavender px-2 py-0.5 text-xs text-muted hover:border-indigo hover:text-indigo"
                >
                  <FlaskConical size={12} aria-hidden /> {k === 'extract' ? 'Mark ready to show' : 'Mark received'}
                </button>
              </span>
            </li>
          ))}
        </ul>
      </DrawerSection>

      <DrawerSection title="Nudges" aside={<span className="text-xs text-muted">{nudge.autoSent.length} auto reminders sent</span>} info={<>
        <p className="font-semibold">Reminder schedule</p>
        <p>Proposed: reminders at 2 h, 24 h and day 7, never between 20:00 and 09:00, at least 12 h apart, and moved on when the driver makes progress. If documents are still missing after the second reminder, the owner calls once, in the first review block at least 3 h later. Then no more calls; the day-14 review decides. The driver can pause or stop reminders in the chat.</p>
        <ol className="space-y-1">
          {reminderTimes(a).map((at, i) => {
            const sent = nudge.autoSent.includes(at);
            return (
              <li key={i}>
                <span className="font-semibold">{['2 h', '24 h', 'Day 7'][i]} · {sent ? `Reminder ${i + 1} sent` : 'Not sent'}</span>
                <span className="num block text-muted">{formatDateTime(at)}</span>
              </li>
            );
          })}
          {nudge.manual.map((t) => (
            <li key={t}>
              <span className="font-semibold">Manual follow-up logged</span>
              <span className="num block text-muted">{formatDateTime(t)} · logged by Ops</span>
            </li>
          ))}
        </ol>

        <p className="pt-2 font-semibold">Message preview</p>
        <p className="whitespace-pre-line">{nudgeMessage(a)}</p>
      </>}>
        <p className="text-sm text-muted">{nudge.nextAt ? `Next: ${formatDateTime(nudge.nextAt)}` : nudge.label.replace('nudges', 'reminders')}</p>
        {justLogged !== null && <p role="status" className="mt-2 rounded-lg bg-ok-bg p-2 text-sm font-semibold text-ok">✓ Manual follow-up logged · {formatDateTime(justLogged!)}<span className="block text-xs font-normal">Recorded in demo; no message sent.</span></p>}
        <p className="mt-2 text-xs text-muted">Demo: logging a manual follow-up stands for Ops having called the driver.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            data-guide="manual-followup" disabled={justLogged !== null} onClick={() => { const result = logNudge(a, now); if (result.ok) setJustLogged(now); onResult(result); }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo px-3 py-2 text-sm font-semibold text-white hover:bg-navy"
          >
            {justLogged !== null ? <Check size={15} aria-hidden /> : <Send size={15} aria-hidden />} {justLogged !== null ? 'Follow-up logged' : 'Log manual follow-up'}
          </button>
          {stale && (
            <button
              type="button"
              onClick={() => onResult(closeNoResponse(a, now), true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-bad px-3 py-2 text-sm font-semibold text-bad hover:bg-bad hover:text-white"
            >
              <Ban size={15} aria-hidden /> Close incomplete file
            </button>
          )}
        </div>
        {stale && <p className="mt-1.5 text-xs text-muted">Review recent replies and progress before closing. Keep engaged applicants open; closure records an incomplete file, not a suitability rejection.</p>}
      </DrawerSection>
    </>
  );
}
