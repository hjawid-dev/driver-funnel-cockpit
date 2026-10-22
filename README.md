# Driver Funnel Cockpit

A clickable prototype of both sides of a driver onboarding funnel in a gig-driver operation, from application to first completed drive:

- **The driver's phone:** one guided path to finish the application in about ten minutes, book your own call, and pick an easy first drive.
- **The ops cockpit:** a review queue with written rules, a document checklist, an activation list and a funnel scoreboard.
- **Automation between them:** reminders, SLA alerts, call reminders and tasks that run by themselves. A "Move time" button shows them running.

Demo data only, no real people. Built by Hjalmar Widlund with Claude Code.

**Live:** https://driver-funnel-cockpit.vercel.app · **Code:** https://github.com/hjawid-dev/driver-funnel-cockpit

Every push to `main` deploys automatically through Vercel.

---

## The problem it addresses

A typical driver funnel loses most applicants somewhere between registration and the first drive. Many never finish their documents, decisions are slow, criteria are unwritten so borderline cases depend on who reviews them, and accepted drivers often never take a first gig. Worst of all, nobody can say where people drop out: rejected, stuck in review, or never activated.

Three changes attack the leaks:

1. **Make finishing easy** (unfinished documents). The driver gets one step at a time on the phone, with BankID, an instant photo check and a guide for the criminal-record extract, plus reminders at 2, 24 and 72 hours.
2. **Decide in one call** (slow decisions). The driver books a 15-minute call in a fixed review slot, shows the extract, and gets the decision in the call. No back-and-forth to arrange it.
3. **Offer the first drive at once** (activation gap). On acceptance the driver sees three easy jobs near them that fit their availability, and picks one with a tap.

Underneath, **every action writes a timestamp or a reason code**, so the funnel becomes measurable as a by-product of doing the work.

## Who uses it, and when

| Who | When | What they do |
|---|---|---|
| Applicant | Any time, on their phone | Applies, finishes the steps, books the call, picks a first drive |
| Driver ops owner | Two fixed review slots a day (09:00 and 14:00) | Holds the extract calls and decides, works the queue by SLA, follows up activation |
| Backup reviewer | When a suitability rejection needs a second opinion | Confirms it |
| Ops lead | Weekly | Reads the scoreboard and the six metrics to see where the funnel leaks |

## What's in it

- **Driver's phone** (Demo bar → Driver's phone, or open the link with `#driver`): pre-qualifying questions that flag but never reject, a privacy notice, BankID, licence, photo with an instant check, extract guide, self-booked call, status, messages, and three first-gig offers after acceptance. "Driver's view" in any applicant's drawer shows their side.
- **Move time:** +2 h, +1 day, +3 days. Automation runs on the simulated clock and the demo bar lists what it did.
- **Demo guide:** three things to try (apply on the phone, decide in the cockpit, move time). It ticks off each step and can be hidden; `?guide=0` hides it for presenting.
- **Change since you opened the page:** ▲▼ chips on the metrics show how your clicks moved them, green when the change is good.
- **Funnel scoreboard:** Registered → Docs submitted → Under review → Accepted → Active, with step conversion and the biggest drop-off highlighted. Click a stage to jump to its list.
- **Six metrics:** document completion, time to decision, acceptance rate (with top reject reasons), activation rate, application → active (the north star), and first-gig quality (guardrail). All are computed live, with the rule for who is counted shown under each number.
- **Review queue:** sorted by SLA (48 h from a complete file), with live clocks and auto-detected flags. The drawer shows the written criteria in three tiers and allows only the decision the rules allow:
  - **Must-have:** valid B licence held ≥ 2 years, ID via BankID, criminal-record extract shown in a short call (viewed, never stored), photo meeting an objective standard.
  - **Borderline:** licence 1–2 years → simple drives first; limited availability → accept and flag for activation (never a reason to reject).
  - **Reject:** only with a generic reason code. A suitability rejection needs a second reviewer. "Other" needs a note, and notes that look like offence details are blocked.
- **Missing documents:** a checklist per applicant, the auto-nudge schedule (2 h, 24 h, 72 h), the reminder text that would go out, "Send nudge now" (logged only, never sent), and closing after 14 days without a response. A complete file is auto-queued for review.
- **Privacy by design:** no criminal-record or traffic-offence data is stored anywhere, reason codes are generic, a human makes every decision, and every file shows when its data will be deleted.
- **Awaiting first gig:** activation status (on track, book first gig, call driver, dormant), a welcome call within 24 h, first-gig booking, and completion with on-time and no-incident checks.
- **All applicants:** filter and search, plus a full timeline per applicant.
- **How this maps to HubSpot:** pipeline stages, the fields required to move on, workflows, and what is configured in HubSpot versus built on top.

## Configured in HubSpot, built on top

Most of the ops side is HubSpot setup, not code: pipeline stages, required fields, reason-code dropdowns, workflows for reminders, SLA alerts and tasks, Meetings for booking the call, and reports. What HubSpot can't do on its own, and what I'd build:

