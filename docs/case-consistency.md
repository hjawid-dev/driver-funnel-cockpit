# Case consistency: current rules

The 27 October audit corrections supersede earlier implementation notes.

## Funnel

- Registration-to-decision is 48 calendar hours, including document collection. Owner/backup contacts missing files from 24 h and arranges exceptions if weekday blocks cannot meet the deadline. No clock reset and no fabricated decision on an incomplete file.
- Two weekday review blocks, each four 15-minute appointments. Extract checks use the same reservation duration; five minutes is an estimated conversation length.
- Licence minimum 1 year; 1 to <2 simple-drive tier; ≥2 standard tier. All first-drive offers are easy standard cars. Thresholds, example age 20 and other suitability grounds require policy/insurance approval; manager consultation does not replace criteria.
- Background check method, authenticity and handling (including video) are proposed, not certified by no-copy/voluntary wording. No extract contents are stored.
- At 14 days, incomplete files receive human review. The internal legacy reason key `no_response_14d` now labels administrative incomplete-file closure, not proven silence. Check recent contact before closing.
- First booking is conditional until the check is complete. Five-day offer lead is not a postal promise. Release at T−24 h leaves an unassigned customer job visible; reassignment is not guaranteed.
- Day-7/day-14 activation tasks require accepted, ready-to-drive applicants with no booking or delivery. Outstanding extracts are handled separately, not with document nudges after acceptance. The three 2/24/72 h document nudges apply before decision.
- Driver books independently. Blocker-specific next actions precede day-based reminders. A logged unsuccessful attempt has a proposed three-day retry; a logged decline is not another uncompleted call. Future booking, passed undelivered job and completed first drive are different states.

## Live Ops

- Reported problems are immediate; ordinary arrival has five minutes for the key update before assistant intervention, then up to ten assistant minutes before human escalation. An explicit report starts its own immediate AI support with an Ops call due by report +10 minutes, earlier for safety/deadline risk; escalation never restarts the clock.
- Standard confirmations T−24 h/T−60 min, calls only on missing replies. Short-notice bookings get one immediate confirmation with a bounded reply deadline.
- Decision time is a planning estimate from assumed drive/hand-over/buffer values, not a guarantee. Recommend a feasible choice. An unreachable customer escalates to the duty lead; only confirmed authority permits recording an Ops stop.
- Resolution differs from delivery. Replacement timing requires customer-agreed pickup and delivery deadline; same-driver confirmation is optional. Without it, the replacement remains unassigned with an owner and the original incident may close. A confirmed same-driver first drive updates the applicant's booked-job link; an unassigned replacement releases that link.
- Pilot incidents require an account-owner update and a scheduled booker review. Other incidents can close with compensation, cause and an owner for asynchronous follow-up; a meeting is optional.
- Waiting compensation, half-reward cancellation payment and incident-fee waiver are proposed policies, not payment integrations or a validated tariff. Waiver is not preselected.

## Metrics

- Primary KPI: new active drivers / new applications in the last 30 days, target 35%. Case monthly flow baseline 25/120 ≈21%. It compares flows, not the same applicant cohort.
- Documents: first submission within seven days / mature registrations. Initial submission history survives complements.
- Decision: mean registration → first human decision; median and within-48 h remain available. Administrative incomplete-file closure is excluded. Open overdue cases remain visible.
- Activation: first delivery within 14 days / initial acceptances aged 14+ days. Booking never activates.
- Supporting metrics: acceptance; original-deadline/no-incident/satisfied delivery outcome among assessed feedback (unknown stays unknown); mature-cohort conversion (first delivery within 30 days / registrations aged 30+ days), without a target. No driver-blame inference from customer incidents.
- No AI-resolution target, fabricated forecast or jobs-per-driver recruitment recommendation. Weekly report separates flows, all-history levels and current queues; numerical validation does not certify interpretation.

## Demo

The guide uses a separately labelled solution replay from arrival, report → AI → Ops by report +10 minutes → each playbook action → close → prevention. Original brief timestamps and facts are retained separately. Guide navigation does not carry out business actions.

## Verification and boundaries

Run `npm test` and `npm run build`; audit regression tests cover the new failure paths. External messaging, verification, reviews, compensation and HubSpot remain simulated. Authenticated approvals and live transactional dispatch require production systems. No production readiness or policy approval is claimed. Existing demo history is preserved; no data-model reset is needed.

The platform choice differs from the brief and requires reviewer acceptance. Retention periods are proposals; deletion is not implemented.
