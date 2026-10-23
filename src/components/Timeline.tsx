import type { Applicant } from '../lib/types';
import { buildTimeline, type TimelineEvent } from '../lib/timeline';
import { formatDateTime, formatDuration } from '../lib/time';
import { CollapsibleSection } from './ui';

const DOT: Record<NonNullable<TimelineEvent['tone']>, string> = {
  ok: 'bg-ok border-ok',
  bad: 'bg-bad border-bad',
  neutral: 'bg-indigo border-indigo',
};

export function Timeline({ a, now }: { a: Applicant; now: number }) {
  const events = buildTimeline(a, now);
  const end = a.decision?.at ?? now;
  return (
    <CollapsibleSection title="Timeline" summary={`Registered → ${a.decision ? 'decision' : 'now'}: ${formatDuration(end - a.registeredAt)}`}>
      <ol className="relative ml-1.5 border-l border-lavender">
        {events.map((e, i) => (
          <li key={i} className="relative pl-5 pb-3 last:pb-0">
            <span
              aria-hidden
              className={`absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full border-2 ${
                e.upcoming ? 'border-dashed border-muted bg-white' : DOT[e.tone ?? 'neutral']
              } ${e.kind === 'nudge' && !e.upcoming ? '!bg-white !border-indigo' : ''}`}
            />
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className={`text-sm ${e.upcoming ? 'text-muted' : 'font-medium'} ${e.tone === 'bad' ? 'text-bad' : ''}`}>
                {e.label}
                {e.upcoming && ' (upcoming)'}
              </span>
              <span className="num text-xs text-muted">{formatDateTime(e.at)}</span>
            </div>
            {e.detail && <div className="text-xs text-muted">{e.detail}</div>}
          </li>
        ))}
      </ol>
    </CollapsibleSection>
  );
}
