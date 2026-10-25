# Driver Ops

A clickable prototype for a car-relocation service's operations case. Demo data only, no real people. Built by Hjalmar Widlund with Claude Code.

**Live:** https://driver-funnel-cockpit-lite.vercel.app

Two connected jobs, one page each:

- **Driver Funnel** builds a supply of qualified, active drivers (Part 2 of the case).
- **Live Ops** keeps that supply delivering when something goes wrong at a pickup (Part 1).

## Driver Funnel: turn qualified applicants into active drivers

1. **Four metrics.** Application → active (the north star), document completion, time to decision and first-gig activation. Each shows the live demo number, its target, and the case's own baseline on a separate line, so the two are never mixed.
2. **Where candidates get stuck.** Registered → Docs submitted → Reviewed → Accepted → Active, with the share who moved on and the biggest drop-off marked. A click on a stage opens the people who are there now.
3. **One candidate queue.** Each row shows who, where they are, why now and the next action: request documents, review and decide, book a first gig, call the driver. Filters: Needs action, Missing documents, In review, Awaiting first gig, All applicants.
4. **Candidate panel.** It shows the next step at the top, then the written criteria:
   - **Must-have:** licence, BankID, photo, and the criminal-record extract shown before the first drive, never stored.
   - **Borderline:** a written rule decides.
   - **Reject:** always with a reason code.

   Only the decisions the rules allow are possible, and a person makes every one. History and logs are folded away until needed.

## Live Ops: keep pickups on track

1. **Exceptions first.** Today's pickups are grouped as Needs attention, On track and Done, each with a state: Needs a person, Issue reported, Check needed, Upcoming, At pickup, On the way, Resolved, Delivered.
2. **The incident.** The demo opens on the case at **Tuesday 09:30**: the pickup was agreed for 09:00, the driver has waited 25 minutes, and the keys are missing. The panel shows:
   - who owns it
   - the next step
   - when the customer must decide (10:15)
   - one time bar up to the 12:00 deadline
3. **The playbook.** Six steps, with the current one open:
   - keep the driver
   - rule out our own error
   - call the contact, then the backup
   - the customer hears it from us
   - the customer decides
   - close the loop with the waiting time paid and a cause

   Every step is logged with the time, and a closed incident keeps its summary.
4. **The pre-pickup check.** A routine pickup shows its touchpoints: at booking, the day before, 60 minutes before, and on arrival. The action appears when a reply is missing.

## Secondary, where it is needed

- **Weekly report:** on Driver Funnel. The numbers are computed by code, the AI writes the text, and a check verifies every number.
- **Driver's phone and chat:** from a candidate ("Driver's view") or a pickup ("Driver's chat").
- **Driver questions:** in Live Ops. The assistant says it is an AI.
- **Demo menu:** the clock icon. It holds the simulated time (+2 h, +1 day, +3 days), what ran by itself, the automated-texts switch, the HubSpot mapping, and Reset demo.
- **Present:** five steps through the case. The app stays usable at every step. ← and → move between steps.

## Run it

```
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests (Vitest)
npm run eval     # the AI checks (needs ANTHROPIC_API_KEY)
```

Stack: React 18, TypeScript, Vite, Tailwind, Claude Haiku for the assistant and the report. Every push to `main` deploys through Vercel.
