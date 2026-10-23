import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, Compass, FileText, Network } from 'lucide-react';
import { useClock, useDemoData, type TabKey } from './state';
import { computeFunnel, computeKpis, type FunnelKey } from './lib/kpis';
import { deriveStage } from './lib/stage';
import { nextReviewSlot } from './lib/sla';
import { formatDuration } from './lib/time';
import { Scoreboard } from './components/Scoreboard';
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
import { waitingThreads } from './lib/chat/threads';
import { ChatQueue } from './components/ChatQueue';
import { formatDateTime } from './lib/time';
import { todayItems } from './lib/today';
import { liveOpsEvents } from './lib/automation';
import { currentJob, driverUpdate, openIncidents, reportProblem, type Job } from './lib/liveOps';
import { backToAi, emptyThread, opsReply, threadIdFor } from './lib/chat/threads';
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

const TILE_TO_TAB: Record<FunnelKey, TabKey> = {
  registered: 'missing',
  docs: 'review',
  review: 'review',
  accepted: 'awaiting',
  active: 'all',
};

export default function App() {
  const clock = useClock();
  const now = clock.now;
  const { apps, gigs, threads, jobs, update, add, upsertThread, updateJob, reset } = useDemoData();
  // Bumped when the cockpit opens the phone on the chat; 0 opens it on the steps.
  const [chatRequest, setChatRequest] = useState(() => (window.location.hash.startsWith('#chat') ? 1 : 0));
  // #driver opens the phone; #driver=DRV-1034 opens it as that applicant; #chat=DRV-1034 opens it on the chat (handy for presenting).
  const [phoneOpen, setPhoneOpen] = useState(() => /^#(driver|chat)/.test(window.location.hash));
  const [phoneId, setPhoneId] = useState<string | null>(() => window.location.hash.match(/^#(?:driver|chat)=(.+)$/)?.[1] ?? null);
  const [lastRun, setLastRun] = useState<{ from: number; to: number; events: AutoEvent[] } | null>(null);
  // #live opens Live ops (handy for presenting Part 1).
  const [tab, setTab] = useState<TabKey>(() => (window.location.hash === '#live' ? 'live' : 'review'));
  useEffect(() => {
    if (window.location.hash === '#live') setTimeout(() => document.getElementById('worklists')?.scrollIntoView({ block: 'start' }), 100);
  }, []);
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

  const onResult = useCallback(
    (r: ActionResult, closeDrawer = false) => {
      if (!r.ok) return;
      update(r.applicant);
      toast.notify(r.message);
      if (closeDrawer) setOpenId(null);
    },
    [update, toast.notify],
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
    (t: ChatThread) => {
      const prev = threads.find((x) => x.id === t.id);
      if (t.messages.length > (prev?.messages.length ?? 0) && t.messages.at(-1)?.from !== 'ops') setChatTried(true);
      upsertThread(t);
      // The assistant handed over a problem on a drive: the driver's job opens as an incident in Live ops.
      if (t.status === 'waiting' && t.reason === 'urgent' && t.applicantId) {
        const job = currentJob(jobs, t.applicantId, now);
        if (job && job.problemAt === undefined && !(job.keysAt !== undefined && job.keysAt <= now)) updateJob(reportProblem(job, now));
      }
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
      if (!prev) return;
      if (!prev.docsCompleteAt && next.docsCompleteAt) toast.notify(`${next.name}: file complete, auto-queued for review.`);
      else if (!prev.callAt && next.callAt) toast.notify(`${next.name} booked the extract call: ${formatDateTime(next.callAt)}.`);
      else if (prev.callAt && next.callAt && prev.callAt !== next.callAt) toast.notify(`${next.name} moved the extract call to ${formatDateTime(next.callAt)}.`);
      else if (!prev.reminders?.offAt && next.reminders?.offAt) toast.notify(`${next.name} stopped the reminders in the chat.`);
      else if (next.reminders?.snooze && prev.reminders?.snooze?.until !== next.reminders.snooze.until)
        toast.notify(`${next.name} asked for a reminder ${formatDateTime(next.reminders.snooze.until)}.`);
      else if (!prev.firstGig?.gigId && next.firstGig?.gigId) toast.notify(`${next.name} picked a first drive. It shows in Awaiting first gig.`);
    },
    [apps, update, toast.notify],
  );

  // The driver's taps on today's job: the cockpit says what changed.
  const onDriverJob = useCallback(
    (next: Job) => {
      const prev = jobs.find((j) => j.id === next.id);
      updateJob(next);
      const first = next.driverName.split(' ')[0];
      if (!prev) return;
      if (!prev.problemAt && next.problemAt) toast.notify(`Urgent: ${first} reported a problem at the pickup. See Live ops.`);
      else if (!prev.keysAt && next.keysAt) toast.notify(`${first} has the keys (${next.id}).`);
      else if (!prev.arrivedAt && next.arrivedAt) toast.notify(`${first} checked in at the pickup (${next.id}).`);
      else if (!prev.departedAt && next.departedAt) toast.notify(`${first} is on the way to the drop-off (${next.id}).`);
      else if (!prev.deliveredAt && next.deliveredAt) toast.notify(`${first} delivered the car (${next.id}).`);
    },
    [jobs, updateJob, toast.notify],
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
    return { live: openIncidents(jobs, now).length, review: n('review'), missing: n('registered'), awaiting: n('accepted'), chat: waitingThreads(threads).length, all: apps.length };
  }, [apps, threads, jobs, now]);
  const slot = nextReviewSlot(now);
  const steps = useMemo(() => guideSteps(apps, { timeMoved: clock.offset > 0, chatTried, reportOpened }), [apps, clock.offset, chatTried, reportOpened]);

  const today = useMemo(() => todayItems(apps, threads, now, jobs), [apps, threads, now, jobs]);

  const onJob = useCallback(
    (j: Job, message: string) => {
      const prev = jobs.find((x) => x.id === j.id);
      updateJob(j);
      toast.notify(message);
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
    toast.notify('Demo reset with fresh data.');
  };

  const openTab = (t: TabKey) => {
    setTab(t);
    if (t === 'all') setStageFilter('all');
    setTimeout(() => document.getElementById('worklists')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  const jumpTo = (key: FunnelKey) => {
    setTab(TILE_TO_TAB[key]);
    if (key === 'active') setStageFilter('active');
    // After the tab bar has settled, so the two scrolls don't cancel each other.
    setTimeout(() => document.getElementById('worklists')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  return (
    <div className="min-h-screen flex">
    <div className="min-w-0 flex-1 flex flex-col">
      <header className="bg-navy text-white">
        <div className="mx-auto max-w-7xl px-4 h-14 flex items-center gap-3">
          <span className="font-semibold tracking-tight whitespace-nowrap">Driver Ops</span>
          <span className="text-xs font-medium rounded-full bg-white/10 px-2 py-0.5 whitespace-nowrap">Demo data</span>
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
            <h1 className="text-2xl font-bold tracking-tight">Driver Funnel Cockpit</h1>
            <p className="text-sm text-muted mt-0.5">Application to active driver, Stockholm</p>
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
          {today.map((i) => (
            <button
              key={i.key}
              type="button"
              onClick={() => openTab(i.tab)}
              className={`rounded-full border px-3 py-1 font-semibold transition-colors ${
                i.urgent ? 'border-bad/40 bg-bad-bg text-bad hover:border-bad' : 'border-lavender bg-white text-navy hover:border-indigo hover:text-indigo'
              }`}
            >
              {i.label}
            </button>
          ))}
          {today.length === 0 && <span className="text-muted">Nothing waiting.</span>}
          <span className="flex items-center gap-1.5 rounded-full bg-card px-3 py-1">
            <CalendarClock size={15} className="text-indigo" aria-hidden />
            Next review <strong className="num font-semibold">{slot.time}</strong> {slot.day}
            <span className="text-muted">· in {formatDuration(slot.at - now)}</span>
          </span>
        </section>

        {!guideHidden && (
          <DemoGuide
            steps={steps}
            onOpen={setOpenId}
            onPhone={() => openAsDriver(apps.find((a) => a.source === 'self')?.id ?? null)}
            onChat={openDriverChat}
            onReport={() => setShowReport(true)}
            onAdvance={() => onAdvance(24 * 3_600_000)}
            onHubspot={() => setShowHubspot(true)}
            onHide={() => toggleGuide(true)}
          />
        )}

        <Scoreboard funnel={funnel} onSelect={jumpTo} />
        <KpiRow kpis={kpis} baseline={baseline} />

        <section id="worklists" className="scroll-mt-4">
          <Tabs active={tab} counts={counts} alert={{ live: counts.live > 0, chat: threads.some((t) => t.status === 'waiting' && t.reason === 'urgent') }} onChange={setTab} />
          <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
            {tab === 'live' ? (
              <LiveOps jobs={jobs} now={now} onJob={onJob} onViewChat={openDriverChat} />
            ) : tab === 'review' ? (
              <ReviewQueue apps={apps.filter((a) => deriveStage(a) === 'review')} now={now} onOpen={setOpenId} />
            ) : tab === 'missing' ? (
              <MissingDocs apps={apps.filter((a) => deriveStage(a) === 'registered')} now={now} onOpen={setOpenId} onResult={onResult} />
            ) : tab === 'awaiting' ? (
              <Activation apps={apps.filter((a) => deriveStage(a) === 'accepted')} now={now} onOpen={setOpenId} />
            ) : tab === 'chat' ? (
              <ChatQueue threads={threads} now={now} onThread={onThread} onViewChat={openDriverChat} />
            ) : (
              <AllApplicants apps={apps} now={now} filter={stageFilter} onFilter={setStageFilter} onOpen={setOpenId} />
            )}
          </div>
        </section>
      </main>

      {open && <ApplicantDrawer applicant={open} now={now} onClose={close} onUpdate={update} onResult={onResult} onViewAsDriver={openAsDriver} />}
      {showHubspot && <HubspotModal onClose={closeHubspot} />}
      {showReport && <ReportModal onOpened={() => setReportOpened(true)} apps={apps} threads={threads} now={now} onClose={closeReport} />}
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
        onClose={() => setPhoneOpen(false)}
      />
    )}
    </div>
  );
}
