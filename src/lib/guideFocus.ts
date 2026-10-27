import type { DemoData } from './persist';
import { incidentTarget, reviewTarget, type PresentKey } from './present';

/**
 * Each guide state names a section to read (lit as a whole) and one control to use (ringed).
 * The section stays still while the ring moves inside it. No business action is performed here.
 */
export interface GuideFocusContext {
  data: DemoData;
  now: number;
  visited: string[];
  /** The current step's own status says it is complete: the next control is Continue in the guide. */
  complete?: boolean;
}
interface Focus { sections: HTMLElement[]; action: HTMLElement | null; hint: string }

// ---------- Finding what is actually on screen ----------

/** Visible to the viewer: laid out, and not inside a closed <details> or a hidden subtree. */
export function isShown(el: Element | null | undefined): el is HTMLElement {
  if (!(el instanceof HTMLElement) || !el.getClientRects().length) return false;
  const check = (el as HTMLElement & { checkVisibility?: (o?: object) => boolean }).checkVisibility;
  return check ? check.call(el, { contentVisibilityAuto: true, visibilityProperty: true }) : true;
}
const usable = (el: Element | null | undefined): el is HTMLElement => isShown(el) && !el.matches(':disabled');
const all = (selector: string, root: ParentNode = document) => [...root.querySelectorAll<HTMLElement>(selector)];
const find = (selector: string, root: ParentNode = document) => all(selector, root).find(usable) ?? null;
const shown = (selector: string, root: ParentNode = document) => all(selector, root).find(isShown) ?? null;
const by = (key: string, root: ParentNode = document) => find(`[data-guide="${key}"]`, root);
const textButton = (text: string, root: ParentNode = document, exact = false) => all('button', root).find(el => usable(el) && (exact ? el.textContent?.trim() === text : el.textContent?.trim().includes(text))) ?? null;
const tick = (input: HTMLElement | null) => input?.closest<HTMLElement>('label') ?? input;

/** The words a presenter would say: “Tap Reject”, “Tick …”, “Press Continue below”. */
function describe(el: HTMLElement | null): string {
  if (!el) return '';
  const field = el.matches('input, select, textarea') ? el : el.matches('label') ? el.querySelector<HTMLElement>('input, select, textarea') : null;
  const full = (el.getAttribute('aria-label') ?? (el.innerText || el.textContent || '')).split('\n').map(s => s.trim()).find(Boolean)?.replace(/\s+/g, ' ') ?? '';
  // Long labels are cut at a word, never mid-word.
  const name = full.length <= 60 ? full : `${full.slice(0, 60).replace(/[\s,.;:(]+\S*$/, '')}…`;
  if (el.closest('.guide-panel')) return `Press “${name}” in this guide.`;
  if (field instanceof HTMLInputElement && field.type === 'checkbox') return `Tick “${name}”.`;
  if (field) return `Fill in “${field.getAttribute('aria-label') ?? name}”.`;
  if (el.matches('fieldset, [role="group"], [data-guide="customer-outcomes"]')) return 'Choose one of the highlighted options.';
  return `Tap “${name}”.`;
}
const focus = (sections: (HTMLElement | null | undefined)[], action: HTMLElement | null, hint?: string): Focus =>
  ({ sections: [...new Set(sections.filter(isShown))], action, hint: hint ?? describe(action) });

// ---------- What each step shows ----------

const PLAYBOOK: Partial<Record<PresentKey, string>> = { playbook: 'keep_driver', booking_check: 'own_error', contact: 'escalate', customer: 'customer', decision: 'decide', close: 'close' };

