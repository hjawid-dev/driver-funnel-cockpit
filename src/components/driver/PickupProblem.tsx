import { ShieldAlert } from 'lucide-react';
import { pendingText, type Job } from '../../lib/liveOps';
import { REASON_LABEL, recipients, type PickupReason } from '../../lib/sms';

const ORDER: PickupReason[] = ['keys_missing', 'no_contact', 'car_missing', 'damage', 'unsafe', 'other'];

/** What is wrong at the pickup: six clear choices, so nothing is assumed. */
export function ReasonPicker({ onPick, onCancel }: { onPick: (r: PickupReason) => void; onCancel?: () => void }) {
  return (
    <div className="space-y-1.5" role="group" aria-label="What is wrong at the pickup?">
      <p className="text-sm font-semibold">What's wrong?</p>
      {ORDER.map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => onPick(r)}
          className={`flex w-full items-center gap-2 rounded-xl border px-3.5 py-2.5 text-left text-sm font-semibold ${
            r === 'damage' || r === 'unsafe' ? 'border-bad/40 text-bad hover:bg-bad-bg' : r === 'other' ? 'border-lavender text-muted hover:text-navy' : 'border-indigo/40 text-navy hover:border-indigo'
          }`}
        >
          {r === 'unsafe' && <ShieldAlert size={15} aria-hidden />}
          {REASON_LABEL[r]}
        </button>
      ))}
      {onCancel && (
        <button type="button" onClick={onCancel} className="w-full pt-1 text-center text-sm font-semibold text-muted hover:text-navy">
          Cancel
        </button>
      )}
    </div>
  );
}

/** The exact text the customer's contacts would get. Nothing goes out until the driver taps Send. */
export function TextPreview({ j, now, onSend }: { j: Job; now: number; onSend: () => void }) {
  const body = pendingText(j, now);
  if (!body) return null;
  const to = recipients(j).map((r) => r.role.toLowerCase());
  return (
    <div className="space-y-2 rounded-xl border border-indigo/30 bg-white px-3.5 py-3">
      <p className="text-sm font-semibold">Send this to the {to.join(' and the ')}?</p>
      <blockquote className="rounded-lg bg-card px-3 py-2 text-sm">{body}</blockquote>
      <p className="text-xs text-muted">A fixed message from the booking. It can't be edited, and nothing else is sent.</p>
      <button type="button" onClick={onSend} className="w-full rounded-xl bg-indigo px-4 py-2.5 text-sm font-semibold text-white hover:bg-navy">
        Send
      </button>
    </div>
  );
}
