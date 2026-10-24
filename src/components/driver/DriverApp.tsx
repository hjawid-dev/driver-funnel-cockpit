import { useState } from 'react';
import { CalendarCheck, Car, Check, ChevronLeft, ChevronRight, ExternalLink, IdCard, Lock, MessageCircle, MessageSquare, ScanFace, ShieldCheck, Sparkles } from 'lucide-react';
import type { Applicant, Gig } from '../../lib/types';
import type { ChatThread } from '../../lib/chat/types';
import { chatTimeline, emptyThread, reportUrgent, threadIdFor, unreadCount } from '../../lib/chat/threads';
import { checkIn, currentJob, deliver, depart, driverStatus, gotKeys, incidentClock, jobAlert, reportProblem, OUTCOME_LABEL, type Job } from '../../lib/liveOps';
import { DriverChat } from './DriverChat';
import { REJECT_REASONS } from '../../lib/types';
import { driverStep, progress, STEP_ORDER, createApplicant, bookCall, bookOffer, MIN_AGE, availabilityFrom, changePrequal, remindWhenQualified, SLOT_LABEL, reviewableSteps, canChangeAnswers, canRetake, retakeDocument, canMoveCall, type Application, type Slot, type ReviewKey } from '../../lib/driverFlow';
import { receiveDocument } from '../../lib/actions';
import { callSlots } from '../../lib/booking';
import { firstGigOffers } from '../../lib/gigs';
import { driverInbox } from '../../lib/automation';
import { CALL_AGENDA, PHOTO_STANDARD } from '../../lib/criteria';
import { formatDateTime } from '../../lib/time';

const AREAS = ['Bromma', 'Haninge', 'Huddinge', 'Järfälla', 'Kungsholmen', 'Lidingö', 'Nacka', 'Sollentuna', 'Solna', 'Sundbyberg', 'Södermalm', 'Täby'];

interface Props {
  applicant: Applicant | null;
  apps: Applicant[];
  gigs: Gig[];
  threads: ChatThread[];
  jobs?: Job[];
  now: number;
  onCreate: (a: Applicant) => void;
  onUpdate: (a: Applicant) => void;
  onThread: (t: ChatThread) => void;
  onJob?: (j: Job) => void;
  onJumpTo?: (ts: number) => void;
  /** Open on the chat (e.g. from the cockpit's chat queue). */
  initialView?: 'steps' | 'chat';
}

/** The applicant's side of the funnel: one step at a time, on a phone. */
export function DriverApp({ applicant: a, apps, gigs, threads, jobs = [], now, onCreate, onUpdate, onThread, onJob, onJumpTo, initialView = 'steps' }: Props) {
  const [view, setView] = useState<'steps' | 'chat'>(initialView);
  // Looking back at a step already done (null = the step the applicant is on).
  const [review, setReview] = useState<ReviewKey | null>(null);
  const reviewable = a ? reviewableSteps(a) : [];
  const shown = review && reviewable.includes(review) ? review : null;
  const update = (next: Applicant) => {
    setReview(null);
    onUpdate(next);
  };
  const thread = threads.find((t) => t.id === threadIdFor(a?.id ?? null));
  // Reminders, status messages and ops replies all arrive in the chat.
  const unread = view === 'chat' ? 0 : unreadCount(chatTimeline(thread, a ? driverInbox(a, now) : []), thread?.seenAt);
  const headerBtn = 'relative flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold hover:bg-white/10';
  const job = a ? currentJob(jobs, a.id, now) : null;

  return (
    <div className="flex h-full flex-col bg-white text-navy">
      <header className="bg-navy px-4 pb-3 pt-4 text-white">
        <div className="flex items-center justify-between gap-2">
          {view === 'steps' ? (
            <span className="text-sm font-semibold">Drive with us</span>
          ) : (
            <button type="button" onClick={() => setView('steps')} className={`${headerBtn} -ml-2`}>
              <ChevronLeft size={15} aria-hidden /> {a ? 'My application' : 'Back'}
            </button>
          )}
          {view !== 'chat' && (
            <button type="button" onClick={() => setView('chat')} className={headerBtn} aria-label={`Messages and help${unread ? `, ${unread} unread` : ''}`}>
              <MessageCircle size={15} aria-hidden /> Messages
              {unread > 0 && <span className="num ml-0.5 rounded-full bg-green px-1.5 text-[11px] font-bold text-navy">{unread}</span>}
            </button>
          )}
        </div>
        {a && view === 'steps' && <Progress a={a} reviewable={reviewable} shown={shown} onPick={setReview} />}
      </header>

      {view === 'chat' ? (
        <div className="min-h-0 flex-1">
          <DriverChat applicant={a} thread={thread} apps={apps} gigs={gigs} jobs={jobs} now={now} onThread={onThread} onUpdate={onUpdate} onSteps={() => setView('steps')} />
        </div>
      ) : (
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {!a ? (
          <Start onCreate={(input) => onCreate(createApplicant(input, apps, now))} onChat={() => setView('chat')} />
        ) : (
          <>
            {job && onJob && (
              <JobCard
                j={job}
                now={now}
                onJob={onJob}
                onProblem={() => {
                  onJob(reportProblem(job, now));
                  onThread(reportUrgent(thread ?? emptyThread(a), "Problem at the pickup: the car or the keys aren't ready.", now));
                  setView('chat');
                }}
                onInbox={() => setView('chat')}
              />
            )}
            {reviewable.length > 0 && <BackNext list={reviewable} shown={shown} onGo={setReview} />}
            {shown ? (
              <Review k={shown} a={a} apps={apps} now={now} onUpdate={update} />
            ) : job && driverStep(a) === 'booked' ? null : (
              <Step
                a={a}
                apps={apps}
                gigs={gigs}
                now={now}
                onUpdate={onUpdate}
                onInbox={() => setView('chat')}
                onJump={(() => {
                  const j = jobs.find((x) => x.driverId === a.id && x.firstDrive && x.deliveredAt === undefined);
                  return j && onJumpTo ? () => onJumpTo(j.pickupAt - 15 * 60_000) : undefined;
                })()}
              />
            )}
          </>
        )}
      </div>
      )}
    </div>
  );
}