function focusFor(key: PresentKey, { data, now, visited, complete }: GuideFocusContext): Focus {
  const phone = shown('[data-demo-target="driver"]');
  const chat = phone?.dataset.phoneView === 'chat';
  const screen = phone ? shown('[data-guide-section="phone-screen"]', phone) : null;
  const j = incidentTarget(data.jobs), a = reviewTarget(data.apps);
  const dialog = shown('[data-demo-target="candidate"]');
  const next = by('guide-next');
  const row = (id: string | undefined) => (id ? shown(`[data-job-row="${id}"]`) : null);
  const detail = shown('[data-demo-target="job-detail"]');
  const section = (name: string, root: ParentNode = document) => shown(`[data-demo-target="${name}"]`, root);
  const toPhone = (why: string) => focus([phone], by('phone-steps') ?? by('guide-target'), why);
  // Only when the presenter closed the view this step needs: the guide then offers to reopen it.
  const restore = () => focus([], by('guide-target'), 'This step’s view was closed. Press “Show this step again”.');

  if (key === 'incident') {
    if (!phone) return restore();
    if (chat) return toPhone('Go back to Julia’s job on the phone.');
    return focus([screen, row(j?.id)], by('pickup-keys-missing') ?? (j?.arrivedAt ? by('phone-problem') : by('phone-checkin')) ?? next);
  }
  if (key === 'assistant') {
    if (!phone) return restore();
    if (!chat) return focus([screen], by('phone-chat'), 'Open the AI assistant on Julia’s phone.');
    const answer = all('[data-guide-context="pickup-ai-response"]').filter(isShown).at(-1);
    const call = by('call-driver');
    if (call) return focus([answer, shown('[data-playbook-step="keep_driver"]')], call);
    return focus([answer, shown('[data-guide-section="assist-status"]')], by('guide-clock') ?? next);
  }
  const play = PLAYBOOK[key];
  if (play) {
    const step = shown(`[data-playbook-step="${play}"]`);
    const closed = !!j?.incident?.closedAt;
    if (closed || (key === 'decision' && j?.incident?.outcome && j.incident.rebooking?.status !== 'open')) return focus([closed ? detail : step], next);
    const opener = step?.querySelector<HTMLElement>(':scope > button[aria-expanded="false"]');
    if (opener) return focus([step], opener, `Open “${opener.innerText.split('\n').find(s => s.trim()) ?? 'this step'}” in the playbook.`);
    const inside = (k: string) => (step ? by(k, step) : null);
    let action: HTMLElement | null = null;
    if (key === 'playbook') action = inside('call-driver') ?? by('guide-clock');
    if (key === 'booking_check') {
      const typed = step?.querySelector<HTMLInputElement>('input[aria-label="Booking correction"]')?.value.trim();
      action = (typed ? inside('booking-correction-save') : null) ?? inside('booking-correct');
    }
    if (key === 'contact') action = inside('call-contacts');
    if (key === 'customer') action = !j?.incident?.steps.customer ? inside('customer-update') : j.pilot && !j.incident.accountOwnerAt ? inside('account-owner') : null;
    if (key === 'decision') action = j?.incident?.rebooking?.status === 'open' ? (step ? find('[data-guide="replacement"] button', step) : null) : inside('customer-outcomes');
    if (key === 'close') {
      if (!j?.incident?.outcome) return focus([shown('[data-playbook-step="decide"]')], by('customer-outcomes'), 'Record the customer’s outcome first.');
      const unchecked = [...(j.pilot && !j.incident.accountOwnerAt ? ['close-account-owner'] : []), 'wait-paid', ...(j.pilot ? ['review-booked'] : [])].map(k => inside(k)).find(el => el instanceof HTMLInputElement && !el.checked);
      const date = step?.querySelector<HTMLInputElement>('input[aria-label="Booker review time"]');
      const note = inside('cause-note') as HTMLTextAreaElement | null;
      action = unchecked ? tick(unchecked)
        : j.pilot && date && isShown(date) && (!date.value || new Date(date.value).getTime() <= now) ? tick(date)
        : note && !note.value.trim() ? tick(note)
        : inside('close-incident');
    }
    return focus([step], action ?? next);
  }
  if (key === 'prevent') return focus([section('confirmations')], textButton('Log this check confirmed by phone') ?? next);

  if (key === 'onboarding') {
    if (!phone) return restore();
    if (chat) return toPhone('Go back to the application on the phone.');
    const own = data.apps.find(x => x.id === phone.dataset.applicantId);
    if (own?.callAt || complete) return focus([by('call-confirmation', phone) ?? screen], next);
    const primary = phone.querySelector<HTMLButtonElement>('[data-guide="phone-primary"]');
    if (primary && primary.disabled && isShown(primary)) return focus([screen], null, own ? 'Follow this screen on the phone; it continues when ready.' : 'Fill in the application on the phone, then tap “Continue”.');
    const slot = by('phone-slot', phone);
    if (slot) return focus([screen], slot, 'Pick a time for the onboarding call.');
    return focus([screen], by('phone-primary', phone) ?? by('phone-photo', phone) ?? next);
  }
  if (key === 'reminders') {
    if (dialog) return focus([section("what's-missing", dialog), section('nudges', dialog)], by('manual-followup', dialog) ?? next);
    const reminders = phone && chat ? all('[data-guide-auto]', phone).filter(isShown) : [];
    return focus(reminders.length ? reminders : [shown('[data-guide="inbox"]')], by('guide-reminders'), 'Read Nora’s reminders, then press “Open Nora’s Ops follow-up” in this guide.');
  }
  if (key === 'queue') {
    if (dialog) {
      const decision = section('decision', dialog);
      const reject = decision ? textButton('Reject', decision, true) ?? textButton('Reject…', decision, true) : null;
      return focus([by('candidate-next', dialog), decision], reject ?? next);
    }
    const list = shown('[data-guide-section="queue"]');
    return focus([list], visited.includes('queue') ? next : (list ? find('[data-guide-applicant]', list) : null) ?? next, visited.includes('queue') ? undefined : 'Open the oldest deadline: the top row.');
  }
  if (key === 'criteria') {
    if (!dialog) return focus([], by('guide-criteria') ?? by('guide-target'), by('guide-criteria') ? undefined : 'Ahmed’s application was closed. Press “Show this step again”.');
    const criteria = section('criteria', dialog), decision = section('decision', dialog), call = by('onboarding-call', dialog);
    if (a?.decision || complete) return focus([by('candidate-next', dialog), section('first-drive-status', dialog) ?? decision], next);
    const unchecked = all('[data-demo-target="criteria"] input[type="checkbox"], input[data-guide="onboarding-call"]', dialog).find(el => usable(el) && !(el as HTMLInputElement).checked);
    const action = unchecked ? tick(unchecked) : textButton('Log licence validity', dialog) ?? textButton('Accept', dialog) ?? textButton('Reject…', dialog, true);
    return focus([criteria, tick(call), decision], action ?? next);
  }
  if (key === 'activate') {
    if (!a?.decision || a.decision.type === 'rejected') return focus([], by('guide-criteria') ?? next);
    if (!phone) return focus([], by('guide-job') ?? by('guide-target'));
    if (chat) return toPhone('Go back to Ahmed’s job on the phone.');
    if (!a.firstGig?.bookedFor) return focus([screen], by('phone-offer') ?? by('phone-primary') ?? next, 'Pick a matching first drive on Ahmed’s phone.');
    const job = data.jobs.find(x => x.id === a.firstGig?.gigId);
    if (detail?.dataset.jobId !== a.firstGig.gigId) return focus([screen], by('guide-job'));
    const live = [row(job?.id), detail];
    if (job?.deliveredAt || complete) return focus(live, next);
    if (job && now < job.pickupAt) return focus([...live, screen], by('guide-clock') ?? by('phone-jump'));
    return focus([...live, screen], by('phone-checkin') ?? by('phone-keys') ?? by('phone-depart') ?? by('phone-deliver') ?? by('guide-clock') ?? next);
  }
  if (key === 'followup') {
    const waiting = shown('[data-guide-section="queue"]');
    if (!visited.includes('followup_reminder')) return focus([waiting], by('guide-followup-reminder'), 'Compare two drivers in this list: press “Ida: day-7 reminder” in this guide.');
    if (!visited.includes('followup_read')) return focus([phone ? shown('[data-guide="activation-reminder"]', phone) : null], by('guide-reminder-read'), 'Read Ida’s day-7 reminder, then press “Continue to Anton”.');
    if (!visited.includes('followup_call') || !dialog) return focus([waiting], by('guide-followup-call') ?? next);
    return focus([by('candidate-next', dialog), section('first-drive-status', dialog)], next);
  }
  if (key === 'measure') {
    const report = shown('[role="dialog"][aria-labelledby="report-title"]');
    if (shown('[data-guide="report-error"]')) return focus([report], textButton('Try again'));
    const loading = shown('[data-guide="report-loading"]');
    if (loading) return focus([loading], null, 'The weekly report is being written from this week’s numbers…');
    if (report) return focus([report], by('report-close'));
    return focus([section('metrics')], next, 'Read the four metrics, then press “Finish walkthrough”. The weekly report in this guide is optional.');
  }
  return focus([], next);
}

