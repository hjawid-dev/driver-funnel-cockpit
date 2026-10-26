import { CircleCheck } from 'lucide-react';
import type { Applicant, Gig } from '../lib/types';
import {
  ACTIVATION_LABEL,
  ACTIVATION_REASON_LABEL,
  JOBS_PER_DRIVER_14D,
  activationBucket,
  activationFlags,
  activationReason,
  activationReasons,
  byActivationPriority,
  supplyDemand,
  welcomeCallState,
  type ActivationBucket,
  type ActivationReason,
} from '../lib/activation';
import { checkMissed, showBy } from '../lib/extract';
import { ago, formatDateTime } from '../lib/time';
import { FlagChip } from './chips';
import { ListIntro } from './ui';

interface Props {
  apps: Applicant[]; // stage = accepted
  /** Everyone, and the open jobs: for which first drives fit, and supply against demand. */
  all: Applicant[];
  gigs: Gig[];
  now: number;
  onOpen: (id: string) => void;
}

/** Demand (no job fits) in its own colour, so it isn't read as the driver's fault. */
const REASON_TONE: Record<ActivationReason, string> = {
  booked: 'text-ok',
  extract: 'text-indigo',
  no_fit: 'text-warn',
  not_picked: 'text-muted',
  declined: 'text-bad',
  unreachable: 'text-bad',
  not_interested: 'text-bad',
};

const BUCKET_STYLE: Record<ActivationBucket, string> = {
  on_track: 'bg-ok-bg text-ok',
  book: 'bg-warn-bg text-warn',
  call: 'bg-bad text-white',
  dormant: 'bg-idle-bg text-idle',
};

