import { Ban, CircleCheck, Send, TriangleAlert } from 'lucide-react';
import type { MouseEvent } from 'react';
import type { Applicant } from '../lib/types';
import { isNoResponse, nudgeState } from '../lib/nudges';
import { closeNoResponse, logNudge, type ActionResult } from '../lib/actions';
import { ago } from '../lib/time';
import { DocChecklist } from './chips';

interface Props {
  apps: Applicant[]; // stage = registered
  now: number;
  onOpen: (id: string) => void;
  onResult: (r: ActionResult) => void;
}

export function MissingDocs({ apps, now, onOpen, onResult }: Props) {
  const rows = [...apps]
    .sort((a, b) => a.registeredAt - b.registeredAt)
    .map((a) => ({ a, nudge: nudgeState(a, now), stale: isNoResponse(a, now) }));
  const stale = rows.filter((r) => r.stale).length;
  const bgPending = rows.filter((r) => r.a.docs.extract === 'pending').length;

  if (!rows.length) {
    return (
      <div className="py-12 flex flex-col items-center gap-2 text-sm text-muted">
        <CircleCheck size={28} className="text-ok" aria-hidden />
        No incomplete files.
      </div>
    );
  }

  const act = (e: MouseEvent, r: ActionResult) => {
    e.stopPropagation();
    onResult(r);
  };

  const Actions = ({ a, stale: isStale }: { a: Applicant; stale: boolean }) => (
    <div className="flex flex-wrap gap-1.5">
      <button
        type="button"
        onClick={(e) => act(e, logNudge(a, now))}
        className="inline-flex items-center gap-1.5 rounded-md border border-lavender bg-white px-2.5 py-1 text-xs font-semibold hover:border-indigo hover:text-indigo"
      >
        <Send size={13} aria-hidden /> Send nudge now
      </button>
      {isStale && (
        <button
          type="button"
          onClick={(e) => act(e, closeNoResponse(a, now))}
          className="inline-flex items-center gap-1.5 rounded-md border border-bad/50 bg-white px-2.5 py-1 text-xs font-semibold text-bad hover:bg-bad hover:text-white"
        >
          <Ban size={13} aria-hidden /> Close: no response
        </button>
      )}
    </div>
  );

  return (
    <div className="pt-4">
      <p className="mb-3 text-sm text-muted">
        Oldest first. Auto-nudges at 2 h, 24 h and 72 h after registration. Extract ordered and on its way for {bgPending}: the slowest item, so it is asked for first. Applicants show it in a call; no copy is kept.
        {stale > 0 && <strong className="font-semibold text-bad"> {stale} with no response for 14 days.</strong>}
      </p>

      {/* Desktop */}
      <div className="hidden lg:block overflow-hidden rounded-xl border border-lavender">
        <table className="w-full text-sm">
          <thead className="bg-card text-left text-xs text-muted">
            <tr>
              <th className="px-4 py-2.5 font-semibold">Applicant</th>
              <th className="px-4 py-2.5 font-semibold">Registered</th>
              <th className="px-4 py-2.5 font-semibold">Documents</th>
              <th className="px-4 py-2.5 font-semibold">Nudges</th>
              <th className="px-4 py-2.5 font-semibold">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ a, nudge, stale: isStale }) => (
              <tr key={a.id} onClick={() => onOpen(a.id)} className={`border-t border-lavender cursor-pointer hover:bg-card/70 ${isStale ? 'bg-bad-bg/30' : ''}`}>
                <td className="px-4 py-3">
                  <button type="button" onClick={() => onOpen(a.id)} className="font-semibold text-left hover:text-indigo">
                    {a.name}
                  </button>
                  <div className="text-xs text-muted">
                    <span className="num">{a.id}</span> · {a.area}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="num text-xs">{ago(a.registeredAt, now)}</div>
                  {isStale && <StaleFlag />}
                </td>
                <td className="px-4 py-3">
                  <DocChecklist docs={a.docs} />
                  {a.docs.extract === 'pending' && <div className="mt-1 text-xs text-muted">Ordered from Polisen by applicant</div>}
                </td>
                <td className="px-4 py-3 text-xs">
                  <div className="font-semibold">
                    <span className="num">{nudge.total}</span> sent
                  </div>
                  <div className="text-muted">{nudge.label}</div>
                </td>
                <td className="px-4 py-3">
                  <Actions a={a} stale={isStale} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile */}
      <ul className="lg:hidden grid gap-2 sm:grid-cols-2">
        {rows.map(({ a, nudge, stale: isStale }) => (
          <li
            key={a.id}
            onClick={() => onOpen(a.id)}
            className={`cursor-pointer rounded-xl border p-3 ${isStale ? 'border-bad/40 bg-bad-bg/30' : 'border-lavender bg-white'}`}
          >
            <div className="flex items-start justify-between gap-2">
              <button type="button" onClick={() => onOpen(a.id)} className="text-left">
                <div className="font-semibold">{a.name}</div>
                <div className="text-xs text-muted">
                  {a.area} · registered {ago(a.registeredAt, now)}
                </div>
              </button>
              <div className="text-right text-xs">
                <div className="font-semibold">
                  <span className="num">{nudge.total}</span> nudges
                </div>
                <div className="text-muted">{nudge.label}</div>
              </div>
            </div>
            <div className="mt-2">
              <DocChecklist docs={a.docs} />
            </div>
            {isStale && <StaleFlag />}
            <div className="mt-2">
              <Actions a={a} stale={isStale} />
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted">Nudges are logged only. This demo never sends a real SMS or email.</p>
    </div>
  );
}

function StaleFlag() {
  return (
    <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-bad-bg px-2 py-0.5 text-xs font-semibold text-bad">
      <TriangleAlert size={12} aria-hidden /> No response 14 days
    </div>
  );
}