// ---------- The hint shown in the guide panel ----------

let hint = '';
const listeners = new Set<() => void>();
export const subscribeGuideHint = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const getGuideHint = () => hint;
/** True when the hint asks to reopen this step's view; the guide then shows that button. */
export const hintNeedsView = (text: string) => text.includes('Show this step again');
function setHint(text: string) { if (text !== hint) { hint = text; listeners.forEach(fn => fn()); } }

// ---------- Marking and scrolling ----------

const ids = new WeakMap<Element, number>();
let nextId = 1;
const idOf = (el: Element) => { if (!ids.has(el)) ids.set(el, nextId++); return ids.get(el)!; };
let lastSections = '', lastAction: HTMLElement | null = null, settleUntil = 0;

export function clearGuideFocus() {
  document.querySelectorAll('[data-demo-focus]').forEach(el => el.removeAttribute('data-demo-focus'));
  document.querySelectorAll('[data-guide-lit]').forEach(el => el.removeAttribute('data-guide-lit'));
  lastSections = ''; lastAction = null;
  setHint('');
}

/** The nearest ancestor that scrolls this element; the page itself, or none inside fixed or sticky panels. */
function scroller(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const style = getComputedStyle(p);
    if (/(auto|scroll)/.test(style.overflowY) && p.scrollHeight > p.clientHeight + 1) return p;
    if (style.position === 'fixed' || style.position === 'sticky') return null;
  }
  return document.scrollingElement as HTMLElement;
}
function bounds(box: HTMLElement) {
  if (box === document.scrollingElement) {
    const header = document.querySelector('[data-guide-header]')?.getBoundingClientRect();
    return { top: header && header.bottom > 0 && header.top <= 0 ? header.bottom : 0, bottom: innerHeight };
  }
  const r = box.getBoundingClientRect();
  return { top: Math.max(r.top, 0), bottom: Math.min(r.bottom, innerHeight) };
}

