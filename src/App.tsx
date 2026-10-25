import { useCallback, useEffect, useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { useClock, useDemoData, type TabKey } from './state';
import { computeFunnel, computeKpis } from './lib/kpis';
import { deriveStage } from './lib/stage';
import { caseTime, formatDateTime } from './lib/time';
import { Scoreboard, type FunnelLink } from './components/Scoreboard';
import { KpiRow } from './components/KpiRow';
import { Tabs } from './components/Tabs';
import { ReviewQueue } from './components/ReviewQueue';
import { MissingDocs } from './components/MissingDocs';
import { Activation } from './components/Activation';
import { ApplicantDrawer } from './components/ApplicantDrawer';
import { Toast, useToast } from './components/Toast';
import { LiveOps } from './components/LiveOps';
import type { ActionResult } from './lib/actions';
import type { Applicant } from './lib/types';
import { releaseDue } from './lib/extract';
import { openIncidents, syncFirstDrive, type Job } from './lib/liveOps';

/**
 * The short version: one page per part of the case, and nothing on screen that doesn't answer it.
 * Part 1, a driver stuck at a pickup: the playbook for now, and the pre-pickup check that prevents it.
 * Part 2, the driver funnel: where people drop off, decisions against written criteria, and the lists that keep them moving.
 */
type Page = 'live' | 'funnel';
const PAGE_LABEL: Record<Page, string> = { live: 'Part 1 · Stuck at pickup', funnel: 'Part 2 · Driver funnel' };
const FUNNEL_TABS: TabKey[] = ['review', 'missing', 'awaiting'];
/** The metrics the case asks for. */
const SHOWN_KPIS = ['docCompletion', 'timeToDecision', 'activation', 'appToActive'];

export default function App() {
  const clock = useClock();
  const now = clock.now;
  const { apps, gigs, jobs, update, updateJob, updateJobs, reset } = useDemoData();
  const [page, setPage] = useState<Page>(() => (window.location.hash === '#part2' ? 'funnel' : 'live'));
  const [tab, setTab] = useState<TabKey>('review');
  const [openId, setOpenId] = useState<string | null>(null);
  const toast = useToast();
  // The metrics when the demo started: the ▲▼ chips show how your clicks moved them.
  const [baseline, setBaseline] = useState(() => computeKpis(apps, now));
  const open = apps.find((a) => a.id === openId) ?? null;
  const close = useCallback(() => setOpenId(null), []);

  /** Start over on the case as the brief gives it: Tuesday 09:30, Julia 25 minutes at the gate. */
  const playCase = useCallback(
    (quiet = false) => {
      const at = caseTime(Date.now());
      const fresh = reset(at, true);
      clock.setTo(at);
      setBaseline(computeKpis(fresh, at));
      setOpenId(null);
      setTab('review');
      if (!quiet) {
        setPage('live');
        window.scrollTo({ top: 0 });
        toast.notify('Tuesday 09:30: Julia calls. She has waited 25 minutes at the pickup.');
      }
    },
    [reset, clock, toast.notify],
  );

  // The demo always runs on the case. A first visit (or an old save) starts there; only on the first render.
  useEffect(() => {
    if (!jobs.some((j) => j.asInCase)) playCase(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** A first drive booked or moved becomes a job; one released goes back. */
  const syncFirstDriveFor = useCallback(
    (prev: Applicant | undefined, next: Applicant) => {
      if (prev?.firstGig?.bookedFor === next.firstGig?.bookedFor && prev?.firstGig?.gigId === next.firstGig?.gigId) return;
      updateJobs((js) => syncFirstDrive(js, next, gigs));
    },
    [updateJobs, gigs],
  );

  // A first drive whose extract wasn't shown by the day before goes back to the pool.
  useEffect(() => {
    const due = releaseDue(apps, now);
    if (!due.length) return;
    for (const next of due) {
      update(next);
      updateJobs((js) => syncFirstDrive(js, next, gigs));
    }
  }, [apps, now, gigs, update, updateJobs]);

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

  const onJob = useCallback(
    (j: Job, message: string) => {
      updateJob(j);
      toast.notify(message);
    },
    [updateJob, toast.notify],
  );

  const funnel = useMemo(() => computeFunnel(apps), [apps]);
  const kpis = useMemo(() => computeKpis(apps, now), [apps, now]);
  const counts = useMemo(() => {
    const stages = apps.map(deriveStage);
    const n = (s: string) => stages.filter((x) => x === s).length;
    return { live: 0, review: n('review'), missing: n('registered'), awaiting: n('accepted'), chat: 0, all: apps.length };
  }, [apps]);
  const urgent = openIncidents(jobs, now).filter((j) => !j.incident?.outcome).length;

  const showPage = (p: Page) => {
    setPage(p);
    window.scrollTo({ top: 0 });
  };
  // A line under a funnel tile opens the list of who is there now.
  const openLink = (to: FunnelLink) => {
    if (to === 'review' || to === 'missing' || to === 'awaiting') setTab(to);
    setTimeout(() => document.getElementById('worklists')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-navy text-white">
        <div className="mx-auto max-w-7xl px-4 h-14 flex items-center gap-3">
          <span className="hidden sm:inline font-semibold tracking-tight whitespace-nowrap">Driver Ops</span>
          <nav aria-label="The two parts of the case" className="sm:ml-2 flex rounded-lg bg-white/10 p-0.5 text-sm font-semibold">
            {(['live', 'funnel'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => showPage(p)}
                aria-current={page === p ? 'page' : undefined}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1 ${page === p ? 'bg-white text-navy' : 'text-white/80 hover:text-white'}`}
              >
                <span className="sm:hidden">{p === 'live' ? 'Part 1' : 'Part 2'}</span>
                <span className="hidden sm:inline">{PAGE_LABEL[p]}</span>
                {p === 'live' && urgent > 0 && <span className="num rounded-full bg-bad px-1.5 text-xs text-white">{urgent}</span>}
              </button>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden md:inline num text-xs text-white/70">{formatDateTime(now)}</span>
            <button
              type="button"
              onClick={() => playCase()}
              title="Start over: Tuesday 09:30, the case as the brief gives it"
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-white/85 hover:bg-white/10 hover:text-white"
            >
              <RotateCcw size={15} aria-hidden /> <span className="hidden sm:inline">Reset demo</span>
              <span className="sr-only sm:hidden">Reset demo</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 mx-auto max-w-7xl w-full px-4 py-5 space-y-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-indigo">{page === 'live' ? 'Part 1 · Live ops' : 'Part 2 · Driver ops'}</p>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight">{page === 'live' ? 'Driver stuck at pickup: keys not found' : 'From application to active driver'}</h1>
          <p className="mt-0.5 text-sm text-muted">
            {page === 'live'
              ? 'Handle it now with the playbook. Prevent it with the pre-pickup check below.'
              : 'Where applicants drop off, decisions against written criteria, and the lists that keep them moving.'}
          </p>
        </div>

        {page === 'live' ? (
          <LiveOps jobs={jobs} now={now} onJob={onJob} />
        ) : (
          <>
            <Scoreboard funnel={funnel} onLink={openLink} />
            <KpiRow kpis={kpis.filter((k) => SHOWN_KPIS.includes(k.key))} baseline={baseline} />
            <section id="worklists" className="scroll-mt-4">
              <Tabs keys={FUNNEL_TABS} active={tab} counts={counts} alert={{}} onChange={setTab} />
              <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
                {tab === 'missing' ? (
                  <MissingDocs apps={apps.filter((a) => deriveStage(a) === 'registered')} now={now} onOpen={setOpenId} onResult={onResult} />
                ) : tab === 'awaiting' ? (
                  <Activation apps={apps.filter((a) => deriveStage(a) === 'accepted')} now={now} onOpen={setOpenId} />
                ) : (
                  <ReviewQueue apps={apps.filter((a) => deriveStage(a) === 'review')} now={now} onOpen={setOpenId} />
                )}
              </div>
            </section>
          </>
        )}
      </main>

      {open && <ApplicantDrawer applicant={open} now={now} onClose={close} onUpdate={update} onResult={onResult} />}
      <Toast message={toast.message} onDismiss={toast.dismiss} />

      <footer className="text-xs text-muted text-center px-4 py-6 border-t border-lavender">Prototype by Hjalmar Widlund · demo data, no real people</footer>
    </div>
  );
}
