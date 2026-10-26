import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { CircleHelp } from 'lucide-react';

interface Props {
  /** What the tip explains, for screen readers: "About time to decision". */
  label: string;
  children: ReactNode;
  /** Which edge of the icon the box lines up with. It is nudged back inside the window if it would overflow. */
  align?: 'left' | 'right';
  /** Light icon for dark backgrounds. */
  dark?: boolean;
  className?: string;
}

/** A small "?" that opens a short explanation. Click or tap to open; click outside or Esc to close. */
export function InfoTip({ label, children, align = 'left', dark = false, className = '' }: Props) {
  const [open, setOpen] = useState(false);
  const [shift, setShift] = useState(0);
  const [above, setAbove] = useState(false);
  const [maxHeight, setMaxHeight] = useState(384);
  const wrap = useRef<HTMLSpanElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation(); // close the tip, not the drawer around it
      setOpen(false);
      btn.current?.focus();
    };
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  // Keep explanations readable inside the viewport, including long reminder histories.
  useLayoutEffect(() => {
    if (!open || !box.current || !wrap.current) {
      setShift(0);
      setAbove(false);
      setMaxHeight(384);
      return;
    }
    const r = box.current.getBoundingClientRect();
    const anchor = wrap.current.getBoundingClientRect();
    const margin = 8;
    const vw = document.documentElement.clientWidth;
    if (r.right > vw - margin) setShift(vw - margin - r.right);
    else if (r.left < margin) setShift(margin - r.left);
    let clipTop = 0;
    let clipBottom = document.documentElement.clientHeight;
    for (let parent = wrap.current.parentElement; parent; parent = parent.parentElement) {
      if (!/auto|scroll|hidden|clip/.test(getComputedStyle(parent).overflowY)) continue;
      const bounds = parent.getBoundingClientRect();
      clipTop = Math.max(clipTop, bounds.top);
      clipBottom = Math.min(clipBottom, bounds.bottom);
    }
    const belowSpace = clipBottom - anchor.bottom - 16;
    const aboveSpace = anchor.top - clipTop - 16;
    const placeAbove = r.height > belowSpace && aboveSpace > belowSpace;
    setAbove(placeAbove);
    setMaxHeight(Math.max(48, Math.min(384, placeAbove ? aboveSpace : belowSpace)));
  }, [open]);

  return (
    <span ref={wrap} className={`relative inline-flex align-middle ${className}`}>
      <button
        ref={btn}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={(e) => {
          e.stopPropagation();
          setShift(0);
          setOpen((v) => !v);
        }}
        className={`rounded-full p-0.5 transition-colors ${
          dark ? 'text-white/60 hover:text-white' : open ? 'text-indigo' : 'text-muted/70 hover:text-indigo'
        }`}
      >
        <CircleHelp size={14} aria-hidden />
      </button>
      {open && (
        <div
          ref={box}
          id={id}
          role="note"
          onClick={(e) => e.stopPropagation()}
          style={{ maxHeight, ...(shift ? { transform: `translateX(${shift}px)` } : {}) }}
          className={`anim-fade absolute z-40 ${above ? 'bottom-full mb-1.5' : 'top-full mt-1.5'} w-72 max-w-[calc(100vw-1rem)] overflow-y-auto space-y-1.5 rounded-lg border border-lavender bg-white p-3 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-navy shadow-lg ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {children}
        </div>
      )}
    </span>
  );
}