export function ActivationChip({ bucket }: { bucket: ActivationBucket }) {
  return <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${BUCKET_STYLE[bucket]}`}>{ACTIVATION_LABEL[bucket]}</span>;
}

export function shortDate(ts: number) {
  return new Date(ts).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function Activation({ apps, all, gigs, now, onOpen }: Props) {
  const rows = [...apps].sort(byActivationPriority(now)).map((a) => {
    const f = activationFlags(a);
    return {
      a,
      bucket: activationBucket(a.decision!.at, now),
      call: welcomeCallState(a, now),
      reason: activationReason(a, all, gigs, now),
      chips: [
        ...(f.simpleDrivesFirst ? [{ label: 'Simple drives first', tone: 'warn' as const }] : []),
        ...(f.activationFollowUp ? [{ label: 'Activation follow-up', tone: 'warn' as const }] : []),
      ],
    };
  });

  if (!rows.length) {
    return (
      <div className="py-12 flex flex-col items-center gap-2 text-sm text-muted">
        <CircleCheck size={28} className="text-ok" aria-hidden />
        Every accepted driver has completed a first gig.
      </div>
    );
  }

  const urgent = rows.filter((r) => r.bucket === 'call' || r.bucket === 'book').length;
  const reasons = activationReasons(apps, all, gigs, now);
  const supply = supplyDemand(all, gigs, now);

  const ReasonCell = ({ a, reason }: { a: Applicant; reason: ActivationReason }) => {
    const by = reason === 'extract' ? showBy(a) : null;
    return (
      <span className={`font-medium ${REASON_TONE[reason]}`}>
        {ACTIVATION_REASON_LABEL[reason]}
        {by && <span className="block text-muted font-normal">show by {formatDateTime(by)}</span>}
        {reason === 'extract' && a.extractCheckAt && (
          <span className="block text-muted font-normal">
            {checkMissed(a, now) ? 'check missed' : 'check'} {formatDateTime(a.extractCheckAt)}
          </span>
        )}
      </span>
    );
  };

  const CallCell = ({ call }: { call: (typeof rows)[number]['call'] }) =>
    call.state === 'done' ? (
      <span className="text-ok font-medium">Done {shortDate(call.at)}</span>
    ) : (
      <span className="text-muted">Driver books in app</span>
    );

  const GigCell = ({ a }: { a: Applicant }) =>
    a.firstGig?.bookedFor ? (
      <span className="font-medium">Booked {shortDate(a.firstGig.bookedFor)}</span>
    ) : (
      <span className="text-muted">Not booked</span>
    );

  return (
    <div className="pt-4">
      <ListIntro
        info={
          <>
            <p>Accepted drivers without a first gig. Target: a first gig within 14 days.</p>
            <p className="text-muted">The driver chooses a matching first drive in the app. No booking after 7 days → automatic reminder. No booking after 14 days → call. After 30 days → dormant, re-engaged in a monthly batch.</p>
            <p className="text-muted">A driver accepted before their extract arrived shows it in a 5-minute check, at the latest the day before the first drive; otherwise the drive goes to another driver.</p>
          </>
        }
      >
        Who to call first{urgent > 0 && <strong className="font-semibold text-navy"> · {urgent} need action</strong>}
      </ListIntro>

      <div className="mb-3 grid gap-2 lg:grid-cols-[3fr_2fr]">
        <div className="rounded-xl border border-lavender bg-white px-3.5 py-2.5 text-sm">
          <p className="font-semibold">
            Why no first drive yet · <span className="num">{rows.length}</span> waiting
          </p>
          <p className="mt-0.5 text-xs text-muted">One reason each, so they add up. Ops notes declined, unreachable or not interested after a call; the rest comes from the data.</p>
          <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {reasons.map((r) => (
              <li key={r.reason} className={REASON_TONE[r.reason]}>
                <strong className="num">{r.count}</strong> {r.label.toLowerCase()}
              </li>
            ))}
          </ul>
        </div>
        <div className={`rounded-xl px-3.5 py-2.5 text-sm ${supply.oversupplied ? 'bg-warn-bg' : 'bg-card'}`}>
          <p className="font-semibold">Supply and demand, next 14 days</p>
          <p className="mt-0.5 text-xs">
            <span className="num">{supply.openJobs}</span> open jobs keep about <span className="num">{supply.driversNeeded}</span> drivers busy (at {JOBS_PER_DRIVER_14D} each, an assumption). We have{' '}
            <span className="num">{supply.active}</span> active and <span className="num">{supply.waiting}</span> waiting.
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {supply.oversupplied ? 'More drivers than open jobs: part of the gap is demand. Recruit to demand, and fit first drives to where and when drivers can work.' : 'The open jobs need more drivers than we have: recruit.'}
          </p>
        </div>
      </div>

      <div className="hidden lg:block overflow-hidden rounded-xl border border-lavender">
        <table className="w-full text-sm">
          <thead className="bg-card text-left text-xs text-muted">
            <tr>
              <th className="px-4 py-2.5 font-semibold">Driver</th>
              <th className="px-4 py-2.5 font-semibold">Accepted</th>
              <th className="px-4 py-2.5 font-semibold">Status</th>
              <th className="px-4 py-2.5 font-semibold">Self-service</th>
              <th className="px-4 py-2.5 font-semibold">First gig</th>
              <th className="px-4 py-2.5 font-semibold">Why not yet</th>
              <th className="px-4 py-2.5 font-semibold">Flags</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ a, bucket, call, chips, reason }) => (
              <tr key={a.id} onClick={() => onOpen(a.id)} className="border-t border-lavender cursor-pointer hover:bg-card/70">
                <td className="px-4 py-3">
                  <button type="button" onClick={() => onOpen(a.id)} className="font-semibold text-left hover:text-indigo">
                    {a.name}
                  </button>
                  <div className="text-xs text-muted">
                    <span className="num">{a.id}</span> · {a.area}
                  </div>
                </td>
                <td className="px-4 py-3 num text-xs">{ago(a.decision!.at, now)}</td>
                <td className="px-4 py-3">
                  <ActivationChip bucket={bucket} />
                </td>
                <td className="px-4 py-3 text-xs">
                  <CallCell call={call} />
                </td>
                <td className="px-4 py-3 text-xs">
                  <GigCell a={a} />
                </td>
                <td className="px-4 py-3 text-xs">
                  <ReasonCell a={a} reason={reason} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">{chips.length ? chips.map((c) => <FlagChip key={c.label} chip={c} />) : <span className="text-xs text-muted">–</span>}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="lg:hidden grid gap-2 sm:grid-cols-2">
        {rows.map(({ a, bucket, call, chips, reason }) => (
          <li key={a.id}>
            <button type="button" onClick={() => onOpen(a.id)} className="w-full text-left rounded-xl border border-lavender bg-white p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold">{a.name}</div>
                  <div className="text-xs text-muted">
                    {a.area} · accepted {ago(a.decision!.at, now)}
                  </div>
                </div>
                <ActivationChip bucket={bucket} />
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <div className="text-muted">Self-service</div>
                  <CallCell call={call} />
                </div>
                <div>
                  <div className="text-muted">First gig</div>
                  <GigCell a={a} />
                </div>
                <div className="col-span-2">
                  <div className="text-muted">Why not yet</div>
                  <ReasonCell a={a} reason={reason} />
                </div>
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
