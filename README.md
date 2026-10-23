# Driver Funnel Cockpit

A clickable prototype of both sides of a driver onboarding funnel in a gig-driver operation, from application to first completed drive:

- **The driver's phone:** one guided path to finish the application in about ten minutes, book your own call, and pick an easy first drive.
- **An AI assistant in the driver chat:** answers from the help articles, hands over to a person when it should, and lets the driver book a call, mark the extract or pause reminders with one tap.
- **The ops cockpit:** a review queue with written rules, a document checklist, an activation list, the driver questions the AI handed over, and a funnel scoreboard.
- **Automation between them:** reminders, SLA alerts, call reminders, tasks, and a weekly report that writes itself. A "Move time" button shows them running.

Demo data only, no real people. Built by Hjalmar Widlund with Claude Code.

**Live:** https://driver-funnel-cockpit.vercel.app · **Code:** https://github.com/hjawid-dev/driver-funnel-cockpit

Every push to `main` deploys automatically through Vercel.

---

## The problem it addresses

A typical driver funnel loses most applicants somewhere between registration and the first drive. Many never finish their documents, decisions are slow, criteria are unwritten so borderline cases depend on who reviews them, and accepted drivers often never take a first gig. Drivers wait for answers to simple questions, and nobody can say where people drop out.

Three changes attack the leaks:

1. **Make finishing easy** (unfinished documents). The driver gets one step at a time on the phone, with BankID, an instant photo check and a guide for the criminal-record extract. Reminders arrive in the chat, where one tap answers them.
2. **Decide in one call** (slow decisions). The driver books a 15-minute call, or asks the assistant to book or move it, shows the extract, and gets the decision in the call.
3. **Offer the first drive at once** (activation gap). On acceptance the driver sees three easy jobs near them that fit their availability, and picks one with a tap.

Underneath, **every action writes a timestamp or a reason code**, so the funnel is measurable as a by-product of the work, and the **weekly report** turns those numbers into a short update for the team.

## Who uses it, and when

| Who | When | What they do |
|---|---|---|
| Applicant | Any time, on their phone | Applies, asks the assistant, books the call, picks a first drive |
| Driver ops owner | Two fixed review slots a day (09:00 and 14:00), and the chat queue | Holds the extract calls and decides, answers handed-over questions within 15 minutes, follows up activation |
| Backup reviewer | When a suitability rejection needs a second opinion | Confirms it |
| Ops lead | Monday morning | Reads the weekly report, writes the missing help articles |

## What's in it

**Driver side**
- **Driver's phone** (Demo bar → Driver's phone, or `#driver`): pre-qualifying questions that flag but never reject, a privacy notice, BankID, licence, photo with an instant check, extract guide, self-booked call, status, and three first-gig offers after acceptance.
- **Messages and help:** one conversation with the AI assistant, the automatic reminders and status messages, and replies from ops. `#chat=DRV-1043` opens it directly.
  - The assistant answers from 36 help articles and the driver's own status, in the driver's language, and shows its sources.
  - It hands over to a person when the driver asks, when the articles don't cover the question, when it needs a person to act, when it is sensitive, or when something is wrong on a drive.
  - One-tap replies under a reminder: *I've ordered my extract*, *Remind me tomorrow*, *Stop reminders*, free call times.
  - The assistant can **propose** one action from the driver's own options: book or move the call, mark the extract, pick a first drive, pause or stop reminders. Nothing happens until the driver taps **Confirm**.

**Ops side**
- **Today:** one row at the top with what needs a person now: urgent problems on a drive, overdue reviews, questions waiting, first gigs to chase, files to close. Each opens its list.
- **Funnel scoreboard:** how many have reached each HubSpot stage, with the biggest drop-off marked. Click a stage to open its list.
- **Six metrics**, which hold all the rates: document completion, time to decision, acceptance rate, activation rate (first gig within 14 days), application → active (the north star), and first-gig quality. ▲▼ chips show how your clicks moved them.
  - Time to decision is measured from registration to decision, as the brief does (about 6 days today, target 48 h). The ops part, from complete file to decision, is shown next to it.
- **Explanations on demand:** the cockpit keeps one short line per item, and a **?** next to a heading or number opens what it means and how it is counted.
- **Review queue:** sorted by SLA (48 h from a complete file), with the written criteria in three tiers, and only the decisions the rules allow.
  - **Must-have:** valid B licence held ≥ 2 years, ID via BankID, criminal-record extract shown in a short call (viewed, never stored), photo meeting an objective standard.
  - **Borderline:** licence 1–2 years → simple drives first; limited availability → accept and flag for activation (never a reason to reject).
  - **Reject:** only with a generic reason code. A suitability rejection needs a second reviewer.
