# Driver Funnel Cockpit

A clickable prototype for the company interview case (Operations Specialist, Stockholm), built by Hjalmar Widlund with Claude Code and Codex. It covers both parts of the case in one tool, because they connect: the driver funnel produces the drivers that live operations depend on.

**Live:** https://driver-funnel-cockpit.vercel.app · start with **Explore cases** for a guided walkthrough, or open **Read me** in the header for the short note.

## Case 1 · Live Ops: driver stuck at pickup

- **Driver app:** the driver checks in and reports a problem in one tap. A fixed, pre-approved text goes to the pickup contact and backup; the AI assistant answers at once and never decides.
- **Ops takeover:** if it is not solved within 10 minutes, Ops gets the incident with a six-step playbook: keep the driver, rule out our own error, escalate, update the customer, decide, close the loop.
- **Decision clock:** the decision point is worked back from the delivery deadline (12:00 − 50 min drive − 15 min handover − 5 min margin = 10:50, minus 35 min = 10:15). With no decision by then, the drive is cancelled by default and the driver's wait is paid.
- **Prevention:** contact, backup and key location are required at booking, then confirmed 24 h and 1 h before pickup. Ops only calls when a reply is missing.

## Case 2 · Driver Funnel: application to active

- **Application:** four questions and one missing item at a time. The police extract never blocks booking the onboarding call.
- **Follow-up:** reminders at 2 h, 24 h and day 7 (never 20:00–09:00), then one call from the owner. Files still incomplete at 14 days are paused, not rejected.
- **48-hour decisions:** a queue sorted by deadline, a 15-minute video call booked by the applicant, and fixed call times including weekends.
- **Written criteria:** the review only offers the decision the rules allow, for example "simple drives first" for licences held 1–2 years.
- **Activation:** accepted drivers book a matching first drive themselves. Ops follows it to delivery, because accepted is not active.
- **Metrics:** application-to-active (north star), documents within 7 days, mean decision time and activation within 14 days, with acceptance and first-drive outcome as guardrails. A weekly report is checked number by number.

## Also included

- A driver chat assistant (Claude) that answers from 40 help articles, proposes actions the driver confirms, and hands over to a person. An 85-question eval with traps runs with `npm run eval`.
- A HubSpot mapping of every stage, field and workflow, plus proposed data-handling controls (no criminal-record data stored, generic reason codes, retention schedule).

## Assumptions

Targets, thresholds, timings and compensation are my proposals to show the thinking. None are validated against the company's policies, insurance or legal review. All data is fictional, and calls, texts, BankID and HubSpot are simulated.

## Run

```
npm install
npm run dev
npm test
npm run build
npm run eval  # needs ANTHROPIC_API_KEY
```

React, TypeScript, Vite and Tailwind. Demo data lives in the browser; `main` deploys to Vercel.
