import { useEffect, useRef, type ReactNode } from 'react';
import { Smartphone, X } from 'lucide-react';
import type { Applicant, Gig } from '../lib/types';
import { DOC_KEYS } from '../lib/types';
import { deriveStage, STAGE_LABEL } from '../lib/stage';
import { slaStatus } from '../lib/sla';
import { fmtYears } from '../lib/criteria';
import { ago, formatDateTime } from '../lib/time';
import { retention } from '../lib/retention';
import type { ActionResult } from '../lib/actions';
import { DOC_LABEL, DocStatusPill, SlaChip } from './chips';
import { ReviewPanel } from './ReviewPanel';
import { MissingPanel } from './MissingPanel';
import { ActivationPanel } from './ActivationPanel';
import { Timeline } from './Timeline';
import { CollapsibleSection, DrawerSection } from './ui';
import type { WorkItem } from '../lib/workQueue';

interface Props {
  applicant: Applicant;
  /** Everyone and the open jobs: for the reason an accepted driver hasn't driven yet. */
  apps: Applicant[];
  gigs: Gig[];
  now: number;
  onClose: () => void;
  /** Apply a change. Results that end the task (a decision) close the drawer. */
  onUpdate: (next: Applicant) => void;
  onResult: (r: ActionResult, close?: boolean) => void;
  onViewAsDriver?: (id: string) => void;
  /** Where they are and the next action, as the queue shows it. */
  next?: WorkItem | null;
}

export function ApplicantDrawer({ applicant: a, apps, gigs, now, onClose, onUpdate, onResult, onViewAsDriver, next }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const stage = deriveStage(a);

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

  return (
    <div className="fixed inset-0 z-[70] lg:z-50">
      <div className="anim-fade absolute inset-0 bg-navy/40" onClick={onClose} aria-hidden />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        className="anim-drawer absolute inset-y-0 right-0 flex w-full sm:w-[520px] flex-col bg-white shadow-2xl"
      >
        <header className="flex items-start gap-3 border-b border-lavender px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="drawer-title" className="text-lg font-bold">
                {a.name}
              </h2>
              <span className="rounded-full bg-card px-2 py-0.5 text-xs font-semibold text-muted">{STAGE_LABEL[stage]}</span>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted">
              <span className="num">{a.id}</span>
              {stage === 'review' && <SlaChip {...slaStatus(a.registeredAt, now)} />}
            </div>
          </div>
          {onViewAsDriver && (
            <button
              type="button"
              onClick={() => onViewAsDriver(a.id)}
              className="flex items-center gap-1 rounded-md border border-lavender px-2 py-1 text-xs font-semibold text-indigo hover:border-indigo"
            >
              <Smartphone size={13} aria-hidden /> Driver's view
            </button>
          )}
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1.5 text-muted hover:bg-card hover:text-navy">
            <X size={20} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
          {next && (
            <div className={`rounded-xl px-3.5 py-2.5 text-sm ${next.needsAction ? 'bg-indigo text-white' : 'bg-card'}`}>
              <div className="font-semibold">Next step: {next.next}</div>
              <div className={`mt-1 text-xs ${next.needsAction ? 'text-white/75' : 'text-muted'}`}>{next.status}</div>
            </div>
          )}
          <Facts a={a} now={now} />
          {stage === 'registered' && <MissingPanel a={a} now={now} onResult={onResult} />}
          {stage === 'accepted' && <ActivationPanel key={a.id} a={a} apps={apps} gigs={gigs} now={now} onUpdate={onUpdate} onResult={onResult} onViewAsDriver={onViewAsDriver} />}
          {stage !== 'review' && <Documents a={a} />}
          {stage === 'review' && <ReviewPanel key={a.id} a={a} now={now} onUpdate={onUpdate} onResult={onResult} />}
          <Timeline a={a} now={now} />
          <Log a={a} />
        </div>
      </aside>
    </div>
  );
}

function Facts({ a, now }: { a: Applicant; now: number }) {
  const rows: [string, ReactNode][] = [
    ['Area', a.area],
    ['Licence', `${fmtYears(a.licenceYears)} · ${a.docs.licence === 'verified' ? 'verified B' : 'not verified'}`],
    ['Owner / backup', `${a.owner ?? 'Hjalmar'} / ${a.backup ?? 'Sofia'}`],
    ['Decision deadline (48 calendar hours)', formatDateTime(a.registeredAt + 48 * 3600000)],
    ['Availability', a.availability === 'full' ? 'Full' : `Limited${a.availabilityNote ? `: ${a.availabilityNote}` : ''}`],
    ['File complete', a.docsCompleteAt ? <When ts={a.docsCompleteAt} now={now} /> : <span className="text-muted">Not yet</span>],
    ...(a.callAt ? ([['Onboarding call', <When ts={a.callAt} now={now} />]] as [string, ReactNode][]) : []),
    ...(a.source === 'self' ? ([['Source', 'Applied in the driver app']] as [string, ReactNode][]) : []),
  ];
  return (
    <DrawerSection
      title="Applicant"
      info={
        <>
          <p>The licence is checked with Transportstyrelsen and the ID with BankID.</p>
          <p className="text-muted">
            Proposed retention schedule (demo does not delete data): <RetentionText a={a} />
          </p>
        </>
      }
    >
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{k}</dt>
            <dd className="font-medium">{v}</dd>
          </div>
        ))}
      </dl>
    </DrawerSection>
  );
}

function RetentionText({ a }: { a: Applicant }) {
  const r = retention(a);
  return (
    <span>
      {r.label}
      {r.deleteAt && <span className="text-muted font-normal"> · {formatDateTime(r.deleteAt).split(',')[0]}</span>}
    </span>
  );
}

function When({ ts, now }: { ts: number; now: number }) {
  return (
    <span>
      {formatDateTime(ts)} <span className="text-muted font-normal">· {ago(ts, now)}</span>
    </span>
  );
}

function Documents({ a }: { a: Applicant }) {
  const ok = DOC_KEYS.filter((k) => ['verified', 'uploaded', 'ready'].includes(a.docs[k]) || (k === 'extract' && a.extractShown)).length;
  return (
    <CollapsibleSection title="Documents" summary={`${ok} of ${DOC_KEYS.length} in place`}>
      <ul className="divide-y divide-lavender rounded-lg border border-lavender">
        {DOC_KEYS.map((k) => (
          <li key={k} className="px-3 py-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span>{DOC_LABEL[k]}</span>
              <DocStatusPill docKey={k} status={a.docs[k]} extractShown={k === 'extract' && !!a.extractShown} />
            </div>
            {a.docNote?.[k] && <p className="mt-0.5 text-xs text-warn">{a.docNote[k]}</p>}
          </li>
        ))}
      </ul>
    </CollapsibleSection>
  );
}

function Log({ a }: { a: Applicant }) {
  const entries = [...a.log].reverse();
  return (
    <CollapsibleSection title="Decision log" summary={`${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`}>
      {entries.length === 0 ? (
        <p className="text-sm text-muted">Nothing logged yet.</p>
      ) : (
        <ol className="space-y-1.5 text-sm">
          {entries.map((e, i) => (
            <li key={i} className="flex gap-3">
              <span className="num w-36 shrink-0 text-xs text-muted pt-0.5">{formatDateTime(e.at)}</span>
              <span>{e.text}</span>
            </li>
          ))}
        </ol>
      )}
    </CollapsibleSection>
  );
}
