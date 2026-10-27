import { useEffect, useRef } from 'react';
import { ShieldCheck, X } from 'lucide-react';

const ROWS: { cockpit: string; hubspot: string; required: string; workflow: string }[] = [
  {
    cockpit: 'Missing documents',
    hubspot: 'Registered',
    required: 'Pre-qualifying answers (licence years, minimum age set by insurance, availability) · status for licence, ID, photo · extract ordered: yes/no',
    workflow: 'Nudges at +2 h, +24 h, +72 h via driver chat · a requirement not met is shown to the applicant and a human closes the file · human review of incomplete files at 14 days; check recent contact before closure',
  },
  {
    cockpit: '(automatic)',
    hubspot: 'Documents submitted',
    required: 'Licence, ID and photo in place, extract ordered (it comes by post, so the decision does not wait for it) · docs_complete_at',
    workflow: 'Auto-move to Under review · reviewer task in the next review slot (weekday blocks 09:00 / 14:00; exception before SLA breach)',
  },
  {
    cockpit: 'Review queue',
    hubspot: 'Under review',
    required: 'decision · generic reject_reason · second_reviewer for suitability rejections · decided_at · extract_shown (yes/no only) if it has arrived',
    workflow: 'Onboarding call booked by the applicant · SLA alert to owner + backup at 24 h and 48 calendar hours after registration',
  },
  {
    cockpit: 'Awaiting first gig',
    hubspot: 'Accepted',
    required: 'accept_variant (standard / simple drives first / activation flag) · extract_shown_at (yes/no only) · extract_check_at · first_gig_booked_for · activation_reason',
    workflow: 'Extract shown in a 5-minute check, by the day before the first drive, or the drive is released · matching offers after acceptance · driver reminder at 7 d without booking · call task at 14 d · dormant at 30 d',
  },
  {
    cockpit: 'Active',
    hubspot: 'Active (first gig completed)',
    required: 'first_gig_done_at · first_gig_on_time · first_gig_ok',
    workflow: 'Feeds the weekly KPI report',
  },
  {
    cockpit: 'Driver questions',
    hubspot: 'Help desk ticket (chat handover)',
    required: 'handover_reason (asked / not in articles / account / sensitive / urgent) · urgent = ongoing drive',
    workflow: 'Routed to driver ops · SLA alert at 15 min, 10 min when urgent · "not in articles" adds a knowledge-base task',
  },
  {
    cockpit: 'Rejected',
    hubspot: 'Closed (rejected)',
    required: 'reject_reason (required, generic) · decided_at · decided_by · delete_after',
    workflow: 'Top reject reasons in the weekly report · proposed delete_after: 2 years after the decision',
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
    <div className="below-present fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-0 sm:p-6">
      <div className="below-present anim-fade fixed inset-0 bg-navy/40" onClick={onClose} aria-hidden />
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

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-card p-4 text-sm">
              <h3 className="font-semibold">Proposed HubSpot setup</h3>
              <p className="mt-1 text-xs text-muted">Proposed production configuration; none is connected in this demo:</p>
              <ul className="mt-2 space-y-1 text-xs">
                <li>Pipeline stages, required fields and reason-code dropdowns</li>
                <li>Workflows for reminders, SLA alerts and tasks (the "Move time" button shows them running)</li>
                <li>Weekday review blocks at 09:00 and 14:00; four 15-minute appointments per block, with owner/backup exceptions before 48 hours</li>
                <li>Funnel and KPI reports from the timestamps</li>
                <li>The help desk inbox and ticket SLAs for questions the assistant hands over</li>
                <li>The knowledge base: the 36 help articles the assistant answers from</li>
                <li>A Monday workflow that posts the weekly report to Slack</li>
              </ul>
            </div>
            <div className="rounded-xl bg-lavender p-4 text-sm">
              <h3 className="font-semibold">Built on top</h3>
              <p className="mt-1 text-xs text-muted">What HubSpot can't do on its own:</p>
              <ul className="mt-2 space-y-1 text-xs">
                <li>
                  <strong>The driver's onboarding flow:</strong> one guided path on the phone with BankID, licence check, photo check and status
                </li>
                <li>
                  <strong>First-gig matching:</strong> needs the open jobs from the order system, matched on area, availability and an easy first drive
                </li>
                <li>
                  <strong>Decision rules:</strong> only the accept variant the written criteria allow, Operations Manager / Team Lead confirmation on suitability rejections
                </li>
                <li>
                  <strong>Self-service in the chat:</strong> actions on the driver's own file that the assistant proposes and the driver confirms,
                  checked against the live state. HubSpot's own AI agent could answer questions; it can't act on our onboarding steps
                </li>
                <li>
                  <strong>A report you can trust:</strong> numbers from the pipeline, text from the AI, and a check that every number matches
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-lavender p-4 text-sm">
            <h3 className="flex items-center gap-1.5 font-semibold">
              <ShieldCheck size={16} className="text-ok" aria-hidden /> Proposed data-handling controls
            </h3>
            <ul className="mt-2 grid gap-x-6 gap-y-1.5 text-xs sm:grid-cols-2">
              <li>
                <strong>No criminal-record data stored.</strong> Proposed control: the applicant shows an extract before the first drive. The method and handling require policy/legal validation. Only
                "extract shown: yes" is recorded. This does not certify the method's legal suitability.
              </li>
              <li>
                <strong>No traffic-offence data.</strong> Licence validity is checked with Transportstyrelsen; offences are never recorded.
              </li>
              <li>
                <strong>Humans decide.</strong> The system blocks what the written rules don't allow, but a person makes every decision.
                Suitability rejections are checked with an Operations Manager or Team Lead.
              </li>
              <li>
                <strong>Reasons can be explained.</strong> Generic reason codes, a right to an explanation and a review, answered within two
                weeks.
              </li>
              <li>
                <strong>Retention.</strong> Proposed schedule: incomplete after 6 months, rejected after 2 years. Actual deletion is not implemented in this demo.
              </li>
              <li>
                <strong>Fair criteria.</strong> Minimum age and licence years are tied to insurance and safety; the photo standard is the
                same for everyone; limited availability never rejects.
              </li>
              <li>
                <strong>Applicants are told first.</strong> Criteria, reminders, retention and their rights, before they apply.
              </li>
              <li>
                <strong>HubSpot setup.</strong> EU data centre, data processing agreement, no extracts or offence data in any field.
              </li>
              <li>
                <strong>The AI says it is an AI</strong> (AI Act art. 50), sees first name and status only, never decides, and every action it
                proposes needs the driver's tap.
              </li>
              <li>
                <strong>Tested, not assumed.</strong> A fixed set of 63 questions in several languages, with traps, is run on every prompt or
                article change.
              </li>
            </ul>
          </div>

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
