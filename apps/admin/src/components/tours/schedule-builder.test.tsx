import { describe, expect, it } from 'vitest';

import {
  scheduleDates,
  scheduleProblem,
  scheduleSize,
  scheduleTimes,
  shiftDay,
  type SlotSchedule,
} from './schedule-builder';

/**
 * The expansion from "runs Tue and Thu through June" to the list of dates the
 * API is asked to create. Getting the weekday wrong here would put departures
 * on days the tour does not run, which nothing downstream would catch — the
 * rows would simply be there and sellable.
 */
function schedule(overrides: Partial<SlotSchedule> = {}): SlotSchedule {
  return {
    times: ['09:00'],
    capacity: '20',
    from: '2030-06-01',
    to: '2030-06-07',
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    ...overrides,
  };
}

describe('scheduleDates', () => {
  it('covers the range end to end, inclusive of both bounds', () => {
    const dates = scheduleDates(schedule());

    expect(dates).toHaveLength(7);
    expect(dates[0]).toBe('2030-06-01');
    expect(dates[6]).toBe('2030-06-07');
  });

  it('keeps only the chosen weekdays', () => {
    // 2030-06-01 is a Saturday, so the first Tuesday is the 4th.
    const dates = scheduleDates(schedule({ to: '2030-06-14', weekdays: [2, 4] }));

    expect(dates).toEqual(['2030-06-04', '2030-06-06', '2030-06-11', '2030-06-13']);
  });

  it('reads the weekday in UTC, whatever the browser is set to', () => {
    // A local-time reading would slide a Saturday-only run onto the Friday or
    // the Sunday for anyone west or east of UTC.
    const saturdays = scheduleDates(
      schedule({ from: '2030-06-01', to: '2030-06-30', weekdays: [6] }),
    );

    expect(saturdays).toEqual([
      '2030-06-01',
      '2030-06-08',
      '2030-06-15',
      '2030-06-22',
      '2030-06-29',
    ]);
  });

  it('is empty when the range runs backwards or no day is chosen', () => {
    expect(scheduleDates(schedule({ from: '2030-06-07', to: '2030-06-01' }))).toEqual([]);
    expect(scheduleDates(schedule({ weekdays: [] }))).toEqual([]);
  });
});

describe('scheduleTimes', () => {
  it('drops blanks and duplicates, and sorts by the clock', () => {
    expect(scheduleTimes(schedule({ times: ['14:00', '', '09:30', '14:00'] }))).toEqual([
      '09:30',
      '14:00',
    ]);
  });
});

describe('scheduleSize', () => {
  it('is every time on every date', () => {
    expect(scheduleSize(schedule({ times: ['09:00', '15:00'] }))).toBe(14);
  });
});

describe('scheduleProblem', () => {
  it('passes a schedule that can be applied', () => {
    expect(scheduleProblem(schedule())).toBeNull();
  });

  it('names what is missing', () => {
    expect(scheduleProblem(schedule({ times: [] }))).toMatch(/departure time/i);
    expect(scheduleProblem(schedule({ weekdays: [] }))).toMatch(/day of the week/i);
    expect(scheduleProblem(schedule({ from: '2030-06-07', to: '2030-06-01' }))).toMatch(/before/i);
  });

  it('refuses a run the API would reject as too large', () => {
    const problem = scheduleProblem(
      schedule({
        to: shiftDay('2030-06-01', 300),
        times: ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00'],
      }),
    );

    expect(problem).toMatch(/Shorten the date range/);
  });
});
