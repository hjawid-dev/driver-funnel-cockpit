import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarClock, Route } from 'lucide-react';
import { useClock, useDemoData } from './state';
import { computeFunnel, computeKpis, type FunnelKey } from './lib/kpis';
import { nextReviewSlot } from './lib/sla';
import { caseTime, formatDateTime, formatDuration } from './lib/time';
import { AllApplicants, type StageFilter } from './components/AllApplicants';
import { HubspotModal } from './components/HubspotModal';
import { ApplicantDrawer } from './components/ApplicantDrawer';
import { Toast, useToast } from './components/Toast';
import type { ActionResult } from './lib/actions';
import { DriverPhone } from './components/driver/DriverPhone';
import { automationEvents, chatEvents, liveOpsEvents, reportEvents, summarize, type AutoEvent } from './lib/automation';
import { ReportModal } from './components/ReportModal';
import type { Applicant } from './lib/types';
import type { ChatThread } from './lib/chat/types';
import { HANDOVER_LABEL } from './lib/chat/types';
import { REASON_LABEL } from './lib/sms';
import { waitingThreads } from './lib/chat/threads';
import { releaseDue } from './lib/extract';
import { assisting, currentJob, driverUpdate, escalate, firstDriveResult, incidentClock, jobAlert, openIncidents, reportProblem, syncFirstDrive, type Job } from './lib/liveOps';
import { canStartDrive } from './lib/eligibility';
import { completeFirstGig } from './lib/actions';
import { backToAi, callRequested, emptyThread, keysFoundByDriver, opsReply, pickupReported, relayContactReply, solvedNote, textsSentNote, threadIdFor } from './lib/chat/threads';
import { REVIEWER } from './lib/types';
import { LiveOps, type LiveSelection } from './components/LiveOps';
import { DemoMenu } from './components/DemoMenu';
import { PresentBar, type GuideView } from './components/PresentBar';
import { Proposed } from './components/ui';
import { FunnelKpis, FunnelStages } from './components/FunnelOverview';
import { WorkQueue } from './components/WorkQueue';
import { filterItems, QUEUE_FILTER_LABEL, queueCounts, workItems, type QueueFilter } from './lib/workQueue';
import { docsTarget, PRESENT_STEPS, reviewTarget, guideDestination, focusGuideStep, presentEvidence, guideStatus, followUpTargets } from './lib/present';

/**
 * Two connected jobs, one page each.
 * Driver Funnel builds a supply of qualified, active drivers (Part 2 of the case).
 * Live Ops keeps that supply delivering when something goes wrong at a pickup (Part 1).
 */
type Page = 'funnel' | 'live';
const PAGE_LABEL: Record<Page, string> = { funnel: 'Driver Funnel', live: 'Live Ops' };
const PAGE_SUB: Record<Page, string> = {
  funnel: 'Turn qualified applicants into active drivers.',
  live: 'Keep pickups on track and resolve incidents before they affect delivery.',
};
const FILTERS: QueueFilter[] = ['action', 'missing', 'review', 'awaiting', 'all'];

const TEXTS_KEY = 'driver-funnel-cockpit-texts';