- **Missing documents**, **Awaiting first gig** and **All applicants**. Flags show only what differs from a clean file. Each applicant opens with the decision in view; the timeline and log fold out.
- **Driver questions:** the handover queue with a 15-minute reply target, replies that go straight to the driver's phone, and four numbers. **Live ops:** a problem on a drive happening now (keys missing, car won't start, damage) goes to the top in red, with a 5-minute target and its own alert.
  The four numbers:
  - **Answered by AI** (target 95%)
  - questions handed to a person, by reason
  - **Done in the chat:** things drivers did themselves
  - ops reply time
  
  Below them, **help content gaps**: the questions the articles didn't cover, the list of articles to write next.
- **Weekly report:** code computes 24 facts, the AI writes a short update (headline, what changed, biggest leak, three suggestions), and a **number check** verifies every number against the facts before it is shown. Copy for Slack, or write again.
- **How this maps to HubSpot:** pipeline stages, the fields required to move on, workflows, and what is configured in HubSpot versus built on top.

**Demo controls**
- **Move time:** +2 h, +1 day, +3 days. Automation runs on the simulated clock: reminders, SLA alerts, chat alerts (after 15 minutes, or 5 when urgent), and the Monday 08:00 report.
- **Demo guide:** one row of five things to try: apply, ask the assistant, decide, move time, read the weekly report. Only the next step is spelled out. `?guide=0` hides it for presenting.
- **Reset demo** in the demo bar starts over with fresh data.

## AI, and where it stops

The AI does the talking and the writing. People make the decisions.

| | Chat assistant | Weekly report |
|---|---|---|
| Model | Claude Haiku 5.5 (cheapest current model) | Claude Haiku 5.5, structured output |
| What it gets | The help articles, the driver's first name, status and own options | 24 counts and rates. No names, and nothing drivers wrote |
| What it can do | Answer, hand over, **propose** one action from a list | Write text around the numbers |
| What stops mistakes | The server only accepts action ids the app sent, the app checks the option again, and nothing happens without the driver's tap | Every number must belong to the facts the sentence cites, and the tone must match the data. One retry, then a template |
| Cost | About $0.00015 per answer (help articles cached) | Well under a cent per report |

- **Tested, not assumed:** `npm run eval` runs 63 questions through the real server code against the real model: answers from the articles, handovers, actions, and traps (prompt injection, booking for someone else, "pretend you're human"), in English, Swedish and Arabic. Graded by rules, not by another AI; a run costs about a cent. Latest result in [`evals/last-run.md`](evals/last-run.md): 63 of 63, and every question the articles cover answered without a person.
- **Always an answer:** without a key, or with `CHAT_ENABLED=off`, the chat falls back to article search and the report to a template, so the demo never breaks.
- **Guards on both functions:** they only accept calls from the app's own page, cap input length and the number of turns, and limit calls per IP and per hour. The real limit is a spending cap on the API account.
- **No decision actions exist:** the assistant can't accept, reject or rank applicants, which keeps it outside the AI Act's high-risk category for recruitment.

## Configured in HubSpot, built on top

Most of the ops side is HubSpot setup, not code: pipeline stages, required fields, reason-code dropdowns, workflows for reminders, SLA alerts and tasks, Meetings for booking the call, and reports. The chat could run on HubSpot's help desk and knowledge base. What HubSpot can't do on its own, and what I'd build:

- **The driver's onboarding flow:** one guided path on the phone with BankID, licence check, photo check and live status.
- **Self-service from the chat:** actions on the driver's own file that the assistant proposes and the driver confirms, checked against the live state.
- **First-gig matching:** it needs the open jobs from the order system, matched on area, availability and an easy first drive.
- **A report you can trust:** numbers from the system, text from the AI, and a check between them.
- **Decision rules:** only the accept variant the written criteria allow, and a second reviewer on suitability rejections.

## Where the logic lives

| Concern | In the cockpit | Code |
|---|---|---|
| Funnel stages | Derived stage, never stored | `src/lib/stage.ts` |
| Consistent decisions | Three-tier criteria, decision validation | `src/lib/criteria.ts` |
| Slow decisions | SLA clock, call slots on weekdays | `src/lib/sla.ts`, `src/lib/booking.ts` |
| Unfinished documents | Reminders at 2/24/72 h, pause or stop, 14-day close | `src/lib/nudges.ts` |
| Activation gap | First-gig offers, welcome call, 7/14/30-day buckets | `src/lib/gigs.ts`, `src/lib/activation.ts` |
| Driver questions | Prompt, streaming, handover, threads, AI metric, content gaps | `src/lib/chat/`, `src/content/help.ts` |
| Self-service | Options per step, proposals, confirmed actions, quick replies | `src/lib/chat/selfService.ts` |
| Weekly report | Facts, number check, template, Slack text | `src/lib/report/` |
| Server functions | Guards, model calls | `api/chat.ts`, `api/report.ts` |
| Automation | Reminders, alerts, tasks, driver messages, Monday report | `src/lib/automation.ts` |
| Measure & improve | Six KPIs, funnel scoreboard | `src/lib/kpis.ts` |

