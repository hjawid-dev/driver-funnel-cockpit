import { CircleCheck } from 'lucide-react';
import type { Applicant } from '../lib/types';
import { byUrgency, slaStatus } from '../lib/sla';
import { reviewChips, shortTime } from '../lib/criteria';
import { ago } from '../lib/time';
import { FlagChip, SlaChip } from './chips';
import { ListIntro } from './ui';

interface Props {
  apps: Applicant[]; // already filtered to stage = review
  now: number;
  onOpen: (id: string) => void;
}

export function ReviewQueue({ apps, now, onOpen }: Props) {
  const rows = [...apps].sort(byUrgency).map((a) => ({ a, sla: slaStatus(a.docsCompleteAt!, now), chips: reviewChips(a) }));
  const overdue = rows.filter((r) => r.sla.bucket === 'overdue').length;

  if (!rows.length) {
    return (
      <div className="py-12 flex flex-col items-center gap-2 text-sm text-muted">
        <CircleCheck size={28} className="text-ok" aria-hidden />
        Review queue is empty. Every complete file has a decision.
      </div>
    );
  }

  return (
    <div className="pt-4">
      <ListIntro
        info={
          <>
            <p>Complete files, most urgent first. Target: a decision within 48 h of a complete file, which is the ops part of time to decision.</p>
            <p className="text-muted">Every file needs the extract shown in the call and the photo checked. Flags show only what differs from a clean file.</p>
          </>
        }
      >
        Most urgent first{overdue > 0 && <strong className="text-bad font-semibold"> · {overdue} overdue</strong>}
      </ListIntro>

      {/* Desktop table */}
      <div className="hidden lg:block overflow-hidden rounded-xl border border-lavender">
        <table className="w-full text-sm">
          <thead className="bg-card text-left text-xs text-muted">
            <tr>
              <th className="px-4 py-2.5 font-semibold">Applicant</th>
              <th className="px-4 py-2.5 font-semibold">Area</th>
              <th className="px-4 py-2.5 font-semibold">File complete</th>
              <th className="px-4 py-2.5 font-semibold">SLA</th>
              <th className="px-4 py-2.5 font-semibold">Extract call</th>
              <th className="px-4 py-2.5 font-semibold">Flags</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ a, sla, chips }) => (
              <tr
                key={a.id}
                onClick={() => onOpen(a.id)}
                className={`border-t border-lavender cursor-pointer hover:bg-card/70 ${sla.bucket === 'overdue' ? 'bg-bad-bg/30' : ''}`}
              >
                <td className="px-4 py-3">
                  <button type="button" onClick={() => onOpen(a.id)} className="font-semibold text-left hover:text-indigo">
                    {a.name}
                  </button>
                  <div className="num text-xs text-muted">{a.id}</div>
                </td>
                <td className="px-4 py-3">{a.area}</td>
                <td className="px-4 py-3 num text-xs">{ago(a.docsCompleteAt!, now)}</td>
                <td className="px-4 py-3">
                  <SlaChip bucket={sla.bucket} label={sla.label} />
                </td>
                <td className="px-4 py-3 text-xs">{a.callAt ? <span className="font-medium">{shortTime(a.callAt)}</span> : <span className="text-muted">Not booked</span>}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {chips.length ? chips.map((c) => <FlagChip key={c.label} chip={c} />) : <span className="text-xs text-muted">–</span>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <ul className="lg:hidden grid gap-2 sm:grid-cols-2">
        {rows.map(({ a, sla, chips }) => (
          <li key={a.id}>
            <button
              type="button"
              onClick={() => onOpen(a.id)}
              className={`w-full text-left rounded-xl border p-3 ${sla.bucket === 'overdue' ? 'border-bad/40 bg-bad-bg/30' : 'border-lavender bg-white'}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold">{a.name}</div>
                  <div className="text-xs text-muted">
                    {a.area} · complete {ago(a.docsCompleteAt!, now)}
                    {a.callAt && <> · call {shortTime(a.callAt)}</>}
                  </div>
                </div>
                <SlaChip bucket={sla.bucket} label={sla.label} />
              </div>
              {chips.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {chips.map((c) => (
                    <FlagChip key={c.label} chip={c} />
                  ))}
                </div>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
