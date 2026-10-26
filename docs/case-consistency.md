# Case consistency: implementation and verification

Implemented locally on 26 October 2026 from Lite commit `39a498f62c07157fad62bbd3ca6034a425c87a7b`. This is the same application and visual system, with corrected domain rules and supporting controls.

## Changes against the review

| Review items | Implemented behavior |
|---|---|
| 01 | Decision queue, missing-document escalation and automatic SLA alerts use 48 calendar hours from registration. Internal review time is separate. Call booking warns when available times miss the target. |
| 02–03 | Extract ordered first. Ordered extracts do not block the call. BankID and a reviewer-verified manual ID route are both supported; driver help and reminder text use the same process. |
| 04–05 | First document submission and initial decisions are preserved. Resubmission does not rewrite earlier throughput. A prequalifying rejection does not invent document completion. |
| 06–07 | Pending stages are not labelled lost. Document completion is explicitly defined as completion within seven calendar days among mature registrations. Each metric states its population/window. |
| 08 | Acceptance and first-drive quality are visible guardrails; the report includes review-rejection reasons and separates prequalifying exits. |
| 09–10 | Explicit logged onboarding, licence verification and a distinct Operations Manager / Team Lead confirmation are required. Accepted candidates can receive a later generic pre-drive rejection. No extract content is collected. |
| 11–14 | Ops, driver and chat booking share matching/eligibility checks and reservations. Rebooking selects another real job. Structured availability distinguishes weekends from weekday evenings. Completion requires a matching booked job and chronological delivery evidence. |
| 15 | Current booking takes precedence over stale activation reasons. Available jobs are not described as proven offers or declines. Automated copy does not promise three jobs. Reserved jobs are excluded from open demand. |
| 16–18 | Dispatch readiness validates contacts, key location and pre-drive checks. T−24 and T−60 phone confirmations are separate. Missing keys are visible on check-in. The feed does not claim a contact text without the appropriate send action. |
| 19–20 | Own-error branch records corrections. Customer copy follows the reported problem. Customer-update due time is retained; the decision step takes priority at the cut-off. Departure after the original cut-off requires a feasible revised agreement. |
| 21–23 | Rescheduling leaves an owned task and creates a linked replacement transport. Incident resolution and transport completion are separate. Waiting time freezes at resolution. Pilot account update and a scheduled booker review are required before closure. Compensation is explicitly a demo confirmation, not a payment integration. |
| 24–25 | A reported problem cannot become incident-free by lacking an incident object. Customer feedback can be unknown; quality shows assessed drives and pending feedback separately. Future timestamps are excluded from current KPI windows. Job delivery and applicant activation update together. |
| 26 | Automatic notifications are materialized once with their text/timestamp. Reload preserves history; it no longer rebases old timestamps. First submission, booking, release, decision and completion have structured events. |
| 27 | Mean decision time, share within 48 hours and a mature 30-day registration cohort conversion are included in reporting; the separate 30-day flow remains. |
| 28–29 | A short submission note is provided. Retention and integrations are described as proposed/simulated. The AI report badge describes numerical validation and its limits, without claiming full semantic verification. |

## Metric definitions

- **North star:** first completed drives in the last 30 days divided by registrations in the same period, with an upper bound at the simulation clock. This is flow, not cohort conversion.
- **Document completion:** first submission within seven calendar days, among applicants registered at least seven days ago. All mature history is used; this is a proposed measurement window, not a case fact.
- **Decision time:** registration to the initial human decision. Median is shown with the mean; administrative no-response closure is excluded. The internal document-to-decision duration remains separate.
- **Acceptance:** initial acceptances divided by reviewed initial decisions. A later pre-drive rejection does not erase the initial acceptance. Early prequalifying exits are separate.
- **Activation:** completed first drive within 14 days of initial acceptance, among acceptances with at least 14 days of follow-up.
- **Quality:** on-time, incident-free first deliveries with confirmed customer satisfaction, divided by deliveries whose feedback has been assessed. Uncollected feedback is counted separately and never assumed positive.
- **Cohort conversion:** active within 30 days of registration among registrations with at least 30 days of follow-up, shown separately in the report.

## Verification

Run `npm test` and `npm run build`. New `caseConsistency.test.ts` cases cover the findings, including returned documents, prequalifying exits, later rejection, unavailable jobs, structured availability, future completion, separate pickup checks, late departure, replacement transport and immutable notifications. Existing tests were updated where their former expectations explicitly encoded the defects.

Browser verification covers: disabled acceptance until checks/call are logged; acceptance leading directly to real-job booking; booking without activation; timed incident closure; rebooking retained in attention; replacement job creation.

## Demo scope and remaining external work

- External calls, SMS, BankID/manual checks, account-owner contact, review bookings and compensation are simulated/logged. No live customer messages or payments were sent.
- The consulted Operations Manager / Team Lead is an explicitly labelled demo role, not a separate authenticated account. Real identity/authorization and cross-device reservation transactions require a backend.
- Data model version 9 resets older demo saves; it does not migrate them. Subsequent version-9 reloads preserve absolute history. Use Reset demo in the demo menu to explicitly start a new scenario.
- The accompanying Google Slides update distinguishes the 59-volume gap from identified lost individuals, uses a comparable mean decision time, defines proposed cohort windows and labels the ~46 scenario as illustrative.
- The brief's platform wording should be clarified with the interviewer; the submission note accurately names the tools used. No rebuild in another platform was performed.
- Live AI/model credentials and real integrations were not certified by these frontend/domain tests. Existing numerical report checks remain limited to numbers; generated interpretation should still be reviewed.
- Published from the reviewed Lite source. Production verification is recorded separately after deployment.
