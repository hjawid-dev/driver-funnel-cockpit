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
  const { apps, update, reset } = useDemoData();
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

  const funnel = useMemo(() => computeFunnel(apps), [apps]);
  const kpis = useMemo(() => computeKpis(apps, now), [apps, now]);
  const counts = useMemo(() => {
    const stages = apps.map(deriveStage);
    const n = (s: string) => stages.filter((x) => x === s).length;
    return { review: n('review'), missing: n('registered'), awaiting: n('accepted'), all: apps.length };
  }, [apps]);
  const slot = nextReviewSlot(now);
  const steps = useMemo(() => guideSteps(apps, now), [apps, now]);

  const jumpTo = (key: FunnelKey) => {
    setTab(TILE_TO_TAB[key]);
    if (key === 'active') setStageFilter('active');
    // After the tab bar has settled, so the two scrolls don't cancel each other.
    setTimeout(() => document.getElementById('worklists')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  return (
    <div className="min-h-screen flex flex-col">
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
          <DemoGuide steps={steps} onOpen={setOpenId} onHubspot={() => setShowHubspot(true)} onHide={() => toggleGuide(true)} />
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

      {open && <ApplicantDrawer applicant={open} now={now} onClose={close} onUpdate={update} onResult={onResult} />}
      {showHubspot && <HubspotModal onClose={closeHubspot} />}
      <Toast message={toast.message} onDismiss={toast.dismiss} />

      <footer className="text-xs text-muted text-center px-4 py-6 border-t border-lavender">
        Prototype by Hjalmar Widlund · demo data, no real people
      </footer>
    </div>
  );
}
