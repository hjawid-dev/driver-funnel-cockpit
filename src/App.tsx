import { useCallback, useMemo, useState } from 'react';
import { CalendarClock, Compass, Network, RotateCcw } from 'lucide-react';
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
import { automationEvents, summarize, type AutoEvent } from './lib/automation';
import type { Applicant } from './lib/types';
import { formatDateTime } from './lib/time';

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
  const { apps, gigs, update, add, reset } = useDemoData();
  const [phoneOpen, setPhoneOpen] = useState(() => window.location.hash.startsWith('#driver'));
  // #driver opens the phone; #driver=DRV-1034 opens it as that applicant (handy for presenting).
  const [phoneId, setPhoneId] = useState<string | null>(() => window.location.hash.match(/^#driver=(.+)$/)?.[1] ?? null);
  const [lastRun, setLastRun] = useState<{ from: number; to: number; events: AutoEvent[] } | null>(null);
  const [tab, setTab] = useState<TabKey>('review');
  const [openId, setOpenId] = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState<StageFilter>('all');
  const [showHubspot, setShowHubspot] = useState(false);
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
    setOpenId(null);
  }, []);

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
      else if (!prev.firstGig?.gigId && next.firstGig?.gigId) toast.notify(`${next.name} picked a first drive. It shows in Awaiting first gig.`);
    },
    [apps, update, toast.notify],
  );

  const onAdvance = (ms: number) => {
    const w = clock.advance(ms);
    const events = automationEvents(apps, w.from, w.to);
    setLastRun({ ...w, events });
    toast.notify(`Time moved forward. Automation: ${summarize(events)}.`);
  };

  const funnel = useMemo(() => computeFunnel(apps), [apps]);
  const kpis = useMemo(() => computeKpis(apps, now), [apps, now]);
  const counts = useMemo(() => {
    const stages = apps.map(deriveStage);
    const n = (s: string) => stages.filter((x) => x === s).length;
    return { review: n('review'), missing: n('registered'), awaiting: n('accepted'), all: apps.length };
  }, [apps]);
  const slot = nextReviewSlot(now);
  const steps = useMemo(() => guideSteps(apps, clock.offset > 0), [apps, clock.offset]);

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
              onClick={() => setShowHubspot(true)}
              title="How this maps to HubSpot"
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-white/85 hover:bg-white/10 hover:text-white"
            >
              <Network size={15} aria-hidden />
              <span className="hidden sm:inline">How this maps to HubSpot</span>
              <span className="sr-only sm:hidden">How this maps to HubSpot</span>
            </button>
            <button
              type="button"
              onClick={() => {
                const fresh = reset();
                clock.resetTime();
                setLastRun(null);
                setPhoneId(null);
                setBaseline(computeKpis(fresh, Date.now()));
                setOpenId(null);
                setStageFilter('all');
                toast.notify('Demo reset with fresh data.');
              }}
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-white/85 hover:bg-white/10 hover:text-white"
            >
              <RotateCcw size={15} aria-hidden />
              <span className="hidden sm:inline">Reset demo</span>
              <span className="sr-only sm:hidden">Reset demo</span>
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
        lastRun={lastRun}
      />

      <main className="flex-1 mx-auto max-w-7xl w-full px-4 py-6 space-y-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Driver Funnel Cockpit</h1>
            <p className="text-sm text-muted mt-0.5">Application to active driver, Stockholm</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
          {guideHidden && (
            <button
              type="button"
              onClick={() => toggleGuide(false)}
              className="flex items-center gap-1.5 rounded-lg border border-lavender px-3 py-2 text-sm font-semibold text-indigo hover:border-indigo"
            >
              <Compass size={15} aria-hidden /> Demo guide
            </button>
          )}
          <div className="flex items-center gap-2 rounded-lg bg-card px-3 py-2 text-sm">
            <CalendarClock size={16} className="text-indigo" aria-hidden />
            <span>
              Next review slot <strong className="num font-semibold">{slot.time}</strong> {slot.day}
              <span className="text-muted"> · in {formatDuration(slot.at - now)}</span>
            </span>
          </div>
          </div>
        </div>

        {!guideHidden && (
          <DemoGuide
            steps={steps}
            onOpen={setOpenId}
            onPhone={() => openAsDriver(apps.find((a) => a.source === 'self')?.id ?? null)}
            onAdvance={() => onAdvance(24 * 3_600_000)}
            onHubspot={() => setShowHubspot(true)}
            onHide={() => toggleGuide(true)}
          />
        )}

        <Scoreboard funnel={funnel} onSelect={jumpTo} />
        <KpiRow kpis={kpis} baseline={baseline} />

        <section id="worklists" className="scroll-mt-4">
          <Tabs active={tab} counts={counts} onChange={setTab} />
          <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
            {tab === 'review' ? (
              <ReviewQueue apps={apps.filter((a) => deriveStage(a) === 'review')} now={now} onOpen={setOpenId} />
            ) : tab === 'missing' ? (
              <MissingDocs apps={apps.filter((a) => deriveStage(a) === 'registered')} now={now} onOpen={setOpenId} onResult={onResult} />
            ) : tab === 'awaiting' ? (
              <Activation apps={apps.filter((a) => deriveStage(a) === 'accepted')} now={now} onOpen={setOpenId} />
            ) : (
              <AllApplicants apps={apps} now={now} filter={stageFilter} onFilter={setStageFilter} onOpen={setOpenId} />
            )}
          </div>
        </section>
      </main>

      {open && <ApplicantDrawer applicant={open} now={now} onClose={close} onUpdate={update} onResult={onResult} onViewAsDriver={openAsDriver} />}
      {showHubspot && <HubspotModal onClose={closeHubspot} />}
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
        now={now}
        onSelect={setPhoneId}
        onCreate={onDriverCreate}
        onUpdate={onDriverUpdate}
        onClose={() => setPhoneOpen(false)}
      />
    )}
    </div>
  );
}
