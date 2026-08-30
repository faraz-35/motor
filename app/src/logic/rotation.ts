import type { Member } from '../types';
import { TIMEZONE } from '../config';

/** "YYYY-MM-DD" for the household's timezone (the whole family shares it). */
export function localDate(now: Date = new Date(), timeZone: string = TIMEZONE): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(now);
}

export function addDays(dateStr: string, n: number): string {
  return new Date(Date.parse(dateStr + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
}

/** Days since epoch. Must stay in lockstep with SQL rotation_assignment(). */
export function dayNumber(dateStr: string): number {
  return Math.floor(Date.parse(dateStr + 'T00:00:00Z') / 86400000);
}

export function activeMembersSorted(members: Member[]): Member[] {
  return members.filter((m) => m.active).sort((a, b) => a.rotation_order - b.rotation_order);
}

/** Deterministic default owner: join-order members, day-number modulo count. */
export function rotationAssign(dateStr: string, members: Member[]): Member | null {
  const active = activeMembersSorted(members);
  if (active.length === 0) return null;
  return active[dayNumber(dateStr) % active.length];
}

/** Overrides (accepted swaps) win over the rotation default. */
export function effectiveAssign(
  dateStr: string,
  members: Member[],
  overrides: Record<string, string>  // date -> member_id
): Member | null {
  const memberId = overrides[dateStr];
  if (memberId) {
    const m = members.find((x) => x.id === memberId);
    if (m) return m;
  }
  return rotationAssign(dateStr, members);
}

/** "10:00:00" -> { hour: 10, minute: 0 } */
export function parseReminderTime(t: string): { hour: number; minute: number } {
  const [h, m] = t.split(':');
  return { hour: Number(h), minute: Number(m) };
}
