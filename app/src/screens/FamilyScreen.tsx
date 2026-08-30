import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert, AppState, ScrollView, Share, StyleSheet, Text, View,
} from 'react-native';
import MotorAlarms from '../alarm/native';
import { C } from '../theme';
import { Screen } from '../components/Screen';
import { Btn, Card, Field, Pill, Row, SectionTitle } from '../components/ui';
import { useApp } from '../state/AppContext';

type Checks = {
  notifications: boolean;
  exactAlarms: boolean;
  battery: boolean;
};

export function FamilyScreen() {
  const app = useApp();
  const { household, members, me, profile, actions } = app;
  const [checks, setChecks] = useState<Checks | null>(null);
  const [time, setTime] = useState('');
  const [minutes, setMinutes] = useState('');
  const [snooze, setSnooze] = useState('');
  const [busy, setBusy] = useState(false);

  const runChecks = useCallback(() => {
    setChecks({
      notifications: MotorAlarms.notificationsEnabled(),
      exactAlarms: MotorAlarms.exactAlarmsEnabled(),
      battery: MotorAlarms.isIgnoringBatteryOptimizations(),
    });
  }, []);

  useEffect(() => { runChecks(); }, [runChecks]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') runChecks();
    });
    return () => sub.remove();
  }, [runChecks]);

  useEffect(() => {
    if (household) {
      setTime(household.reminder_time.slice(0, 5));
      setMinutes(String(household.run_minutes));
      setSnooze(String(household.snooze_minutes));
    }
  }, [household?.reminder_time, household?.run_minutes, household?.snooze_minutes]);

  const guard = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); } catch (e) {
      Alert.alert('Something broke', e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  const saveSettings = () =>
    guard(async () => {
      if (!/^\d{1,2}:\d{2}$/.test(time)) throw new Error('Reminder time must look like 10:00');
      const mm = Number(minutes), ss = Number(snooze);
      if (!(mm >= 1 && mm <= 120)) throw new Error('Run minutes must be 1–120');
      if (!(ss >= 1 && ss <= 30)) throw new Error('Snooze must be 1–30');
      await actions.saveSettings({ reminder_time: `${time}:00`, run_minutes: mm, snooze_minutes: ss });
      await MotorAlarms.setSnoozeMinutes(ss);
      Alert.alert('Saved', 'Every phone picks this up next time the app opens.');
    });

  const shareCode = () =>
    void Share.share({
      message: `Join our Motor household — code ${profile?.code ?? ''}. Install the app and enter this code.`,
    });

  const leave = () =>
    Alert.alert(
      'Leave household?',
      'You stop taking turns and this phone goes back to onboarding. Everyone else keeps their history.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Leave', style: 'destructive', onPress: () => void guard(actions.leave) },
      ]
    );

  return (
    <Screen>
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      <SectionTitle>Household</SectionTitle>
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <View>
            <Text style={s.codeLabel}>join code</Text>
            <Text style={s.code}>{profile?.code ?? '—'}</Text>
          </View>
          <Btn title="Share code" kind="ghost" onPress={shareCode} />
        </Row>
        <Text style={s.meta}>
          A sibling installs the app, enters this code with their name, and they're in the rotation.
        </Text>
      </Card>

      <SectionTitle>Members</SectionTitle>
      <Card style={{ gap: 14 }}>
        {members.map((m) => (
          <Row key={m.id} style={{ justifyContent: 'space-between' }}>
            <Text style={[s.member, !m.active && { color: C.dim, textDecorationLine: 'line-through' }]}>
              {m.rotation_order + 1}. {m.name}
            </Text>
            {m.id === me?.id ? <Pill text="you" tone="good" /> : !m.active ? <Pill text="left" tone="dim" /> : null}
          </Row>
        ))}
      </Card>

      <SectionTitle>Schedule</SectionTitle>
      <Card style={{ gap: 14 }}>
        <Field label="Daily reminder (24h)" value={time} onChangeText={setTime} placeholder="10:00" />
        <Field label="Motor run minutes" value={minutes} onChangeText={setMinutes} keyboardType="number-pad" placeholder="10" />
        <Field label="Snooze minutes" value={snooze} onChangeText={setSnooze} keyboardType="number-pad" placeholder="5" />
        <Btn title="Save schedule" onPress={saveSettings} loading={busy} />
      </Card>

      <SectionTitle>Make alarms reliable on this phone</SectionTitle>
      <Card style={{ gap: 14 }}>
        <CheckRow
          ok={checks?.notifications}
          label="Notifications allowed"
          fix="Allow" onFix={() => void MotorAlarms.openNotificationSettings()}
        />
        <CheckRow
          ok={checks?.exactAlarms}
          label="Exact alarms (fires at the right minute)"
          fix="Allow" onFix={() => void MotorAlarms.openExactAlarmSettings()}
        />
        <CheckRow
          ok={checks?.battery}
          label="Not battery-optimized (survives idle nights)"
          fix="Exempt" onFix={() => void MotorAlarms.requestIgnoreBatteryOptimizations()}
        />
        <View style={{ gap: 6 }}>
          <Text style={s.checkLabel}>4. Autostart after reboot (manual on Xiaomi / Infinix)</Text>
          <Btn title="Open autostart settings" kind="ghost" onPress={() => MotorAlarms.openAutostartSettings()} />
          <Text style={s.meta}>
            On Redmi: Security app → Permissions → Autostart → enable Motor. On Infinix/HiOS the
            toggle lives in Phone Master or Settings → Apps → Motor → autostart.
          </Text>
        </View>
        <View style={{ gap: 6 }}>
          <Text style={s.checkLabel}>
            5. Alarms that take over the screen (manual on Xiaomi / Infinix)
          </Text>
          <Btn title="Open app permissions" kind="ghost" onPress={() => MotorAlarms.openAppDetails()} />
          <Text style={s.meta}>
            In the app's permission page, also allow "Display pop-up windows while running in the
            background" (Redmi) / "Display pop-up windows" (Infinix). Without it the alarm still
            rings and vibrates, but shows as a banner instead of lighting up the full screen.
          </Text>
        </View>
        <Btn
          title="Ring a test alarm in 1 minute"
          onPress={() => {
            void MotorAlarms.armStopAlarm(Date.now() + 60_000);
            Alert.alert(
              'Test armed',
              'Lock the phone now. In one minute the stop-alarm should light up the screen and ring. If it only appears as a silent banner, do step 5 above.'
            );
          }}
        />
      </Card>

      <SectionTitle>Danger zone</SectionTitle>
      <Card>
        <Btn title="Leave this household" kind="danger" onPress={leave} loading={busy} />
      </Card>

      <Text style={s.version}>Motor v1.0.1 · household {household?.id?.slice(0, 8) ?? '—'}</Text>
    </ScrollView>
    </Screen>
  );
}

function CheckRow({
  ok, label, fix, onFix,
}: {
  ok: boolean | undefined; label: string; fix: string; onFix: () => void;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text style={[s.checkLabel, { flex: 1 }]}>{label}</Text>
        {ok === undefined ? <Pill text="…" tone="dim" /> : ok ? <Pill text="ok" tone="good" /> : <Pill text="needed" tone="bad" />}
      </Row>
      {ok === false && <Btn title={fix} kind="ghost" onPress={onFix} />}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { padding: 20, gap: 16, paddingBottom: 40 },
  codeLabel: { color: C.dim, fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  code: { color: C.accent, fontSize: 34, fontWeight: '800', letterSpacing: 4 },
  meta: { color: C.dim, fontSize: 13 },
  member: { color: C.text, fontSize: 16, fontWeight: '500' },
  checkLabel: { color: C.text, fontSize: 15 },
  version: { color: C.dim, fontSize: 12, textAlign: 'center', marginTop: 8 },
});
