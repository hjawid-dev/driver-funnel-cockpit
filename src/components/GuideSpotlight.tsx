import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

type Box = { x: number; y: number; width: number; height: number };
type Frame = Box & { label: string; badgeX: number; badgeY: number; context?: Box };

/** Paint above drawers and the phone; the real target remains visible and clickable through the cutout. */
export function GuideSpotlight() {
  const [frame, setFrame] = useState<Frame | null>(null);
  useEffect(() => {
    let raf = 0;
    let observed: Element | null = null;
    const resize = new ResizeObserver(() => schedule());
    const measure = () => {
      const target = document.querySelector<HTMLElement>('[data-demo-focus]');
      if (observed !== target) { resize.disconnect(); if (target) resize.observe(target); observed = target; }
      if (!target || !target.getClientRects().length) { setFrame(null); return; }
      const r = target.getBoundingClientRect();
      let left = Math.max(4, r.left - 8), top = Math.max(4, r.top - 8);
      let right = Math.min(innerWidth - 4, r.right + 8), bottom = Math.min(innerHeight - 4, r.bottom + 8);
      for (let p = target.parentElement; p && p !== document.body; p = p.parentElement) {
        if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(p).overflowY)) {
          const b = p.getBoundingClientRect();
          top = Math.max(top, b.top + 2); bottom = Math.min(bottom, b.bottom - 2);
        }
      }
      // The AI answer stays readable while the next action is the demo clock in the dock.
      const answer = target.dataset.guide === 'guide-clock' ? document.querySelector<HTMLElement>('[data-guide-context="pickup-ai-response"]') : target.dataset.guide === 'report-close' ? document.querySelector<HTMLElement>('[data-guide="report-ready"]') : ['guide-next', 'candidate-close'].includes(target.dataset.guide ?? '') ? document.querySelector<HTMLElement>('[data-guide="candidate-next"]') : null;
      const bounds = answer?.getBoundingClientRect();
      const list = answer?.closest('[data-guide="inbox"]')?.getBoundingClientRect() ?? { top: 0, bottom: innerHeight };
      const context = bounds && list && bounds.bottom > list.top && bounds.top < list.bottom ? { x: bounds.left - 4, y: Math.max(bounds.top - 4, list.top), width: bounds.width + 8, height: Math.min(bounds.bottom + 4, list.bottom) - Math.max(bounds.top - 4, list.top) } : undefined;
      // A control in the guide panel gets its label just outside the panel, so it never covers the guide text.
      const panel = target.closest('.guide-panel')?.getBoundingClientRect();
      const beside = !!panel && panel.right + 180 < innerWidth;
      const badgeX = beside ? panel.right + 10 : Math.min(innerWidth - 170, Math.max(8, left));
      const badgeY = beside ? (top + bottom) / 2 - 16 : top > 42 ? top - 36 : bottom + 8;
      const next = right > left && bottom > top ? { x: left, y: top, width: right - left, height: bottom - top, label: `${beside ? '← ' : ''}${target.dataset.guideLabel ?? 'Next'}`, badgeX, badgeY, context } : null;
      setFrame(old => JSON.stringify(old) === JSON.stringify(next) ? old : next);
    };
    const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(measure); };
    const observer = new MutationObserver(schedule);
    // Include the floating guide as well as controls inside the app root.
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-demo-focus'] });
    window.addEventListener('resize', schedule);
    document.addEventListener('scroll', schedule, true);
    schedule();
    return () => { cancelAnimationFrame(raf); observer.disconnect(); resize.disconnect(); window.removeEventListener('resize', schedule); document.removeEventListener('scroll', schedule, true); };
  }, []);
  if (!frame) return null;
  return createPortal(<><div className="guide-spotlight" aria-hidden="true">
    <svg width="100%" height="100%"><defs><mask id="guide-cutout"><rect width="100%" height="100%" fill="white" /><rect x={frame.x} y={frame.y} width={frame.width} height={frame.height} rx="12" fill="black" />{frame.context && <rect {...frame.context} rx="12" fill="black" />}</mask></defs><rect width="100%" height="100%" fill="#100e35" fillOpacity="0.64" mask="url(#guide-cutout)" /><rect x={frame.x} y={frame.y} width={frame.width} height={frame.height} rx="12" fill="none" stroke="white" strokeWidth="3" /></svg>
  </div><span aria-hidden="true" className="guide-next-badge" style={{ left: frame.badgeX, top: frame.badgeY }}>{frame.label}</span></>, document.body);
}
