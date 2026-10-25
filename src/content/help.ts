/**
 * The help centre behind the driver assistant. Demo content for a generic car-relocation
 * service in Stockholm: amounts and times are examples, not real terms.
 *
 * In production this lives in the help desk's knowledge base (and is what ops maintains).
 * The assistant answers only from these articles, so a missing answer here is a content gap.
 *
 * This module has no imports: the server function bundles it too.
 */
export type HelpCategory =
  | 'Applying'
  | 'Documents'
  | 'The call and decision'
  | 'First drive'
  | 'Jobs and pay'
  | 'On a drive'
  | 'Damage and insurance'
  | 'Your account'
  | 'Privacy'
  | 'Contact';

export interface HelpArticle {
  id: string;
  title: string;
  category: HelpCategory;
  /** Extra words people use, for the offline search (also in other languages). */
  tags: string[];
  body: string;
}

export const HELP: HelpArticle[] = [
  // ---------------- Applying ----------------
  {
    id: 'requirements',
    title: 'Who can drive with us',
    category: 'Applying',
    tags: ['requirements', 'krav', 'age', 'ålder', 'qualify', 'eligible', 'who can apply'],
    body: `To drive with us you need:
- To be at least 20 years old (our insurance requires it).
- A valid Swedish or EU B licence (cars) held for at least 2 years. With 1–2 years you can start with simple drives first. Under 1 year we can't offer drives yet.
- Swedish BankID, to verify who you are.
- The right to work in Sweden.
- A smartphone with mobile data.
- To speak Swedish or English well enough to talk with customers and ops.
Before your first drive you also show a criminal-record extract on video (we only look at it and never keep it), because we handle customers' cars and keys.`,
  },
  {
    id: 'how-to-apply',
    title: 'How applying works, step by step',
    category: 'Applying',
    tags: ['apply', 'ansöka', 'steps', 'process', 'how long', 'application'],
    body: `Applying takes about 10 minutes of your time, all on your phone:
1. Answer four quick questions (they decide nothing on their own).
2. Verify your ID with BankID.
3. Take a photo of your driving licence, front and back.
4. Add a profile photo.
5. Order your criminal-record extract at polisen.se. It comes by post, so you don't wait for it.
6. Book your 15-minute onboarding call (video) right away. We go through how jobs work and decide in the call.
7. Before your first drive, show us the extract on video: in the call if it has arrived, otherwise in a 5-minute check.
The progress bar at the top shows where you are. You can stop and continue later; we keep your progress.`,
  },
  {
    id: 'application-time',
    title: 'How long until I can start driving?',
    category: 'Applying',
    tags: ['how long', 'hur lång tid', 'when', 'start', 'waiting', 'time'],
    body: `Applying takes about 10 minutes. You book your onboarding call yourself as soon as your extract is ordered, often for the same or next day, and we decide in the call, at the latest within 48 hours.
The criminal-record extract comes by post and can take up to two weeks, so we don't wait for it to decide. You show it before your first drive.
If you're accepted you pick your first drive straight away. Until your extract is shown, first drives start at least 5 days ahead so it has time to arrive.`,
  },
  {
    id: 'licence-years',
    title: "I've had my licence for less than 2 years",
    category: 'Applying',
    tags: ['new licence', 'nytt körkort', 'probation', 'prövotid', '1 year', 'licence years'],
    body: `- Under 1 year: we can't offer drives yet. You're welcome to apply again when you have had your licence for a year.
- 1–2 years: you can be accepted for simple drives first (short drives with standard cars). After a few drives without remarks you get the full range.
- 2 years or more: you meet the licence requirement.
A person always looks at your application; the questions at the start never reject anyone on their own.`,
  },
  {
    id: 'availability',
    title: 'Can I drive only evenings or weekends?',
    category: 'Applying',
    tags: ['part time', 'deltid', 'weekend', 'helg', 'evening', 'kväll', 'availability', 'student', 'flexible'],
    body: `Yes. You choose which jobs you take, so it works well next to studies or another job. Limited availability is never a reason to say no to an application.
Most jobs are on weekdays between 07:00 and 18:00, but there are evening and weekend jobs every week. When you're accepted, we suggest first drives that fit the times you gave.`,
  },
  {
    id: 'reapply',
    title: 'Can I apply again?',
    category: 'Applying',
    tags: ['apply again', 'reapply', 'closed', 'stängd', 'new application'],
    body: `Yes. If your application was closed because it wasn't finished, you can start a new one at any time.
If you were not accepted, you can apply again after 6 months, or earlier if what stopped you has changed (for example, you have now had your licence for a year).
You can always ask why a decision was made and ask for a review, here in the chat. A person confirms your request, usually within 15 minutes, and you get the result of the review within two weeks.`,
  },

  // ---------------- Documents ----------------
  {
    id: 'bankid',
    title: 'Verifying your ID with BankID',
    category: 'Documents',
    tags: ['bankid', 'id', 'identity', 'legitimation', 'verify'],
    body: `We use BankID to check who you are. Tap "Open BankID" in the app and approve in your BankID app. It takes about a minute.
If you don't have Swedish BankID, you can't apply yet. Most banks in Sweden issue BankID; ask your bank.
If BankID fails, try again after a few minutes. If it still fails, ask to talk to a person in the chat.`,
  },
  {
    id: 'licence-photo',
    title: 'Photo of your driving licence',
    category: 'Documents',
    tags: ['licence', 'körkort', 'driving licence', 'photo', 'scan', 'category b'],
    body: `Take a photo of the front and back of your licence. Make sure:
- The whole card is visible and nothing is covered by your fingers.
- The text is sharp and there is no glare.
We check with Transportstyrelsen that the licence is valid for cars (category B) and how long you have had it.
A digital licence in an app can't be used yet; use the physical card. A temporary licence (körkortstillstånd) is not a licence.`,
  },
  {
    id: 'profile-photo',
    title: 'Profile photo rules',
    category: 'Documents',
    tags: ['profile photo', 'profilbild', 'picture', 'selfie', 'photo rejected', 'sunglasses'],
    body: `Customers see your profile photo when you pick up their car, so it needs to show you clearly:
- Your face, from the front, taken recently.
- Plain, light background.
- No sunglasses, cap or anything covering your face. Religious head coverings are fine as long as your face is visible.
- Only you in the photo.
The app checks the photo instantly and tells you if something needs fixing. A person on our team also looks at it.`,
  },
  {
    id: 'extract-order',
    title: 'How to order your criminal-record extract',
    category: 'Documents',
    tags: ['extract', 'utdrag', 'belastningsregistret', 'criminal record', 'polisen', 'police', 'record', 'order'],
    body: `We move customers' cars and keys, so we ask everyone to show an extract from the criminal record (belastningsregistret) before their first drive.
1. Go to polisen.se and order an extract of your own data from the criminal record (kontroll av egna uppgifter). It is free.
2. It comes by post, often within a week, sometimes up to two weeks.
3. In the app, tap "I've ordered it", or tell the assistant in the chat. Then book your onboarding call right away: you don't have to wait for the extract.
4. When it arrives, tap "My extract has arrived". If your call is still ahead, show it there. If you're already accepted, book a 5-minute video check.
Show it at the latest the day before your first drive. We never keep a copy and never write down what it says.`,
  },
  {
    id: 'extract-privacy',
    title: 'What happens with my criminal-record extract?',
    category: 'Documents',
    tags: ['extract', 'utdrag', 'privacy', 'stored', 'sparas', 'copy', 'record', 'gdpr'],
    body: `Nothing is stored. You hold up the extract on video, in the onboarding call or a 5-minute check before your first drive, and we look at it together. We don't take a copy, a photo or notes about what it says.
The only thing we record is that the extract was shown.
Please don't send the extract or details from it in the chat or by email. If you have questions about how an entry affects your application, ask in the call.`,
  },
  {
    id: 'extract-delay',
    title: "My extract hasn't arrived",
    category: 'Documents',
    tags: ['extract late', 'not arrived', 'inte kommit', 'delay', 'post', 'waiting'],
    body: `It comes by post, often within a week, sometimes up to two weeks. If two weeks have passed, check your order at polisen.se or order it again.
You don't have to wait for it: finish the other steps and book your onboarding call. The decision doesn't depend on when the extract arrives.
If you have a first drive booked, show the extract by the day before. If it hasn't arrived in time, the drive goes to another driver, you stay accepted, and you pick a new drive once it has arrived.`,
  },
  {
    id: 'reminders',
    title: 'Reminders while your application is open',
    category: 'Documents',
    tags: ['reminder', 'påminnelse', 'messages', 'notifications', 'stop', 'spam'],
    body: `While something is missing we send up to three reminders in the chat: about 2 hours, 1 day and 3 days after you started. Each one says exactly what is left.
You can answer a reminder right there: "Remind me tomorrow", "Remind me in 3 days", or "Stop reminders". Your application stays open either way.
If nothing has happened in 14 days, a person on our team looks at your application before it is closed. You can always start again.`,
  },

  // ---------------- The call and decision ----------------
  {
    id: 'call-booking',
    title: 'Booking your onboarding call',
    category: 'The call and decision',
    tags: ['book call', 'boka samtal', 'onboarding call', 'interview', 'intervju', 'video call', 'time', 'slot'],
    body: `As soon as your extract is ordered, the app shows free times. You don't have to wait for it to arrive. Calls are held in two daily slots, around 09:00 and 14:00 on weekdays. Pick a time and it is booked; you get a reminder 1 hour before.
The call is 15 minutes, by video. You need your driving licence and a phone or computer with a camera, and your extract if it has arrived.`,
  },
  {
    id: 'call-reschedule',
    title: 'Changing or cancelling your call',
    category: 'The call and decision',
    tags: ['reschedule', 'boka om', 'cancel call', 'avboka', 'move call', 'change time', 'missed call'],
    body: `You can move your call yourself in the chat, up to 2 hours before it starts: tell the assistant when suits you, and it offers free times. Nothing changes until you tap Confirm.
Less than 2 hours before, or if no free time suits you, ask to talk to a person in the chat.
If you miss your call, ask in the chat for a new time. Missing one call doesn't affect your application.`,
  },
  {
    id: 'call-content',
    title: 'What happens in the onboarding call',
    category: 'The call and decision',
    tags: ['call', 'samtal', 'onboarding', 'interview', 'intervju', 'questions', 'prepare', 'förbereda', 'agenda'],
    body: `The onboarding call is a short interview, 15 minutes by video:
1. How a job works: pickup, photos and handover.
2. What to do if you get stuck at a pickup: stay, tell ops, your waiting time is paid.
3. When you can drive.
4. Your licence, and your criminal-record extract if it has arrived. We only look at the extract and keep nothing from it. If it hasn't arrived, you show it before your first drive.
5. Your questions, and our decision. If we need to check something, you get the decision within 48 hours.
6. If you're accepted, we book your first drive together in the same call.
No preparation is needed beyond having your licence at hand, and your extract if you have it.`,
  },
  {
    id: 'decision-review',
    title: 'Understanding a decision and asking for a review',
    category: 'The call and decision',
    tags: ['rejected', 'nekad', 'decision', 'beslut', 'why', 'varför', 'appeal', 'review', 'överklaga'],
    body: `A person makes every decision; nothing is decided automatically.
If we can't offer you drives, the message gives the reason. You can ask us to explain it and to review the decision, here in the chat. A person confirms your request, usually within 15 minutes, and you get the result of the review within two weeks.
Some reasons we can't go into in writing. Then we offer to explain in a call.`,
  },

  // ---------------- First drive ----------------
  {
    id: 'first-drive',
    title: 'Your first drive',
    category: 'First drive',
    tags: ['first drive', 'första uppdraget', 'first job', 'first gig', 'start', 'new driver', 'show extract', 'visa utdrag', 'extract check'],
    body: `When you're accepted, the app offers up to three easy first drives: short, with a standard car, in your part of Stockholm and at times that fit you. Pick one and it is booked.
You can't drive before your criminal-record extract has been shown, but you can book the drive before it arrives: until it is shown, the drives start at least 5 days ahead, and you show it in a 5-minute video check by the day before. Otherwise the drive goes to another driver; you stay accepted and pick a new one.
Someone from ops calls you within 24 hours to welcome you and go through the drive. During the whole drive ops is on standby in the chat.
Bring your driving licence and a charged phone. The day before, you get a reminder with the address and time.`,
  },
  {
    id: 'no-offers',
    title: "No first drives are shown",
    category: 'First drive',
    tags: ['no jobs', 'inga jobb', 'no offers', 'nothing near', 'first drive missing'],
    body: `If no easy drive near you fits your times right now, the app says so. New jobs come in every day, and we message you when one fits.
You can also widen your area or times under your profile, or ask in the chat and we look for a first drive with you.`,
  },
  {
    id: 'simple-drives',
    title: "What 'simple drives first' means",
    category: 'First drive',
    tags: ['simple drives', 'enkla uppdrag', 'restricted', 'limited jobs', 'new licence'],
    body: `Drivers who have had their licence for 1–2 years start with simple drives: up to about 25 km, with standard cars (no premium cars or vans).
After a few drives without remarks, and once you have had your licence for 2 years, you get the full range of jobs automatically.`,
  },

  // ---------------- Jobs and pay ----------------
  {
    id: 'how-jobs-work',
    title: 'How jobs work',
    category: 'Jobs and pay',
    tags: ['jobs', 'uppdrag', 'gig', 'how it works', 'accept job', 'choose'],
    body: `We move cars for dealerships, workshops, leasing and rental companies, and their customers, in the Stockholm area.
Open jobs show up in the app with pickup, drop-off, time, distance and pay. You choose the jobs you want; there is no minimum.
A typical job: travel to the pickup, check and photograph the car, drive it to the drop-off, photograph it again and hand over the keys.`,
  },
  {
    id: 'pay',
    title: 'What a job pays',
    category: 'Jobs and pay',
    tags: ['pay', 'lön', 'ersättning', 'salary', 'money', 'how much', 'earn', 'tjäna', 'price'],
    body: `Every job shows its pay before you accept it. Pay depends mainly on distance and time. As an example, short drives in the city pay around 300–350 SEK, and longer drives like Stockholm–Uppsala around 650–700 SEK.
Travel to the pickup and back home with public transport is refunded on top (see "Travel to and from a job").
Amounts in this demo are examples.`,
  },
  {
    id: 'payouts',
    title: 'When and how you get paid',
    category: 'Jobs and pay',
    tags: ['payout', 'utbetalning', 'paid', 'salary day', 'lönedag', 'tax', 'skatt', 'payslip'],
    body: `Pay for finished jobs is paid out twice a month, on the 10th and the 25th, for jobs done up to 5 days earlier.
You don't need your own company. Pay goes through our payroll partner, which deducts tax and pays employer contributions; you get a payslip each time. If you have a company with F-tax, you can invoice instead.
If a payout looks wrong, ask to talk to a person in the chat.`,
  },
  {
    id: 'travel-costs',
    title: 'Travel to and from a job',
    category: 'Jobs and pay',
    tags: ['travel', 'resa', 'public transport', 'SL', 'ticket', 'biljett', 'expenses', 'utlägg', 'taxi'],
    body: `Most drivers use public transport to the pickup and from the drop-off. We refund SL tickets and train tickets that are part of a job: add the receipt to the job in the app within 7 days.
Taxi is only refunded if ops has approved it first, for example late at night.`,
  },
  {
    id: 'fuel-tolls',
    title: 'Fuel, charging, tolls and parking',
    category: 'Jobs and pay',
    tags: ['fuel', 'bensin', 'tanka', 'charging', 'ladda', 'electric', 'elbil', 'toll', 'trängselskatt', 'parking', 'parkering'],
    body: `- Fuel and charging: only fill up or charge if the job says so or ops asks you to. Pay, keep the receipt and add it to the job; it's refunded with your next payout.
- Congestion charges and bridge tolls: billed to the car's owner, you pay nothing.
- Parking during a job: refunded with a receipt when it is needed for the job.`,
  },
  {
    id: 'fines',
    title: 'Speeding tickets and parking fines',
    category: 'Jobs and pay',
    tags: ['fine', 'böter', 'speeding', 'fortkörning', 'parking ticket', 'parkeringsböter', 'camera'],
    body: `Follow traffic rules on every drive. Speeding tickets and other traffic fines are the driver's personal responsibility.
Parking fines caused by the job itself (for example, the customer's address only had paid parking) are handled by us: send a photo of the fine in the chat.`,
  },
  {
    id: 'cancel-job',
    title: 'Cancelling a job you have taken',
    category: 'Jobs and pay',
    tags: ['cancel job', 'avboka', 'sick', 'sjuk', "can't make it", 'drop job'],
    body: `Plans change. You can cancel a job in the app up to 24 hours before it starts, free of any consequence.
Later than that, tell ops in the chat as soon as you can, so we can find another driver. Late cancellations now and then are fine; if it happens often, ops talks with you about it.`,
  },

  // ---------------- On a drive ----------------
  {
    id: 'pickup-checklist',
    title: 'Pickup checklist',
    category: 'On a drive',
    tags: ['pickup', 'hämta', 'checklist', 'photos', 'inspection', 'besiktning', 'damage check'],
    body: `At pickup, in the app:
1. Check the car's registration number against the job.
2. Photograph the car from all four sides, plus the dashboard (mileage and fuel or battery level).
3. Note any existing damage, with a close-up photo.
4. Check that the documents and items listed in the job are in the car.
The photos protect you: they show the car's condition before you drove it.`,
  },
  {
    id: 'delivery',
    title: 'Delivering the car',
    category: 'On a drive',
    tags: ['delivery', 'leverans', 'drop off', 'lämna', 'keys', 'nycklar', 'handover', 'customer not home'],
    body: `At the drop-off, photograph the car again from all sides plus the dashboard, then hand over the keys as the job describes (to a person, a key box or a reception).
If the customer isn't there, wait 15 minutes and message ops in the chat. Never leave keys anywhere the job doesn't say.`,
  },
  {
    id: 'running-late',
    title: "I'm running late or something went wrong",
    category: 'On a drive',
    tags: ['late', 'sen', 'försenad', 'problem', 'stuck', 'car won\'t start', 'breakdown', 'keys missing', 'emergency', 'akut'],
    body: `During a drive, write in the chat right away. Messages about an ongoing drive go straight to a person in ops, with priority.
Examples: you'll be late, the car or keys aren't where the job says, the car won't start, a warning light comes on, or the customer isn't there.
In an emergency or if anyone is hurt, call 112 first.`,
  },
  {
    id: 'waiting-pickup',
    title: 'Waiting at the pickup: keys or contact missing',
    category: 'On a drive',
    tags: ['waiting', 'väntar', 'vänta', 'keys', 'nycklar', 'no keys', 'key box', 'nyckelbox', 'contact', 'nobody there', 'should I leave', 'ska jag åka', 'waiting time', 'väntetid', 'pickup'],
    body: `At the pickup, tap "I'm here" in today's job, and "Got the keys" when you have them. If something is wrong, tap "Problem at pickup" and pick what it is, or write here.
Keys missing, nobody there, or the car isn't there: that one tap sends a fixed, pre-approved message to the pickup contact and the backup in the booking, and you see what was sent. It can't be changed, and nothing you or the assistant write is sent to the customer.
Damage, an accident or feeling unsafe goes straight to a person. If anyone is hurt or you are in danger, call 112 first.
Stay at the pickup. Your waiting time is paid from the agreed pickup time, whatever happens with the job.
If it isn't solved within 5 minutes, a person from ops calls you and agrees the next step with the customer, so you never have to cancel or decide anything yourself.`,
  },
  {
    id: 'passengers',
    title: 'Passengers and personal use',
    category: 'On a drive',
    tags: ['passenger', 'passagerare', 'friend', 'kompis', 'child', 'barn', 'stop on the way', 'personal errands'],
    body: `No passengers and no personal errands during a job. Drive the reasonable route from pickup to drop-off.
Short stops for fuel, charging or a break on longer drives are fine.`,
  },

  // ---------------- Damage and insurance ----------------
  {
    id: 'insurance',
    title: 'Insurance while you drive',
    category: 'Damage and insurance',
    tags: ['insurance', 'försäkring', 'insured', 'covered', 'liability', 'deductible', 'självrisk'],
    body: `Every car is insured while you drive it on a job. You don't need any insurance of your own for the car.
If something happens, you don't pay the deductible (självrisk) for normal accidents. The exception is gross negligence, for example driving under the influence or far above the speed limit.`,
  },
  {
    id: 'damage-report',
    title: 'If something happens to the car',
    category: 'Damage and insurance',
    tags: ['damage', 'skada', 'accident', 'olycka', 'scratch', 'repa', 'crash', 'krock', 'report'],
    body: `1. Make sure everyone is safe. Call 112 if anyone is hurt.
2. Write in the chat right away; a person in ops takes over.
3. Photograph the damage and the place, and if another vehicle is involved, its registration number.
4. Fill in the damage report in the job (ops helps you).
Reporting quickly is what matters: no one is blamed for reporting damage.`,
  },

  // ---------------- Your account ----------------
  {
    id: 'change-details',
    title: 'Changing your area, times or phone number',
    category: 'Your account',
    tags: ['profile', 'profil', 'change', 'ändra', 'area', 'område', 'phone number', 'telefonnummer', 'address', 'availability'],
    body: `You can change your area and the times you can drive under your profile in the app. Job suggestions follow your new settings right away.
To change your name, phone number or bank details, ask to talk to a person in the chat; we confirm the change with BankID.`,
  },
  {
    id: 'pause-quit',
    title: 'Taking a break or stopping',
    category: 'Your account',
    tags: ['pause', 'paus', 'break', 'vacation', 'semester', 'quit', 'sluta', 'delete account', 'radera konto'],
    body: `You can take a break any time: just don't take jobs. Nothing happens to your account.
To stop completely, ask in the chat and we close your account. Your data is deleted according to our privacy rules (see "Your data and how long we keep it").`,
  },
  {
    id: 'languages',
    title: 'Languages',
    category: 'Your account',
    tags: ['language', 'språk', 'english', 'engelska', 'svenska', 'arabic', 'translate'],
    body: `The app is in English and Swedish. You can write to the chat assistant in any language and it answers in the same language.
Ops answers in Swedish or English. In the job itself you need to be able to talk with customers in Swedish or English.`,
  },

  // ---------------- Privacy ----------------
  {
    id: 'data-retention',
    title: 'Your data and how long we keep it',
    category: 'Privacy',
    tags: ['data', 'gdpr', 'privacy', 'integritet', 'personuppgifter', 'delete', 'radera', 'retention', 'how long'],
    body: `We use your details to assess your application and, if you're accepted, to offer you jobs and pay you.
- An application that was never finished is deleted after 6 months.
- If you weren't accepted, the application is deleted 2 years after the decision.
- As a driver, we keep what we need while you drive with us, and what the law requires for pay and accounting after that.
You can ask to see your data, correct it or have it deleted: ask in the chat.`,
  },
  {
    id: 'ai-assistant',
    title: 'About the chat assistant',
    category: 'Privacy',
    tags: ['ai', 'bot', 'chatbot', 'assistant', 'robot', 'human', 'person', 'människa', 'is this a bot'],
    body: `The chat assistant is an AI. It answers from our help articles and from the status of your own application, nothing else. It can't make decisions about your application.
It can suggest things on your own application: booking or moving your call, marking your extract as ordered or arrived, booking the 5-minute extract check, picking your first drive, or pausing reminders. Nothing happens until you tap Confirm.
You can talk to a person at any time: tap "Talk to a person" or just ask. The assistant also hands you over when it isn't sure.
Don't share sensitive details in the chat, such as health information or anything from your criminal-record extract.`,
  },

  // ---------------- Contact ----------------
  {
    id: 'contact',
    title: 'Contacting ops',
    category: 'Contact',
    tags: ['contact', 'kontakt', 'phone', 'telefon', 'call us', 'ring', 'email', 'opening hours', 'öppettider', 'human', 'person'],
    body: `Write in the chat. The assistant answers right away; ask for a person whenever you want.
Ops is staffed every day 07:00–20:00 and answers within 15 minutes. During an ongoing drive, ops is reachable for the whole drive, also outside those hours.
We don't have a public phone number; if a call is easier, ask in the chat and we call you.`,
  },
];

export const HELP_BY_ID: Record<string, HelpArticle> = Object.fromEntries(HELP.map((h) => [h.id, h]));
