import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PermissionsAndroid } from 'react-native';
import MotorAlarms from '../alarm/native';
import { PROFILE_KEY } from '../config';
import type { Household, Member, Profile, Run, Swap } from '../types';
import { computeDesiredAlarms } from '../logic/alarms';
import { effectiveAssign, localDate } from '../logic/rotation';
import { ensureDeviceSession, db } from '../db/client';
import * as api from '../db/api';

type Phase = 'boot' | 'needOnboarding' | 'ready' | 'error';

type AppState = {
  phase: Phase;
  error: string | null;
  profile: Profile | null;
  household: Household | null;
  members: Member[];
  overrides: Record<string, string>;
  runs: Run[];
  swaps: Swap[];
  today: string;
  me: Member | null;
  assigneeToday: Member | null;
  myTurn: boolean;
  todayRun: Run | null;
  pendingSwaps: Swap[];
  refresh: () => Promise<void>;
  actions: {
    startRun: () => Promise<void>;
    stopRun: () => Promise<void>;
    requestSwap: (toMemberId: string | null) => Promise<void>;
    acceptSwap: (requestId: string) => Promise<void>;
    cancelSwap: (requestId: string) => Promise<void>;
    saveSettings: (patch: Partial<Pick<Household, 'reminder_time' | 'run_minutes' | 'snooze_minutes'>>) => Promise<void>;
    leave: () => Promise<void>;
    completeOnboarding: (p: Profile) => Promise<void>;
  };
};

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<Phase>('boot');
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [household, setHousehold] = useState<Household | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [runs, setRuns] = useState<Run[]>([]);
  const [swaps, setSwaps] = useState<Swap[]>([]);
  const [today, setToday] = useState(localDate());
  const [reloadKey, setReloadKey] = useState(0);
  const appliedAlarms = useRef<string>('');

  const refresh = useCallback(async () => {
    if (!profile) return;
    try {
      const data = await api.fetchHouseholdData(profile.householdId);
      setHousehold(data.household);
      setMembers(data.members);
      setOverrides(data.overrides);
      setRuns(data.runs);
      setSwaps(data.swaps);
      setToday(localDate());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [profile]);

  // bootstrap: device session -> stored profile -> data
  useEffect(() => {
    (async () => {
      try {
        await ensureDeviceSession();
        const raw = await AsyncStorage.getItem(PROFILE_KEY);
        if (!raw) {
          setPhase('needOnboarding');
          return;
        }
        const p: Profile = JSON.parse(raw);
        setProfile(p);
        setPhase('ready');
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setPhase('error');
      }
    })();
  }, []);

  useEffect(() => {
    if (phase === 'ready') void refresh();
  }, [phase, reloadKey, refresh]);

  // realtime: any household-row change triggers a refetch
  useEffect(() => {
    if (!profile) return;
    const channel = db.channel(`household-${profile.householdId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', filter: `household_id=eq.${profile.householdId}` },
        () => { setReloadKey((k) => k + 1); }
      )
      .subscribe();
    return () => { void db.removeChannel(channel); };
  }, [profile]);

  // notification permission (Android 13+)
  useEffect(() => {
    if (phase !== 'ready') return;
    void PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS).catch(() => undefined);
  }, [phase]);

  const me = useMemo(
    () => members.find((m) => m.id === profile?.memberId) ?? null,
    [members, profile]
  );
  const assigneeToday = useMemo(
    () => effectiveAssign(today, members, overrides),
    [today, members, overrides]
  );
  const myTurn = !!me && !!assigneeToday && me.id === assigneeToday.id;
  const todayRun = useMemo(() => runs.find((r) => r.on_date === today) ?? null, [runs, today]);
  const pendingSwaps = useMemo(
    () => swaps.filter((s) => s.status === 'pending' && s.on_date >= today),
    [swaps, today]
  );

  // reconcile the native alarm engine with desired state (local-first: alarms
  // live on every phone; the server only feeds them state)
  const desired = useMemo(
    () => computeDesiredAlarms(household, todayRun),
    [household, todayRun]
  );
  useEffect(() => {
    if (phase !== 'ready') return;
    const key = JSON.stringify(desired);
    if (key === appliedAlarms.current) return;
    appliedAlarms.current = key;
    (async () => {
      try {
        if (desired.daily) {
          await MotorAlarms.scheduleDaily(desired.daily.hour, desired.daily.minute);
        }
        if (desired.stopAtMs != null) {
          await MotorAlarms.armStopAlarm(desired.stopAtMs);
        } else {
          await MotorAlarms.cancelStopAlarm();
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [phase, desired]);

  // a minute ticker so "today" rolls over on screen and stale started runs age out
  useEffect(() => {
    const t = setInterval(() => setToday(localDate()), 30_000);
    return () => clearInterval(t);
  }, []);

  const actions: AppState['actions'] = useMemo(() => ({
    async startRun() {
      if (!profile || !assigneeToday) return;
      await api.startRun(profile.householdId, today, assigneeToday.id, profile.memberId);
      await refresh();
    },
    async stopRun() {
      if (!profile) return;
      await api.stopRun(profile.householdId, today, profile.memberId);
      await MotorAlarms.cancelStopAlarm();
      await refresh();
    },
    async requestSwap(toMemberId) {
      if (!profile) return;
      await api.requestSwap(profile.householdId, today, profile.memberId, toMemberId);
      await refresh();
    },
    async acceptSwap(requestId) {
      await api.acceptSwap(requestId);
      await refresh();
    },
    async cancelSwap(requestId) {
      await api.cancelSwap(requestId);
      await refresh();
    },
    async saveSettings(patch) {
      if (!profile) return;
      await api.saveHouseholdSettings(profile.householdId, patch);
      await refresh();
    },
    async leave() {
      if (!profile) return;
      await api.leaveHousehold(profile.memberId);
      await MotorAlarms.cancelDaily();
      await MotorAlarms.cancelStopAlarm();
      await AsyncStorage.removeItem(PROFILE_KEY);
      setProfile(null);
      setHousehold(null);
      setPhase('needOnboarding');
    },
    async completeOnboarding(p) {
      await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(p));
      setProfile(p);
      setPhase('ready');
    },
  }), [profile, assigneeToday, today, refresh]);

  const value: AppState = {
    phase, error, profile, household, members, overrides, runs, swaps,
    today, me, assigneeToday, myTurn, todayRun, pendingSwaps,
    refresh, actions,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp outside provider');
  return v;
}