The demo data (44 applicants and about 30 chat conversations over about 40 days, generated relative to now) is tuned to a realistic, leaky baseline. Thresholds are a starting proposal, to be set with the team.

## Privacy and fairness

Built to follow GDPR, Swedish rules and the EU AI Act from the start. This is a design, not legal advice; a DPO should confirm it before real use.

- **No criminal-record data (GDPR art. 10).** The applicant shows their own extract in a short call; the cockpit records only "extract shown". The assistant never asks about it, and if a driver starts sharing details it asks them not to and hands over.
- **No traffic-offence data.** Only that the B licence is valid and how long it has been held.
- **Humans decide.** The rules block what is not allowed; a person makes every decision. Suitability rejections need a second reviewer. Applicants can ask for the reason and a review.
- **The AI says it is an AI** (AI Act art. 50), answers only from the help articles, and can't decide anything. A person is one tap away.
- **Minimal data to the AI.** The chat sends first name and status only; the report sends counts and rates only. Conversations are not stored on the server, and the logs hold token counts, never content.
- **Retention.** Incomplete applications are deleted after 6 months, rejected ones 2 years after the decision.
- **Fair criteria.** Minimum age and licence years follow insurance and safety needs; the photo standard is objective; limited availability never leads to rejection.
- **Ready for platform-work rules.** Information before applying, human oversight, reasons and review, and no automatic suspensions ("dormant" is only a label).

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # 226 unit tests (Vitest)
npm run eval     # 63 questions to the real assistant (needs a key), writes evals/last-run.md
npm run build
```

For the real AI locally, put `ANTHROPIC_API_KEY=...` in `.env.local` (never committed); the dev server runs the functions in `api/`. Without a key the chat uses article search and the report a template. On Vercel the key is a project environment variable; `CHAT_ENABLED=off` switches the AI off.

State is saved in the browser (localStorage), including the simulated time. **Reset demo** generates fresh data and goes back to now. Saves older than 12 hours are moved forward so the clocks still look live.

The driver's phone and the cockpit share the same browser data, so the demo runs on one screen. Applying on a real phone and seeing it on a laptop would need a backend, and real personal data; that is a production step.

## Structure

```
api/              Vercel functions: chat.ts, report.ts (thin; logic in src/lib)
evals/            The assistant's eval suite and its last result
src/content/      help.ts: the 36 help articles behind the assistant
src/lib/          Business logic as pure functions, all unit-tested
  stage.ts        Stage derivation
  criteria.ts     Written criteria, borderline rules, decision validation
  sla.ts          Review SLA clock, review slots
  nudges.ts       Reminder schedule and text, pause/stop, 14-day no-response
  activation.ts   Activation buckets, welcome-call SLA
  driverFlow.ts   Self-registration, the driver's steps, booking a call or a first drive
  booking.ts      Free extract-call times on weekdays
  gigs.ts         Open jobs and first-gig matching
  automation.ts   Reminders, alerts, tasks, driver messages, the Monday report
  chat/           Prompt, guards, streaming server, threads, self-service, offline search
  report/         Weekly facts, number check, template, report server
  kpis.ts         Six KPIs and the funnel scoreboard
  today.ts        What needs a person today
  actions.ts      Every action: new applicant out, with a log entry
  seed.ts         Demo data relative to now
  persist.ts      localStorage save, restore and time shift
src/components/   UI only: calls src/lib, holds no rules
  driver/         The driver's phone and chat
```

Stack: Vite, React 18, TypeScript, Tailwind CSS 4, lucide-react, Vitest, the Anthropic TypeScript SDK on two Vercel functions.

## What I'd build next

1. **Connect to HubSpot and the order system.** Deals through the API and webhooks so the pipeline stays the source of truth; the chat on the help desk; open jobs from the order system for first-gig matching. Real BankID and licence checks.
2. **Support for the reviewer:** a summary of each file, the next practical step and draft messages, never a recommendation to accept or reject.
3. **Document checks with image analysis:** photo quality and reading the licence category and date, confirmed by a person, with no face matching.
4. **Grow the eval set from real conversations:** every handed-over question becomes a test case, and every new help article is checked against it before it goes live.
5. **Ops basics for real use:** sign-in, roles, an audit log, a DPIA, data processing agreements, and the applicant privacy notice reviewed by a DPO.
