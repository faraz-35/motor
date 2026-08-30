import type { Household, Run } from '../types';

export type DesiredAlarms = {
  /** Daily reminder time, or null when no household is loaded. */
  daily: { hour: number; minute: number } | null;
  /** Epoch ms when the stop alarm should ring, or null when nothing runs. */
  stopAtMs: number | null;
};

/**
 * Pure derivation of what the native alarm engine should be armed with.
 * Every phone in the household computes this from shared state, so the stop
 * alarm rings on all of them — redundancy if the starter's phone dies.
 */
export function computeDesiredAlarms(
  household: Household | null,
  todayRun: Run | null,
  now: number = Date.now()
): DesiredAlarms {
  if (!household) return { daily: null, stopAtMs: null };

  const [h, m] = household.reminder_time.split(':');
  const daily = { hour: Number(h), minute: Number(m) };

  let stopAtMs: number | null = null;
  if (todayRun?.status === 'started' && todayRun.started_at) {
    const at = Date.parse(todayRun.started_at) + household.run_minutes * 60_000;
    // stale 'started' rows (phone died mid-run months ago) don't arm anything
    if (at > now - 3600_000) stopAtMs = at;
  }
  return { daily, stopAtMs };
}

export function formatRemaining(ms: number): string {
  const s = Math.round(ms / 1000);
  const abs = Math.abs(s);
  const m = Math.floor(abs / 60);
  const r = abs % 60;
  const body = `${m}:${String(r).padStart(2, '0')}`;
  return s < 0 ? `+${body}` : body;
}
