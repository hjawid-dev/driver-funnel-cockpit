import { assisting, driverIncidentState, driverStatus, driverTimeline, OUTCOME_LABEL, type DriverIncidentState, type Job } from '../../lib/liveOps';

const hm = (ts: number) => new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

const TONE: Record<DriverIncidentState, string> = {
  assistant: 'bg-lavender/60 text-navy',
  waiting_call: 'bg-warn-bg text-navy',
  ops_working: 'bg-lavender/60 text-navy',
  decided: 'bg-ok-bg text-navy',
};

/**
 * A stuck pickup on the driver's phone: one line for where it stands now, and the steps so far.
 * The job card and the chat both show this, so the phone never says two things at once.
 */
export function PickupStatus({ j, now, onInbox }: { j: Job; now: number; onInbox?: () => void }) {
  const state = driverIncidentState(j, now);
  // Once the car is on its way, the pickup is history.
  if (!state || ['driving', 'delivered'].includes(driverStatus(j, now))) return null;
  const waitFrom = hm(Math.max(j.pickupAt, j.arrivedAt ?? j.pickupAt));
  const outcome = j.incident?.outcome?.type;
  const headline: Record<DriverIncidentState, string> = {
    assistant: `We're contacting the customer. If it isn't solved by ${hm(assisting(j, now)?.until ?? now)}, a person from ops calls you.`,
    waiting_call: 'A person from ops calls you within 5 minutes.',
    ops_working: 'Ops has called you and is working on it with the customer.',
    decided: outcome === 'keys_found' ? 'Keys found. You can head off.' : `${OUTCOME_LABEL[outcome ?? 'cancelled']}. You can leave the pickup.`,
  };
  const steps = driverTimeline(j, now);

  return (
    <div className={`rounded-xl px-3.5 py-3 ${TONE[state]}`} role="status">
      <p className="text-sm font-semibold">{headline[state]}</p>
      <p className="mt-0.5 text-sm">
        Your waiting time {state === 'decided' ? 'from' : 'is paid from'} {waitFrom}
        {state === 'decided' ? ' is paid.' : state === 'assistant' || state === 'waiting_call' ? '. Stay where you are.' : '.'}
      </p>
      {steps.length > 0 && (
        <ol className="mt-2 space-y-0.5 border-t border-navy/10 pt-2 text-xs">
          {steps.map((s, i) => (
            <li key={i} className="flex gap-2">
              <span className="num w-10 shrink-0 text-muted">{hm(s.at)}</span>
              <span>{s.text}</span>
            </li>
          ))}
        </ol>
      )}
      {onInbox && (
        <button type="button" onClick={onInbox} className="mt-1.5 text-sm font-semibold text-indigo hover:underline">
          Open messages
        </button>
      )}
    </div>
  );
}
