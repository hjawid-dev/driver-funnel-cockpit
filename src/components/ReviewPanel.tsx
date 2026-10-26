import { useState, type ReactNode } from 'react';
import { Camera, CircleAlert, CircleCheck, CircleX, Clock, Scale, ShieldCheck, Square, SquareCheck } from 'lucide-react';
import type { Applicant, RejectReason } from '../lib/types';
import { REJECT_REASONS } from '../lib/types';
import { CALL_AGENDA, DECISION_LABEL, evaluate, NEEDS_SECOND_REVIEWER, noteLooksSensitive, type CheckResult } from '../lib/criteria';
import { completeOnboarding, confirmSecondReview, receiveDocument, applyDecision, requestNewPhoto, setExtractShown, setPhotoApproved, type ActionResult } from '../lib/actions';
import { CollapsibleSection, DrawerSection, Proposed } from './ui';
import { InfoTip } from './InfoTip';

export const BACKUP_REVIEWER = 'Sofia (backup)';

interface Props {
  a: Applicant;
  now: number;
  preDrive?: boolean;
  onUpdate: (next: Applicant) => void;
  onResult: (r: ActionResult, close?: boolean) => void;
}

const VARIANT_HINT = {
  accepted: 'Decision checks passed; any pre-drive condition is shown on the next step.',
  accepted_simple: 'Licence 1–2 years: the driver starts on simple drives first.',
  accepted_flagged: 'Limited availability: flagged for activation follow-up.',
} as const;

/** The first sentence of a criterion's note; the rest sits behind the "?". */
const firstSentence = (s: string) => {
  const i = s.indexOf('. ');
  return i === -1 ? s : s.slice(0, i + 1);
};

