# Driver Ops

A clickable prototype for a car-relocation service's operations case. Demo data only, no real people. Built by Hjalmar Widlund with Claude Code.

**Live:** https://driver-funnel-cockpit-lite.vercel.app

Two connected jobs, one page each:

- **Live Ops** keeps the drivers delivering when something goes wrong at a pickup (Part 1 of the case).
- **Driver Funnel** builds a supply of qualified, active drivers (Part 2).

Details sit behind a click: the main view shows the problem and the step to take now.

## Live Ops: keep pickups on track

1. **Exceptions first.** Today's pickups are grouped as Needs attention, On track and Done, each with a state: Needs a person, Issue reported, Check needed, Upcoming, At pickup, On the way, Resolved, Delivered.
2. **The incident.** The demo opens on the case at **Tuesday 09:30**: the pickup was agreed for 09:00, the driver has waited 25 minutes, and the keys are missing. The panel shows:
   - the problem in one line: waited 25 min · no keys · contact not answering
   - four facts (pickup, deadline, distance, keys), with the customer, contacts and price behind a click
   - who owns it
   - one time bar up to the 12:00 deadline, with when the customer must decide (10:15)
3. **The playbook.** Six steps, with the current one open:
   - keep the driver
   - rule out our own error
   - call the contact, then the backup
   - the customer hears it from us
   - the customer decides
   - close the loop with the waiting time paid and a cause

   Every step is logged with the time, and a closed incident keeps its summary.
4. **The pre-pickup check.** A routine pickup shows its touchpoints: at booking, the day before, 60 minutes before, and on arrival. The action appears when a reply is missing.

## Driver Funnel: turn qualified applicants into active drivers

1. **Four metrics:**
   - **New active ÷ applications,** the north star. It is a 30-day flow, the same kind of number as the case's "25 of 120 a month". It is not a cohort conversion, which needs 60+ days of history.
   - **Document completion.**
   - **Median time to decision.** The case gives a mean of 6 days.
   - **First-gig activation.**

   Each shows the live demo number, its target, and the case's own baseline on a separate line, so the two are never mixed.
2. **Where candidates get stuck.** Registered → Docs submitted → Reviewed → Accepted → Active, with the share who moved on and the biggest drop-off marked. A click on a stage opens the people who are there now.
3. **One candidate queue.** Each row shows who, where they are, why now and the next action: request documents, review and decide, book a first gig, call the driver. Filters: Needs action, Missing documents, In review, Awaiting first gig, All applicants. The first 8 rows show, the rest behind "Show all".
4. **Candidate panel.** It shows the next step at the top, then the written criteria:
   - **Must-have:** licence, BankID, photo, and the criminal-record extract shown before the first drive, never stored.
   - **Borderline:** a written rule decides.
   - **Reject:** always with a reason code.

   Only the decisions the rules allow are possible, and a person makes every one. History, documents and logs are folded away until needed.
5. **Accepted, not yet active.** The panel says why there is no first drive yet, and only the step to do now is open: welcome call, book a first gig, first gig completed.

## From the case, and what is proposed

**From the case:**
- 120 applications and 25 active drivers a month
- 30% never finish their documents
- 6 days on average to a decision, against a 48-hour target
- the funnel stages
- an ID or personnummer and a background check
- the Part 1 facts: pickup 09:00, 25 minutes waited, deadline 12:00, 35 km, 500 / 780 SEK, a pilot customer

**Proposed here**, marked *Proposed* in the app, and to agree with the team:
- the targets of 35%, 85% and 75%
- the written criteria
- BankID for the ID, and the criminal-record extract shown by the driver and never stored. The exact check, and how sensitive data is handled, must be validated with company policy and legal.
- the reminders at 2, 24 and 72 hours, and closing a file after 14 days
- two review slots a day
- for a first gig: book at 7 days, call at 14
- the 10:15 cut-off for the customer's decision
- the playbook and the pre-pickup check

## Secondary, where it is needed

- **Weekly report:** on Driver Funnel. The numbers are computed by code, the AI writes the text, and a check verifies every number.
- **Driver's phone and chat:** from a candidate ("Driver's view") or a pickup ("Driver's chat").
- **Driver questions:** in Live Ops. The assistant says it is an AI. Its weekly numbers are folded away.
- **Demo menu:** the clock icon. It holds the simulated time (+2 h, +1 day, +3 days), what ran by itself, the automated-texts switch, the HubSpot mapping, and Reset demo.
- **Present:** five steps through the case, Part 1 first. Each part shows the problem, then the fix: a stuck driver, the playbook; the funnel, review within 48 h, from accepted to active. The app stays usable at every step. ← and → move between steps.

## Run it

```
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests (Vitest)
npm run eval     # the AI checks (needs ANTHROPIC_API_KEY)
```

Stack: React 18, TypeScript, Vite, Tailwind, Claude Haiku for the assistant and the report. Every push to `main` deploys through Vercel.
