import { describe, expect, it } from 'vitest';

import { eachDayInRange, formatClockTime, formatDuration } from './date';
import { formatMoney, formatPriceFrom, toMinorUnits } from './money';
import { buildPageRange, buildPaginationMeta, formatResultRange } from './pagination';
import { humanizeEnum, initials, slugify } from './string';

describe('money', () => {
  it('formats minor units the way the designs do', () => {
    expect(formatMoney(11800, 'EUR')).toBe('€118.00');
    expect(formatMoney(9900, 'USD')).toBe('$99.00');
    expect(formatPriceFrom(5900, 'EUR')).toBe('€59');
  });

  it('round-trips major units without float drift', () => {
    expect(toMinorUnits(59.5)).toBe(5950);
    expect(toMinorUnits(0.1 + 0.2)).toBe(30);
  });
});

describe('date', () => {
  it('formats slot times', () => {
    expect(formatClockTime('09:30')).toBe('09:30 AM');
    expect(formatClockTime('12:00')).toBe('12:00 PM');
    expect(formatClockTime('18:30')).toBe('06:30 PM');
    expect(formatClockTime('00:15')).toBe('12:15 AM');
  });

  it('formats durations like the tour cards', () => {
    expect(formatDuration(2.5)).toBe('2.5 Hours');
    expect(formatDuration(1)).toBe('1 Hour');
    expect(formatDuration(24)).toBe('1 Day');
    expect(formatDuration(0.5)).toBe('30 mins');
  });

  it('builds the seven-day availability rail', () => {
    expect(eachDayInRange('2024-05-21', 3)).toEqual(['2024-05-21', '2024-05-22', '2024-05-23']);
  });
});

describe('strings', () => {
  it('slugifies blog titles', () => {
    expect(slugify('10 Must-See Attractions in Rome')).toBe('10-must-see-attractions-in-rome');
    expect(slugify('  Città  —  Vaticano ')).toBe('citta-vaticano');
  });

  it('derives avatar initials and enum labels', () => {
    expect(initials('John Michael Smith')).toBe('JS');
    expect(humanizeEnum('PAYMENT_PENDING')).toBe('Payment Pending');
  });
});

describe('pagination', () => {
  it('describes the visible result window', () => {
    const meta = buildPaginationMeta(24, 1, 6);
    expect(meta.totalPages).toBe(4);
    expect(formatResultRange(meta, 'tours')).toBe('Showing 1–6 of 24 tours');
  });

  it('collapses long pagers with ellipses', () => {
    expect(buildPageRange(1, 19)).toEqual([1, 2, 'ellipsis', 19]);
    expect(buildPageRange(10, 19)).toEqual([1, 'ellipsis', 9, 10, 11, 'ellipsis', 19]);
  });
});
