import { useState } from 'react';
import { Bell, CalendarCheck, Car, Check, ChevronLeft, ChevronRight, ExternalLink, IdCard, Lock, MessageCircle, MessageSquare, ScanFace, ShieldCheck, Sparkles } from 'lucide-react';
import type { Applicant, Gig } from '../../lib/types';
import type { ChatThread } from '../../lib/chat/types';
import { threadIdFor } from '../../lib/chat/threads';
import { DriverChat } from './DriverChat';
import { REJECT_REASONS } from '../../lib/types';
import { driverStep, progress, STEP_ORDER, createApplicant, bookCall, bookOffer, MIN_AGE, type Application } from '../../lib/driverFlow';
import { receiveDocument } from '../../lib/actions';
import { callSlots } from '../../lib/booking';
import { firstGigOffers } from '../../lib/gigs';
import { driverInbox } from '../../lib/automation';
import { PHOTO_STANDARD } from '../../lib/criteria';
import { formatDateTime } from '../../lib/time';

const AREAS = ['Bromma', 'Haninge', 'Huddinge', 'Järfälla', 'Kungsholmen', 'Lidingö', 'Nacka', 'Sollentuna', 'Solna', 'Sundbyberg', 'Södermalm', 'Täby'];

interface Props {
  applicant: Applicant | null;
  apps: Applicant[];
  gigs: Gig[];
  threads: ChatThread[];
  now: number;
  onCreate: (a: Applicant) => void;
  onUpdate: (a: Applicant) => void;
  onThread: (t: ChatThread) => void;
  /** Open on the chat (e.g. from the cockpit's chat queue). */
  initialView?: 'steps' | 'chat';
}

