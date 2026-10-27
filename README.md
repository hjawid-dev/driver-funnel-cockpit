# Driver Funnel Cockpit

A clickable prototype for the Flovi Operations Specialist case, built by Hjalmar Widlund with Claude Code and Codex. Fictional data; external services, calls, verification and compensation are simulated.

**Live:** https://driver-funnel-cockpit.vercel.app

## Case 1: Live Ops

Exceptions first. Julia's pickup opens at Tuesday 09:30: 25 minutes waiting, no keys, no contact, delivery due 12:00. The playbook keeps the driver informed, checks our booking, escalates to the pickup contact/backup and updates the customer and internal pilot account owner.

Ops recommends a feasible next step and logs the confirmed choice. If the customer is unreachable, an Ops stop requires confirmed duty-lead authority. Resolution and delivery are separate. Replacement booking requires customer-agreed pickup **and delivery** plus confirmation that the driver is available; a replacement first drive stays linked to activation.

Prevention confirms contact, backup and key location at booking, then at T−24 h and T−60 min. Calls happen only on missing replies. Short-notice bookings get one immediate confirmation. A reported problem is immediate; a normal check-in without a key update gets a five-minute grace period before the assistant checks in.

## Case 2: Driver Funnel

The candidate queue keeps **Next step**, urgency and missing items visible. A named owner and backup work the whole registration-to-decision clock, including document collection. At 24 hours, missing documents require personal follow-up. Standard calls use two weekday review blocks (09:00 and 14:00), four 15-minute appointments each; owner/backup must arrange exceptions when these cannot meet the 48-calendar-hour target. Open incomplete cases still count as SLA misses, not as decisions.

Written checks cover licence, identity and photo. Proposed experience tiers are minimum 1 year, 1 to <2 years simple drives first, and ≥2 years standard. All demo first drives are easy standard-car routes; later progression is not automated. Other suitability grounds require an agreed Flovi policy and Operations Manager / Team Lead review. Ordering the proposed extract does not block acceptance; showing it is required before driving.

Drivers self-book matching jobs. No booking: a reminder at 7 days and Ops contact at 14 days. Actual blockers take precedence: no fitting work is an owner task; an extract still in the post cannot have its check booked yet. Contact outcomes change the next action. A booked drive without delivery stays operational work; a released reservation leaves the customer transport visible as unassigned.

At 14 days, an incomplete application gets a **human review**, not a claim that the driver has not responded. Check recent replies/progress before closing; keep engaged applicants open. Administrative closure is distinct from a suitability rejection.

## Measure and improve

Four primary metrics:
- **Application → active:** first delivery within 30 days of registration among registrations with 30+ days of follow-up; all mature history. Pilot target 35%; case cohort baseline unknown.
- **Documents within 7 days:** mature registrations; pilot target 85%. The case's ~70% has no defined completion window.
- **Mean decision time:** registration to first human decision, comparable to the case's six-day mean and 48-hour target. Median, share within 48 h and open overdue work remain available.
- **Activation within 14 days:** initial acceptances with 14+ days of follow-up; pilot target 75%, based on completed drives.

Acceptance, first-drive delivery outcome and the monthly flow ratio sit under **Guardrails and throughput**. Delivery outcome uses the original deadline, incident status and assessed customer feedback; customer-caused incidents are not driver fault. Unknown feedback stays unknown. The 95% outcome guardrail is a pilot hypothesis. Monthly new active ÷ applications is throughput across different people, not conversion or a target.

Weekly: identify a blocker, choose one process change and compare appropriate outcomes. The report has numerical checks, not a guarantee that its interpretation is correct. No business improvement is claimed from demo actions. No driver-capacity or recruitment conclusion is drawn from a fixed jobs-per-driver ratio. AI answer share is diagnostic, with no 95% automation target.

## Case facts and policy proposals

Case facts include 120 applications/25 active per month, ~30% incomplete documents, six-day mean registration-to-decision, the 48-hour target, required documents and the supplied pickup facts.

Proposals requiring Flovi validation: 35/85/75% pilot targets and cohort windows; licence/age thresholds (20 is an example, not verified insurance policy); background-check method and handling including video; reminders at 2/24/72 h; 14-day incomplete-file review; review blocks and exception coverage; day-7/day-14 follow-up, a 3-day retry after an unsuccessful call and monthly dormant review; the 10:15 decision point based on assumed 50-minute driving time, 15-minute handover and 5-minute margin; confirmation reply windows; staffing/service levels; compensation rates/half-reward cancellation proposal, fee-waiver authority and retention periods (6 months incomplete, 2 years rejected/closed). No deletion is implemented.

Five days before a conditional first booking is a planning floor, **not a guarantee of extract arrival**. The proposed extract may take two weeks to process plus post, longer in some international cases. Only an arrived extract can have a check booked; about five minutes of conversation reserves a 15-minute appointment. The proposed 24-hour release deadline protects a reassignment opportunity, not a guarantee of replacement capacity.

## Explore the demo

**Explore cases** starts an eleven-step user walkthrough with fresh data. Each step links a problem to its solution and a normal control. A focus border and scroll point to the relevant area. The guide does not accept, book, deliver or invent customer replies. Navigation stays free; completion and prerequisites say what actually happened. Step 5 starts a blank application; Ahmed remains the same person from review through first delivery. Ida and Anton are explicit separate blocker examples. The optional weekly report and HubSpot mapping are supporting detail, not extra required demo steps.

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
