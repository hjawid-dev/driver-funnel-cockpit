# Driver Funnel Cockpit

A clickable prototype for the Flovi Operations Specialist case, built by Hjalmar Widlund with Claude Code and Codex. Fictional data; external services, calls, verification and compensation are simulated.

**Live:** https://driver-funnel-cockpit.vercel.app

## Case 1: Live Ops

Exceptions first. Julia's pickup opens at Tuesday 09:30: 25 minutes waiting, no keys, no contact, delivery due 12:00. The playbook keeps the driver informed, checks our booking, escalates to the pickup contact/backup and updates the customer and internal pilot account owner.

Ops recommends a feasible next step and logs the confirmed choice. If the customer is unreachable, an Ops stop requires confirmed duty-lead authority. Resolution and delivery are separate. Replacement timing requires customer-agreed pickup **and delivery**. Same-driver confirmation is optional: otherwise a separate unassigned transport stays visible with an owner. The incident can close while that transport remains open. A confirmed same-driver replacement preserves first-drive tracking.

Prevention confirms contact, backup and key location at booking, then at T−24 h and T−60 min. Calls happen only on missing replies. Short-notice bookings get one immediate confirmation. A reported problem starts AI support immediately; Ops calls by 10 minutes from that report if unresolved (earlier for safety/deadline risk). Escalation never starts a second countdown. A normal check-in without a key update gets five minutes for handover before the assistant checks in.

## Case 2: Driver Funnel

The candidate queue keeps **Next step**, urgency and missing items visible. A named owner and backup work the whole registration-to-decision clock, including document collection. At 24 hours, missing documents require personal follow-up. Standard calls use two weekday review blocks (09:00 and 14:00), four 15-minute appointments each; owner/backup must arrange exceptions when these cannot meet the 48-calendar-hour target. Open incomplete cases still count as SLA misses, not as decisions.

Written checks cover licence, identity and photo. Proposed experience tiers are minimum 1 year, 1 to <2 years simple drives first, and ≥2 years standard. All demo first drives are easy standard-car routes; later progression is not automated. Other suitability grounds require an agreed Flovi policy and Operations Manager / Team Lead review. Ordering the proposed extract does not block acceptance; showing it is required before driving.

Drivers self-book matching jobs. Ready drivers without a booking receive a reminder at day 7 and Ops contact at day 14 after acceptance. These are separate from the three pre-decision document nudges (2/24/72 h); outstanding extracts use the pre-drive-check flow. Actual blockers take precedence: no fitting work is an owner task; an extract still in the post cannot have its check booked yet. Contact outcomes change the next action. A booked drive without delivery stays operational work; a released reservation leaves the customer transport visible as unassigned.

At 14 days, an incomplete application gets a **human review**, not a claim that the driver has not responded. Check recent replies/progress before closing; keep engaged applicants open. Administrative closure is distinct from a suitability rejection.

## Measure and improve

Four primary metrics:
- **New active ÷ applications:** new active drivers divided by new applications in the last 30 days. Target 35%; the case's monthly flow is 25/120 ≈21%. This compares monthly flows, not the conversion of the same applicants.
- **Documents within 7 days:** mature registrations; pilot target 85%. The case's ~70% has no defined completion window.
- **Mean decision time:** registration to first human decision, comparable to the case's six-day mean and 48-hour target. Median, share within 48 h and open overdue work remain available.
- **Activation within 14 days:** initial acceptances with 14+ days of follow-up; pilot target 75%, based on completed drives.

Acceptance, first-drive delivery outcome and mature-cohort conversion sit under **Guardrails and cohort detail**. Delivery outcome uses the original deadline, incident status and assessed customer feedback; customer-caused incidents are not driver fault. Unknown feedback stays unknown. The 95% outcome guardrail is a pilot hypothesis. Mature-cohort conversion is first delivery within 30 days among registrations aged 30+ days. It is a supporting diagnostic without a target; 35% belongs only to the monthly flow KPI.