export function ReviewPanel({ a, now, onUpdate, onResult, preDrive = false }: Props) {
  const ev = evaluate(a);
  const [secondConfirmed, setSecondConfirmed] = useState(false);
  const [secondName, setSecondName] = useState(BACKUP_REVIEWER);
  const [reason, setReason] = useState<RejectReason | ''>(preDrive ? 'requirements_not_met' : ev.suggestedReject ?? '');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Reject starts folded away unless the rules already point to a reason.
  const [showReject, setShowReject] = useState(preDrive || !!ev.suggestedReject);

  const photoSubmitted = a.docs.photo !== 'missing' && a.docs.photo !== 'pending';
  const extractReady = a.docs.extract === 'ready';
  const needsSecond = !!reason && NEEDS_SECOND_REVIEWER.includes(reason);
  const secondOk = !needsSecond || (!!a.secondReview && a.secondReview.reason === reason && a.secondReview.by === secondName && a.secondReview.at <= now);
  const sensitive = noteLooksSensitive(note);
  const canAccept = ev.acceptBlockedBy.length === 0 && !!a.onboardingCompletedAt && a.onboardingCompletedAt <= now;
  const canReject = !!reason && (reason !== 'other' || note.trim().length > 0) && secondOk && !sensitive;

  const run = (r: ActionResult) => {
    if (!r.ok) return setError(r.error);
    setError(null);
    onResult(r, r.applicant.decision?.type === 'rejected');
  };

  const accept = () => run(applyDecision(a, { type: ev.acceptType }, now));
  const reject = () =>
    reason && run(applyDecision(a, { type: 'rejected', reason, note, ...(needsSecond ? { secondReviewer: secondName } : {}) }, now));

  return (
    <>
      {!preDrive && <DrawerSection
        title="Criteria"
        aside={<Proposed title="My proposed written criteria, not given in the case: to agree with the team, and to check with policy and legal." />}
        info={
          <>
            <p>Thresholds are a starting proposal, to be set with the team.</p>
            <p>
              From the case: ID or personnummer, and a background check. Proposed here: BankID for the ID, and the criminal-record extract shown by the driver, never stored. The exact check, and how sensitive data is handled, must be validated with company policy and legal.
            </p>
            <p className="text-muted">
              The extract comes by post and can take two weeks, so it doesn't hold up the decision: it is shown, voluntarily, before the first drive. In this call if it has arrived, otherwise in a 5-minute check. We only look at it: no copy, no notes about its content.
            </p>
          </>
        }
      >
        <div className="rounded-lg border border-lavender">
          <div className="border-b border-lavender px-3 py-2 text-xs font-semibold text-navy">Must-have · all required</div>
          <ul className="divide-y divide-lavender">
            {ev.mustHaves.map((m) => (
              <li key={m.key} className="flex items-start gap-2.5 px-3 py-2 text-sm">
                <ResultIcon result={m.result} />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{m.label}</div>
                  <div className={`flex items-center gap-1 text-xs ${m.result === 'fail' ? 'text-bad' : 'text-muted'}`}>
                    {firstSentence(m.detail)}
                    {firstSentence(m.detail) !== m.detail && (
                      <InfoTip label={`More on ${m.label.toLowerCase()}`}>
                        <p>{m.detail}</p>
                      </InfoTip>
                    )}
                  </div>
                  {m.key === 'extract' && extractReady && (
                    <Tick checked={!!a.extractShown} onChange={(v) => onUpdate(setExtractShown(a, v, now))}>
                      Extract shown in call (nothing stored)
                    </Tick>
                  )}
                  {m.key === 'licence' && a.docs.licence === 'uploaded' && <button type="button" onClick={() => onUpdate(receiveDocument(a, 'licence', 'verified', now))} className="mt-1 text-xs font-semibold text-indigo">Log licence validity and years verified</button>}
                  {m.key === 'id' && a.docs.id === 'uploaded' && <button type="button" onClick={() => onUpdate(receiveDocument({ ...a, idMethod: 'manual' }, 'id', 'verified', now))} className="mt-1 text-xs font-semibold text-indigo">Log manual identity check completed</button>}
                  {m.key === 'photo' && photoSubmitted && (
                    <Tick checked={!!a.photoApproved} onChange={(v) => onUpdate(setPhotoApproved(a, v, now))}>
                      Photo meets the standard
                    </Tick>
                  )}
                </div>
              </li>
            ))}
          </ul>

          <div className="border-y border-lavender bg-card/60 px-3 py-2 text-xs font-semibold">Borderline · a written rule decides</div>
          {ev.borderline.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted">No borderline rule applies.</p>
          ) : (
            <ul className="divide-y divide-lavender">
              {ev.borderline.map((b) => (
                <li key={b.key} className="flex items-start gap-2.5 px-3 py-2 text-sm">
                  <Scale size={18} className="mt-0.5 shrink-0 text-warn" aria-hidden />
                  <span>{b.rule}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DrawerSection>}

      {!preDrive && <CollapsibleSection title="Onboarding call agenda" summary="15 min · 6 points">
        <ol className="space-y-1 text-sm">
          {CALL_AGENDA.map((x, i) => (
            <li key={x} className="flex gap-2">
              <span className="num w-4 shrink-0 text-muted">{i + 1}.</span>
              <span>{x}</span>
            </li>
          ))}
        </ol>
      </CollapsibleSection>}

      {!preDrive && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!a.onboardingCompletedAt} disabled={!!a.onboardingCompletedAt} onChange={() => onUpdate(completeOnboarding(a, now))} />Log onboarding call completed; ready to decide and book first drive</label>}

      <DrawerSection
        title="Decision"
        info={<p>A person makes every decision; the rules only block what is not allowed. The applicant can ask for the reason and a review, with the result within two weeks.</p>}
      >
        <div className="space-y-4">
          {/* Accept */}
          {!preDrive && <div className="rounded-lg border border-lavender p-3">
            <button
              type="button"
              disabled={!canAccept}
              onClick={accept}
              className="w-full rounded-lg bg-indigo px-4 py-2.5 text-sm font-semibold text-white hover:bg-navy disabled:cursor-not-allowed disabled:bg-lavender disabled:text-muted"
            >
              {DECISION_LABEL[ev.acceptType]}
            </button>
            {canAccept ? (
              <p className="mt-1.5 text-xs text-muted">{VARIANT_HINT[ev.acceptType]}</p>
            ) : (
              <ul className="mt-1.5 space-y-0.5 text-xs text-muted">
                {ev.acceptBlockedBy.map((b) => (
                  <li key={b}>Locked: {b}</li>
                ))}
              </ul>
            )}
          </div>}

          {/* Request new photo */}
          {!preDrive && photoSubmitted && (
            <button
              type="button"
              onClick={() => run(requestNewPhoto(a, now))}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-lavender px-4 py-2 text-sm font-semibold hover:border-indigo hover:text-indigo"
            >
              <Camera size={16} aria-hidden /> Request new photo
            </button>
          )}

          {/* Reject */}
          {!showReject ? (
            <button
              type="button"
              onClick={() => setShowReject(true)}
              className="w-full rounded-lg px-4 py-2 text-sm font-semibold text-muted hover:bg-bad-bg hover:text-bad"
            >
              Reject…
            </button>
          ) : (
          <div className="rounded-lg border border-lavender p-3 space-y-2">
            <label className="block text-xs font-semibold" htmlFor="reject-reason">
              Reject with reason code
            </label>
            <select
              id="reject-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value as RejectReason | '')}
              className="w-full rounded-md border border-lavender bg-white px-2 py-2 text-sm"
            >
              <option value="">Choose a reason…</option>
              {REJECT_REASONS.map((r) => (
                <option key={r.value} value={r.value} disabled={r.value === 'no_response_14d'}>
                  {r.label}
                  {r.value === 'no_response_14d' ? ' (incomplete files only)' : ''}
                  {r.value === ev.suggestedReject ? ' · suggested' : ''}
                </option>
              ))}
            </select>

            {needsSecond && (
              <div className="rounded-md bg-warn-bg p-2.5 text-sm">
                <p className="font-semibold text-warn">Suitability rejections are decided by owner + backup together</p>
                <label className="mt-2 flex items-center gap-2">
                  <input type="checkbox" checked={secondConfirmed} onChange={(e) => { setSecondConfirmed(e.target.checked); if (e.target.checked && reason) onUpdate(confirmSecondReview(a, reason, secondName, now)); }} className="h-4 w-4 accent-indigo" />
                  Confirm as backup reviewer (demo role): separate logged check
                </label>
                <label className="mt-2 flex items-center gap-2 text-xs">
                  <span className="text-muted">Backup reviewer</span>
                  <input
                    value={secondName}
                    onChange={(e) => setSecondName(e.target.value)}
                    className="min-w-0 flex-1 rounded-md border border-lavender bg-white px-2 py-1 text-sm"
                  />
                </label>
              </div>
            )}

            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder={reason === 'other' ? 'Note (required for Other). Never write anything from the extract.' : 'Note (optional). Never write anything from the extract.'}
              aria-label="Note"
              aria-invalid={sensitive}
              className={`w-full rounded-md border px-2 py-1.5 text-sm ${sensitive ? 'border-bad' : 'border-lavender'}`}
            />
            {sensitive && (
              <p role="alert" className="flex items-start gap-1.5 text-xs text-bad">
                <ShieldCheck size={14} className="mt-0.5 shrink-0" aria-hidden />
                This looks like offence details. Criminal-record data may not be stored: remove it and use the reason code.
              </p>
            )}
            <button
              type="button"
              disabled={!canReject}
              onClick={reject}
              className="w-full rounded-lg border border-bad px-4 py-2 text-sm font-semibold text-bad hover:bg-bad hover:text-white disabled:cursor-not-allowed disabled:border-lavender disabled:text-muted disabled:hover:bg-transparent"
            >
              Reject
            </button>
          </div>
          )}

          {error && (
            <p role="alert" className="rounded-md bg-bad-bg px-3 py-2 text-sm text-bad">
              {error}
            </p>
          )}
        </div>
      </DrawerSection>
    </>
  );
}

function Tick({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="mt-1.5 inline-flex cursor-pointer items-center gap-2 rounded-md bg-card px-2 py-1 text-xs font-semibold">
      <input type="checkbox" className="sr-only peer" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {checked ? <SquareCheck size={16} className="text-indigo" aria-hidden /> : <Square size={16} className="text-muted" aria-hidden />}
      <span className="peer-focus-visible:underline">{children}</span>
    </label>
  );
}

function ResultIcon({ result }: { result: CheckResult }) {
  const cls = 'mt-0.5 shrink-0';
  if (result === 'pass') return <CircleCheck size={18} className={`${cls} text-ok`} aria-label="Pass" />;
  if (result === 'fail') return <CircleX size={18} className={`${cls} text-bad`} aria-label="Fail" />;
  if (result === 'borderline') return <CircleAlert size={18} className={`${cls} text-warn`} aria-label="Borderline" />;
  if (result === 'later') return <Clock size={18} className={`${cls} text-indigo`} aria-label="Before the first drive" />;
  return <CircleAlert size={18} className={`${cls} text-muted`} aria-label="Needs manual check" />;
}
