# Driver Funnel Cockpit

A clickable prototype of a daily workspace for driver onboarding in a gig-driver operation: from application to first completed drive.

It combines three tools in one: a **review tracker**, a **document-completion checklist**, and a **funnel scoreboard** that shows where applicants drop off.

Demo data only, no real people. Built by Hjalmar Widlund with Claude Code.

**Live:** https://driver-funnel-cockpit.vercel.app · **Code:** https://github.com/hjawid-dev/driver-funnel-cockpit

Every push to `main` deploys automatically through Vercel.

---

## The problem it addresses

A typical driver funnel loses most applicants somewhere between registration and the first drive. Many never finish their documents, decisions are slow, criteria are unwritten so borderline cases depend on who reviews them, and accepted drivers often never take a first gig. Worst of all, nobody can say where people drop out: rejected, stuck in review, or never activated.

The cockpit gives every stage an owner, a clock and written rules. **Every action writes a timestamp or a reason code**, so the funnel becomes measurable as a by-product of reviewers doing their job.

## Who uses it, and when

| Who | When | What they do |
|---|---|---|
| Driver ops owner | Two fixed review slots a day (09:00 and 14:00) | Works the review queue by SLA, chases missing documents, books first gigs |
| Backup reviewer | When a borderline case needs a second opinion | Confirms minor-violation cases |
| Ops lead | Weekly | Reads the scoreboard and the six metrics to see where the funnel leaks |

## What's in it

- **Demo guide:** a short intro with three things to try (accept a clean file, hit a borderline rule, close a silent applicant). It ticks off each step and can be hidden.
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
- **How this maps to HubSpot:** pipeline stages, the fields required to move on, and workflows.

## Where the logic lives

| Concern | In the cockpit | Code |
|---|---|---|
| Funnel stages | Derived stage, never stored | `src/lib/stage.ts` |
| Consistent decisions | Three-tier criteria, decision validation | `src/lib/criteria.ts` |
| Slow decisions | SLA clock and urgency sort | `src/lib/sla.ts` |
| Unfinished documents | Nudges at 2/24/72 h, 14-day close | `src/lib/nudges.ts` |
| Activation gap | Welcome call, 7/14/30-day buckets | `src/lib/activation.ts` |
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
npm test         # 124 unit tests (Vitest)
npm run build
```

State is saved in the browser (localStorage). **Reset demo** in the top bar generates fresh data. If a saved demo is more than 12 hours old, its timestamps are moved forward so the clocks still look live.

## Structure

```
src/lib/          Business logic as pure functions, all unit-tested
  stage.ts        Stage derivation
  criteria.ts     Written criteria, borderline rules, decision validation
  sla.ts          Review SLA clock, review slots
  nudges.ts       Nudge schedule, reminder text, 14-day no-response
  activation.ts   Activation buckets, welcome-call SLA
  kpis.ts         Six KPIs and the funnel scoreboard
  actions.ts      Every action: new applicant out, with a log entry
  timeline.ts     Per-applicant timeline
  seed.ts         Demo data relative to now
  persist.ts      localStorage save, restore and time shift
src/components/   UI only: calls src/lib, holds no rules
```

Stack: Vite, React 18, TypeScript, Tailwind CSS 4, lucide-react, Vitest. No backend.

## What I'd build next

1. **Connect to HubSpot.** Read and write deals through the API, and listen to webhooks, so the pipeline stays the source of truth. The nudges and reviewer tasks become HubSpot workflows that send through the driver chat.
2. **Weekly cohort view.** Compare cohorts week by week, to see whether a change such as BankID or auto-nudges actually moved document completion and time to decision.
3. **Calibrate the criteria.** After four weeks of decision data, review the borderline outcomes with the team, adjust the thresholds, and move pre-qualifying questions (licence years, age, availability) into the sign-up form.
4. **Ops basics for real use:** sign-in, roles (owner and backup), an audit log, and GDPR-safe storage of background checks.
