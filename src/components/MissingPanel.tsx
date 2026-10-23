import { Ban, FlaskConical, MessageSquare, Send } from 'lucide-react';
import type { Applicant, DocKey, DocStatus } from '../lib/types';
import { isNoResponse, NUDGE_OFFSETS, nudgeMessage, nudgeState, outstandingDocs } from '../lib/nudges';
import { applyDecision, closeNoResponse, logNudge, receiveDocument, type ActionResult } from '../lib/actions';
import { MIN_AGE } from '../lib/driverFlow';
import { formatDateTime, HOUR } from '../lib/time';
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
          ? `${a.name} has the extract ready to show in a call.`
          : `${DOC_LABEL[k]} received: ${a.name}.`,
    });
  };

  const closePrequal = () =>
    onResult(
      a.prequalIssue === 'licence'
        ? applyDecision(a, { type: 'rejected', reason: 'no_valid_licence' }, now)
        : applyDecision(a, { type: 'rejected', reason: 'other', note: `Below the minimum age set by our insurance (${MIN_AGE})` }, now),
      true,
    );

  return (
    <>
      {a.prequalIssue && (
        <DrawerSection title="Pre-qualifying">
          <div className="rounded-lg bg-warn-bg p-3 text-sm">
            <p className="font-semibold text-warn">
              {a.prequalIssue === 'licence' ? 'Says the B licence is held under 1 year' : `Says they are under ${MIN_AGE} (insurance requirement)`}
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

      <DrawerSection title="Nudges" aside={<span className="text-xs text-muted">{nudge.label}</span>}>
        <ol className="space-y-1 text-sm">
          {NUDGE_OFFSETS.map((o, i) => {
            const at = a.registeredAt + o;
            const sent = nudge.autoSent.includes(at);
            return (
              <li key={o} className="flex items-center gap-3">
                <span className={`h-2 w-2 shrink-0 rounded-full ${sent ? 'bg-indigo' : 'border border-muted'}`} aria-hidden />
                <span className="w-16 text-muted">+{o / HOUR} h</span>
                <span className="num text-xs">{formatDateTime(at)}</span>
                <span className="text-xs text-muted">{sent ? `Auto-nudge ${i + 1} sent` : 'Scheduled'}</span>
              </li>
            );
          })}
          {nudge.manual.map((t) => (
            <li key={t} className="flex items-center gap-3">
              <span className="h-2 w-2 shrink-0 rounded-full bg-magenta" aria-hidden />
              <span className="w-16 text-muted">Manual</span>
              <span className="num text-xs">{formatDateTime(t)}</span>
              <span className="text-xs text-muted">Logged by ops</span>
            </li>
          ))}
        </ol>

        <div className="mt-3 rounded-lg bg-card p-3">
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted">
            <MessageSquare size={13} aria-hidden /> Reminder text · via driver chat in production
          </div>
          <p className="whitespace-pre-line text-sm">{nudgeMessage(a)}</p>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onResult(logNudge(a, now))}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo px-3 py-2 text-sm font-semibold text-white hover:bg-navy"
          >
            <Send size={15} aria-hidden /> Send nudge now
          </button>
          {stale && (
            <button
              type="button"
              onClick={() => onResult(closeNoResponse(a, now), true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-bad px-3 py-2 text-sm font-semibold text-bad hover:bg-bad hover:text-white"
            >
              <Ban size={15} aria-hidden /> Close: no response
            </button>
          )}
        </div>
        {stale && <p className="mt-1.5 text-xs text-muted">Over 14 days with documents missing. Closing logs the reason code "No response after 14 days".</p>}
      </DrawerSection>
    </>
  );
}