- **The driver's onboarding flow:** one guided path on the phone with BankID, licence check, photo check and live status.
- **First-gig matching:** it needs the open jobs from the order system, matched on area, availability and an easy first drive.
- **Decision rules:** only the accept variant the written criteria allow, and a second reviewer on suitability rejections.

## Where the logic lives

| Concern | In the cockpit | Code |
|---|---|---|
| Funnel stages | Derived stage, never stored | `src/lib/stage.ts` |
| Consistent decisions | Three-tier criteria, decision validation | `src/lib/criteria.ts` |
| Slow decisions | SLA clock and urgency sort | `src/lib/sla.ts` |
| Unfinished documents | Nudges at 2/24/72 h, 14-day close | `src/lib/nudges.ts` |
| Activation gap | First-gig offers, welcome call, 7/14/30-day buckets | `src/lib/gigs.ts`, `src/lib/activation.ts` |
| Driver experience | Step-by-step flow, self-booked call | `src/lib/driverFlow.ts`, `src/lib/booking.ts` |
| Automation | Reminders, alerts, tasks, driver messages | `src/lib/automation.ts` |
| Measure & improve | Six KPIs, funnel scoreboard | `src/lib/kpis.ts` |
| Data for all of the above | Every action logs time and reason | `src/lib/actions.ts` |

The demo data (44 applicants over about 40 days, generated relative to now) is tuned to a realistic, leaky baseline. See `src/lib/seed.ts`.

Thresholds are a starting proposal, to be set with the team.

## Privacy and fairness

Built to follow GDPR and Swedish rules from the start. This is a design, not legal advice; a DPO should confirm it before real use.

- **No criminal-record data (GDPR art. 10).** Private companies may not keep it without a legal basis. The applicant orders their own extract from Polisen and shows it in a short call; the cockpit records only "extract shown". Reason codes never reveal an offence, and notes with offence details are blocked.
- **No traffic-offence data.** Speeding fines are criminal-offence data too. The cockpit only records that the B licence is valid and how long it has been held.
- **Humans decide, reasons can be explained.** The rules block what is not allowed; a person makes every decision. Suitability rejections need a second reviewer. Applicants can ask for the reason and a review.
- **Retention.** Incomplete applications are deleted after 6 months, rejected ones 2 years after the decision.
- **Fair criteria.** Minimum age and licence years follow insurance and safety needs; the photo standard is objective; limited availability never leads to rejection.
- **Ready for platform-work rules.** Information before applying, human oversight, and no automatic suspensions ("dormant" is only a label), in line with the EU Platform Work Directive.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # 143 unit tests (Vitest)
npm run build
```

State is saved in the browser (localStorage), including the simulated time. **Reset demo** in the top bar generates fresh data and goes back to now. If a saved demo is more than 12 hours old, its timestamps are moved forward so the clocks still look live.

The driver's phone and the cockpit share the same browser data, so the demo runs on one screen. Applying on a real phone and seeing it on a laptop would need a backend, and real personal data; that is a production step.

## Structure

```
src/lib/          Business logic as pure functions, all unit-tested
  stage.ts        Stage derivation
  criteria.ts     Written criteria, borderline rules, decision validation
  sla.ts          Review SLA clock, review slots
  nudges.ts       Nudge schedule, reminder text, 14-day no-response
  activation.ts   Activation buckets, welcome-call SLA
  driverFlow.ts   Self-registration, the driver's steps, booking a call or a first drive
  booking.ts      Free extract-call times in the review slots
  gigs.ts         Open jobs and first-gig matching
  automation.ts   Reminders, alerts, tasks and driver messages from timestamps
  retention.ts    When each file's data is deleted
  kpis.ts         Six KPIs and the funnel scoreboard
  actions.ts      Every action: new applicant out, with a log entry
  timeline.ts     Per-applicant timeline
  seed.ts         Demo data relative to now
  persist.ts      localStorage save, restore and time shift
src/components/   UI only: calls src/lib, holds no rules
  driver/         The driver's phone
```

Stack: Vite, React 18, TypeScript, Tailwind CSS 4, lucide-react, Vitest. No backend.

## What I'd build next

1. **Connect to HubSpot and the order system.** Deals through the API and webhooks so the pipeline stays the source of truth; reminders and tasks as HubSpot workflows through the driver chat; open jobs from the order system for first-gig matching. Real BankID and licence checks.
2. **Weekly cohort view.** Compare cohorts week by week, to see whether a change such as BankID or auto-nudges actually moved document completion and time to decision.
3. **Calibrate the criteria.** After four weeks of decision data, review the borderline outcomes with the team, adjust the thresholds, and move pre-qualifying questions (licence years, age, availability) into the sign-up form.
4. **Ops basics for real use:** sign-in, roles (owner and backup), an audit log, a DPIA, and the applicant privacy notice reviewed by a DPO.
