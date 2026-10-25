import { ChevronRight, CircleCheck } from 'lucide-react';
import { STAGE_LABEL } from '../lib/stage';
import { QUEUE_FILTER_LABEL, type QueueFilter, type WorkItem, type WorkTone } from '../lib/workQueue';
import { StageChip } from './AllApplicants';

interface Props {
  items: WorkItem[];
  filter: QueueFilter;
  onOpen: (id: string) => void;
}

const TONE: Record<WorkTone, string> = { bad: 'text-bad', warn: 'text-warn', ok: 'text-ok', muted: 'text-muted' };

const EMPTY: Record<QueueFilter, string> = {
  action: 'Nothing needs a person right now. Reminders and follow-ups run by themselves.',
  missing: 'No incomplete files.',
  review: 'The review queue is empty: every complete file has a decision.',
  awaiting: 'Every accepted driver has done a first gig.',
  all: '',
};

/** The candidate queue: who, where they are, why now, and the next action. One row each, most urgent first. */
export function WorkQueue({ items, filter, onOpen }: Props) {
  if (!items.length) {
    return (
      <p className="flex items-center gap-2 rounded-xl bg-card px-4 py-6 text-sm text-muted">
        <CircleCheck size={18} className="text-ok" aria-hidden /> {EMPTY[filter]}
      </p>
    );
  }
  return (
    <ul aria-label={QUEUE_FILTER_LABEL[filter]} className="divide-y divide-lavender overflow-hidden rounded-xl border border-lavender">
      {items.map((w) => (
        <li key={w.a.id}>
          <button
            type="button"
            onClick={() => onOpen(w.a.id)}
            className="grid w-full grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-3 text-left text-sm hover:bg-card/60 md:grid-cols-[minmax(0,1.3fr)_8.5rem_minmax(0,1.6fr)_minmax(0,1.3fr)_auto]"
          >
            <span className="min-w-0">
              <span className="block truncate font-semibold">{w.a.name}</span>
              <span className="num block text-xs text-muted">
                {w.a.id} · {w.a.area}
              </span>
            </span>
            <span className="hidden md:block">
              <StageChip stage={w.stage} />
            </span>
            <span className="col-span-2 min-w-0 md:col-span-1">
              <span className={`block font-semibold ${TONE[w.tone]}`}>{w.status}</span>
              <span className="block truncate text-xs text-muted">{w.detail}</span>
            </span>
            <span className={`col-span-2 text-sm md:col-span-1 ${w.needsAction ? 'font-semibold text-indigo' : 'text-muted'}`}>
              <span className="md:hidden text-xs font-normal text-muted">{STAGE_LABEL[w.stage]} · </span>
              {w.next}
            </span>
            <ChevronRight size={16} aria-hidden className="row-start-1 col-start-2 text-muted md:row-auto md:col-auto" />
          </button>
        </li>
      ))}
    </ul>
  );
}
