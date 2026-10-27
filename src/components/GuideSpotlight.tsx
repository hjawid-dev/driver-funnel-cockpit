import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { isShown } from '../lib/guideFocus';

type Box = { x: number; y: number; width: number; height: number };
interface Frame { holes: Box[]; outlines: Box[] }

/** The visible part of an element: clipped by scrolling panels, the sticky header and the window. */
function visibleBox(el: HTMLElement, pad: number): Box | null {
  if (!isShown(el)) return null;
  const r = el.getBoundingClientRect();
  let left = r.left - pad, top = r.top - pad, right = r.right + pad, bottom = r.bottom + pad;
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const style = getComputedStyle(p);
    const b = p.getBoundingClientRect();
    if (style.overflowY !== 'visible') { top = Math.max(top, b.top); bottom = Math.min(bottom, b.bottom); }
    if (style.overflowX !== 'visible') { left = Math.max(left, b.left); right = Math.min(right, b.right); }
    if (style.position === 'fixed') break;
  }
  const header = document.querySelector<HTMLElement>('[data-guide-header]');
  const h = header?.getBoundingClientRect();
  if (h && !header!.contains(el) && h.bottom > 0 && left < h.right && right > h.left && !el.closest('[role="dialog"], .driver-phone, .guide-panel')) top = Math.max(top, h.bottom);
  left = Math.max(left, 0); top = Math.max(top, 0); right = Math.min(right, innerWidth); bottom = Math.min(bottom, innerHeight);
  return right - left > 2 && bottom - top > 2 ? { x: Math.round(left), y: Math.round(top), width: Math.round(right - left), height: Math.round(bottom - top) } : null;
}
const inside = (a: Box, b: Box) => a.x >= b.x && a.y >= b.y && a.x + a.width <= b.x + b.width && a.y + a.height <= b.y + b.height;

/**
 * One shade for the whole walkthrough. Lit sections are cut out whole; the control to use
 * carries its own ring (CSS), so the ring never lags behind the element.
 * Measured every frame, so drawers sliding in, accordions and scrolling stay aligned.
 */
export function GuideSpotlight() {
  const [frame, setFrame] = useState<Frame | null>(null);
  useEffect(() => {
    let raf = 0, last = '';
    const measure = () => {
      const outlines = [...document.querySelectorAll<HTMLElement>('[data-guide-lit]')].map(el => visibleBox(el, 6)).filter((b): b is Box => !!b);
      const holes = [...outlines];
      const action = document.querySelector<HTMLElement>('[data-demo-focus]');
      const ring = action && visibleBox(action, 8);
      if (ring && !holes.some(h => inside(ring, h))) holes.push(ring);
      const next = holes.length ? { holes, outlines } : null;
      const key = JSON.stringify(next);
      if (key !== last) { last = key; setFrame(next); }
      raf = requestAnimationFrame(measure);
    };
    raf = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(raf);
  }, []);
  if (!frame) return null;
  return createPortal(<div className="guide-spotlight" aria-hidden="true">
    <svg width="100%" height="100%">
      <defs><mask id="guide-cutout"><rect width="100%" height="100%" fill="white" />{frame.holes.map((b, i) => <rect key={i} {...b} rx="12" fill="black" />)}</mask></defs>
      <rect width="100%" height="100%" fill="#100e35" fillOpacity="0.62" mask="url(#guide-cutout)" />
      {frame.outlines.map((b, i) => <rect key={i} {...b} rx="12" fill="none" stroke="white" strokeOpacity="0.9" strokeWidth="2" />)}
    </svg>
  </div>, document.body);
}