function Progress({ a, reviewable, shown, onPick }: { a: Applicant; reviewable: ReviewKey[]; shown: ReviewKey | null; onPick: (k: ReviewKey | null) => void }) {
  const step = driverStep(a);
  const pct = progress(step);
  const idx = STEP_ORDER.findIndex((s) => s.key === step);
  return (
    <div className="mt-3">
      <div className="h-1.5 rounded-full bg-white/15">
        <div className="h-full rounded-full bg-green transition-all" style={{ width: `${Math.max(pct, 4)}%` }} />
      </div>
      <ol className="mt-2 flex justify-between text-[10px] text-white/60">
        {STEP_ORDER.map((s, i) => {
          const canOpen = reviewable.includes(s.key as ReviewKey);
          const cls = (shown ? shown === s.key : i === idx) ? 'font-semibold text-white' : i < idx || pct === 100 ? 'text-green' : '';
          return (
            <li key={s.key}>
              {canOpen || (i === idx && shown) ? (
                <button type="button" onClick={() => onPick(i === idx ? null : (s.key as ReviewKey))} className={`${cls} underline-offset-2 hover:underline`}>
                  {s.label}
                </button>
              ) : (
                <span className={cls}>{s.label}</span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Card({ children, tone = 'plain' }: { children: React.ReactNode; tone?: 'plain' | 'soft' | 'ok' | 'warn' }) {
  const cls = { plain: 'border border-lavender bg-white', soft: 'bg-card', ok: 'bg-ok-bg', warn: 'bg-warn-bg' }[tone];
  return <div className={`rounded-xl p-3.5 ${cls}`}>{children}</div>;
}

function Primary({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo px-4 py-3 text-sm font-semibold text-white hover:bg-navy disabled:cursor-not-allowed disabled:bg-lavender disabled:text-muted"
    >
      {children}
    </button>
  );
}

function Title({ icon, children, sub }: { icon: React.ReactNode; children: React.ReactNode; sub?: string }) {
  return (
    <div className="mb-3">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-lavender text-indigo">{icon}</span>
        <h2 className="text-lg font-bold leading-tight">{children}</h2>
      </div>
      {sub && <p className="mt-1.5 text-sm text-muted">{sub}</p>}
    </div>
  );
}

const Simulated = () => <p className="mt-2 text-center text-[11px] text-muted">Simulated in this demo.</p>;

// ---------------- Start + pre-qualifying ----------------

function Start({ onCreate, onChat }: { onCreate: (a: Application) => void; onChat: () => void }) {
  const [started, setStarted] = useState(false);
  const [name, setName] = useState('');
  const [area, setArea] = useState('Solna');
  const [licence, setLicence] = useState<number | null>(null);
  const [age, setAge] = useState<boolean | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const ok = name.trim().length > 1 && licence !== null && age !== null && slots.length > 0;
  const toggle = (s: Slot) => setSlots((xs) => (xs.includes(s) ? xs.filter((x) => x !== s) : [...xs, s]));

  if (!started) {
    return (
      <div className="space-y-3">
        <Title icon={<Car size={16} />} sub="Move cars for dealerships, leasing and rental companies in Stockholm. Pick the jobs that fit you, paid per job.">
          Become a driver
        </Title>
        <Card tone="soft">
          <p className="text-sm font-semibold">About 10 minutes, all on your phone</p>
          <ul className="mt-1.5 space-y-1 text-sm text-muted">
            <li>1. Verify your ID with BankID</li>
            <li>2. Photo of your licence and a profile photo</li>
            <li>3. Order your criminal-record extract</li>
            <li>4. Book a 15-minute onboarding call. We decide in the call.</li>
          </ul>
        </Card>
        <PrivacyNotice />
        <Primary onClick={() => setStarted(true)}>
          Start application <ChevronRight size={16} aria-hidden />
        </Primary>
        <button type="button" onClick={onChat} className="flex w-full items-center justify-center gap-1.5 text-sm font-semibold text-indigo hover:underline">
          <MessageCircle size={15} aria-hidden /> Questions first? Ask our assistant
        </button>
      </div>
    );
  }

  const Choice = <T,>({ value, current, set, children }: { value: T; current: T | null; set: (v: T) => void; children: React.ReactNode }) => (
    <button
      type="button"
      onClick={() => set(value)}
      aria-pressed={current === value}
      className={`rounded-lg border px-3 py-2 text-sm font-medium ${current === value ? 'border-indigo bg-lavender text-navy' : 'border-lavender bg-white text-muted'}`}
    >
      {children}
    </button>
  );

  return (
    <div className="space-y-4">
      <Title icon={<Sparkles size={16} />} sub="Four quick questions. They decide nothing on their own.">
        A few questions first
      </Title>
      <label className="block text-sm font-semibold">
        Your name
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="First and last name (demo: not your real name)" className="mt-1 w-full rounded-lg border border-lavender px-3 py-2 text-sm font-normal" />
      </label>
      <label className="block text-sm font-semibold">
        Where do you live?
        <select value={area} onChange={(e) => setArea(e.target.value)} className="mt-1 w-full rounded-lg border border-lavender bg-white px-3 py-2 text-sm font-normal">
          {AREAS.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </label>
      <fieldset>
        <legend className="text-sm font-semibold">How long have you had a B licence?</legend>
        <div className="mt-1 grid grid-cols-4 gap-1.5">
          {[
            [0.5, '< 1 yr'],
            [1.5, '1–2 yrs'],
            [3, '2–5 yrs'],
            [6, '5+ yrs'],
          ].map(([v, l]) => (
            <Choice key={l} value={v as number} current={licence} set={setLicence}>
              {l}
            </Choice>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="text-sm font-semibold">Are you {MIN_AGE} or older?</legend>
        <p className="text-xs text-muted">Our insurance requires it.</p>
        <div className="mt-1 grid grid-cols-2 gap-1.5">
          <Choice value={true} current={age} set={setAge}>Yes</Choice>
          <Choice value={false} current={age} set={setAge}>No</Choice>
        </div>
      </fieldset>
      <fieldset>
        <legend className="text-sm font-semibold">When can you usually drive?</legend>
        <p className="text-xs text-muted">Pick all that fit. Any answer works: we match jobs to your times.</p>
        <div className="mt-1 grid grid-cols-3 gap-1.5">
          {(Object.keys(SLOT_LABEL) as Slot[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => toggle(s)}
              aria-pressed={slots.includes(s)}
              className={`rounded-lg border px-2 py-2 text-sm font-medium leading-tight ${slots.includes(s) ? 'border-indigo bg-lavender text-navy' : 'border-lavender bg-white text-muted'}`}
            >
              {SLOT_LABEL[s]}
            </button>
          ))}
        </div>
      </fieldset>
      <Primary
        disabled={!ok}
        onClick={() =>
          onCreate({
            name,
            area,
            licenceYears: licence!,
            meetsMinAge: age!,
            ...availabilityFrom(slots),
          })
        }
      >
        Continue
      </Primary>
    </div>
  );
}

function PrivacyNotice() {
  return (
    <details className="rounded-xl border border-lavender p-3 text-sm">
      <summary className="flex cursor-pointer items-center gap-1.5 font-semibold">
        <ShieldCheck size={15} className="text-ok" aria-hidden /> How we handle your data
      </summary>
      <ul className="mt-2 space-y-1.5 text-xs text-muted">
        <li>We use your details only to assess your application and, if accepted, to offer you jobs.</li>
        <li>
          <strong>Your criminal-record extract is only shown in the onboarding call.</strong> We never keep a copy or write down what it says.
        </li>
        <li>A person makes every decision. You can ask why and ask for a review; you get the result of the review within two weeks.</li>
        <li>
          Our chat assistant is an AI (provided by Anthropic, in the US). It sees your first name and where you are in the application, never your ID number, and a
          person is always one tap away. Please don't write sensitive details in the chat.
        </li>
        <li>We send up to three reminders in the chat while your application is open. Tap "Stop reminders" or write "stop" to end them.</li>
        <li>Incomplete applications are deleted after 6 months, rejected ones after 2 years.</li>
      </ul>
    </details>
  );
}

// ---------------- Steps ----------------

function Step({ a, apps, gigs, now, onUpdate, onInbox, onJump }: { a: Applicant; apps: Applicant[]; gigs: Gig[]; now: number; onUpdate: (a: Applicant) => void; onInbox: () => void; onJump?: () => void }) {
  const step = driverStep(a);
  const first = a.name.split(' ')[0];

  switch (step) {
    case 'prequal_review':
      return <PrequalStop a={a} now={now} onUpdate={onUpdate} first={first} />;
    case 'id':
      return <BankIdStep onDone={() => onUpdate(receiveDocument(a, 'id', 'verified', now))} first={first} />;
    case 'licence':
      return (
        <div className="space-y-3">
          <Title icon={<IdCard size={16} />} sub="Front and back. We check that it is valid for cars (category B) with Transportstyrelsen.">
            Your driving licence
          </Title>
          <Primary onClick={() => onUpdate(receiveDocument(a, 'licence', 'verified', now))}>Take photo of licence</Primary>
          <Simulated />
        </div>
      );
    case 'photo':
      return <PhotoStep onDone={() => onUpdate(receiveDocument(a, 'photo', 'uploaded', now))} />;
    case 'extract':
      return (
        <div className="space-y-3">
          <Title icon={<Lock size={16} />} sub="We move customers' cars and keys, so we ask everyone for an extract from the criminal record.">
            Your criminal-record extract
          </Title>
          <Card tone="soft">
            <ol className="space-y-1.5 text-sm">
              <li>1. Order your own extract at polisen.se. It usually takes a few days.</li>
              <li>2. When it arrives, book your 15-minute onboarding call (video).</li>
              <li>3. In the call you also show it to us. <strong>We never keep a copy or write down what it says.</strong></li>
            </ol>
          </Card>
          <a
            href="https://polisen.se/tjanster-tillstand/belastningsregistret/"
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-1.5 text-sm font-semibold text-indigo hover:underline"
          >
            Order at polisen.se <ExternalLink size={14} aria-hidden />
          </a>
          {a.docs.extract === 'missing' ? (
            <Primary onClick={() => onUpdate(receiveDocument(a, 'extract', 'pending', now))}>I've ordered it</Primary>
          ) : (
            <>
              <Card tone="ok">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-ok">
                  <Check size={15} aria-hidden /> Ordered. We'll remind you to book the onboarding call.
                </p>
              </Card>
              <Primary onClick={() => onUpdate(receiveDocument(a, 'extract', 'ready', now))}>It has arrived</Primary>
            </>
          )}
        </div>
      );
    case 'call':
      return <CallStep a={a} apps={apps} now={now} onBook={(t) => onUpdate(bookCall(a, t, now))} />;
    case 'decision':
      return (
        <div className="space-y-3">
          <Title icon={<CalendarCheck size={16} />}>You're all set, {first}</Title>
          <Card tone="ok">
            <p className="text-sm">
              Your call: <strong>{formatDateTime(a.callAt!)}</strong>
            </p>
            <p className="mt-1 text-xs text-muted">15 minutes, video. Have your extract ready.</p>
          </Card>
          <Card tone="soft">
            <p className="text-sm font-semibold">Your onboarding call, 15 minutes</p>
            <ol className="mt-1.5 space-y-1 text-sm text-muted">
              {CALL_AGENDA.map((x, i) => (
                <li key={x}>
                  {i + 1}. {x}
                </li>
              ))}
            </ol>
          </Card>
        </div>
      );
    case 'first_gig':
      return <OffersStep a={a} apps={apps} gigs={gigs} now={now} onPick={(g) => onUpdate(bookOffer(a, g, now))} />;
    case 'booked': {
      const g = gigs.find((x) => x.id === a.firstGig?.gigId);
      return (
        <div className="space-y-3">
          <Title icon={<Car size={16} />}>Your first drive is booked</Title>
          <Card tone="ok">
            <p className="text-sm font-semibold">{g ? `${g.from} → ${g.to}` : 'First drive'}</p>
            <p className="mt-0.5 text-sm">{formatDateTime(a.firstGig!.bookedFor!)}</p>
            {g && <p className="mt-0.5 text-xs text-muted">{g.km} km · about {g.minutes} min · {g.pay} SEK</p>}
          </Card>
          <Card tone="soft">
            <p className="text-sm">Ops is on standby during the whole drive. On the day, this screen shows the job: tap "I'm here" at the pickup.</p>
          </Card>
          {onJump && (
            <button type="button" onClick={onJump} className="w-full rounded-xl border border-dashed border-lavender px-4 py-2 text-xs font-semibold text-muted hover:border-indigo hover:text-indigo">
              Demo: jump to the morning of the drive
            </button>
          )}
        </div>
      );
    }
    case 'active':
      return (
        <div className="space-y-3">
          <Title icon={<Sparkles size={16} />}>You're an active driver</Title>
          <p className="text-sm text-muted">New jobs show up every day. Pick the ones that fit you.</p>
        </div>
      );
    case 'closed': {
      const d = a.decision!;
      const label = REJECT_REASONS.find((r) => r.value === d.reason)?.label;
      return (
        <div className="space-y-3">
          <Title icon={<MessageSquare size={16} />}>Decision on your application</Title>
          <Card tone="soft">
            <p className="text-sm">
              {d.reason === 'no_response_14d' ? 'We closed your application because it was not completed.' : `We can't offer you driving assignments right now. Reason: ${label}.`}
            </p>
          </Card>
          <p className="text-sm text-muted">You can ask us in the chat to explain the decision and to review it. You get the result of the review within two weeks.</p>
          <button type="button" onClick={onInbox} className="text-sm font-semibold text-indigo hover:underline">
            Open your messages
          </button>
        </div>
      );
    }
  }
}

function BankIdStep({ onDone, first }: { onDone: () => void; first: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-3">
      <Title icon={<ShieldCheck size={16} />} sub={`Hi ${first}! Verify who you are. It takes a minute.`}>
        Verify with BankID
      </Title>
      <Primary
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setTimeout(onDone, 1200);
        }}
      >
        {busy ? 'Waiting for BankID…' : 'Open BankID'}
      </Primary>
      <Simulated />
    </div>
  );
}

function Avatar({ glasses }: { glasses?: boolean }) {
  return (
    <svg viewBox="0 0 64 64" className="h-16 w-16" aria-hidden>
      <rect width="64" height="64" rx="12" fill="#E4E3FA" />
      <circle cx="32" cy="27" r="13" fill="#C9A98C" />
      <path d="M12 60c2-12 10-18 20-18s18 6 20 18" fill="#3F39B9" />
      {glasses ? (
        <g fill="#1D1A58">
          <rect x="20" y="22" width="10" height="7" rx="2" />
          <rect x="34" y="22" width="10" height="7" rx="2" />
          <rect x="29" y="24" width="6" height="2" />
        </g>
      ) : (
        <g fill="#1D1A58">
          <circle cx="27" cy="26" r="1.6" />
          <circle cx="37" cy="26" r="1.6" />
        </g>
      )}
    </svg>
  );
}

function PhotoStep({ onDone }: { onDone: () => void }) {
  const [feedback, setFeedback] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      <Title icon={<ScanFace size={16} />} sub={PHOTO_STANDARD}>
        Profile photo
      </Title>
      <p className="text-xs text-muted">Customers see it when you pick up their car. Try both sample photos:</p>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={onDone} className="flex flex-col items-center gap-1 rounded-xl border border-lavender p-3 text-xs font-semibold hover:border-indigo">
          <Avatar /> Use photo A
        </button>
        <button
          type="button"
          onClick={() => setFeedback('Your face is partly hidden by sunglasses. Please use another photo.')}
          className="flex flex-col items-center gap-1 rounded-xl border border-lavender p-3 text-xs font-semibold hover:border-indigo"
        >
          <Avatar glasses /> Use photo B
        </button>
      </div>
      {feedback && (
        <p role="alert" className="rounded-lg bg-warn-bg p-2.5 text-sm text-warn">
          {feedback}
        </p>
      )}
      <p className="text-center text-[11px] text-muted">Instant check, simulated. A person on our team also looks at it.</p>
    </div>
  );
}

function CallStep({ a, apps, now, onBook }: { a: Applicant; apps: Applicant[]; now: number; onBook: (t: number) => void }) {
  const slots = callSlots(now, apps.filter((x) => x.id !== a.id));
  const byDay = new Map<string, number[]>();
  for (const t of slots) {
    const day = new Date(t).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
    byDay.set(day, [...(byDay.get(day) ?? []), t]);
  }
  return (
    <div className="space-y-3">
      <Title icon={<CalendarCheck size={16} />} sub="15 minutes on video: how jobs work, a few questions, and you show your extract. We decide in the call.">
        Book your onboarding call
      </Title>
      {[...byDay.entries()].map(([day, ts]) => (
        <div key={day}>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{day}</p>
          <div className="grid grid-cols-4 gap-1.5">
            {ts.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => onBook(t)}
                className="num rounded-lg border border-lavender py-2 text-sm font-semibold hover:border-indigo hover:bg-lavender"
              >
                {new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function OffersStep({ a, apps, gigs, now, onPick }: { a: Applicant; apps: Applicant[]; gigs: Gig[]; now: number; onPick: (g: Gig) => void }) {
  const offers = firstGigOffers(a, gigs, apps, now);
  return (
    <div className="space-y-3">
      <Title icon={<Sparkles size={16} />} sub="Pick your first drive. All three are short and easy, with ops on standby.">
        Welcome aboard, {a.name.split(' ')[0]}!
      </Title>
      {offers.length === 0 ? (
        <Card tone="soft">
          <p className="text-sm">No easy jobs near you right now. New jobs are posted every day; we'll message you.</p>
        </Card>
      ) : (
        offers.map((g) => (
          <div key={g.id} className="rounded-xl border border-lavender p-3.5">
            <p className="text-sm font-semibold">
              {g.from} → {g.to}
            </p>
            <p className="mt-0.5 text-sm">{formatDateTime(g.at)}</p>
            <p className="mt-0.5 text-xs text-muted">
              {g.km} km · about {g.minutes} min · <strong className="text-navy">{g.pay} SEK</strong>
            </p>
            <button type="button" onClick={() => onPick(g)} className="mt-2.5 w-full rounded-lg bg-indigo py-2 text-sm font-semibold text-white hover:bg-navy">
              Pick this drive
            </button>
          </div>
        ))
      )}
    </div>
  );
}

const hm = (ts: number) => new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

/** Today's job on the driver's phone: three taps tell ops where things stand, and a problem goes straight to a person. */
function JobCard({ j, now, onJob, onProblem, onInbox }: { j: Job; now: number; onJob: (j: Job) => void; onProblem: () => void; onInbox: () => void }) {
  const status = driverStatus(j, now);
  const alert = jobAlert(j, now);
  const outcome = j.incident?.outcome?.type;
  const stopped = outcome && outcome !== 'keys_found';
  const waitFrom = hm(Math.max(j.pickupAt, j.arrivedAt ?? j.pickupAt));
  const problem = (
    <button type="button" onClick={onProblem} className="w-full rounded-xl border border-bad/50 px-4 py-2.5 text-sm font-semibold text-bad hover:bg-bad-bg">
      Problem at pickup
    </button>
  );

  return (
    <div className="mb-5 space-y-3">
      <Title icon={<Car size={16} />} sub={`Pickup ${hm(j.pickupAt)} · deliver by ${hm(j.deadline)}`}>
        Today's job
      </Title>
      <Card tone="soft">
        <p className="text-sm font-semibold">
          {j.from} → {j.to}
        </p>
        <p className="mt-0.5 text-xs text-muted">
          {j.km} km · about {j.driveMin} min · {j.reward} SEK
        </p>
        <p className="mt-1.5 text-xs">
          <span className="text-muted">Keys:</span> {j.keyLocation}
        </p>
      </Card>

      {stopped ? (
        <Card tone="ok">
          <p className="text-sm font-semibold">{OUTCOME_LABEL[outcome!]}.</p>
          <p className="mt-0.5 text-sm">You don't need to wait any longer. Your waiting time from {waitFrom} is paid.</p>
        </Card>
      ) : status === 'scheduled' || status === 'due' ? (
        <>
          <Primary onClick={() => onJob(checkIn(j, now))}>I'm here</Primary>
          {problem}
        </>
      ) : status === 'arrived' ? (
        <>
          {(alert || j.problemAt) && (
            <Card tone="warn">
              <p className="text-sm font-semibold">We're on it and contacting the customer.</p>
              <p className="mt-0.5 text-sm">Stay where you are: your waiting time is paid from {waitFrom}. Ops calls you within 5 minutes, so you don't need to decide anything yourself.</p>
              <button type="button" onClick={onInbox} className="mt-1.5 text-sm font-semibold text-indigo hover:underline">
                Open messages
              </button>
            </Card>
          )}
          <Primary onClick={() => onJob(gotKeys(j, now))}>Got the keys</Primary>
          {!j.problemAt && problem}
        </>
      ) : status === 'keys' ? (
        <>
          <p className="text-sm text-muted">Leave by {hm(incidentClock(j, now).lastDeparture)} at the latest to make {hm(j.deadline)}.</p>
          <Primary onClick={() => onJob(depart(j, now))}>On my way to the drop-off</Primary>
        </>
      ) : status === 'driving' ? (
        <Primary onClick={() => onJob(deliver(j, now))}>Delivered</Primary>
      ) : (
        <Card tone="ok">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-ok">
            <Check size={15} aria-hidden /> Delivered. Thanks!
          </p>
        </Card>
      )}
    </div>
  );
}

/** One requirement isn't met: the application pauses here, a person decides, and a wrong answer can be changed. */
function PrequalStop({ a, now, onUpdate, first }: { a: Applicant; now: number; onUpdate: (a: Applicant) => void; first: string }) {
  const [editing, setEditing] = useState(false);
  if (editing) return <AnswersForm a={a} onSave={(ans) => onUpdate(changePrequal(a, ans, now))} onCancel={() => setEditing(false)} />;

  return (
    <div className="space-y-3">
      <Title icon={<ShieldCheck size={16} />}>Thanks, {first}</Title>
      <Card tone="warn">
        <p className="text-sm">
          One requirement isn't met:{' '}
          <strong>{a.prequalIssue === 'licence' ? 'a B licence held for at least 1 year' : `being ${MIN_AGE} or older (insurance requirement)`}</strong>. Your application
          pauses here, so you don't need to send any documents.
        </p>
      </Card>
      <p className="text-sm text-muted">Nothing is decided automatically. A person on our team reads your application and gets back to you within two working days.</p>
      <button type="button" onClick={() => setEditing(true)} className="w-full rounded-xl border border-lavender px-4 py-2.5 text-sm font-semibold text-indigo hover:border-indigo">
        Change my answers
      </button>
      {a.remindWhenQualifiedAt ? (
        <p className="flex items-center justify-center gap-1.5 text-sm font-semibold text-ok">
          <Check size={15} aria-hidden /> We'll let you know when you qualify.
        </p>
      ) : (
        <button type="button" onClick={() => onUpdate(remindWhenQualified(a, now))} className="w-full text-sm font-semibold text-indigo hover:underline">
          Remind me when I qualify
        </button>
      )}
    </div>
  );
}

/** Back and Next while applying: look at a step already done, then return to where you are. */
function BackNext({ list, shown, onGo }: { list: ReviewKey[]; shown: ReviewKey | null; onGo: (k: ReviewKey | null) => void }) {
  const pos = shown ? list.indexOf(shown) : list.length;
  return (
    <div className="mb-3 flex items-center justify-between text-sm">
      <button type="button" disabled={pos === 0} onClick={() => onGo(list[pos - 1])} className="flex items-center gap-0.5 font-semibold text-indigo disabled:invisible">
        <ChevronLeft size={15} aria-hidden /> Back
      </button>
      {shown && (
        <>
          <span className="text-xs text-muted">A step you've done</span>
          <button type="button" onClick={() => onGo(pos + 1 < list.length ? list[pos + 1] : null)} className="flex items-center gap-0.5 font-semibold text-indigo">
            Next <ChevronRight size={15} aria-hidden />
          </button>
        </>
      )}
    </div>
  );
}

/** A step already done: what was sent, and what can still be changed. */
function Review({ k, a, apps, now, onUpdate }: { k: ReviewKey; a: Applicant; apps: Applicant[]; now: number; onUpdate: (a: Applicant) => void }) {
  const [editing, setEditing] = useState(false);
  const locked = <p className="text-xs text-muted">A person is reviewing your file, so this can't be changed now. Ask in Messages if something is wrong.</p>;
  const doneCard = (text: string) => (
    <Card tone="ok">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-ok">
        <Check size={15} aria-hidden /> {text}
      </p>
    </Card>
  );

  switch (k) {
    case 'answers':
      if (editing) return <AnswersForm a={a} onSave={(ans) => onUpdate(changePrequal(a, ans, now))} onCancel={() => setEditing(false)} />;
      return (
        <div className="space-y-3">
          <Title icon={<Sparkles size={16} />}>Your answers</Title>
          <Card tone="soft">
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="text-muted">Licence</dt>
              <dd>{a.licenceYears < 1 ? 'under 1 year' : a.licenceYears < 2 ? '1–2 years' : a.licenceYears < 5 ? '2–5 years' : '5+ years'}</dd>
              <dt className="text-muted">Age {MIN_AGE}+</dt>
              <dd>{a.prequalIssue === 'age' ? 'No' : 'Yes'}</dd>
              <dt className="text-muted">Can drive</dt>
              <dd>{a.availability === 'full' ? 'Weekdays, daytime' : (a.availabilityNote ?? 'Limited')}</dd>
            </dl>
          </Card>
          {canChangeAnswers(a) ? (
            <button type="button" onClick={() => setEditing(true)} className="w-full rounded-xl border border-lavender px-4 py-2.5 text-sm font-semibold text-indigo hover:border-indigo">
              Change my answers
            </button>
          ) : (
            locked
          )}
        </div>
      );
    case 'id':
      return (
        <div className="space-y-3">
          <Title icon={<ShieldCheck size={16} />}>Your ID</Title>
          {doneCard('Verified with BankID')}
        </div>
      );
    case 'licence':
    case 'photo':
      return (
        <div className="space-y-3">
          <Title icon={k === 'licence' ? <IdCard size={16} /> : <ScanFace size={16} />}>{k === 'licence' ? 'Your driving licence' : 'Your profile photo'}</Title>
          {doneCard(k === 'licence' ? 'Licence photo sent' : 'Profile photo sent')}
          {canRetake(a, k) ? (
            <button type="button" onClick={() => onUpdate(retakeDocument(a, k, now))} className="w-full rounded-xl border border-lavender px-4 py-2.5 text-sm font-semibold text-indigo hover:border-indigo">
              Take a new photo
            </button>
          ) : (
            locked
          )}
        </div>
      );
    case 'extract':
      return (
        <div className="space-y-3">
          <Title icon={<Lock size={16} />}>Your criminal-record extract</Title>
          {doneCard(a.docs.extract === 'ready' ? 'Ready to show in the onboarding call' : 'Ordered')}
          <p className="text-xs text-muted">We never keep a copy or write down what it says.</p>
        </div>
      );
    case 'call':
      if (editing && canMoveCall(a, now)) return <CallStep a={a} apps={apps} now={now} onBook={(t) => onUpdate(bookCall(a, t, now))} />;
      return (
        <div className="space-y-3">
          <Title icon={<CalendarCheck size={16} />}>Your onboarding call</Title>
          {doneCard(a.callAt ? formatDateTime(a.callAt) : 'Booked')}
          {canMoveCall(a, now) ? (
            <button type="button" onClick={() => setEditing(true)} className="w-full rounded-xl border border-lavender px-4 py-2.5 text-sm font-semibold text-indigo hover:border-indigo">
              Move the call
            </button>
          ) : (
            <p className="text-xs text-muted">Less than two hours to go: ask in Messages if you need to move it.</p>
          )}
        </div>
      );
  }
}

/** The licence and age questions, to correct a wrong tap. */
function AnswersForm({ a, onSave, onCancel }: { a: Applicant; onSave: (ans: { licenceYears: number; meetsMinAge: boolean }) => void; onCancel: () => void }) {
  const [licence, setLicence] = useState<number>(a.licenceYears);
  const [age, setAge] = useState<boolean>(a.prequalIssue !== 'age');
  const opt = (on: boolean) => `rounded-lg border px-3 py-2 text-sm font-medium ${on ? 'border-indigo bg-lavender text-navy' : 'border-lavender bg-white text-muted'}`;
  return (
    <div className="space-y-4">
      <Title icon={<ShieldCheck size={16} />} sub="If you tapped the wrong answer, change it here.">
        Change your answers
      </Title>
      <fieldset>
        <legend className="text-sm font-semibold">How long have you had a B licence?</legend>
        <div className="mt-1 grid grid-cols-4 gap-1.5">
          {([[0.5, '< 1 yr'], [1.5, '1–2 yrs'], [3, '2–5 yrs'], [6, '5+ yrs']] as const).map(([v, l]) => (
            <button key={l} type="button" aria-pressed={licence === v} onClick={() => setLicence(v)} className={opt(licence === v)}>
              {l}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="text-sm font-semibold">Are you {MIN_AGE} or older?</legend>
        <div className="mt-1 grid grid-cols-2 gap-1.5">
          <button type="button" aria-pressed={age} onClick={() => setAge(true)} className={opt(age)}>Yes</button>
          <button type="button" aria-pressed={!age} onClick={() => setAge(false)} className={opt(!age)}>No</button>
        </div>
      </fieldset>
      <Primary onClick={() => onSave({ licenceYears: licence, meetsMinAge: age })}>Save</Primary>
      <button type="button" onClick={onCancel} className="w-full text-sm font-semibold text-muted hover:text-navy">
        Cancel
      </button>
    </div>
  );
}
