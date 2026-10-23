import { CircleCheck } from 'lucide-react';
import type { Applicant } from '../lib/types';
import { ACTIVATION_LABEL, activationBucket, activationFlags, byActivationPriority, welcomeCallState, type ActivationBucket } from '../lib/activation';
import { ago } from '../lib/time';
import { FlagChip } from './chips';
import { ListIntro } from './ui';

interface Props {
  apps: Applicant[]; // stage = accepted
  now: number;
  onOpen: (id: string) => void;
}

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

export function Activation({ apps, now, onOpen }: Props) {
  const rows = [...apps].sort(byActivationPriority(now)).map((a) => {
    const f = activationFlags(a);
    return {
      a,
      bucket: activationBucket(a.decision!.at, now),
      call: welcomeCallState(a, now),
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

  const CallCell = ({ call }: { call: (typeof rows)[number]['call'] }) =>
    call.state === 'done' ? (
      <span className="text-ok font-medium">Done {shortDate(call.at)}</span>
    ) : (
      <span className={call.state === 'overdue' ? 'text-bad font-semibold' : call.state === 'missed' ? 'text-muted' : 'text-warn font-semibold'}>{call.label}</span>
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
            <p className="text-muted">Welcome call within 24 h of acceptance. No gig booked after 7 days → book one with them. No gig in 14 days → call. After 30 days → dormant, re-engaged in a monthly batch.</p>
          </>
        }
      >
        Who to call first{urgent > 0 && <strong className="font-semibold text-navy"> · {urgent} need action</strong>}
      </ListIntro>

      <div className="hidden lg:block overflow-hidden rounded-xl border border-lavender">
        <table className="w-full text-sm">
          <thead className="bg-card text-left text-xs text-muted">
            <tr>
              <th className="px-4 py-2.5 font-semibold">Driver</th>
              <th className="px-4 py-2.5 font-semibold">Accepted</th>
              <th className="px-4 py-2.5 font-semibold">Status</th>
              <th className="px-4 py-2.5 font-semibold">Welcome call</th>
              <th className="px-4 py-2.5 font-semibold">First gig</th>
              <th className="px-4 py-2.5 font-semibold">Flags</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ a, bucket, call, chips }) => (
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
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">{chips.length ? chips.map((c) => <FlagChip key={c.label} chip={c} />) : <span className="text-xs text-muted">–</span>}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="lg:hidden grid gap-2 sm:grid-cols-2">
        {rows.map(({ a, bucket, call, chips }) => (
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
                  <div className="text-muted">Welcome call</div>
                  <CallCell call={call} />
                </div>
                <div>
                  <div className="text-muted">First gig</div>
                  <GigCell a={a} />
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
