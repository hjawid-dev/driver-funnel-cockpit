import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

const ROWS: { cockpit: string; hubspot: string; required: string; workflow: string }[] = [
  {
    cockpit: 'Missing documents',
    hubspot: 'Registered',
    required: 'Knock-out answers (licence years, age, Stockholm availability) · status per document: licence, ID, background, photo',
    workflow: 'Nudges at +2 h, +24 h, +72 h via driver chat · task "no response 14 days" → close with reason code',
  },
  {
    cockpit: '(automatic)',
    hubspot: 'Documents submitted',
    required: 'All four document statuses set · docs_complete_at',
    workflow: 'Auto-move to Under review · reviewer task in the next review slot (09:00 / 14:00)',
  },
  {
    cockpit: 'Review queue',
    hubspot: 'Under review',
    required: 'decision · reject_reason (Other needs a note) · second_reviewer if minor violation · decided_at',
    workflow: 'SLA alert to owner + backup at 24 h and 48 h after docs complete',
  },
  {
    cockpit: 'Awaiting first gig',
    hubspot: 'Accepted',
    required: 'accept_variant (standard / simple drives first / activation flag) · welcome_call_at · first_gig_booked_for',
    workflow: 'Welcome-call task due 24 h after acceptance · alert at 7 d without booking · call task at 14 d · dormant at 30 d',
  },
  {
    cockpit: 'Active',
    hubspot: 'Active (first gig completed)',
    required: 'first_gig_done_at · first_gig_on_time · first_gig_ok',
    workflow: 'Feeds the weekly KPI report',
  },
  {
    cockpit: 'Rejected',
    hubspot: 'Closed (rejected)',
    required: 'reject_reason (required) · decided_at · decided_by',
    workflow: 'Top reject reasons in the weekly report: tells us if pre-qualifying works',
  },
];

export function HubspotModal({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
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
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-0 sm:p-6">
      <div className="anim-fade fixed inset-0 bg-navy/40" onClick={onClose} aria-hidden />
      <div role="dialog" aria-modal="true" aria-labelledby="hs-title" className="anim-rise relative w-full max-w-4xl bg-white sm:rounded-2xl shadow-2xl min-h-full sm:min-h-0">
        <header className="flex items-start gap-3 border-b border-lavender px-5 py-4">
          <div className="flex-1">
            <h2 id="hs-title" className="text-lg font-bold">
              How this maps to HubSpot
            </h2>
            <p className="text-sm text-muted">In production this cockpit sits on top of the HubSpot pipeline. The prototype simulates it in the browser.</p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1.5 text-muted hover:bg-card hover:text-navy">
            <X size={20} />
          </button>
        </header>

        <div className="px-5 py-4">
          <div className="hidden md:block overflow-hidden rounded-xl border border-lavender">
            <table className="w-full text-sm">
              <thead className="bg-card text-left text-xs text-muted">
                <tr>
                  <th className="px-3 py-2 font-semibold w-36">Cockpit</th>
                  <th className="px-3 py-2 font-semibold w-40">HubSpot stage</th>
                  <th className="px-3 py-2 font-semibold">Required to move on</th>
                  <th className="px-3 py-2 font-semibold">Workflows</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((r) => (
                  <tr key={r.hubspot} className="border-t border-lavender align-top">
                    <td className="px-3 py-2.5 font-semibold">{r.cockpit}</td>
                    <td className="px-3 py-2.5">
                      <span className="rounded-md bg-lavender px-1.5 py-0.5 text-xs font-semibold">{r.hubspot}</span>
                    </td>
                    <td className="px-3 py-2.5 text-xs">{r.required}</td>
                    <td className="px-3 py-2.5 text-xs">{r.workflow}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="md:hidden space-y-2">
            {ROWS.map((r) => (
              <li key={r.hubspot} className="rounded-xl border border-lavender p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{r.cockpit}</span>
                  <span className="text-muted">→</span>
                  <span className="rounded-md bg-lavender px-1.5 py-0.5 text-xs font-semibold">{r.hubspot}</span>
                </div>
                <p className="mt-1.5 text-xs">
                  <span className="text-muted">Required: </span>
                  {r.required}
                </p>
                <p className="mt-1 text-xs">
                  <span className="text-muted">Workflows: </span>
                  {r.workflow}
                </p>
              </li>
            ))}
          </ul>

          <div className="mt-4 rounded-xl bg-navy p-4 text-sm text-white">
            <strong className="text-green">The rule:</strong> every exit from a stage writes a timestamp, and every rejection writes a reason code. That
            is what makes the six metrics measurable. Today nobody knows where the ~59 applicants between "submitted" and "active" disappear; with this,
            the cockpit answers it every morning.
          </div>
        </div>
      </div>
    </div>
  );
}
