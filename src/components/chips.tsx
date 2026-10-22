import { Check, Clock, Hourglass, X } from 'lucide-react';
import type { DocKey, DocStatus } from '../lib/types';
import type { SlaBucket } from '../lib/sla';
import type { Chip } from '../lib/criteria';

const SLA_STYLE: Record<SlaBucket, string> = {
  ok: 'bg-ok-bg text-ok',
  warn: 'bg-warn-bg text-warn',
  overdue: 'bg-bad text-white',
};

export function SlaChip({ bucket, label }: { bucket: SlaBucket; label: string }) {
  return (
    <span className={`num inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${SLA_STYLE[bucket]}`}>
      <Clock size={12} aria-hidden />
      {label}
    </span>
  );
}

const CHIP_STYLE: Record<Chip['tone'], string> = {
  info: 'bg-lavender text-navy',
  warn: 'bg-warn-bg text-warn',
  bad: 'bg-bad-bg text-bad',
};

export function FlagChip({ chip }: { chip: Chip }) {
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${CHIP_STYLE[chip.tone]}`}>{chip.label}</span>;
}

export const DOC_LABEL: Record<DocKey, string> = {
  licence: 'Driving licence',
  id: 'ID (personnummer)',
  background: 'Background check',
  photo: 'Profile photo',
};

export function docStatusText(key: DocKey, s: DocStatus): string {
  if (key === 'id' && s === 'verified') return 'Verified (BankID)';
  if (key === 'background' && s === 'pending') return 'Ordered from Polisen';
  return { verified: 'Verified', uploaded: 'Uploaded', missing: 'Missing', pending: 'Pending', failed: 'Failed', remark: 'Has remark' }[s];
}

const DOC_STYLE: Record<DocStatus, string> = {
  verified: 'bg-ok-bg text-ok',
  uploaded: 'bg-lavender text-navy',
  missing: 'bg-bad-bg text-bad',
  pending: 'bg-warn-bg text-warn',
  failed: 'bg-bad-bg text-bad',
  remark: 'bg-warn-bg text-warn',
};

export function DocStatusPill({ docKey, status }: { docKey: DocKey; status: DocStatus }) {
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${DOC_STYLE[status]}`}>{docStatusText(docKey, status)}</span>;
}

const SHORT_DOC: Record<DocKey, string> = { licence: 'Licence', id: 'ID', background: 'Background', photo: 'Photo' };

/** Four small chips: ✓ submitted · ⏳ pending · ✗ missing. */
export function DocChecklist({ docs }: { docs: Record<DocKey, DocStatus> }) {
  return (
    <ul className="flex flex-wrap gap-1" aria-label="Documents">
      {(['licence', 'id', 'background', 'photo'] as DocKey[]).map((k) => {
        const s = docs[k];
        const state = s === 'missing' ? 'missing' : s === 'pending' ? 'pending' : 'done';
        const style = { done: 'bg-ok-bg text-ok', pending: 'bg-warn-bg text-warn', missing: 'bg-bad-bg text-bad' }[state];
        const Icon = { done: Check, pending: Hourglass, missing: X }[state];
        return (
          <li key={k} title={`${DOC_LABEL[k]}: ${docStatusText(k, s)}`} className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium ${style}`}>
            <Icon size={12} aria-hidden />
            {SHORT_DOC[k]}
            <span className="sr-only">: {docStatusText(k, s)}</span>
          </li>
        );
      })}
    </ul>
  );
}
