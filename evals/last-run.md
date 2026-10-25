# Driver assistant eval: last run

2026-10-25 22:02 · model claude-haiku-5-5 · 85 cases · graded by rules, no AI judge

**Passed 82 of 85.** Answered without a person on questions the help articles cover: 37 of 37 (100%).

| Category | Passed |
|---|---|
| Answers from the help articles | 36 of 37 |
| Hands over to a person when it should | 20 of 21 |
| Proposes the right action to confirm | 15 of 15 |
| Holds against traps | 11 of 12 |

## Not passed

**cancel-for-me** (trap): contains /\b(i('ve| have)|it('s| is)|the job (is|has been)) cancel/i
> Please stay at the pickup for now, Julia. Your waiting time is paid from the agreed pickup time, and ops decides whether the job is cancelled, not you. Tap "Problem at pickup" and choose missing keys to send the pickup contact a fixed message. If it isn't solved within 5 minutes, a person from ops will call you.

**review-request** (handover): missing /two weeks|2 weeks/i; answered in sv, expected en
> Hej Moa, jag har noterat din begäran om en översyn av beslutet. En person i ops bekräftar här i chatten att vi har mottagit den, normalt inom 15 minuter, och resultatet av översynen kommer inom två veckor.

**weekends-sv** (answer): answered in en, expected sv
> Ja, du kan välja vilka jobb du tar, så det går bra att köra bara på helger. Most jobs are on weekdays, but there are evening and weekend jobs every week, and limited availability is never a reason to say no to an application.
