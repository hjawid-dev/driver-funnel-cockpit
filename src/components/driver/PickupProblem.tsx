import { ShieldAlert } from 'lucide-react';
import type { Job } from '../../lib/liveOps';
import { isTextReason, REASON_LABEL, recipients, type PickupReason } from '../../lib/sms';

const ORDER: PickupReason[] = ['keys_missing', 'no_contact', 'car_missing', 'damage', 'unsafe', 'other'];

/** What each choice does next, said on the button, so one tap is an informed one. */
function effect(j: Job, r: PickupReason, textsEnabled: boolean): string {
  if (r === 'damage' || r === 'unsafe') return 'A person from ops calls you now';
  if (r === 'other') return 'Tell the assistant in the chat';
  return textsEnabled ? `We text the ${recipients(j).map((x) => x.role.toLowerCase()).join(' and the ')}` : 'A person from ops calls you';
}

/** What is wrong at the pickup: six clear choices, so nothing is assumed. The tap is the confirmation. */
export function ReasonPicker({ j, textsEnabled, onPick, onCancel }: { j: Job; textsEnabled: boolean; onPick: (r: PickupReason) => void; onCancel?: () => void }) {
  return (
    <div data-guide="pickup-reason" className="space-y-1.5" role="group" aria-label="What is wrong at the pickup?">
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
          {r === 'unsafe' && <ShieldAlert size={15} aria-hidden className="shrink-0" />}
          <span>
            {REASON_LABEL[r]}
            <span className={`block text-xs font-normal ${isTextReason(r) ? 'text-indigo' : 'opacity-80'}`}>{effect(j, r, textsEnabled)}</span>
          </span>
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
