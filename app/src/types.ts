export type Member = {
  id: string;
  household_id: string;
  name: string;
  rotation_order: number;
  active: boolean;
  joined_at: string;
};

export type Household = {
  id: string;
  code: string;
  reminder_time: string;   // "HH:MM:SS"
  run_minutes: number;
  snooze_minutes: number;
};

export type Run = {
  id: string;
  household_id: string;
  on_date: string;         // "YYYY-MM-DD"
  assigned_member_id: string | null;
  status: 'scheduled' | 'started' | 'completed' | 'missed';
  started_at: string | null;
  started_by: string | null;
  stopped_at: string | null;
  stopped_by: string | null;
};

export type Swap = {
  id: string;
  household_id: string;
  on_date: string;
  from_member_id: string;
  to_member_id: string | null;  // null = anyone may accept
  status: 'pending' | 'accepted' | 'declined' | 'canceled';
  created_at: string;
};

export type Profile = {
  householdId: string;
  memberId: string;
  code: string;
};