Weekly: identify a blocker, choose one process change and compare appropriate outcomes. The report has numerical checks, not a guarantee that its interpretation is correct. No business improvement is claimed from demo actions. No driver-capacity or recruitment conclusion is drawn from a fixed jobs-per-driver ratio. AI answer share is diagnostic, with no 95% automation target.

## Case facts and policy proposals

Case facts include 120 applications/25 active per month, ~30% incomplete documents, six-day mean registration-to-decision, the 48-hour target, required documents and the supplied pickup facts.

Proposals requiring Flovi validation: 35/85/75% pilot targets and cohort windows; licence/age thresholds (20 is an example, not verified insurance policy); background-check method and handling including video; reminders at 2/24/72 h; 14-day incomplete-file review; review blocks and exception coverage; day-7/day-14 follow-up, a 3-day retry after an unsuccessful call and monthly dormant review; the 10:15 decision point based on assumed 50-minute driving time, 15-minute handover and 5-minute margin; confirmation reply windows; staffing/service levels; compensation rates/half-reward cancellation proposal, fee-waiver authority and retention periods (6 months incomplete, 2 years rejected/closed). No deletion is implemented.

Five days before a conditional first booking is a planning floor, **not a guarantee of extract arrival**. The proposed extract may take two weeks to process plus post, longer in some international cases. Only an arrived extract can have a check booked; about five minutes of conversation reserves a 15-minute appointment. The proposed 24-hour release deadline protects a reassignment opportunity, not a guarantee of replacement capacity.

## Explore the demo

**Explore cases** starts a user walkthrough with fresh data. Four Case 1 chapters cover Report & AI, Ops takeover, Decision & closure and Prevention. Five Case 2 chapters cover Documents, Decision within 48h, First drive, Follow-up and Measure. All sixteen underlying steps remain accessible under **All steps**. The guide is one fixed panel at the top left, the same in every step: process chapters, a short problem/solution explanation, one line saying what to do next, and Continue at the bottom. On wide screens it is a column and the app moves right, so it never covers a control. Each state lights a whole section to read (the open playbook card, the phone screen, the criteria and decision, Ahmed’s pickup row and job) and rings the one control to use; the section stays still while the ring moves inside it. One shade covers the rest of the app in every step, measured every frame so drawers and accordions stay aligned; drawers do not add a second shade, and app confirmations appear in the guide instead of floating toasts. The page scrolls only when the lit section is out of view. The guide moves on by itself only inside Julia’s incident, where the view stays the same; elsewhere it stays on the result until Continue. Saved actions advance the guide without scrolling back to the top. The new applicant stays on their own onboarding-call confirmation until choosing Continue. Ida’s actual day-7 message is framed until the user continues to Anton. The pickup example targets the missing-keys choice directly, then uses the ten-minute demo clock without a Still waiting button. Longer explanations sit under **Why this matters**.

Case 1 is a labelled solution replay from arrival at 09:05, with phone and Live Ops side by side; the original brief remains a separate 09:30 call after 25 minutes waiting. A pickup solved before human takeover skips unnecessary escalation and explains the transition to prevention. Reset demo restarts at the first step. Manual follow-up shows an inline receipt before advancing; reports show loading immediately. The guide never accepts, books, delivers or invents replies. Registration is saved separately from document-checklist completion. Ahmed remains the same person from review through first delivery; Nora, Ida and Anton are separate examples. The full funnel dashboard stays open during the walkthrough. Driver questions always shows Help content gaps and The assistant this week as open sections. The four metrics conclude the walkthrough; the weekly report and HubSpot mapping are optional detail.

## Run

```
npm install
npm run dev
npm test
npm run build
npm run eval  # AI evaluations; requires ANTHROPIC_API_KEY
```

React, TypeScript, Vite and Tailwind. GitHub main deploys through Vercel. Browser-local demo data has no production backend.

[Submission note](docs/submission-note.md) · [Domain and metric definitions](docs/case-consistency.md) · [Audit resolution](docs/case-audit-resolution.md)

**Submission boundary:** the brief names Lovable or Google AI Studio; this prototype was built with Claude Code/Codex. Acceptance of that platform choice must be confirmed with the reviewer; no alternative-platform build is claimed.
