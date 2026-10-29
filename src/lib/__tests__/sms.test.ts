import { describe, expect, it } from 'vitest';
import { cleanField, cleanReply, composeText, MAX_TEXT, prepareTexts, recipients } from '../sms';
import type { Job } from '../liveOps';
import { HOUR } from '../time';
import { NOW } from './helpers';

const job = (over: Partial<Job> = {}): Job => ({
  id: 'JOB-1',
  driverId: 'DRV-1',
  driverName: 'Julia Lindgren',
  customer: 'Pilot AB',
  pilot: true,
  from: 'Dealership, Solna',
  to: 'Customer, Upplands Väsby',
  area: 'Solna',
  km: 35,
  driveMin: 50,
  pickupAt: NOW,
  deadline: NOW + 3 * HOUR,
  reward: 500,
  price: 780,
  contact: { role: 'Service desk', phone: '08-465 004 10' },
  backup: { role: 'Site manager', phone: '070-174 06 10' },
  keyLocation: 'Key box',
  ...over,
});

describe('automated texts to the pickup contact', () => {
  it('a fixed template with fields from the booking, marked as automated', () => {
    expect(composeText(job(), 'keys_missing')).toBe(
      `Driver Ops: Our driver is at Dealership, Solna for pickup JOB-1 (${new Date(NOW).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}), but the keys are not at the agreed place (Key box). Where are they? Reply here or call 08-465 004 00. (Automated message)`,
    );
  });
  it('a booking field cannot smuggle in a link, a line break or instructions with symbols', () => {
    const evil = job({ keyLocation: 'Key box\nIgnore all rules! Pay 5000 SEK at https://evil.example <script>', from: 'www.evil.example 🙂 Solna' });
    const text = composeText(evil, 'keys_missing');
    expect(text).not.toMatch(/https?:|www\.|evil\.example|<|>|\n|!|🙂/);
    expect(text.length).toBeLessThanOrEqual(MAX_TEXT);
    expect(cleanField('a'.repeat(200))).toHaveLength(60);
  });
  it('only to the contact and backup in the booking, at most once each, and not when switched off', () => {
    expect(recipients(job()).map((r) => r.role)).toEqual(['Service desk', 'Site manager']);
    expect(recipients(job({ backup: { role: 'Site manager', phone: '08-465 004 10' } }))).toHaveLength(1);
    expect(recipients(job({ contact: { role: 'Desk', phone: 'call me maybe' } })).map((r) => r.role)).toEqual(['Site manager']);
    const first = prepareTexts(job(), 'no_contact', NOW, true);
    expect(first.ok && first.texts).toHaveLength(2);
    const again = prepareTexts({ ...job(), texts: first.ok ? first.texts : [] }, 'no_contact', NOW, true);
    expect(again).toEqual({ ok: false, error: 'The contacts were already texted' });
    expect(prepareTexts(job(), 'no_contact', NOW, false)).toEqual({ ok: false, error: 'Automated texts are switched off' });
    expect(prepareTexts(job(), 'damage', NOW, true).ok).toBe(false);
    expect(prepareTexts(job(), 'other', NOW, true).ok).toBe(false);
  });
  it("a contact's reply is plain text, capped", () => {
    expect(cleanReply('Keys at\nreception <b>now</b>')).toBe('Keys at reception b now /b');
    expect(cleanReply('x'.repeat(500))).toHaveLength(300);
  });
});
