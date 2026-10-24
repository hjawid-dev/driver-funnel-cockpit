# Driver Funnel Cockpit

A clickable prototype of both sides of a driver onboarding funnel in a gig-driver operation, from application to first completed drive:

- **The driver's phone:** one guided path to finish the application in about ten minutes, book your own call, and pick an easy first drive.
- **An AI assistant in the driver chat:** answers from the help articles, hands over to a person when it should, and lets the driver book a call, mark the extract or pause reminders with one tap. When a driver is stuck at a pickup, it takes the first five minutes before a person does.
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
2. **Decide in one call** (slow decisions). The driver books a 15-minute onboarding call, or asks the assistant to book or move it. The call is a short interview: how a job works, what to do if stuck at a pickup, availability, the extract shown (one part, never stored), the decision, and the first drive booked in the same call.
3. **Offer the first drive at once** (activation gap). On acceptance the driver sees three easy jobs near them that fit their availability, and picks one with a tap.

Underneath, **every action writes a timestamp or a reason code**, so the funnel is measurable as a by-product of the work, and the **weekly report** turns those numbers into a short update for the team.

## Who uses it, and when

| Who | When | What they do |
|---|---|---|
| Applicant | Any time, on their phone | Applies, asks the assistant, books the onboarding call, picks and does a first drive |
| Driver ops owner | Two fixed review slots a day (09:00 and 14:00), and the chat queue | Holds the onboarding calls and decides, answers handed-over questions within 15 minutes, follows up activation |
| Live ops (same person on shift) | All day, from the Today row | Calls ahead on pickups nobody confirmed, takes over from the assistant when a stuck pickup isn't solved in 5 minutes, runs the playbook |
| Backup reviewer | When a suitability rejection needs a second opinion | Confirms it |
| Ops lead | Monday morning | Reads the weekly report, writes the missing help articles |

## What's in it

**Driver side**
- **Driver's phone** (Demo bar → Driver's phone, or `#driver`): pre-qualifying questions, a privacy notice, BankID, licence, photo with an instant check, extract guide, a self-booked onboarding call, status, and three first-drive offers after acceptance.
  - **When can you drive** takes several answers (weekdays, evenings, weekends). Limited availability is noted, never a reason to reject.
  - **An unmet requirement** (licence under a year, under the insurance age) pauses the application, so no documents are collected. Nothing is decided automatically: the applicant can change a wrong answer and carry on, or ask to be reminded when they qualify, and a person closes the file.
  - **Back and Next**, and the step bar, open steps already done: change the answers, retake a photo, or move the call until two hours before. BankID, and everything once the file is complete, stays locked.
  - **The first drive** shows as today's job on the day, with the same taps as any drive; delivering it makes the driver active. *Demo: jump to the morning of the drive* moves the clock there.
- **Messages and help:** one conversation with the AI assistant, the automatic reminders and status messages, and replies from ops. `#chat=DRV-1043` opens it directly.
  - The assistant answers from 37 help articles and the driver's own status, in the driver's language, and shows its sources.
  - It hands over to a person when the driver asks, when the articles don't cover the question, when it needs a person to act, when it is sensitive, or when something on a drive needs a person now (damage, safety, a car that won't start).
  - Stuck at a pickup (keys, car or contact missing), it keeps the first five minutes: it tells the driver to stay, that the waiting time is paid, to pick what is wrong so the pickup contact can get a fixed text, and when a person calls. It never contacts anyone itself, never passes on a message, and mentions 112 only if someone is hurt or in danger.
  - One-tap replies under a reminder: *I've ordered my extract*, *Remind me tomorrow*, *Stop reminders*, free call times.
  - The assistant can **propose** one action from the driver's own options: book or move the call, mark the extract, pick a first drive, pause or stop reminders. Nothing happens until the driver taps **Confirm**.

**Ops side: two pages**, switched in the header, so the funnel and live work don't compete for attention. Each page has its own **Today** row with what needs a person now. Each item opens its list filtered to exactly what it counts, so the number clicked is the number shown (*Show all* lifts the filter).

