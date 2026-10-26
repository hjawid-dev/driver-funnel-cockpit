import { X } from 'lucide-react';
import type { Applicant, Gig } from '../../lib/types';
import type { ChatThread } from '../../lib/chat/types';
import type { Job } from '../../lib/liveOps';
import { DriverApp } from './DriverApp';
import { driverStep } from '../../lib/driverFlow';

interface Props {
  applicantId: string | null;
  apps: Applicant[];
  gigs: Gig[];
  threads: ChatThread[];
  jobs: Job[];
  now: number;
  /** Changes when the cockpit asks the phone to open on the chat. */
  chatRequest: number;
  onSelect: (id: string | null) => void;
  onCreate: (a: Applicant) => void;
  onUpdate: (a: Applicant) => void;
  onThread: (t: ChatThread) => void;
  onJob: (j: Job, base?: ChatThread) => void;
  /** Demo: move the clock to a moment (e.g. just before the first drive). */
  onJumpTo?: (ts: number) => void;
  onDecide?: (id: string) => void;
  textsEnabled?: boolean;
  onClose: () => void;
}

/**
 * The driver's phone, docked next to the cockpit on desktop and full screen on a phone.
 * It shares the same data, so every step shows up in the cockpit at once.
 */
export function DriverPhone({ applicantId, apps, gigs, threads, jobs, now, chatRequest, onSelect, onCreate, onUpdate, onThread, onJob, onJumpTo, onDecide, textsEnabled, onClose }: Props) {
  const a = applicantId ? (apps.find((x) => x.id === applicantId) ?? null) : null;
  const self = apps.filter((x) => x.source === 'self');
  const others = apps.filter((x) => x.source !== 'self').sort((x, y) => x.name.localeCompare(y.name));

  return (
    <aside
      aria-label="Driver's phone"
      style={{ top: 'var(--present-top, 0px)', height: 'calc(100dvh - var(--present-top, 0px))' }}
      className="fixed inset-0 z-40 flex flex-col bg-card lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:w-[420px] lg:shrink-0 lg:border-l lg:border-lavender"
    >
      <div className="flex items-center gap-2 border-b border-lavender px-3 py-2">
        <label className="flex min-w-0 flex-1 items-center gap-2 text-xs">
          <span className="shrink-0 font-semibold text-muted">Viewing as</span>
          <select
            value={applicantId ?? ''}
            onChange={(e) => onSelect(e.target.value || null)}
            className="min-w-0 flex-1 rounded-md border border-lavender bg-white px-2 py-1 text-sm"
          >
            <option value="">New applicant (start here)</option>
            {self.length > 0 && (
              <optgroup label="Applied in the app">
                {self.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name} · {driverStep(x).replace('_', ' ')}
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label="Demo applicants">
              {others.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name} · {driverStep(x).replace('_', ' ')}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <button type="button" onClick={onClose} aria-label="Close the driver's phone" className="rounded-md p-1.5 text-muted hover:bg-white hover:text-navy">
          <X size={18} />
        </button>
      </div>

      <div className="flex flex-1 items-start justify-center overflow-hidden p-0 lg:p-5">
        <div className="anim-fade h-full w-full overflow-hidden bg-white lg:h-full lg:max-h-[780px] lg:w-[360px] lg:rounded-[2.2rem] lg:border-[10px] lg:border-navy lg:shadow-2xl">
          <DriverApp
            key={`${applicantId ?? 'new'}-${chatRequest}`}
            applicant={a}
            apps={apps}
            gigs={gigs}
            threads={threads}
            jobs={jobs}
            now={now}
            onCreate={onCreate}
            onUpdate={onUpdate}
            onThread={onThread}
            onJob={onJob}
            onJumpTo={onJumpTo}
            onDecide={onDecide}
            textsEnabled={textsEnabled}
            initialView={chatRequest ? 'chat' : 'steps'}
          />
        </div>
      </div>
    </aside>
  );
}
