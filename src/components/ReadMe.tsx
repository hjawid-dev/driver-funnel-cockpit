import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

/** The short note for the build-it bonus (max half a page), always one click away in the header. */
export function ReadMe({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const h = 'text-xs font-semibold uppercase tracking-[0.08em] text-indigo';
  return (
    <div data-readme className="below-present fixed inset-0 z-[115] flex items-start justify-center overflow-y-auto p-0 sm:p-6">
      <div className="anim-fade fixed inset-0 bg-navy/40" onClick={onClose} aria-hidden />
      <article role="dialog" aria-modal="true" aria-labelledby="readme-title" className="anim-rise relative w-full max-w-2xl bg-white shadow-2xl sm:rounded-2xl">
        <header className="flex items-start gap-3 border-b border-lavender px-6 py-4">
          <div className="flex-1">
            <h2 id="readme-title" className="text-lg font-bold">Read me: a short note on this prototype</h2>
            <p className="text-sm text-muted">Build-it bonus · Hjalmar Widlund · start with <strong className="text-navy">Explore cases</strong> for a guided walkthrough</p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1.5 text-muted hover:bg-card hover:text-navy">
            <X size={20} />
          </button>
        </header>
        <div className="space-y-4 px-6 py-5 text-sm leading-relaxed text-navy/90">
          <section>
            <h3 className={h}>What problem it solves</h3>
            <p className="mt-1"><strong>Live Ops (Part 1):</strong> a driver stuck at a pickup should never wait 25 minutes alone. The driver reports it in the app (or has no keys 5 minutes after checking in), an AI assistant texts the site, and if it is not solved 10 minutes later, Ops takes over with a playbook: keep the driver, rule out a booking error, escalate, update the customer, decide, close. A pre-pickup check (24 hours and 1 hour before pickup) catches missing keys before arrival.</p>
            <p className="mt-1"><strong>Driver Funnel (Part 2):</strong> a few-minute application with one missing item at a time and automatic reminders; a review queue sorted by the 48-hour deadline; written criteria; first drives followed to delivery, because accepted is not active; four weekly metrics.</p>
          </section>
          <section>
            <h3 className={h}>Who uses it and when</h3>
            <p className="mt-1">The Ops owner, all day: Live Ops for pickups and incidents, Driver Funnel for the review and follow-up queues. Drivers use the phone view to apply, book a first drive and report problems. The team reads the metrics weekly.</p>
          </section>
          <section>
            <h3 className={h}>Why both parts, and why not Lovable</h3>
            <p className="mt-1">The brief asked for one tool for one part, built in Lovable or Google AI Studio. I built it with Claude Code and Codex and covered both parts, because they connect: the funnel produces the drivers Live Ops depends on. It is still what was asked for: real, clickable and showing my thinking, with the brief’s own examples inside (pre-pickup check, incident playbook, review tracker, document checklist, funnel scoreboard). I went further because I enjoyed building it.</p>
          </section>
          <section>
            <h3 className={h}>A sketch, not a finished policy</h3>
            <p className="mt-1">Numbers, thresholds and rules are my estimates to show the thinking and sketch a solution; none are validated yet. Flovi’s policies and industry best practice are not included and can be added later. Demo data only; integrations are simulated.</p>
          </section>
          <section>
            <h3 className={h}>What I would improve next</h3>
            <ol className="mt-1 list-decimal space-y-0.5 pl-5">
              <li>A complete damage-case workflow: photo evidence, follow-up and resolution.</li>
              <li>Replacement-driver assignment with availability checks and confirmed acceptance.</li>
              <li>Incident-cost tracking, to find recurring problems and cut avoidable costs.</li>
            </ol>
          </section>
        </div>
      </article>
    </div>
  );
}