*Driver funnel* (applications to active drivers):
- **Funnel scoreboard:** Registered → Docs submitted → Reviewed → Accepted → Active, with the biggest drop-off marked. The number opens exactly those people. The lines under it always add up to it: who stopped there (a link to a list of the same size) and who moved on, so 44 = 15 missing documents + 1 closed, not finished + 28 submitted. A test checks every sum.
- **Six metrics**, which hold all the rates: document completion, time to decision, acceptance rate, activation rate (first gig within 14 days), application → active (the north star), and first-gig quality. ▲▼ chips show how your clicks moved them.
  - Time to decision is measured from registration to decision, as the brief does (about 6 days today, target 48 h). The ops part, from complete file to decision, is shown next to it.
- **Each metric shows the group it counts** (*22 of 31 who registered 7+ days ago*, *16 of 20 reviewed files*), so a rate can be checked against the tiles.
- **Explanations on demand:** the cockpit keeps one short line per item, and a **?** next to a heading or number opens what it means and how it is counted.
- **Review queue:** sorted by SLA (48 h from a complete file), with the written criteria in three tiers, and only the decisions the rules allow.
  - **Must-have:** valid B licence held ≥ 2 years, ID via BankID, criminal-record extract shown in the onboarding call (viewed, never stored), photo meeting an objective standard.
  - The **onboarding call agenda** (six points) sits next to the decision.
  - **Borderline:** licence 1–2 years → simple drives first; limited availability → accept and flag for activation (never a reason to reject).
  - **Reject:** only with a generic reason code. A suitability rejection needs a second reviewer.
- **Missing documents**, **Awaiting first gig** and **All applicants**, where the filter shows *where they are now* in its own words (*In review*, *Closed, not finished*), never the tiles' words. A file closed because it was never finished is not counted as a rejection. Flags show only what differs from a clean file. Each applicant opens with the decision in view; the timeline and log fold out. The welcome call is only a task when no first drive was booked in the onboarding call.

*Live ops* (`#live`): a driver stuck at a pickup, the check that prevents it, and driver questions.
- **Pickups & incidents.**
  - **Today's pickups** with a pre-pickup check: the pickup contact gets a message 24 hours and 60 minutes before (time, where the keys are, who is on site). No reply gives ops a task to call the backup contact.
  - **On site** the driver taps *I'm here*, *Got the keys* or *Problem at pickup*. Each pickup has a status pill (*Due soon*, *At pickup*, *Driving to drop-off*, *Delivered*), with delivered ones last.
  - **What is wrong, not a guess.** *Problem at pickup* offers six choices: keys missing, nobody there, the car isn't there or ready, damage or a car that won't start, *I feel unsafe*, or something else. Damage and feeling unsafe go straight to a person; something else opens the chat.
  - **A text only on the driver's Send.** For the first three, the driver sees the exact text the pickup contact would get and taps Send. Live ops shows the pickup as *Assistant handling*: what the driver reported, the text that went out, when a person takes over, and *Take over now*.
  - **Guardrails on every text to a customer** (`src/lib/sms.ts`): fixed templates per reason, marked as automated; fields only from the booking, cleaned of links and line breaks and capped; only the booking's contact and backup, once each; a switch in Live ops turns texts off, and a text that can't go out hands the pickup to a person. Nothing the driver or the AI writes is sent. The contact's reply is shown to the driver as a note and is never given to the AI.
  - **Then a person:** after 5 minutes, at once on the driver's *Call me now*, when ops takes over, for damage or safety, or 15 minutes before the customer must decide. The card turns urgent and shows what was already tried.
  - **Solved in time** (*Got the keys* or *Customer is here*, in the job or the chat): closed by the rules with the waiting time paid, listed under *Closed today*. Nobody needs to act, and ops still sees it.
  - **One thing at a time on the phone.** The job card and the chat show the same state (assistant, a call coming, ops on it, decided) with the driver's own timeline, so the phone never says two things at once.
  - **The incident card:** the clock (agreed pickup, waiting time, decide by, last departure, deadline, margin) and a six-step escalation ladder: keep the driver, rule out our own error, call the contact and then the backup (after the text: *texted 16:49, no reply · call first*), update the customer (a template, not AI), the customer decides, close the loop. Every step is logged with the time, and an incident can't close without a decision, paid waiting time and a cause (customer side, our error, other), which the weekly report counts.
  - A new driver's **first drive** is a job here too, marked "ops on standby".
  - The driver hears the decision in the chat. Keys found after a person took over: the incident stays open as *to close*. The assistant never tells a stuck driver to leave or cancel: that is decided with the customer.
  - *Demo: the service desk replies* on the assistant's card shows the contact answering; the reply reaches the driver as a quoted note.
