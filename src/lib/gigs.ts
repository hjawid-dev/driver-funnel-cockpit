import type { Applicant, Gig } from './types';
import { DAY, HOUR, atLocal } from './time';

/** Rough geography for matching: same area first, then the same part of Stockholm. */
const REGION: Record<string, 'north' | 'central' | 'south'> = {
  Solna: 'north',
  Sundbyberg: 'north',
  Bromma: 'north',
  Järfälla: 'north',
  Sollentuna: 'north',
  Täby: 'north',
  Södermalm: 'central',
  Kungsholmen: 'central',
  Lidingö: 'central',
  Huddinge: 'south',
  Haninge: 'south',
  Nacka: 'south',
};

export function distanceScore(a: string, b: string): number {
  if (a === b) return 0;
  return REGION[a] && REGION[a] === REGION[b] ? 1 : 2;
}

/** A curated first gig: short and a standard car, so a new driver starts easy with ops on standby. */
export function isEasy(g: Gig): boolean {
  return g.km <= 25 && g.car === 'standard';
}

export function isWeekendOrEvening(ts: number): boolean {
  const d = new Date(ts);
  return d.getDay() === 0 || d.getDay() === 6 || d.getHours() >= 17;
}

// [day offset, hour, from, to, pickup area, km, minutes, pay, car]
const TEMPLATE: [number, number, string, string, string, number, number, number, Gig['car']][] = [
  [1, 9, 'Dealership, Solna', 'Workshop, Sundbyberg', 'Solna', 8, 25, 320, 'standard'],
  [1, 13, 'Leasing depot, Bromma', 'Customer, Kungsholmen', 'Bromma', 11, 30, 340, 'standard'],
  [1, 15, 'Dealership, Täby', 'Customer, Uppsala', 'Täby', 62, 55, 690, 'standard'],
  [2, 10, 'Workshop, Nacka', 'Dealership, Södermalm', 'Nacka', 9, 25, 320, 'standard'],
  [2, 18, 'Rental hub, Järfälla', 'Customer, Sollentuna', 'Järfälla', 14, 25, 360, 'standard'],
  [2, 9, 'Dealership, Huddinge', 'Leasing depot, Haninge', 'Huddinge', 17, 25, 350, 'standard'],
  [3, 11, 'Premium dealer, Lidingö', 'Customer, Täby', 'Lidingö', 19, 30, 520, 'premium'],
  [3, 14, 'Workshop, Sundbyberg', 'Dealership, Solna', 'Sundbyberg', 7, 20, 300, 'standard'],
  [4, 10, 'Dealership, Kungsholmen', 'Workshop, Bromma', 'Kungsholmen', 10, 25, 320, 'standard'],
  [5, 10, 'Leasing depot, Haninge', 'Customer, Nacka', 'Haninge', 21, 30, 380, 'standard'],
  [5, 12, 'Dealership, Sollentuna', 'Workshop, Täby', 'Sollentuna', 12, 20, 330, 'standard'],
  [6, 10, 'Rental hub, Solna', 'Customer, Bromma', 'Solna', 9, 20, 320, 'standard'],
  [6, 13, 'Workshop, Södermalm', 'Dealership, Huddinge', 'Södermalm', 16, 30, 350, 'standard'],
  [7, 11, 'Dealership, Bromma', 'Customer, Järfälla', 'Bromma', 13, 25, 340, 'standard'],
  [8, 9, 'Dealership, Nacka', 'Customer, Lidingö', 'Nacka', 18, 30, 360, 'standard'],
  [9, 17, 'Workshop, Täby', 'Dealership, Solna', 'Täby', 15, 25, 350, 'standard'],
  [10, 10, 'Leasing depot, Sundbyberg', 'Customer, Kungsholmen', 'Sundbyberg', 8, 20, 320, 'standard'],
  [11, 11, 'Dealership, Huddinge', 'Customer, Södermalm', 'Huddinge', 14, 25, 340, 'standard'],
  [12, 10, 'Rental hub, Sollentuna', 'Workshop, Järfälla', 'Sollentuna', 11, 20, 330, 'standard'],
  [13, 12, 'Dealership, Solna', 'Customer, Täby', 'Solna', 16, 25, 350, 'standard'],
];

/** Open jobs over the next two weeks, relative to now (demo data, like the applicants). */
export function generateGigs(now: number): Gig[] {
  return TEMPLATE.map(([d, h, from, to, area, km, minutes, pay, car], i) => ({
    id: `JOB-${301 + i}`,
    from,
    to,
    area,
    km,
    minutes,
    pay,
    at: atLocal(now, d, h),
    car,
  }));
}

export const OFFER_COUNT = 3;

/**
 * First-gig offers for an accepted driver: easy jobs only, not taken by someone else, from
 * 12 hours to 10 days ahead, matching limited availability, nearest first, then soonest.
 */
export function firstGigOffers(a: Applicant, gigs: Gig[], apps: Applicant[], now: number): Gig[] {
  const taken = new Set(apps.filter((x) => x.id !== a.id).map((x) => x.firstGig?.gigId).filter(Boolean));
  return gigs
    .filter((g) => !taken.has(g.id))
    .filter((g) => g.at >= now + 12 * HOUR && g.at <= now + 10 * DAY)
    .filter(isEasy)
    .filter((g) => a.availability === 'full' || isWeekendOrEvening(g.at))
    .sort((x, y) => distanceScore(a.area, x.area) - distanceScore(a.area, y.area) || x.at - y.at)
    .slice(0, OFFER_COUNT);
}
