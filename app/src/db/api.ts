import type { Household, Member, Run, Swap } from '../types';
import { addDays, localDate } from '../logic/rotation';
import { db } from './client';

export type HouseholdData = {
  household: Household;
  members: Member[];
  overrides: Record<string, string>;
  runs: Run[];
  swaps: Swap[];
};

const WINDOW_PAST = 35;
const WINDOW_FUTURE = 35;

export async function fetchHouseholdData(householdId: string): Promise<HouseholdData> {
  const from = addDays(localDate(), -WINDOW_PAST);
  const to = addDays(localDate(), WINDOW_FUTURE);
  const [household, members, assignments, runs, swaps] = await Promise.all([
    db.from('households').select('*').eq('id', householdId).single(),
    db.from('members').select('*').eq('household_id', householdId).order('rotation_order'),
    db.from('assignments').select('on_date, member_id')
      .eq('household_id', householdId).gte('on_date', from).lte('on_date', to),
    db.from('runs').select('*').eq('household_id', householdId)
      .gte('on_date', from).lte('on_date', to).order('on_date', { ascending: false }),
    db.from('swap_requests').select('*').eq('household_id', householdId)
      .order('created_at', { ascending: false }).limit(50),
  ]);
  if (household.error || members.error || assignments.error || runs.error || swaps.error) {
    throw household.error ?? members.error ?? assignments.error ?? runs.error ?? swaps.error;
  }
  const overrides: Record<string, string> = {};
  for (const a of assignments.data ?? []) overrides[a.on_date] = a.member_id;
  return {
    household: household.data,
    members: members.data ?? [],
    overrides,
    runs: runs.data ?? [],
    swaps: swaps.data ?? [],
  };
}

export async function startRun(householdId: string, date: string, assignedMemberId: string, meId: string) {
  const { error } = await db.from('runs').upsert({
    household_id: householdId,
    on_date: date,
    assigned_member_id: assignedMemberId,
    status: 'started',
    started_at: new Date().toISOString(),
    started_by: meId,
  }, { onConflict: 'household_id,on_date' });
  if (error) throw error;
}

export async function stopRun(householdId: string, date: string, meId: string) {
  const { error } = await db.from('runs')
    .update({ status: 'completed', stopped_at: new Date().toISOString(), stopped_by: meId })
    .eq('household_id', householdId).eq('on_date', date);
  if (error) throw error;
}

export async function requestSwap(householdId: string, date: string, meId: string, toMemberId: string | null) {
  const { error } = await db.from('swap_requests').insert({
    household_id: householdId,
    on_date: date,
    from_member_id: meId,
    to_member_id: toMemberId,
    status: 'pending',
  });
  if (error) throw error;
}

export async function acceptSwap(requestId: string) {
  const { error } = await db.rpc('accept_swap', { p_request_id: requestId });
  if (error) throw error;
}

export async function cancelSwap(requestId: string) {
  const { error } = await db.rpc('cancel_swap', { p_request_id: requestId });
  if (error) throw error;
}

export async function saveHouseholdSettings(householdId: string, patch: Partial<Pick<Household, 'reminder_time' | 'run_minutes' | 'snooze_minutes'>>) {
  const { error } = await db.from('households').update(patch).eq('id', householdId);
  if (error) throw error;
}

export async function leaveHousehold(memberId: string) {
  const { error } = await db.from('members').update({ active: false }).eq('id', memberId);
  if (error) throw error;
}

export async function createHousehold(name: string) {
  const { data, error } = await db.rpc('create_household', { p_name: name });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

export async function joinHousehold(code: string, name: string) {
  const { data, error } = await db.rpc('join_household', { p_code: code, p_name: name });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}
