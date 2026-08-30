import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { C } from '../theme';
import { Btn, Card, Pill, Row, SectionTitle } from '../components/ui';
import { useApp } from '../state/AppContext';
import { formatRemaining } from '../logic/alarms';
import { parseReminderTime } from '../logic/rotation';

export function TodayScreen() {
  const app = useApp();
  const { household, me, assigneeToday, myTurn, todayRun, pendingSwaps, actions } = app;
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [swapModal, setSwapModal] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const memberName = (id: string | null) => app.members.find((m) => m.id === id)?.name ?? '—';

  const stopAt = useMemo(() => {
    if (todayRun?.status === 'started' && todayRun.started_at && household) {
      return Date.parse(todayRun.started_at) + household.run_minutes * 60_000;
    }
    return null;
  }, [todayRun, household]);

  const reminder = household ? parseReminderTime(household.reminder_time) : null;
  const reminderLabel = reminder
    ? `${String(reminder.hour).padStart(2, '0')}:${String(reminder.minute).padStart(2, '0')}`
    : '--:--';

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); } catch (e) {
      Alert.alert('Something broke', e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  const visibleSwaps = pendingSwaps.filter((s) => s.from_member_id !== me?.id);

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      <SectionTitle>Today · {app.today}</SectionTitle>

      <Card style={{ alignItems: 'center', paddingVertical: 28 }}>
        {assigneeToday ? (
          <>
            <Text style={s.turnLabel}>{myTurn ? 'YOUR TURN' : 'on duty'}</Text>
            <Text style={[s.name, { color: myTurn ? C.accent : C.text }]}>
              {assigneeToday.name}
            </Text>
            <Text style={s.meta}>
              {reminderLabel} · {household?.run_minutes ?? '—'} min motor run
            </Text>
          </>
        ) : (
          <Text style={s.meta}>No active members — someone rejoin from the Family tab.</Text>
        )}
      </Card>

      {todayRun?.status === 'started' && stopAt != null && (
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={s.runTitle}>Motor running</Text>
            <Text style={[s.countdown, { color: stopAt > now ? C.warn : C.bad }]}>
              {formatRemaining(stopAt - now)}
            </Text>
          </Row>
          <Text style={s.meta}>
            started by {memberName(todayRun.started_by)}
            {stopAt <= now ? ' · overdue — stop the motor now' : ' until the alarm rings'}
          </Text>
          <Btn
            title="I stopped the motor"
            onPress={() => run(actions.stopRun)}
            loading={busy}
          />
        </Card>
      )}

      {todayRun?.status === 'completed' && (
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={s.runTitle}>Done today</Text>
            <Pill text="completed" tone="good" />
          </Row>
          <Text style={s.meta}>
            {memberName(todayRun.started_by)} ran it
            {todayRun.started_by !== todayRun.stopped_by && todayRun.stopped_by
              ? `, ${memberName(todayRun.stopped_by)} stopped it` : ''}
          </Text>
        </Card>
      )}

      {myTurn && !todayRun && household && (
        <Card>
          <Text style={s.runTitle}>When you switch the motor on, tap here:</Text>
          <Btn title="I'm starting the motor" onPress={() => run(actions.startRun)} loading={busy} />
          <Btn title="I can't today — ask someone else" kind="ghost" onPress={() => setSwapModal(true)} />
        </Card>
      )}

      {myTurn && todayRun?.status !== 'started' && todayRun?.status !== 'completed' && (
        <Card>
          <Btn title="I can't today — ask someone else" kind="ghost" onPress={() => setSwapModal(true)} />
        </Card>
      )}

      {!myTurn && !todayRun && (
        <Card>
          <Text style={s.meta}>
            {assigneeToday ? `${assigneeToday.name} handles the motor today. You're on standby.` : ''}
          </Text>
        </Card>
      )}

      {visibleSwaps.length > 0 && (
        <>
          <SectionTitle>Swap requests</SectionTitle>
          {visibleSwaps.map((sw) => (
            <Card key={sw.id}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={s.runTitle}>
                  {memberName(sw.from_member_id)} can't do {sw.on_date}
                </Text>
                {sw.to_member_id ? (
                  sw.to_member_id === me?.id ? <Pill text="asks you" tone="warn" /> : null
                ) : (
                  <Pill text="anyone" tone="dim" />
                )}
              </Row>
              {(sw.to_member_id === null || sw.to_member_id === me?.id) && (
                <Row>
                  <Btn title="I'll take it" onPress={() => run(() => actions.acceptSwap(sw.id))} loading={busy} />
                  <View style={{ flex: 1 }} />
                </Row>
              )}
              {sw.to_member_id != null && sw.to_member_id !== me?.id && (
                <Text style={s.meta}>Waiting for {memberName(sw.to_member_id)}.</Text>
              )}
            </Card>
          ))}
        </>
      )}

      <SwapModal
        visible={swapModal}
        onClose={() => setSwapModal(false)}
        onSubmit={(to) => run(async () => { await actions.requestSwap(to); setSwapModal(false); })}
      />
    </ScrollView>
  );
}

function SwapModal({
  visible, onClose, onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (toMemberId: string | null) => void;
}) {
  const { members, me, pendingSwaps, today } = useApp();
  const alreadyRequested = pendingSwaps.some((s) => s.from_member_id === me?.id && s.on_date === today && s.status === 'pending');
  const others = members.filter((m) => m.active && m.id !== me?.id);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.modalBackdrop}>
        <View style={s.modalSheet}>
          <Text style={s.sheetTitle}>Hand over today's turn</Text>
          {alreadyRequested ? (
            <Text style={s.meta}>
              Your request is already out. If nobody takes it, the turn stays yours —
              ask a sibling directly if it's urgent.
            </Text>
          ) : (
            <>
              <Text style={s.meta}>
                Whoever accepts covers today, and repays you by taking your next turn.
              </Text>
              <Btn title="Ask anyone in the house" onPress={() => onSubmit(null)} />
              <Text style={s.or}>or pick someone specific:</Text>
              {others.map((m) => (
                <Btn key={m.id} title={`Ask ${m.name}`} kind="ghost" onPress={() => onSubmit(m.id)} />
              ))}
            </>
          )}
          <Btn title="Close" kind="ghost" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { padding: 20, gap: 16, paddingBottom: 40 },
  turnLabel: { color: C.dim, fontSize: 12, fontWeight: '700', letterSpacing: 1.5 },
  name: { fontSize: 40, fontWeight: '800', letterSpacing: -0.5 },
  meta: { color: C.dim, fontSize: 14, textAlign: 'center' },
  runTitle: { color: C.text, fontSize: 16, fontWeight: '600' },
  countdown: { fontSize: 28, fontWeight: '800', fontVariant: ['tabular-nums'] },
  or: { color: C.dim, fontSize: 13, textAlign: 'center' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: C.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: C.border,
    padding: 20,
    gap: 12,
  },
  sheetTitle: { color: C.text, fontSize: 20, fontWeight: '700' },
});