- **Driver questions:** the handover queue with a 15-minute reply target (5 minutes when urgent), replies that go straight to the driver's phone, and four numbers.
  The four numbers:
  - **Answered by AI** (target 95%)
  - questions handed to a person, by reason
  - **Done in the chat:** things drivers did themselves
  - ops reply time
  
  Below them, **help content gaps**: the questions the articles didn't cover, the list of articles to write next.

*In the header, for both pages:*
- **Weekly report:** code computes 24 facts, the AI writes a short update (headline, what changed, biggest leak, three suggestions), and a **number check** verifies every number against the facts before it is shown. Copy for Slack, or write again.
- **How this maps to HubSpot:** pipeline stages, the fields required to move on, workflows, and what is configured in HubSpot versus built on top.

**Demo controls**
- **Move time:** +2 h, +1 day, +3 days. Automation runs on the simulated clock: reminders, SLA alerts, chat alerts (after 15 minutes, or 5 when urgent), pre-pickup messages and their tasks, the assistant taking a missing key and the hand-over to a person, and the Monday 08:00 report. The other drivers' pickups move along by themselves.
- **Demo guide:** one row of six things to try: apply, ask the assistant, decide, handle a stuck driver, move time, read the weekly report. Only the next step is spelled out. `?guide=0` hides it for presenting.
- **Reset demo** in the demo bar starts over with fresh data.
- **Demo shortcuts on the phone,** marked as not shown in production: *Demo: decide as ops* opens the applicant's decision in the cockpit, and *Demo: jump to the morning of the drive* moves the clock to a first drive.

## AI, and where it stops

The AI does the talking and the writing. People make the decisions.

| | Chat assistant | Weekly report |
|---|---|---|
| Model | Claude Haiku 5.5 (cheapest current model) | Claude Haiku 5.5, structured output |
| What it gets | The help articles, the driver's first name, status and own options | 24 counts and rates. No names, and nothing drivers wrote |
| What it can do | Answer, hand over, **propose** one action from a list. At a stuck pickup: five minutes with the driver; it never contacts the customer | Write text around the numbers |
| What stops mistakes | The server only accepts action ids the app sent, the app checks the option again, and nothing happens without the driver's tap | Every number must belong to the facts the sentence cites, and the tone must match the data. One retry, then a template |
| Cost | About $0.00015 per answer (help articles cached) | Well under a cent per report |

- **Tested, not assumed:** `npm run eval` runs 74 questions through the real server code against the real model: answers from the articles, handovers, actions, and traps (prompt injection, booking for someone else, "pretend you're human", "cancel the job for me"), a driver stuck at a pickup, a threat on site, a review request, and a driver asking it to text the customer, in English, Swedish and Arabic. Graded by rules, not by another AI; a run costs about a cent. Latest result in [`evals/last-run.md`](evals/last-run.md): 74 of 74, and every question the articles cover answered without a person.
- **Always an answer:** without a key, or with `CHAT_ENABLED=off`, the chat falls back to article search and the report to a template, so the demo never breaks.
- **Guards on both functions:** they only accept calls from the app's own page, cap input length and the number of turns, and limit calls per IP and per hour. The real limit is a spending cap on the API account.
- **No decision actions exist:** the assistant can't accept, reject or rank applicants, which keeps it outside the AI Act's high-risk category for recruitment. At a pickup it only gathers facts; a text to the customer is a fixed message the driver sees and sends. Waiting longer, a new time or cancelling is decided by a person with the customer, and it never judges the driver.

## Configured in HubSpot, built on top