export default function App() {
  const clock = useClock();
  const now = clock.now;
  const { apps, gigs, threads, jobs, update, add, upsertThread, updateJob, updateJobs, reset, recordThrough } = useDemoData();
  const toast = useToast();
  useEffect(() => { recordThrough(now); }, [now, recordThrough]);

  const [page, setPage] = useState<Page>(() => (window.location.hash === '#funnel' ? 'funnel' : 'live'));
  const [filter, setFilter] = useState<QueueFilter>('action');
  const [stageFilter, setStageFilter] = useState<StageFilter>('all');
  const [liveSel, setLiveSel] = useState<LiveSelection>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [showHubspot, setShowHubspot] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [present, setPresent] = useState<number | null>(null);
  const [guideApplicantId, setGuideApplicantId] = useState<string | null>(null);
  // Bumped when the cockpit opens the phone on the chat; 0 opens it on the steps.
  const [chatRequest, setChatRequest] = useState(0);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [phoneId, setPhoneId] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<{ from: number; to: number; events: AutoEvent[] } | null>(null);
  // The metrics when the demo started: the ▲▼ chips show how your clicks moved them.
  const [baseline, setBaseline] = useState(() => computeKpis(apps, now));
  // Ops' switch for automated texts to pickup contacts. Kept in this browser.
  const [textsEnabled, setTextsEnabled] = useState(() => {
    try {
      return localStorage.getItem(TEXTS_KEY) !== 'off';
    } catch {
      return true;
    }
  });
  const switchTexts = (on: boolean) => {
    setTextsEnabled(on);
    try {
      localStorage.setItem(TEXTS_KEY, on ? 'on' : 'off');
    } catch {
      /* private mode: the switch still works for this visit */
    }
    toast.notify(on ? 'Automated texts to pickup contacts are on.' : 'Automated texts are off: every stuck pickup goes straight to a person.');
  };

  const open = apps.find((a) => a.id === openId) ?? null;
  const close = useCallback(() => setOpenId(null), []);
  const openApplicant = useCallback((id: string) => {
    setPhoneOpen(false);
    setOpenId(id);
  }, []);
  const closeReport = useCallback(() => setShowReport(false), []);
  const closeHubspot = useCallback(() => setShowHubspot(false), []);

  const showPage = (p: Page) => {
    setPage(p);
    window.scrollTo({ top: 0 });
  };

  /** Start over on the case as the brief gives it: a fresh demo on Tuesday 09:30, Julia 25 minutes at the gate. */
  const playCase = useCallback(
    (quiet = false) => {
      const at = caseTime(Date.now());
      const fresh = reset(at, true);
      clock.setTo(at);
      setLastRun(null);
      setPhoneId(null);
      setBaseline(computeKpis(fresh, at));
      setOpenId(null);
      setFilter('action');
      setStageFilter('all');
      setLiveSel(null);
      if (!quiet) toast.notify('Demo reset: Tuesday 09:30, fresh data. Julia has waited 25 minutes at the pickup.');
    },
    [reset, clock, toast.notify],
  );

  // The demo always runs on the case. A first visit (or an old save) starts there; only on the first render.
  // The case always moves the clock, so case data with an unmoved clock is a half-saved state: play it again.
  useEffect(() => {
    if (!jobs.some((j) => j.asInCase) || clock.offset === 0) playCase(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** A first drive booked or moved (by the driver, in the chat or by ops) becomes a job in Live Ops. */
  const syncFirstDriveFor = useCallback(
    (prev: Applicant | undefined, next: Applicant) => {
      if (prev?.firstGig?.bookedFor === next.firstGig?.bookedFor && prev?.firstGig?.gigId === next.firstGig?.gigId) return;
      updateJobs((js) => syncFirstDrive(js, next, gigs));
    },
    [updateJobs, gigs],
  );

  // A first drive whose extract wasn't shown by the day before goes back to the pool (checked as the clock moves).
  useEffect(() => {
    const due = releaseDue(apps, now);
    if (!due.length) return;
    for (const next of due) {
      update(next);
      updateJobs((js) => syncFirstDrive(js, next, gigs));
    }
    toast.notify(`${due.map((a) => a.name.split(' ')[0]).join(', ')}: first drive released, the extract wasn't shown by the day before.`);
  }, [apps, now, gigs, update, updateJobs, toast.notify]);

  const onResult = useCallback(
    (r: ActionResult, closeDrawer = false) => {
      // A refused action says why, so a button never silently does nothing.
      if (!r.ok) return toast.notify(r.error);
      const prev = apps.find((a) => a.id === r.applicant.id);
      update(r.applicant);
      syncFirstDriveFor(prev, r.applicant);
      toast.notify(r.message);
      if (closeDrawer) setOpenId(null);
    },
    [apps, update, syncFirstDriveFor, toast.notify],
  );

  // ---- The driver's phone ----
  const openAsDriver = useCallback((id: string | null) => {
    setPhoneId(id);
    setPhoneOpen(true);
    setChatRequest(0);
    setOpenId(null);
  }, []);

  const openDriverChat = useCallback((id: string | null) => {
    setOpenId(null);
    setPhoneId(id);
    setPhoneOpen(true);
    setChatRequest(Date.now());
  }, []);

  const onThread = useCallback(
    (incoming: ChatThread) => {
      let t = incoming;
      const prev = threads.find((x) => x.id === t.id);
      const job = t.applicantId ? currentJob(jobs, t.applicantId, now) : null;
      const newest = t.messages.length > (prev?.messages.length ?? 0) ? t.messages.at(-1) : undefined;
      const hasKeys = job?.keysAt !== undefined && job.keysAt <= now;
      // Stuck at a pickup: the assistant takes the first minutes and Live Ops shows it. Without a job today, a person answers.
      if (newest?.handover === 'pickup') {
        if (job && !hasKeys) {
          upsertThread(t);
          if (job.problemAt === undefined) {
            const next = reportProblem(job, now);
            updateJob(next);
            const until = assisting(next, now)?.until;
            toast.notify(`${t.name} is stuck at a pickup. The assistant is on it${until ? `; a person takes over at ${new Date(until).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} if it isn't solved` : ''}. See Live Ops.`);
          }
          return;
        }
        t = { ...t, status: 'waiting', waitingSince: now, reason: 'urgent' };
      }
      upsertThread(t);
      // Something on a drive a person must handle (damage, safety, the car won't start): Live Ops has it as urgent at once.
      if (t.status === 'waiting' && t.reason === 'urgent' && job && !hasKeys && jobAlert(job, now)?.kind !== 'escalated') updateJob(escalate(job, 'safety', now));
      if (t.status === 'waiting' && prev?.status !== 'waiting') {
        toast.notify(
          t.reason === 'urgent'
            ? `Urgent: ${t.name} has a problem on a drive. Call within 5 minutes: see Live Ops.`
            : `${t.name} needs a person in the chat${t.reason ? `: ${HANDOVER_LABEL[t.reason].toLowerCase()}` : ''}. See Live Ops → Driver questions.`,
        );
      }
    },
    [threads, jobs, now, upsertThread, updateJob, toast.notify],
  );

  const onDriverCreate = useCallback(
    (a: Applicant) => {
      add(a);
      if (present !== null && PRESENT_STEPS[present].key === 'onboarding') setGuideApplicantId(a.id);
      setPhoneId(a.id);
      toast.notify(`New applicant: ${a.name} registered in the driver app.`);
    },
    [add, toast.notify, present],
  );

  const onDriverUpdate = useCallback(
    (next: Applicant) => {
      const prev = apps.find((a) => a.id === next.id);
      update(next);
      syncFirstDriveFor(prev, next);
      if (!prev) return;
      if (!prev.docsCompleteAt && next.docsCompleteAt) toast.notify(`${next.name}: file complete, auto-queued for review.`);
      else if (!prev.callAt && next.callAt) toast.notify(`${next.name} booked the onboarding call: ${formatDateTime(next.callAt)}.`);
      else if (prev.callAt && next.callAt && prev.callAt !== next.callAt) toast.notify(`${next.name} moved the onboarding call to ${formatDateTime(next.callAt)}.`);
      else if (!prev.reminders?.offAt && next.reminders?.offAt) toast.notify(`${next.name} stopped the reminders in the chat.`);
      else if (next.reminders?.snooze && prev.reminders?.snooze?.until !== next.reminders.snooze.until) toast.notify(`${next.name} asked for a reminder ${formatDateTime(next.reminders.snooze.until)}.`);
      else if (!prev.firstGig?.gigId && next.firstGig?.gigId) toast.notify(`${next.name} picked a first drive. It shows in Awaiting first gig.`);
    },
    [apps, update, syncFirstDriveFor, toast.notify],
  );

  // The driver's taps on today's job: the cockpit says what changed.
  const onDriverJob = useCallback(
    // `base` is the thread as the chat just changed it (a confirmed proposal), so that change isn't lost.
    (next: Job, base?: ChatThread) => {
      const prev = jobs.find((j) => j.id === next.id);
      const driverBefore = apps.find(a => a.id === next.driverId);
      if (next.firstDrive && driverBefore && ((!prev?.arrivedAt && next.arrivedAt) || (!prev?.departedAt && next.departedAt) || (!prev?.deliveredAt && next.deliveredAt))) {
        const error = canStartDrive(driverBefore);
        if (error) return toast.notify(error);
      }
      if (next.firstDrive && driverBefore && !prev?.deliveredAt && next.deliveredAt) {
        const result = completeFirstGig(driverBefore, { ...firstDriveResult(next), delivery: { jobId: next.id, at: next.deliveredAt } }, now);
        if (!result.ok) return toast.notify(result.error);
      }
      updateJob(next);
      const first = next.driverName.split(' ')[0];
      if (!prev) return;
      const a = apps.find((x) => x.id === next.driverId) ?? null;
      // One thread update per tap, built up in order, so nothing a step adds is lost.
      const stored = threads.find((x) => x.id === threadIdFor(next.driverId)) ?? emptyThread(a);
      let t = base ?? stored;
      const before = stored;
      const hhmm = (ts: number) => new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      const roles = [next.contact.role.toLowerCase(), next.backup.role.toLowerCase()];
      const until = assisting(next, now)?.until ?? null;
      let note: string | null = null;
      if (next.problemReason && next.problemReason !== prev.problemReason) {
        t = pickupReported(t, next.problemReason, roles, until, now, !(prev.texts ?? []).length && (next.texts ?? []).length > 0);
        note = `${first} reported a problem at the pickup: ${REASON_LABEL[next.problemReason].toLowerCase()}.${until ? ` The assistant has it; a person takes over at ${hhmm(until)} if it isn't solved.` : ''} See Live Ops.`;
      }
      if (!(prev.texts ?? []).length && (next.texts ?? []).length) {
        t = textsSentNote(t, next.texts!.map((x) => x.role.toLowerCase()), next.texts![0].body, now);
        note = `${first} sent the automated text to the ${roles.join(' and the ')} (${next.id}).`;
      }
      if (!prev.escalation && next.escalation) {
        if (next.escalation.why === 'driver') t = callRequested(t, now);
        note =
          next.escalation.why === 'text_failed'
            ? `Urgent: the automated text couldn't go out, so ${first}'s pickup is with a person now (${next.id}). See Live Ops.`
            : `Urgent: ${first} ${next.escalation.why === 'driver' ? 'asked for a call' : 'needs a person now'} (${next.id}). See Live Ops.`;
      }
      const solved = !prev.incident && next.incident?.by === 'assistant';
      if (solved) {
        t = solvedNote(t, now);
        note = `${first} has the keys: solved by the assistant (${next.id}).`;
      }
      const keysNow = !solved && !(prev.keysAt !== undefined && prev.keysAt <= now) && next.keysAt !== undefined && next.keysAt <= now;
      if (keysNow) t = keysFoundByDriver(t, now);
      if (t !== before) upsertThread(t);
      if (note) toast.notify(note);
      else if (keysNow) toast.notify(`${first} has the keys (${next.id}).`);
      else if (!prev.arrivedAt && next.arrivedAt) toast.notify(`${first} checked in at the pickup (${next.id}).`);
      else if (!prev.departedAt && next.departedAt) toast.notify(`${first} is on the way to the drop-off (${next.id}).`);
      else if (!prev.deliveredAt && next.deliveredAt) {
        // A first drive delivered: the driver is active, and first-gig quality counts it.
        const driver = next.firstDrive ? apps.find((x) => x.id === next.driverId) : undefined;
        const r = driver ? completeFirstGig(driver, { ...firstDriveResult(next), delivery: { jobId: next.id, at: next.deliveredAt! } }, now) : null;
        if (r?.ok) {
          toast.notify(`${first} delivered the first drive: now an active driver.`);
        } else toast.notify(`${first} delivered the car (${next.id}).`);
      }
    },
    [jobs, apps, threads, now, update, updateJob, upsertThread, toast.notify],
  );

  const onAdvance = (ms: number) => {
    const w = clock.advance(ms);
    const events = [...automationEvents(apps, w.from, w.to), ...chatEvents(threads, w.from, w.to), ...liveOpsEvents(jobs, w.from, w.to), ...reportEvents(w.from, w.to)].sort((x, y) => x.at - y.at);
    setLastRun({ ...w, events });
    toast.notify(`Time moved forward. Automation: ${summarize(events)}.`);
  };

  const onJob = useCallback(
    (j: Job, message: string) => {
      const prev = jobs.find((x) => x.id === j.id);
      updateJob(j);
      toast.notify(message);
      // In the demo the pickup contact answers the assistant's text: the assistant passes it on to the driver.
      if (!prev?.contactReply && j.contactReply) {
        const a = apps.find((x) => x.id === j.driverId) ?? null;
        upsertThread(relayContactReply(threads.find((x) => x.id === threadIdFor(j.driverId)) ?? emptyThread(a), j.contact.role, j.contactReply.text, now));
        return;
      }
      // The driver hears the decision in the chat, and the chat goes back to the assistant when the incident is closed.
      const decided = !prev?.incident?.outcome && j.incident?.outcome;
      const closed = prev?.incident?.closedAt === undefined && j.incident?.closedAt !== undefined;
      if (!decided && !closed) return;
      const a = apps.find((x) => x.id === j.driverId) ?? null;
      let t = threads.find((x) => x.id === threadIdFor(j.driverId)) ?? emptyThread(a);
      if (decided) t = opsReply(t, driverUpdate(j, j.incident!.outcome!.type, now), REVIEWER, now);
      if (closed && t.status !== 'ai') t = backToAi(t, now);
      upsertThread(t);
    },
    [jobs, apps, threads, now, updateJob, upsertThread, toast.notify],
  );

  // ---- What the two pages show ----
  const funnel = useMemo(() => computeFunnel(apps), [apps]);
  const kpis = useMemo(() => computeKpis(apps, now), [apps, now]);
  const items = useMemo(() => workItems(apps, gigs, now), [apps, gigs, now]);
  const counts = queueCounts(items, apps.length);
  const shownItems = filterItems(items, filter);
  const openItem = items.find((w) => w.a.id === openId) ?? null;
  const slot = nextReviewSlot(now);
  const urgent = openIncidents(jobs, now).filter((j) => !j.incident?.outcome).length;
  const questions = waitingThreads(threads).length;

  const toQueue = () => setTimeout(() => document.getElementById('queue')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  // A stage opens the people who are there now.
  const onStage = (k: FunnelKey) => {
    if (k === 'registered') setFilter('missing');
    else if (k === 'docs') setFilter('review');
    else if (k === 'accepted') setFilter('awaiting');
    else {
      setFilter('all');
      setStageFilter(k === 'active' ? 'active' : 'reviewed_rejected');
    }
    toQueue();
  };
  const pickFilter = (f: QueueFilter) => {
    setFilter(f);
    if (f === 'all') setStageFilter('all');
  };

  // The guide changes views only. All decisions, bookings and delivery use the ordinary controls.
  const presentData = { apps, gigs, threads, jobs };
  const currentPresent = present === null ? null : PRESENT_STEPS[present];
  const goStep = (i: number) => {
    const step = PRESENT_STEPS[i];
    if (!step) return;
    const target = guideDestination(step.key, presentData, guideApplicantId);
    setPresent(i);
    setShowReport(false);
    setShowHubspot(false);
    setStageFilter('all');
    setPage(target.page);
    setFilter(target.filter);
    setLiveSel(target.liveId);
    setOpenId(target.applicantId);
    setPhoneId(target.driverId);
    setChatRequest(target.phone === 'chat' ? n => n + 1 : 0);
    setPhoneOpen(target.phone !== null);
    window.scrollTo({ top: 0 });
    setTimeout(() => focusGuideStep(step.key), 100);
  };
  const guideExplore = (view: GuideView) => {
    if (view === 'target' && present !== null) return goStep(present);
    if (view === 'report') return setShowReport(true);
    setOpenId(null);
    setPhoneOpen(false);
    if (view === 'start') {
      setPhoneId(null); setChatRequest(0); setPhoneOpen(true);
    } else if (view === 'reminders') {
      setPage('funnel'); setOpenId(docsTarget(apps)?.id ?? null);
      setTimeout(() => {
        [...document.querySelectorAll<HTMLElement>('h3')].find(e => e.textContent?.trim().startsWith('Nudges'))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } else if (view === 'criteria') {
      setPage('funnel'); setOpenId(reviewTarget(apps)?.id ?? null);
    } else if (view === 'followup_reminder' || view === 'followup_call') {
      const examples = followUpTargets(presentData, now);
      setPage('funnel'); setFilter('awaiting'); setOpenId((view === 'followup_reminder' ? examples.reminder : examples.call)?.id ?? null);
    } else if (view === 'job') {
      setPage('live'); setLiveSel(jobs.find(j => j.firstDrive && j.driverId === reviewTarget(apps)?.id)?.id ?? null);
    }
  };
  const guideIncident = jobs.find(j => j.asInCase);
  const guideJumpAt = currentPresent?.key === 'decision' && guideIncident && !guideIncident.incident?.outcome ? incidentClock(guideIncident, now).decideBy : null;
  const guideJumpLabel = guideJumpAt && guideJumpAt > now ? `Move demo time to decision point (${new Date(guideJumpAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })})` : null;
  // While presenting, the header and the bar stick to the top; drawers and dialogs open below them.
  const topRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = document.documentElement.style;
    const el = topRef.current;
    if (present === null || !el) {
      root.removeProperty('--present-top');
      return;
    }
    const set = () => root.setProperty('--present-top', `${el.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, [present]);
  // ← and → move between the steps, unless you are typing.
  useEffect(() => {
    if (present === null) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target instanceof Element ? e.target : null;
      if (t?.closest('input, textarea, select, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'ArrowRight' && present < PRESENT_STEPS.length - 1) goStep(present + 1);
      else if (e.key === 'ArrowLeft' && present > 0) goStep(present - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const startPresenting = () => {
    clock.pause();
    playCase(true);
    setPhoneOpen(false);
    setPage('live');
    setLiveSel(null);
    setPresent(0);
    setGuideApplicantId(null);
    window.scrollTo({ top: 0 });
    toast.notify('Case demo started: fresh data, Tuesday 09:30.');
  };

  return (
    <div className="min-h-screen flex">
      <div className="min-w-0 flex-1 flex flex-col">
        <div ref={topRef} className={`${present !== null ? 'sticky top-0 z-[60]' : ''} ${open ? 'lg:w-[calc(100%_-_520px)]' : ''}`}>
        <header className="bg-navy text-white">
          <div className="mx-auto max-w-7xl px-4 h-14 flex items-center gap-3">
            <span className="hidden sm:inline font-semibold tracking-tight whitespace-nowrap">Driver Ops</span>
            <nav aria-label="Pages" className="sm:ml-2 flex rounded-lg bg-white/10 p-0.5 text-sm font-semibold">
              {(['live', 'funnel'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => showPage(p)}
                  aria-current={page === p ? 'page' : undefined}
                  className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1 ${page === p ? 'bg-white text-navy' : 'text-white/80 hover:text-white'}`}
                >
                  {PAGE_LABEL[p]}
                  {p === 'live' && urgent > 0 && (
                    <span className="num rounded-full bg-bad px-1.5 text-xs text-white">
                      {urgent}
                      <span className="sr-only"> urgent</span>
                    </span>
                  )}
                </button>
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-1">
              {present === null && (
                <button
                  type="button"
                  onClick={startPresenting}
                  title="Explore case 1 and case 2 step by step with fresh demo data"
                  className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-white/85 hover:bg-white/10 hover:text-white"
                >
                  <Route size={15} aria-hidden /> <span className="hidden sm:inline">Explore cases</span>
                  <span className="sr-only sm:hidden">Explore cases</span>
                </button>
              )}
              <DemoMenu
                now={now}
                onAdvance={onAdvance}
                onReset={() => playCase()}
                onPhone={() => openAsDriver(phoneId)}
                onHubspot={() => setShowHubspot(true)}
                textsEnabled={textsEnabled}
                onTexts={switchTexts}
                lastRun={lastRun}
              />
            </div>
          </div>
        </header>
        {present !== null && <PresentBar step={present} onStep={goStep} onExit={() => { setPresent(null); clock.resume(); }} evidence={currentPresent ? presentEvidence(currentPresent.key, presentData) : ''} status={currentPresent ? guideStatus(currentPresent.key, presentData, guideApplicantId) : { kind: 'explore', text: '' }} onExplore={guideExplore} jumpLabel={guideJumpLabel} onJump={() => { if (guideJumpAt && guideJumpAt > now) onAdvance(guideJumpAt - now); }} />}
        </div>

        <main className="flex-1 mx-auto max-w-7xl w-full px-4 py-6 space-y-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{PAGE_LABEL[page]}</h1>
            <p className="mt-0.5 text-sm text-muted">{PAGE_SUB[page]}</p>
          </div>

          {page === 'funnel' ? (
            <>
              <FunnelKpis kpis={kpis} baseline={baseline} onReport={() => setShowReport(true)} />
              <FunnelStages funnel={funnel} onStage={onStage} />
              <section id="queue" aria-labelledby="queue-title" className="scroll-mt-[calc(var(--present-top,0px)+1rem)]">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h2 id="queue-title" className="flex items-center gap-1.5 text-sm font-semibold">
                    Candidates
                    <Proposed title="The follow-up rules are my proposal, not given in the case: reminders at 2, 24 and 72 h, close after 14 days without a reply, two review slots a day, the driver books from matching offers, reminder at 7 days without booking, call at 14." />
                  </h2>
                  <span className="flex items-center gap-1.5 text-xs text-muted">
                    <CalendarClock size={14} className="text-indigo" aria-hidden />
                    Next review slot <strong className="num font-semibold text-navy">{slot.time}</strong> {slot.day} · in {formatDuration(slot.at - now)}
                  </span>
                </div>
                <div role="tablist" aria-label="Filter candidates" className="mb-3 flex gap-1 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
                  {FILTERS.map((f) => (
                    <button
                      key={f}
                      type="button"
                      role="tab"
                      aria-selected={filter === f}
                      onClick={() => pickFilter(f)}
                      className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold ${
                        filter === f ? 'border-indigo bg-indigo text-white' : 'border-lavender bg-white text-navy hover:border-indigo'
                      }`}
                    >
                      {QUEUE_FILTER_LABEL[f]}
                      <span className={`num text-xs ${filter === f ? 'text-white/80' : 'text-muted'}`}>{counts[f]}</span>
                    </button>
                  ))}
                </div>
                {filter === 'all' ? (
                  <AllApplicants apps={apps} now={now} filter={stageFilter} onFilter={setStageFilter} onOpen={openApplicant} />
                ) : (
                  <WorkQueue key={filter} items={shownItems} filter={filter} onOpen={openApplicant} />
                )}
              </section>
            </>
          ) : (
            <LiveOps jobs={jobs} now={now} onJob={onJob} onViewChat={openDriverChat} selected={liveSel} onSelect={setLiveSel} focus={null} threads={threads} waitingQuestions={questions} onThread={onThread} />
          )}
        </main>

        {open && (
          <ApplicantDrawer
            applicant={open}
            apps={apps}
            gigs={gigs}
            now={now}
            next={openItem}
            onClose={close}
            onUpdate={update}
            onResult={onResult}
            onViewAsDriver={openAsDriver}
          />
        )}
        {showHubspot && <HubspotModal onClose={closeHubspot} />}
        {showReport && <ReportModal apps={apps} threads={threads} jobs={jobs} gigs={gigs} now={now} onClose={closeReport} />}
        <Toast message={toast.message} onDismiss={toast.dismiss} />

        <footer className="border-t border-lavender px-4 py-6 text-center text-xs text-muted">
          Driver Funnel builds a supply of qualified drivers. Live Ops keeps that supply delivering. · Prototype by Hjalmar Widlund · demo data, no real people
        </footer>
      </div>
      {phoneOpen && !open && (
        <DriverPhone
          applicantId={phoneId}
          apps={apps}
          gigs={gigs}
          threads={threads}
          jobs={jobs}
          now={now}
          chatRequest={chatRequest}
          onSelect={setPhoneId}
          onCreate={onDriverCreate}
          onUpdate={onDriverUpdate}
          onThread={onThread}
          onJob={onDriverJob}
          onJumpTo={(ts) => ts > now && onAdvance(ts - now)}
          textsEnabled={textsEnabled}
          onDecide={(id) => {
            showPage('funnel');
            openApplicant(id);
          }}
          onClose={() => setPhoneOpen(false)}
        />
      )}
    </div>
  );
}
