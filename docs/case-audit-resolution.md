# Case 1 and 2 audit: implementation record

27 October 2026. Updated after the user's KPI, call-clock and demo corrections. Existing app, sixteen-step guide and nine-slide deck updated in place. No backend, new platform build, authenticated policy approval or measured business improvement is claimed.

| Audit point | Resolution |
|---|---|
| 1 Conversion | Monthly new active/applications is primary with target 35%. Mature-cohort conversion is supporting, without a target. |
| 2 Total 48-hour process | Owner contact from 24 h on incomplete files; same original deadline, explicit exceptions and misses. No rushed or invented decisions. |
| 3 Booking is not activation | Passed/undelivered and interrupted bookings require Ops work. The first-drive step completes only on delivery. |
| 4 Replacement | Requires customer-agreed pickup and delivery. Same-driver confirmation is optional; otherwise a separate unassigned transport stays open with an owner. Confirmed same-driver first drive updates the applicant link. |
| 5 Suitability | Claims narrowed to defined checks. Other grounds explicitly await agreed policy, with manager review. |
| 6 Closure | Incomplete after 14 days is a human review, not inferred silence; review recent replies before closure. |
| 7 Review blocks | Same weekday calendar; four 15-minute appointments per block; exceptions owned before the original deadline. |
| 8 Availability | Daytime blocks are standard, not the only permissible process; existing Ops support handles exceptions. |
| 9 Extract arrival | Removed five-day arrival promise. Lead time is a conditional planning floor; processing plus post is explicit. |
| 10 Release | Customer job stays visible as unassigned until another driver reserves it; no guaranteed reassignment claim. |
| 11 Five-minute check | Estimated conversation, with a 15-minute reservation. |
| 12 Blocker-specific next step | Extract state and missing demand precede generic booking prompts. Day-7/day-14 tasks apply only to ready, accepted drivers without booking/delivery; document nudges remain pre-decision. |
| 13 Logged contacts | Outcomes alter next action; unsuccessful contact has an explicit proposed three-day retry. |
| 14 Report calls | Report recommendation uses day 14, not day 7. |
| 15 Normal check-in | Five-minute ordinary handover grace; explicit reports start AI immediately and require an Ops call by report +10 minutes, earlier for urgent risk. No second countdown. |
| 16 Short-notice booking | One immediate confirmation with a bounded reply deadline. |
| 17 Unreachable customer | Recommend feasible options; escalate to duty lead. An authorised Ops-stop log does not pretend the customer chose cancellation. |
| 18 Incident clock | Assumed driving, handover and buffer made explicit; departure is an estimate. |
| 19 Close the loop | Booker meeting mandatory for pilot incidents, optional for routine incidents; follow-up owner retained. |
| 20 Compensation | Proposed half-reward cancellation treatment consistent when released, waiver not preselected, incident fee scope explicit. Actual rates/authority await Flovi. |
| 21 Delivery quality | Original deadline preserved in outcome; customer causes are not interpreted as driver blame; unknown feedback separate. |
| 22 Background check | No-copy handling does not certify policy/legal suitability, especially for video. Explicit validation boundary retained. |
| 23 Eligibility thresholds | Age 20 and licence tiers labelled proposals; exact 1 to <2 range; no invented insurance approval. |
| 24 Targets | Pilot hypotheses, cohort baseline unknown; removed multiplicative forecast. |
| 25 Improvement measurement | Mean decision time primary; median and within-48 h available; open overdue work visible. Historical/cohort windows and weekly review purpose explicit. |
| 26 Capacity inference | Removed jobs-per-driver capacity/recruitment conclusions from the active report. Legacy helper is not a production recommendation. |
| 27 Support/AI | Service levels explicitly proposed; AI answer percentage is diagnostic, with no automation target in active UI/report. |
| 28 Platform | Honest mismatch with named brief platforms documented; reviewer acceptance remains external. No rebuild or acceptance claimed. |
| 29 End-to-end demo | Separate Case 1 solution replay shows report → AI → Ops → individual playbook actions, retaining original brief facts. Same Ahmed self-books, checks in, receives keys, departs and delivers with normal controls; demo clock is explicit. |
| 30 Completion wording | Registration completion distinguished from document completion; rejected-path prerequisites visible; free navigation retained. |
| 31 Guide density | Short problem/solution/action; pending instruction replaces duplicate text; evidence folded. |
| 32 Focus | Stable targets, scroll and outline; no blocking spotlight overlay or tour-engine dependency. |
| 33 Visual priority | Four primary KPIs; guardrails/cohort detail folded; next actions and blockers stay visible. |
| 34 Copy vs behavior | Manual action logs follow-up, no fake sent message; original deadline, reversible manual ID checkbox and exact first-drive date wording. |
| 35 Documentation | README, submission note and mapping aligned; old welcome field removed; Proposed uses clickable help. |
| 36 Supporting detail | Help-content gaps folded; integrations, retention and AI details remain optional. Weekly review selects a blocker and testable process change. |

## Validation

401 unit/regression tests pass; the production build passes. Browser checks verify report → AI → the 10-minute Ops deadline, individual action logging, customer-agreed replacement timing without the same driver, closure with an unassigned transport remaining, and reversible manual ID checks. KPI/dashboard and updated slides were visually checked; native slide text was read back. External calls and messages remain simulated.

## External decisions

Flovi still needs to approve eligibility/insurance thresholds, background-check method and handling, staffing/exception coverage, compensation and waiver authority, retention periods and pilot targets. The reviewer must accept the different build platform. These are openly described proposals, not software defects that can be resolved by asserting approval.
