import type { DemoData } from './persist';
import { incidentTarget, reviewTarget, type PresentKey } from './present';

const visible = (el: Element | null): el is HTMLElement => el instanceof HTMLElement && el.getClientRects().length > 0;
const usable = (el: Element | null): el is HTMLElement => visible(el) && !el.matches(':disabled');
const find = (selector: string, root: ParentNode = document) => [...root.querySelectorAll<HTMLElement>(selector)].find(usable) ?? null;
const by = (key: string, root: ParentNode = document) => find(`[data-guide="${key}"]`, root);
const textButton = (text: string, root: ParentNode = document) => [...root.querySelectorAll<HTMLButtonElement>('button')].find(el => usable(el) && el.textContent?.trim().includes(text)) ?? null;
const tick = (input: HTMLElement | null) => input?.closest<HTMLElement>('label') ?? input;

export interface GuideFocusContext {
  data: DemoData;
  now: number;
  visited: string[];
}

/** Every target is an existing control. No business action is performed by the guide. */
function targetFor(key: PresentKey, { data, now, visited }: GuideFocusContext): HTMLElement | null {
  const phone = find('[data-demo-target="driver"]');
  const chat = phone?.dataset.phoneView === 'chat';
  const j = incidentTarget(data.jobs), a = reviewTarget(data.apps);
  const dialog = find('[data-demo-target="candidate"]');
  const next = () => by('guide-next');
  const toPhone = () => by('phone-steps') ?? by('guide-target');
  if (key === 'incident') return by('pickup-reason') ?? (chat ? toPhone() : j?.arrivedAt ? by('phone-problem') : by('phone-checkin')) ?? by('guide-target');
  if (key === 'assistant') {
    if (!chat) return by('phone-chat') ?? by('guide-target');
    const t = data.threads.find(t => t.applicantId === j?.driverId);
    const tried = t?.messages.some(m => m.from === 'driver' && m.at >= (j?.problemAt ?? Infinity) && !m.text.startsWith('Problem at the pickup:'));
    return (tried ? by('guide-clock') : by('chat-wait')) ?? by('guide-clock') ?? by('call-driver') ?? next();
  }
  if (key === 'playbook') return by('call-driver') ?? next();
  if (key === 'booking_check') return by('booking-correction-save') ?? by('booking-correct') ?? next();
  if (key === 'contact') return by('call-contacts') ?? next();
  if (key === 'customer') return !j?.incident?.steps.customer ? by('customer-update') : j.pilot && !j.incident.accountOwnerAt ? by('account-owner') : next();
  if (key === 'decision') return j?.incident?.rebooking?.status === 'open' ? by('replacement') : j?.incident?.outcome ? next() : by('customer-outcomes');
  if (key === 'close') {
    if (!j?.incident?.outcome) return by('customer-outcomes') ?? find('[data-playbook-step="decide"] button[aria-expanded]');
    if (j.incident.rebooking?.status === 'open') return by('replacement') ?? find('[data-playbook-step="decide"] button[aria-expanded]');
    if (j.pilot && !j.incident.accountOwnerAt) return tick(by('close-account-owner'));
    const unchecked = ['wait-paid', ...(j?.pilot ? ['review-booked'] : [])].map(k => by(k)).find(el => el instanceof HTMLInputElement && !el.checked);
    if (unchecked) return tick(unchecked);
    const date = find('input[aria-label="Booker review time"]') as HTMLInputElement | null;
    if (j?.pilot && date && (!date.value || new Date(date.value).getTime() <= now)) return tick(date);
    const note = by('cause-note') as HTMLTextAreaElement | null;
    if (note && !note.value.trim()) return tick(note);
    return by('close-incident') ?? next();
  }
  if (key === 'prevent') return textButton('Log this check confirmed by phone') ?? next();
  if (key === 'onboarding') {
    if (!phone || chat) return toPhone();
    return find('[data-guide-done="false"]', phone) ?? by('phone-primary', phone) ?? by('phone-photo', phone) ?? by('phone-slot', phone) ?? next();
  }
  if (key === 'reminders') return dialog ? by('manual-followup', dialog) ?? next() : by('guide-reminders');
  if (key === 'queue') {
    if (dialog) return by('candidate-close', dialog);
    return visited.includes('queue') ? next() : find('[data-guide-applicant]') ?? next();
  }
  if (key === 'criteria') {
    if (!dialog) return by('guide-criteria') ?? by('guide-target');
    const unchecked = [...dialog.querySelectorAll<HTMLInputElement>('[data-demo-target="criteria"] input[type="checkbox"], input[data-guide="onboarding-call"]')].find(el => usable(el) && !el.checked);
    if (unchecked) return tick(unchecked);
    const licence = textButton('Log licence validity', dialog);
    if (licence) return licence;
    return textButton('Accept', dialog) ?? textButton('Reject', dialog) ?? by('candidate-close', dialog);
  }
  if (key === 'activate') {
    if (!a?.decision || a.decision.type === 'rejected') return by('guide-criteria') ?? next();
    if (!phone || chat) return toPhone();
    if (a.firstGig?.gigId && document.querySelector<HTMLElement>('[data-demo-target="job-detail"]')?.dataset.jobId !== a.firstGig.gigId) return by('guide-job');
    if (!a.firstGig?.bookedFor) return by('phone-offer') ?? by('phone-primary') ?? next();
    const job = data.jobs.find(j => j.id === a.firstGig?.gigId);
    if (job?.deliveredAt) return next();
    if (job && now < job.pickupAt) return by('guide-clock') ?? by('phone-jump');
    return by('phone-checkin') ?? by('phone-keys') ?? by('phone-depart') ?? by('phone-deliver') ?? by('guide-clock') ?? next();
  }
  if (key === 'followup') return !visited.includes('followup_reminder') ? by('guide-followup-reminder') : !visited.includes('followup_call') ? by('guide-followup-call') : next();
  if (key === 'measure' && find('[data-guide="report-error"]')) return textButton('Try again');
  if (key === 'measure' && visited.includes('report') && !find('[role="dialog"]')) return next();
  if (key === 'measure') return find('[data-guide="report-ready"]') ? by('report-close') : find('[data-guide="report-loading"]') ? null : by('weekly-report') ?? by('guide-report') ?? next();
  return next();
}