/** The applicant's side of the funnel: one step at a time, on a phone. */
export function DriverApp({ applicant: a, apps, gigs, threads, now, onCreate, onUpdate, onThread, initialView = 'steps' }: Props) {
  const [view, setView] = useState<'steps' | 'inbox' | 'chat'>(initialView);
  const inbox = a ? driverInbox(a, now) : [];
  const thread = threads.find((t) => t.id === threadIdFor(a?.id ?? null));
  const unreadOps = thread?.messages.at(-1)?.from === 'ops';
  const headerBtn = 'relative flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold hover:bg-white/10';

  return (
    <div className="flex h-full flex-col bg-white text-navy">
      <header className="bg-navy px-4 pb-3 pt-4 text-white">
        <div className="flex items-center justify-between gap-2">
          {view === 'steps' ? (
            <span className="text-sm font-semibold">Drive with us</span>
          ) : (
            <button type="button" onClick={() => setView('steps')} className={`${headerBtn} -ml-2`}>
              <ChevronLeft size={15} aria-hidden /> {view === 'chat' ? 'Help chat' : 'Messages'}
            </button>
          )}
          <div className="flex items-center gap-1">
            {view !== 'chat' && (
              <button type="button" onClick={() => setView('chat')} className={headerBtn} aria-label="Help chat">
                <MessageCircle size={15} aria-hidden /> Help
                {unreadOps && <span className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-green" aria-label="New reply from ops" />}
              </button>
            )}
            {a && view === 'steps' && (
              <button type="button" onClick={() => setView('inbox')} className={headerBtn} aria-label={`Messages, ${inbox.length}`}>
                <Bell size={15} aria-hidden /> {inbox.length}
              </button>
            )}
          </div>
        </div>
        {a && view === 'steps' && <Progress a={a} />}
      </header>

      {view === 'chat' ? (
        <div className="min-h-0 flex-1">
          <DriverChat applicant={a} thread={thread} gigs={gigs} now={now} onThread={onThread} />
        </div>
      ) : (
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {!a ? (
          <Start onCreate={(input) => onCreate(createApplicant(input, apps, now))} onChat={() => setView('chat')} />
        ) : view === 'inbox' ? (
          <Inbox items={inbox} />
        ) : (
          <Step a={a} apps={apps} gigs={gigs} now={now} onUpdate={onUpdate} onInbox={() => setView('inbox')} />
        )}
      </div>
      )}
    </div>
  );
}

function Progress({ a }: { a: Applicant }) {
  const step = driverStep(a);
  const pct = progress(step);
  const idx = STEP_ORDER.findIndex((s) => s.key === step);
  return (
    <div className="mt-3">
      <div className="h-1.5 rounded-full bg-white/15">
        <div className="h-full rounded-full bg-green transition-all" style={{ width: `${Math.max(pct, 4)}%` }} />
      </div>
      <ol className="mt-2 flex justify-between text-[10px] text-white/60">
        {STEP_ORDER.map((s, i) => (
          <li key={s.key} className={i === idx ? 'font-semibold text-white' : i < idx || pct === 100 ? 'text-green' : ''}>
            {s.label}
          </li>
        ))}
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
  const [avail, setAvail] = useState<'full' | 'limited' | null>(null);
  const ok = name.trim().length > 1 && licence !== null && age !== null && avail !== null;

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
            <li>4. Book a 15-minute call. We decide in the call.</li>
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
        <legend className="text-sm font-semibold">When can you drive?</legend>
        <div className="mt-1 grid grid-cols-2 gap-1.5">
          <Choice value={'full' as const} current={avail} set={setAvail}>Weekdays too</Choice>
          <Choice value={'limited' as const} current={avail} set={setAvail}>Evenings and weekends</Choice>
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
            availability: avail!,
            ...(avail === 'limited' ? { availabilityNote: 'Evenings and weekends' } : {}),
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
          <strong>Your criminal-record extract is only shown in a call.</strong> We never keep a copy or write down what it says.
        </li>
        <li>A person makes every decision. You can ask why and ask for a review; we reply within two weeks.</li>
        <li>We send up to three reminders while your application is open. Reply "stop" to end them.</li>
        <li>Incomplete applications are deleted after 6 months, rejected ones after 2 years.</li>
      </ul>
    </details>
  );
}

// ---------------- Steps ----------------

function Step({ a, apps, gigs, now, onUpdate, onInbox }: { a: Applicant; apps: Applicant[]; gigs: Gig[]; now: number; onUpdate: (a: Applicant) => void; onInbox: () => void }) {
  const step = driverStep(a);
  const first = a.name.split(' ')[0];

  switch (step) {
    case 'prequal_review':
      return (
        <div className="space-y-3">
          <Title icon={<ShieldCheck size={16} />}>Thanks, {first}</Title>
          <Card tone="warn">
            <p className="text-sm">
              One requirement isn't met:{' '}
              <strong>{a.prequalIssue === 'licence' ? 'a B licence held for at least 1 year' : `being ${MIN_AGE} or older (insurance requirement)`}</strong>.
            </p>
          </Card>
          <p className="text-sm text-muted">Nothing is decided automatically. A person on our team reads your application and gets back to you within two working days.</p>
        </div>
      );
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
              <li>2. When it arrives, book a 15-minute video call.</li>
              <li>3. In the call you show it to us. <strong>We never keep a copy or write down what it says.</strong></li>
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
                  <Check size={15} aria-hidden /> Ordered. We'll remind you to book the call.
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
            <p className="text-sm font-semibold">What happens in the call</p>
            <ul className="mt-1.5 space-y-1 text-sm text-muted">
              <li>You show the extract; we don't keep it.</li>
              <li>We go through how jobs work and answer your questions.</li>
              <li>We decide in the call, at the latest within 48 hours.</li>
            </ul>
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
            <p className="text-sm">Ops is on standby during the whole drive. Bring your licence and a charged phone.</p>
          </Card>
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
          <p className="text-sm text-muted">You can ask us to explain the decision and to review it. We reply within two weeks.</p>
          <button type="button" onClick={onInbox} className="text-sm font-semibold text-indigo hover:underline">
            See your messages
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
      <Title icon={<CalendarCheck size={16} />} sub="15 minutes on video. You show the extract and we decide in the call.">
        Book your call
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

function Inbox({ items }: { items: ReturnType<typeof driverInbox> }) {
  if (!items.length) return <p className="py-8 text-center text-sm text-muted">No messages yet.</p>;
  return (
    <ol className="space-y-2">
      {items.map((m, i) => (
        <li key={i} className="rounded-xl bg-card p-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-semibold">{m.title}</span>
            <span className="num shrink-0 text-[11px] text-muted">{formatDateTime(m.at)}</span>
          </div>
          {m.body && <p className="mt-1 whitespace-pre-line text-sm text-muted">{m.body}</p>}
        </li>
      ))}
    </ol>
  );
}
