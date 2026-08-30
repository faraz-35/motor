import { addDays, dayNumber, effectiveAssign, localDate, rotationAssign } from '../rotation';
import { computeDesiredAlarms, formatRemaining } from '../alarms';
import type { Household, Member, Run } from '../../types';

const member = (id: string, order: number, active = true): Member => ({
  id, household_id: 'h', name: id, rotation_order: order, active, joined_at: '',
});

const members = [member('a', 0), member('b', 1), member('c', 2)];

describe('rotation', () => {
  test('dayNumber is stable and integer', () => {
    expect(dayNumber('1970-01-01')).toBe(0);
    expect(dayNumber('2026-08-30')).toBe(Math.floor(Date.parse('2026-08-30T00:00:00Z') / 86400000));
  });

  test('assignment cycles through members in join order', () => {
    const first = rotationAssign('2026-08-30', members)!;
    for (let i = 0; i < 7; i++) {
      const d = addDays('2026-08-30', i);
      const expectIdx = dayNumber(d) % 3;
      expect(rotationAssign(d, members)!.id).toBe(members[expectIdx].id);
    }
    expect(first).toBeTruthy();
  });

  test('inactive members are skipped without breaking the cycle', () => {
    const twoActive = [member('a', 0), member('b', 1), member('x', 2, false)];
    for (let i = 0; i < 6; i++) {
      const d = addDays('2026-09-01', i);
      const assigned = rotationAssign(d, twoActive)!.id;
      expect(['a', 'b']).toContain(assigned);
      expect(assigned).toBe(['a', 'b'][dayNumber(d) % 2]);
    }
  });

  test('overrides win over rotation', () => {
    const d = '2026-09-05';
    const rotated = rotationAssign(d, members)!.id;
    const other = members.find((m) => m.id !== rotated)!.id;
    expect(effectiveAssign(d, members, { [d]: other })!.id).toBe(other);
  });

  test('override pointing at a removed member falls back to rotation', () => {
    const d = '2026-09-05';
    const rotated = rotationAssign(d, members)!.id;
    expect(effectiveAssign(d, members, { [d]: 'gone' })!.id).toBe(rotated);
  });

  test('localDate is YYYY-MM-DD', () => {
    expect(localDate(new Date('2026-08-30T23:30:00Z'))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // 18:30 UTC on Aug 30 is past midnight in Karachi (23:30 PKT) — same date
    expect(localDate(new Date('2026-08-30T18:30:00Z'))).toBe('2026-08-30');
    // 20:00 UTC Aug 30 is 01:00 PKT Aug 31
    expect(localDate(new Date('2026-08-30T20:00:00Z'))).toBe('2026-08-31');
  });
});

const household: Household = {
  id: 'h', code: 'ABC123', reminder_time: '10:00:00', run_minutes: 10, snooze_minutes: 5,
};
const now = Date.parse('2026-08-30T10:00:00Z');
const startedRun: Run = {
  id: 'r', household_id: 'h', on_date: '2026-08-30', assigned_member_id: 'a',
  status: 'started', started_at: '2026-08-30T09:55:00Z', started_by: 'a',
  stopped_at: null, stopped_by: null,
};

describe('computeDesiredAlarms', () => {
  test('no household -> nothing armed', () => {
    expect(computeDesiredAlarms(null, null, now)).toEqual({ daily: null, stopAtMs: null });
  });

  test('daily reminder parsed from settings', () => {
    const d = computeDesiredAlarms(household, null, now);
    expect(d.daily).toEqual({ hour: 10, minute: 0 });
    expect(d.stopAtMs).toBeNull();
  });

  test('started run arms stop alarm at start + run_minutes', () => {
    const d = computeDesiredAlarms(household, startedRun, now);
    expect(d.stopAtMs).toBe(Date.parse('2026-08-30T09:55:00Z') + 10 * 60_000);
  });

  test('completed run arms nothing', () => {
    const d = computeDesiredAlarms(household, { ...startedRun, status: 'completed', stopped_at: '2026-08-30T10:04:00Z' }, now);
    expect(d.stopAtMs).toBeNull();
  });

  test('stale started rows from long ago do not arm', () => {
    const d = computeDesiredAlarms(household, { ...startedRun, started_at: '2026-08-01T09:55:00Z' }, now);
    expect(d.stopAtMs).toBeNull();
  });
});

describe('formatRemaining', () => {
  test('formats mm:ss and overdue with +', () => {
    expect(formatRemaining(65_000)).toBe('1:05');
    expect(formatRemaining(-65_000)).toBe('+1:05');
    expect(formatRemaining(9_800)).toBe('0:10');
  });
});