Most of the ops side is HubSpot setup, not code: pipeline stages, required fields, reason-code dropdowns, workflows for reminders, SLA alerts and tasks, Meetings for booking the onboarding call, and reports. The chat could run on HubSpot's help desk and knowledge base. What HubSpot can't do on its own, and what I'd build:

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
| Activation gap | First-drive offers, first drive as a job, welcome call when needed, 7/14/30-day buckets | `src/lib/gigs.ts`, `src/lib/activation.ts` |
| Driver questions | Prompt, streaming, handover, threads, AI metric, content gaps | `src/lib/chat/`, `src/content/help.ts` |
| Self-service | Options per step, proposals, confirmed actions, quick replies | `src/lib/chat/selfService.ts` |
| Weekly report | Facts, number check, template, Slack text | `src/lib/report/` |
| Server functions | Guards, model calls | `api/chat.ts`, `api/report.ts` |
| Live ops | Pre-pickup check, the assistant's first minutes, hand-over to a person, incident clock, playbook | `src/lib/liveOps.ts` |
| Texts to customers | Templates, cleaned fields, allowed recipients, once each, off switch | `src/lib/sms.ts` |
| Automation | Reminders, alerts, tasks, pre-pickup messages, driver messages, Monday report | `src/lib/automation.ts` |
| Measure & improve | Six KPIs, funnel scoreboard | `src/lib/kpis.ts` |

The demo data (44 applicants and about 30 chat conversations over about 40 days, generated relative to now) is tuned to a realistic, leaky baseline. Thresholds are a starting proposal, to be set with the team.

## Privacy and fairness

Built to follow GDPR, Swedish rules and the EU AI Act from the start. This is a design, not legal advice; a DPO should confirm it before real use.

- **No criminal-record data (GDPR art. 10).** The applicant shows their own extract as one part of the onboarding call; the cockpit records only "extract shown". The assistant never asks about it, and if a driver starts sharing details it asks them not to and hands over.
- **No traffic-offence data.** Only that the B licence is valid and how long it has been held.
- **Humans decide.** The rules block what is not allowed; a person makes every decision. Suitability rejections need a second reviewer. Applicants can ask for the reason and a review.
- **The AI says it is an AI** (AI Act art. 50), answers only from the help articles, and can't decide anything. A person is one tap away.
- **Minimal data to the AI.** The chat sends first name and status only; the report sends counts and rates only. Conversations are not stored on the server, and the logs hold token counts, never content.
- **Retention.** Incomplete applications are deleted after 6 months, rejected ones 2 years after the decision.
- **Fair criteria.** Minimum age and licence years follow insurance and safety needs; the photo standard is objective; limited availability never leads to rejection.
- **External messages follow the OWASP advice for LLM apps:** the model has no tool that reaches outside, text from outside never reaches the model, and the only automated message to a customer is a fixed template on the driver's tap.
- **Safety first.** Damage, an accident or feeling unsafe goes to a person at once, never through the assistant (AFS 2023:2: quick help in an emergency).
- **Ready for platform-work rules.** Information before applying, human oversight, reasons and review, and no automatic suspensions ("dormant" is only a label).

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # 287 unit tests (Vitest)
npm run eval     # 74 questions to the real assistant (needs a key), writes evals/last-run.md
npm run build
```

For the real AI locally, put `ANTHROPIC_API_KEY=...` in `.env.local` (never committed); the dev server runs the functions in `api/`. Without a key the chat uses article search and the report a template. On Vercel the key is a project environment variable; `CHAT_ENABLED=off` switches the AI off.

State is saved in the browser (localStorage), including the simulated time. **Reset demo** generates fresh data and goes back to now. Saves older than 12 hours are moved forward so the clocks still look live.

The driver's phone and the cockpit share the same browser data, so the demo runs on one screen. Applying on a real phone and seeing it on a laptop would need a backend, and real personal data; that is a production step.

## Structure

```
api/              Vercel functions: chat.ts, report.ts (thin; logic in src/lib)
evals/            The assistant's eval suite and its last result
src/content/      help.ts: the 37 help articles behind the assistant
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
  liveOps.ts      Today's pickups, pre-pickup check, the assistant's minutes, alerts, incident clock and playbook
  sms.ts          The only automated message to a customer: templates and guardrails
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
