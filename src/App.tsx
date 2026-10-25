import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, Compass, FileText, Network } from 'lucide-react';
import { useClock, useDemoData, type TabKey } from './state';
import { computeFunnel, computeKpis, reachedStage, type FunnelKey } from './lib/kpis';
import { deriveStage } from './lib/stage';
import { nextReviewSlot } from './lib/sla';
import { formatDuration } from './lib/time';
import { Scoreboard, type FunnelLink } from './components/Scoreboard';
import { KpiRow } from './components/KpiRow';
import { Tabs } from './components/Tabs';
import { ReviewQueue } from './components/ReviewQueue';
import { MissingDocs } from './components/MissingDocs';
import { Activation } from './components/Activation';
import { AllApplicants, type StageFilter } from './components/AllApplicants';
import { HubspotModal } from './components/HubspotModal';
import { ApplicantDrawer } from './components/ApplicantDrawer';
import { Toast, useToast } from './components/Toast';
import { DemoGuide } from './components/DemoGuide';
import { guideSteps } from './lib/guide';
import type { ActionResult } from './lib/actions';
import { DemoBar } from './components/DemoBar';
import { DriverPhone } from './components/driver/DriverPhone';
import { automationEvents, chatEvents, reportEvents, summarize, type AutoEvent } from './lib/automation';
import { ReportModal } from './components/ReportModal';
import type { Applicant } from './lib/types';
import type { ChatThread } from './lib/chat/types';
import { HANDOVER_LABEL } from './lib/chat/types';
import { REASON_LABEL } from './lib/sms';
import { waitingThreads } from './lib/chat/threads';
import { ChatQueue } from './components/ChatQueue';
import { formatDateTime } from './lib/time';
import { todayItems, type TodayItem } from './lib/today';
import { liveOpsEvents } from './lib/automation';
import { releaseDue } from './lib/extract';
import { assistedJobs, assisting, currentJob, driverUpdate, escalate, firstDriveResult, jobAlert, openIncidents, reportProblem, syncFirstDrive, type Job } from './lib/liveOps';
import { completeFirstGig } from './lib/actions';
import { backToAi, callRequested, emptyThread, keysFoundByDriver, opsReply, pickupReported, relayContactReply, solvedNote, textsSentNote, threadIdFor } from './lib/chat/threads';
import { REVIEWER } from './lib/types';
import { LiveOps } from './components/LiveOps';

const GUIDE_KEY = 'driver-funnel-cockpit-guide-hidden';

