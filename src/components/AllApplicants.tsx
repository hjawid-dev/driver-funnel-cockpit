import { useState } from 'react';
import { Search } from 'lucide-react';
import type { Applicant, Stage } from '../lib/types';
import { deriveStage, STAGE_LABEL } from '../lib/stage';
import { ago } from '../lib/time';

export type StageFilter = Stage | 'all';

const STAGE_STYLE: Record<Stage, string> = {
  registered: 'bg-lavender text-navy',
  review: 'bg-[#DCEBFD] text-[#1E4E8C]',
  accepted: 'bg-mint text-[#0F5132]',
  active: 'bg-green text-navy',
  rejected: 'bg-bad-bg text-bad',
  closed: 'bg-idle-bg text-idle',
};

export function StageChip({ stage }: { stage: Stage }) {
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${STAGE_STYLE[stage]}`}>{STAGE_LABEL[stage]}</span>;
}

const FILTERS: StageFilter[] = ['all', 'registered', 'review', 'accepted', 'active', 'rejected', 'closed'];

interface Props {
  apps: Applicant[];
  now: number;
  filter: StageFilter;
  onFilter: (f: StageFilter) => void;
  onOpen: (id: string) => void;
}

export function AllApplicants({ apps, now, filter, onFilter, onOpen }: Props) {
  const [q, setQ] = useState('');
  const withStage = apps.map((a) => ({ a, stage: deriveStage(a) }));
  const count = (f: StageFilter) => (f === 'all' ? apps.length : withStage.filter((x) => x.stage === f).length);
  const query = q.trim().toLowerCase();
  const rows = withStage
    .filter((x) => filter === 'all' || x.stage === filter)
    .filter((x) => !query || x.a.name.toLowerCase().includes(query) || x.a.id.toLowerCase().includes(query))
    .sort((x, y) => y.a.registeredAt - x.a.registeredAt)
    .map((x) => ({ ...x, last: x.a.log.at(-1) }));

  return (
    <div className="pt-4">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by where they are now">
          <span className="mr-0.5 text-xs text-muted">Where they are now:</span>
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => onFilter(f)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                filter === f ? 'bg-indigo text-white' : 'bg-card text-muted hover:text-navy'
              }`}
            >
              {f === 'all' ? 'All' : STAGE_LABEL[f]} <span className="num opacity-80">{count(f)}</span>
            </button>
          ))}
        </div>
        <label className="relative block sm:w-64">
          <span className="sr-only">Search by name</span>
          <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name or ID"
            className="w-full rounded-lg border border-lavender py-1.5 pl-8 pr-3 text-sm"
          />
        </label>
      </div>

      {rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">No applicants match.</p>
      ) : (
        <>
          <div className="hidden lg:block overflow-hidden rounded-xl border border-lavender">
            <table className="w-full text-sm">
              <thead className="bg-card text-left text-xs text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Applicant</th>
                  <th className="px-4 py-2.5 font-semibold">Stage</th>
                  <th className="px-4 py-2.5 font-semibold">Area</th>
                  <th className="px-4 py-2.5 font-semibold">Registered</th>
                  <th className="px-4 py-2.5 font-semibold">Last activity</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ a, stage, last }) => (
                  <tr key={a.id} onClick={() => onOpen(a.id)} className="border-t border-lavender cursor-pointer hover:bg-card/70">
                    <td className="px-4 py-2.5">
                      <button type="button" onClick={() => onOpen(a.id)} className="font-semibold text-left hover:text-indigo">
                        {a.name}
                      </button>
                      <div className="num text-xs text-muted">{a.id}</div>
                    </td>
                    <td className="px-4 py-2.5">
                      <StageChip stage={stage} />
                    </td>
                    <td className="px-4 py-2.5">{a.area}</td>
                    <td className="px-4 py-2.5 num text-xs">{ago(a.registeredAt, now)}</td>
                    <td className="px-4 py-2.5 text-xs">
                      {last && (
                        <>
                          <span className="block max-w-xs truncate">{last.text}</span>
                          <span className="num text-muted">{ago(last.at, now)}</span>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="lg:hidden grid gap-2 sm:grid-cols-2">
            {rows.map(({ a, stage, last }) => (
              <li key={a.id}>
                <button type="button" onClick={() => onOpen(a.id)} className="w-full text-left rounded-xl border border-lavender bg-white p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold">{a.name}</div>
                      <div className="text-xs text-muted">
                        {a.area} · registered {ago(a.registeredAt, now)}
                      </div>
                    </div>
                    <StageChip stage={stage} />
                  </div>
                  {last && <div className="mt-1.5 truncate text-xs text-muted">{last.text}</div>}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