/** Bring the sections (and the ring) fully into view, calmly: centred when they fit, never when already visible. */
function reveal(sections: HTMLElement[], action: HTMLElement | null) {
  const groups = new Map<HTMLElement, HTMLElement[]>();
  for (const el of [...sections, ...(action ? [action] : [])]) {
    const box = scroller(el);
    if (box) groups.set(box, [...(groups.get(box) ?? []), el]);
  }
  for (const [box, els] of groups) {
    const { top, bottom } = bounds(box), pad = 12;
    const rects = els.map(el => el.getBoundingClientRect());
    const uTop = Math.min(...rects.map(r => r.top)), uBottom = Math.max(...rects.map(r => r.bottom));
    if (uTop >= top + pad && uBottom <= bottom - pad) continue;
    let delta = uBottom - uTop <= bottom - top - 2 * pad ? (uTop + uBottom) / 2 - (top + bottom) / 2 : uTop - top - pad;
    const ring = action && els.includes(action) ? action.getBoundingClientRect() : null;
    if (ring) delta = Math.min(Math.max(delta, ring.bottom - bottom + 2 * pad), ring.top - top - 2 * pad);
    if (Math.abs(delta) < 4) continue;
    const motion = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    if (box === document.scrollingElement) window.scrollBy({ top: delta, behavior: motion });
    else box.scrollBy({ top: delta, behavior: motion });
  }
}
const fullyVisible = (el: HTMLElement) => {
  const box = scroller(el);
  if (!box) return true;
  const { top, bottom } = bounds(box), r = el.getBoundingClientRect();
  return r.top >= top && r.bottom <= bottom;
};

/** Mark the section and the control for the current state. Scrolls only when the section changes or the ring leaves view. */
export function highlightGuideStep(key: PresentKey, context: GuideFocusContext, force = false) {
  const f = focusFor(key, context);
  const lit = new Set<Element>(f.sections);
  document.querySelectorAll('[data-guide-lit]').forEach(el => { if (!lit.has(el)) el.removeAttribute('data-guide-lit'); });
  f.sections.forEach(el => el.setAttribute('data-guide-lit', ''));
  const old = document.querySelector('[data-demo-focus]');
  if (old !== f.action) { old?.removeAttribute('data-demo-focus'); f.action?.setAttribute('data-demo-focus', 'true'); }
  setHint(f.hint);

  const signature = `${key}|${f.sections.map(idOf).join(',')}`;
  const sectionsChanged = signature !== lastSections;
  const actionChanged = f.action !== lastAction;
  lastSections = signature; lastAction = f.action;
  // Newly opened content keeps growing for a moment (accordions, drawers); keep it in view while it settles.
  if (force || sectionsChanged) settleUntil = performance.now() + 700;
  const settling = performance.now() < settleUntil;
  if (force || sectionsChanged || (settling && [...f.sections, ...(f.action ? [f.action] : [])].some(el => !fullyVisible(el)))) reveal(f.sections, f.action);
  else if (actionChanged && f.action && !fullyVisible(f.action)) reveal([], f.action);
}

export function openGuideSection(key: PresentKey) {
  const keys: Partial<Record<PresentKey, string>> = { playbook: 'keep_driver', booking_check: 'own_error', contact: 'escalate', customer: 'customer', decision: 'decide', close: 'close' };
  const button = document.querySelector<HTMLButtonElement>(`[data-playbook-step="${keys[key]}"] button[aria-expanded]`);
  if (button?.getAttribute('aria-expanded') === 'false') button.click();
}