export function clearGuideFocus() {
  document.querySelectorAll('[data-demo-focus]').forEach(el => { el.removeAttribute('data-demo-focus'); el.removeAttribute('data-guide-label'); });
}

/** Scroll the containing pane only, and only when the control is outside its visible area. */
function reveal(target: HTMLElement, allowUp: boolean) {
  let parent = target.parentElement;
  while (parent && parent !== document.body) {
    if (/(auto|scroll)/.test(getComputedStyle(parent).overflowY) && parent.scrollHeight > parent.clientHeight) {
      const r = target.getBoundingClientRect(), p = parent.getBoundingClientRect();
      if (r.bottom > p.bottom - 20) parent.scrollTop += r.bottom - p.bottom + 28;
      else if (allowUp && r.top < p.top + 20) parent.scrollTop -= p.top - r.top + 28;
      return;
    }
    parent = parent.parentElement;
  }
  if (target.closest('[aria-label="Case walkthrough"]')) return;
  const r = target.getBoundingClientRect(), top = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--present-top')) || 0;
  if (r.bottom > innerHeight - 20) window.scrollBy({ top: r.bottom - innerHeight + 28, behavior: 'instant' });
  else if (allowUp && r.top < top + 20) window.scrollBy({ top: r.top - top - 28, behavior: 'instant' });
}

export function highlightGuideStep(key: PresentKey, context: GuideFocusContext, scroll: false | 'nearest' | 'down' = false) {
  const target = targetFor(key, context);
  if (document.querySelector('[data-demo-focus]') !== target) {
    clearGuideFocus();
    if (target) { target.dataset.demoFocus = 'true'; target.dataset.guideLabel = target.matches('fieldset, [role="group"], [data-guide="customer-outcomes"], [data-guide="replacement"]') ? 'Choose here' : 'Next'; }
  }
  if (target && scroll) reveal(target, scroll === 'nearest');
}

export function openGuideSection(key: PresentKey) {
  const keys: Partial<Record<PresentKey, string>> = { playbook: 'keep_driver', booking_check: 'own_error', contact: 'escalate', customer: 'customer', decision: 'decide', close: 'close' };
  const button = document.querySelector<HTMLButtonElement>(`[data-playbook-step="${keys[key]}"] button[aria-expanded]`);
  if (button?.getAttribute('aria-expanded') === 'false') button.click();
}
