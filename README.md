# Driver Funnel Cockpit (short version)

A clickable prototype for a car-relocation service's operations case, with one page per part of the case. Demo data only, no real people. Built by Hjalmar Widlund with Claude Code.

**Live:** https://driver-funnel-cockpit-lite.vercel.app

## Part 1 · A driver stuck at a pickup

The page opens on the case at **Tuesday 09:30**. The pickup was agreed for 09:00, and the driver has waited 25 minutes. The pickup contact isn't answering, and nobody on site knows about the transport.

1. **Handle it now: the playbook.**
   - **The clock:** the agreed pickup, the waiting time, when the customer must decide (10:15), the last departure (10:50) and the deadline (12:00).
   - **Six steps**, each logged with the time:
     - keep the driver (stay, the waiting time is paid)
     - rule out our own error
     - call the contact, then the backup
     - tell the customer before they ask
     - the customer decides
     - close the loop with a cause
2. **Prevent it: the pre-pickup check.** Four touchpoints, each saying what to confirm, who does it and when:
   - at booking
   - 24 hours before (a person calls a new site or a pilot customer)
   - 60 minutes before
   - on arrival
   
   The pickups for today and tomorrow show where each check stands. When nobody replied, there is a button to log the call to the backup, and for a new site one to log the call to the site.

## Part 2 · From application to active driver

- **Funnel scoreboard:** Registered → Docs submitted → Reviewed → Accepted → Active, with the biggest drop-off marked. The lines under each number add up to it.
- **Four metrics:** application → active (the north star), document completion, time to decision and activation within 14 days.
- **Review queue:** sorted by the 48-hour target, with written criteria in three tiers:
  - **Must-have:** licence, BankID, photo, and the criminal-record extract shown before the first drive, never stored.
  - **Borderline:** a written rule decides.
  - **Reject:** always with a reason code.
  
  Only the decisions the rules allow are possible.
- **Missing documents:** reminders at 2 h, 24 h and 72 h, and a person closes the file after 14 days.
- **Awaiting first gig:** book a first gig after 7 days, call the driver after 14.

**Reset demo** starts over at Tuesday 09:30.

## Run it

```
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests (Vitest)
```

Stack: React 18, TypeScript, Vite, Tailwind. Every push to `main` deploys through Vercel.