function readGuideHidden(): boolean {
  // ?guide=0 gives a clean view for presenting or screenshots, without changing the saved choice.
  if (new URLSearchParams(window.location.search).get('guide') === '0') return true;
  try {
    return localStorage.getItem(GUIDE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeGuideHidden(hidden: boolean) {
  try {
    localStorage.setItem(GUIDE_KEY, hidden ? '1' : '0');
  } catch {
    // Per-viewer convenience only.
  }
}

type Page = 'funnel' | 'live';
const PAGE_TABS: Record<Page, TabKey[]> = { funnel: ['review', 'missing', 'awaiting', 'all'], live: ['live', 'chat'] };
const LIVE_TABS: TabKey[] = PAGE_TABS.live;

/** A list narrowed to what was clicked, so the number clicked is the number shown. */
const TEXTS_KEY = 'driver-funnel-cockpit-texts';

type Focus = { tab: TabKey } & ({ kind: 'today'; key: TodayItem['key'] } | { kind: 'reached'; stage: FunnelKey });

export default function App() {
  const clock = useClock();
  const now = clock.now;
  const { apps, gigs, threads, jobs, update, add, upsertThread, updateJob, updateJobs, reset } = useDemoData();
  // Bumped when the cockpit opens the phone on the chat; 0 opens it on the steps.
  const [chatRequest, setChatRequest] = useState(() => (window.location.hash.startsWith('#chat') ? 1 : 0));
  // #driver opens the phone; #driver=DRV-1034 opens it as that applicant; #chat=DRV-1034 opens it on the chat (handy for presenting).
  const [phoneOpen, setPhoneOpen] = useState(() => /^#(driver|chat)/.test(window.location.hash));
  const [phoneId, setPhoneId] = useState<string | null>(() => window.location.hash.match(/^#(?:driver|chat)=(.+)$/)?.[1] ?? null);
  const [lastRun, setLastRun] = useState<{ from: number; to: number; events: AutoEvent[] } | null>(null);
  // Two pages: the driver funnel (applications to active drivers) and live ops (drives today, driver questions).
  // #live opens Live ops (handy for presenting Part 1).
  const [page, setPage] = useState<Page>(() => (window.location.hash === '#live' ? 'live' : 'funnel'));
  const [tab, setTab] = useState<TabKey>(() => (window.location.hash === '#live' ? 'live' : 'review'));
  const [focus, setFocus] = useState<Focus | null>(null);
  // Ops' switch for automated texts to customers. Kept in this browser; off means a person handles every stuck pickup.
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
    toast.notify(on ? 'Automated texts to customers are on.' : 'Automated texts are off: every stuck pickup goes straight to a person.');
  };
  const changeTab = (t: TabKey) => {
    setTab(t);
    setFocus(null);
  };
  const showPage = (p: Page) => {
    setPage(p);
    changeTab(PAGE_TABS[p][0]);
    window.scrollTo({ top: 0 });
  };
  const [openId, setOpenId] = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState<StageFilter>('all');
  const [showHubspot, setShowHubspot] = useState(false);
  const [showReport, setShowReport] = useState(false);
  // Demo guide progress this session.
  const [chatTried, setChatTried] = useState(false);
  const [reportOpened, setReportOpened] = useState(false);
  const closeReport = useCallback(() => setShowReport(false), []);
  const closeHubspot = useCallback(() => setShowHubspot(false), []);
  const toast = useToast();
  // KPI values when the page was opened (or the demo reset): the ▲▼ chips compare against this.
  const [baseline, setBaseline] = useState(() => computeKpis(apps, Date.now()));
  const [guideHidden, setGuideHidden] = useState(readGuideHidden);
  const toggleGuide = (hidden: boolean) => {
    setGuideHidden(hidden);
    writeGuideHidden(hidden);
  };
  const open = apps.find((a) => a.id === openId) ?? null;
  const close = useCallback(() => setOpenId(null), []);

  /** A first drive booked or moved (by the driver, in the chat or by ops) becomes a job in Live ops. */
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

  // ---- Demo: the driver's phone and the clock ----
  const openAsDriver = useCallback((id: string | null) => {
    setPhoneId(id);
    setPhoneOpen(true);
    setChatRequest(0);
    setOpenId(null);
  }, []);

  const openDriverChat = useCallback((id: string | null) => {
    setPhoneId(id);
    setPhoneOpen(true);
    setChatRequest(Date.now());
  }, []);

  const onThread = useCallback(
    (incoming: ChatThread) => {
      let t = incoming;
      const prev = threads.find((x) => x.id === t.id);
      if (t.messages.length > (prev?.messages.length ?? 0) && t.messages.at(-1)?.from !== 'ops') setChatTried(true);
      const job = t.applicantId ? currentJob(jobs, t.applicantId, now) : null;
      const newest = t.messages.length > (prev?.messages.length ?? 0) ? t.messages.at(-1) : undefined;
      const hasKeys = job?.keysAt !== undefined && job.keysAt <= now;
      // Stuck at a pickup: the assistant takes the first minutes and Live ops shows it. Without a job today, a person answers.
      if (newest?.handover === 'pickup') {
        if (job && !hasKeys) {
          upsertThread(t);
          if (job.problemAt === undefined) {
            const next = reportProblem(job, now);
            updateJob(next);
            const until = assisting(next, now)?.until;
            toast.notify(`${t.name} is stuck at a pickup. The assistant is on it${until ? `; a person takes over at ${new Date(until).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} if it isn't solved` : ''}. See Live ops.`);
          }
          return;
        }
        t = { ...t, status: 'waiting', waitingSince: now, reason: 'urgent' };
      }
      upsertThread(t);
      // Something on a drive a person must handle (damage, safety, the car won't start): Live ops has it as urgent at once.
      if (t.status === 'waiting' && t.reason === 'urgent' && job && !hasKeys && jobAlert(job, now)?.kind !== 'escalated') updateJob(escalate(job, 'safety', now));
      if (t.status === 'waiting' && prev?.status !== 'waiting') {
        toast.notify(
          t.reason === 'urgent'
            ? `Urgent: ${t.name} has a problem on a drive. Call within 5 minutes: see ${t.applicantId && currentJob(jobs, t.applicantId, now) ? 'Live ops' : 'Driver questions'}.`
            : `${t.name} needs a person in the chat${t.reason ? `: ${HANDOVER_LABEL[t.reason].toLowerCase()}` : ''}. See Driver questions.`,
        );
      }
    },
    [threads, jobs, now, upsertThread, updateJob, toast.notify],
  );

  const onDriverCreate = useCallback(
    (a: Applicant) => {
      add(a);
      setPhoneId(a.id);
      toast.notify(`New applicant: ${a.name} registered in the driver app.`);
    },
    [add, toast.notify],
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
      else if (next.reminders?.snooze && prev.reminders?.snooze?.until !== next.reminders.snooze.until)
        toast.notify(`${next.name} asked for a reminder ${formatDateTime(next.reminders.snooze.until)}.`);
      else if (!prev.firstGig?.gigId && next.firstGig?.gigId) toast.notify(`${next.name} picked a first drive. It shows in Awaiting first gig.`);
    },
    [apps, update, toast.notify],
  );

  // The driver's taps on today's job: the cockpit says what changed.
  const onDriverJob = useCallback(
    // `base` is the thread as the chat just changed it (a confirmed proposal), so that change isn't lost.
    (next: Job, base?: ChatThread) => {
      const prev = jobs.find((j) => j.id === next.id);
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
        note = `${first} reported a problem at the pickup: ${REASON_LABEL[next.problemReason].toLowerCase()}.${until ? ` The assistant has it; a person takes over at ${hhmm(until)} if it isn't solved.` : ''} See Live ops.`;
      }
      if (!(prev.texts ?? []).length && (next.texts ?? []).length) {
        t = textsSentNote(t, next.texts!.map((x) => x.role.toLowerCase()), next.texts![0].body, now);
        note = `${first} sent the automated text to the ${roles.join(' and the ')} (${next.id}).`;
      }
      if (!prev.escalation && next.escalation) {
        if (next.escalation.why === 'driver') t = callRequested(t, now);
        note =
          next.escalation.why === 'text_failed'
            ? `Urgent: the automated text couldn't go out, so ${first}'s pickup is with a person now (${next.id}). See Live ops.`
            : `Urgent: ${first} ${next.escalation.why === 'driver' ? 'asked for a call' : 'needs a person now'} (${next.id}). See Live ops.`;
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
        const a = next.firstDrive ? apps.find((x) => x.id === next.driverId) : undefined;
        const r = a ? completeFirstGig(a, firstDriveResult(next), now) : null;
        if (r?.ok) {
          update(r.applicant);
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

  const funnel = useMemo(() => computeFunnel(apps), [apps]);
  const kpis = useMemo(() => computeKpis(apps, now), [apps, now]);
  const counts = useMemo(() => {
    const stages = apps.map(deriveStage);
    const n = (s: string) => stages.filter((x) => x === s).length;
    // The tab counts every card on it: incidents for a person and pickups the assistant has. Only the first are urgent.
    return { live: openIncidents(jobs, now).length + assistedJobs(jobs, now).length, review: n('review'), missing: n('registered'), awaiting: n('accepted'), chat: waitingThreads(threads).length, all: apps.length };
  }, [apps, threads, jobs, now]);
  const slot = nextReviewSlot(now);
  const liveHandled = jobs.some((j) => j.incident?.outcome);
  const steps = useMemo(() => guideSteps(apps, { timeMoved: clock.offset > 0, chatTried, reportOpened, liveHandled }), [apps, clock.offset, chatTried, reportOpened, liveHandled]);

  const today = useMemo(() => todayItems(apps, threads, now, jobs), [apps, threads, now, jobs]);

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

  const resetDemo = () => {
    const fresh = reset();
    clock.resetTime();
    setLastRun(null);
    setPhoneId(null);
    setBaseline(computeKpis(fresh, Date.now()));
    setOpenId(null);
    setStageFilter('all');
    setFocus(null);
    toast.notify('Demo reset with fresh data.');
  };

  const toWorklists = () => setTimeout(() => document.getElementById('worklists')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  const openToday = (i: TodayItem) => {
    setPage(LIVE_TABS.includes(i.tab) ? 'live' : 'funnel');
    setTab(i.tab);
    setFocus({ kind: 'today', key: i.key, tab: i.tab });
    toWorklists();
  };

  // Who the focused list shows, and the line above it. Worked out on every render, so it follows the data.
  const focused = useMemo(() => {
    if (!focus || focus.tab !== tab) return null;
    if (focus.kind === 'today') {
      const i = today.find((x) => x.key === focus.key);
      return { ids: new Set(i?.ids ?? []), text: i ? `Showing ${i.label}` : 'All done here' };
    }
    const label = funnel.tiles.find((t) => t.key === focus.stage)!.label;
    const ids = new Set(apps.filter((a) => reachedStage(a, focus.stage)).map((a) => a.id));
    return { ids, text: `Showing ${ids.size} who reached ${label}` };
  }, [focus, tab, today, funnel, apps]);
  const inFocus = (id: string) => !focused || focused.ids.has(id);

  const pageToday = today.filter((i) => (page === 'live') === LIVE_TABS.includes(i.tab));
  const urgentIncidents = openIncidents(jobs, now).filter((j) => !j.incident?.outcome).length;
  const liveAlert = urgentIncidents + threads.filter((t) => t.status === 'waiting' && t.reason === 'urgent' && !jobs.some((j) => j.driverId === t.applicantId && openIncidents([j], now).length)).length;

  // A tile shows everyone who reached the stage; its second line opens the work list for who is there now.
  const jumpTo = (key: FunnelKey) => {
    setTab('all');
    setStageFilter('all');
    setFocus({ kind: 'reached', stage: key, tab: 'all' });
    toWorklists();
  };
  const openLink = (to: FunnelLink) => {
    if (to === 'rejected' || to === 'closed') {
      changeTab('all');
      setStageFilter(to);
    } else changeTab(to);
    toWorklists();
  };

  return (
    <div className="min-h-screen flex">
    <div className="min-w-0 flex-1 flex flex-col">
      <header className="bg-navy text-white">
        <div className="mx-auto max-w-7xl px-4 h-14 flex items-center gap-3">
          <span className="hidden sm:inline font-semibold tracking-tight whitespace-nowrap">Driver Ops</span>
          <span className="hidden md:inline text-xs font-medium rounded-full bg-white/10 px-2 py-0.5 whitespace-nowrap">Demo data</span>
          <nav aria-label="Pages" className="sm:ml-2 flex rounded-lg bg-white/10 p-0.5 text-sm font-semibold">
            {(['funnel', 'live'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => showPage(p)}
                aria-current={page === p ? 'page' : undefined}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1 ${page === p ? 'bg-white text-navy' : 'text-white/80 hover:text-white'}`}
              >
                {p === 'funnel' ? (
                  <>
                    <span className="sm:hidden">Funnel</span>
                    <span className="hidden sm:inline">Driver funnel</span>
                  </>
                ) : (
                  'Live ops'
                )}
                {p === 'live' && liveAlert > 0 && <span className="num rounded-full bg-bad px-1.5 text-xs text-white">{liveAlert}</span>}
              </button>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => setShowReport(true)}
              title="Weekly report"
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-white/85 hover:bg-white/10 hover:text-white"
            >
              <FileText size={15} aria-hidden />
              <span className="hidden sm:inline">Weekly report</span>
              <span className="sr-only sm:hidden">Weekly report</span>
            </button>
            <button
              type="button"
              onClick={() => setShowHubspot(true)}
              title="How this maps to HubSpot"
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-white/85 hover:bg-white/10 hover:text-white"
            >
              <Network size={15} aria-hidden />
              <span className="hidden sm:inline">How this maps to HubSpot</span>
              <span className="sr-only sm:hidden">How this maps to HubSpot</span>
            </button>
          </div>
        </div>
      </header>
      <DemoBar
        now={now}
        offset={clock.offset}
        phoneOpen={phoneOpen}
        onTogglePhone={() => setPhoneOpen((v) => !v)}
        onAdvance={onAdvance}
        onReset={resetDemo}
        lastRun={lastRun}
      />

      <main className="flex-1 mx-auto max-w-7xl w-full px-4 py-5 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{page === 'funnel' ? 'Driver funnel' : 'Live ops'}</h1>
            <p className="text-sm text-muted mt-0.5">{page === 'funnel' ? 'Application to active driver, Stockholm' : "Today's drives and driver questions, Stockholm"}</p>
          </div>
          {guideHidden && (
            <button
              type="button"
              onClick={() => toggleGuide(false)}
              className="flex items-center gap-1.5 rounded-lg border border-lavender px-3 py-2 text-sm font-semibold text-indigo hover:border-indigo"
            >
              <Compass size={15} aria-hidden /> Demo guide
            </button>
          )}
        </div>

        <section aria-label="Today" className="flex flex-wrap items-center gap-2 text-sm">
          <span className="mr-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted">Today</span>
          {pageToday.map((i) => (
            <button
              key={i.key}
              type="button"
              onClick={() => openToday(i)}
              className={`rounded-full border px-3 py-1 font-semibold transition-colors ${
                i.urgent ? 'border-bad/40 bg-bad-bg text-bad hover:border-bad' : 'border-lavender bg-white text-navy hover:border-indigo hover:text-indigo'
              }`}
            >
              {i.label}
            </button>
          ))}
          {pageToday.length === 0 && <span className="text-muted">Nothing waiting.</span>}
          {page === 'funnel' && (
            <span className="flex items-center gap-1.5 rounded-full bg-card px-3 py-1">
              <CalendarClock size={15} className="text-indigo" aria-hidden />
              Next review <strong className="num font-semibold">{slot.time}</strong> {slot.day}
              <span className="text-muted">· in {formatDuration(slot.at - now)}</span>
            </span>
          )}
        </section>

        {!guideHidden && (
          <DemoGuide
            steps={steps}
            onOpen={(id) => {
              showPage('funnel');
              setOpenId(id);
            }}
            onPhone={() => openAsDriver(apps.find((a) => a.source === 'self')?.id ?? null)}
            onChat={openDriverChat}
            onReport={() => setShowReport(true)}
            onLive={() => showPage('live')}
            onAdvance={() => onAdvance(24 * 3_600_000)}
            onHubspot={() => setShowHubspot(true)}
            onHide={() => toggleGuide(true)}
          />
        )}

        {page === 'funnel' && (
          <>
            <Scoreboard funnel={funnel} onSelect={jumpTo} onLink={openLink} />
            <KpiRow kpis={kpis} baseline={baseline} />
          </>
        )}

        <section id="worklists" className="scroll-mt-4">
          <Tabs keys={PAGE_TABS[page]} active={tab} counts={counts} alert={{ live: urgentIncidents > 0, chat: threads.some((t) => t.status === 'waiting' && t.reason === 'urgent') }} onChange={changeTab} />
          <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
            {/* A filter that already shows everyone says nothing: leave it out. */}
            {focused && (tab === 'live' || focused.ids.size !== counts[tab]) && (
              <p className="mt-4 flex flex-wrap items-center gap-x-2 rounded-lg bg-lavender/50 px-3 py-2 text-sm">
                <span className="font-semibold text-navy">{focused.text}</span>
                <span className="text-muted">·</span>
                <button type="button" onClick={() => setFocus(null)} className="font-semibold text-indigo hover:underline">
                  {/* Live ops' tab count is incidents only, so a number there would not be "all". */}
                  Show all{tab === 'live' ? '' : ` ${counts[tab]}`}
                </button>
              </p>
            )}
            {tab === 'live' ? (
              <LiveOps jobs={jobs} now={now} onJob={onJob} onViewChat={openDriverChat} only={focused?.ids} textsEnabled={textsEnabled} onTexts={switchTexts} />
            ) : tab === 'review' ? (
              <ReviewQueue apps={apps.filter((a) => deriveStage(a) === 'review' && inFocus(a.id))} now={now} onOpen={setOpenId} />
            ) : tab === 'missing' ? (
              <MissingDocs apps={apps.filter((a) => deriveStage(a) === 'registered' && inFocus(a.id))} now={now} onOpen={setOpenId} onResult={onResult} />
            ) : tab === 'awaiting' ? (
              <Activation apps={apps.filter((a) => deriveStage(a) === 'accepted' && inFocus(a.id))} all={apps} gigs={gigs} now={now} onOpen={setOpenId} />
            ) : tab === 'chat' ? (
              <ChatQueue threads={threads} now={now} onThread={onThread} onViewChat={openDriverChat} only={focused?.ids} />
            ) : (
              <AllApplicants apps={apps.filter((a) => inFocus(a.id))} now={now} filter={stageFilter} onFilter={setStageFilter} onOpen={setOpenId} />
            )}
          </div>
        </section>
      </main>

      {open && <ApplicantDrawer applicant={open} apps={apps} gigs={gigs} now={now} onClose={close} onUpdate={update} onResult={onResult} onViewAsDriver={openAsDriver} />}
      {showHubspot && <HubspotModal onClose={closeHubspot} />}
      {showReport && <ReportModal onOpened={() => setReportOpened(true)} apps={apps} threads={threads} jobs={jobs} gigs={gigs} now={now} onClose={closeReport} />}
      <Toast message={toast.message} onDismiss={toast.dismiss} />

      <footer className="text-xs text-muted text-center px-4 py-6 border-t border-lavender">
        Prototype by Hjalmar Widlund · demo data, no real people
      </footer>
    </div>
    {phoneOpen && (
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
          setOpenId(id);
        }}
        onClose={() => setPhoneOpen(false)}
      />
    )}
    </div>
  );
}
