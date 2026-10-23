import { useLayoutEffect, useRef } from 'react';
import type { TabKey } from '../state';

export const TABS: { key: TabKey; label: string }[] = [
  { key: 'live', label: 'Live ops' },
  { key: 'review', label: 'Review queue' },
  { key: 'missing', label: 'Missing documents' },
  { key: 'awaiting', label: 'Awaiting first gig' },
  { key: 'chat', label: 'Driver questions' },
  { key: 'all', label: 'All applicants' },
];

interface Props {
  active: TabKey;
  counts: Record<TabKey, number>;
  /** Tabs with something urgent get a red count. */
  alert?: Partial<Record<TabKey, boolean>>;
  onChange: (key: TabKey) => void;
}

export function Tabs({ active, counts, alert = {}, onChange }: Props) {
  const listRef = useRef<HTMLDivElement>(null);

  // Keep the selected tab visible when the bar scrolls sideways on a phone.
  useLayoutEffect(() => {
    const list = listRef.current;
    const el = list?.querySelector<HTMLElement>(`#tab-${active}`);
    if (!list || !el) return;
    const left = el.offsetLeft - list.offsetLeft;
    if (left < list.scrollLeft || left + el.offsetWidth > list.scrollLeft + list.clientWidth) {
      list.scrollLeft = Math.max(0, left - 16); // instant: a smooth scroll here would cancel the page scroll
    }
  }, [active]);

  return (
    <div ref={listRef} role="tablist" aria-label="Work lists" className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-lavender -mx-4 px-4 sm:mx-0 sm:px-0">
      {TABS.map((t) => {
        const selected = t.key === active;
        return (
          <button
            key={t.key}
            id={`tab-${t.key}`}
            role="tab"
            type="button"
            aria-selected={selected}
            aria-controls={`panel-${t.key}`}
            onClick={() => onChange(t.key)}
            className={`relative shrink-0 flex items-center gap-2 px-3 py-2.5 text-sm font-semibold transition-colors ${
              selected ? 'text-indigo' : 'text-muted hover:text-navy'
            }`}
          >
            {t.label}
            <span className={`num rounded-full px-1.5 text-xs ${alert[t.key] ? 'bg-bad text-white' : selected ? 'bg-indigo text-white' : 'bg-card text-muted'}`}>{counts[t.key]}</span>
            {alert[t.key] && <span className="sr-only">(urgent)</span>}
            {selected && <span aria-hidden className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-indigo" />}
          </button>
        );
      })}
    </div>
  );
}
