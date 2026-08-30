import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { C } from '../theme';
import { Card, Pill, Row, SectionTitle } from '../components/ui';
import { useApp } from '../state/AppContext';
import { addDays, dayNumber, effectiveAssign } from '../logic/rotation';

type DayStatus = 'completed' | 'started' | 'missed' | 'scheduled';

function dayStatus(date: string, today: string, completed: boolean, started: boolean): DayStatus {
  if (completed) return 'completed';
  if (started) return 'started';
  return date < today ? 'missed' : 'scheduled';
}

export function HistoryScreen() {
  const { today, members, overrides, runs } = useApp();
  const byDate = new Map(runs.map((r) => [r.on_date, r]));
  const memberName = (id: string | null) => members.find((m) => m.id === id)?.name ?? '—';

  const days = Array.from({ length: 28 }, (_, i) => addDays(today, -(27 - i)));

  const weekRows: { week: string; days: typeof days }[] = [];
  for (let i = 0; i < days.length; i += 7) {
    const chunk = days.slice(i, i + 7);
    weekRows.push({
      week: i === days.length - 7 ? 'This week' : `Week of ${chunk[0]}`,
      days: chunk,
    });
  }

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      <SectionTitle>Last 4 weeks</SectionTitle>
      {weekRows.map(({ week, days: chunk }) => (
        <View key={week} style={{ gap: 8 }}>
          <Text style={s.week}>{week}</Text>
          {chunk.map((d) => {
            const run = byDate.get(d);
            const assignee = effectiveAssign(d, members, overrides);
            const status = dayStatus(d, today, run?.status === 'completed', run?.status === 'started');
            const covered = run?.started_by && run.assigned_member_id && run.started_by !== run.assigned_member_id;
            return (
              <Card key={d} style={s.row}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <View>
                    <Text style={s.date}>{d === today ? 'Today' : d.slice(5)}</Text>
                    <Text style={s.who}>
                      {assignee ? memberName(assignee.id) : '—'}
                      {covered ? ` (covered by ${memberName(run.started_by)})` : ''}
                    </Text>
                  </View>
                  <Pill
                    text={status === 'completed' ? 'done' : status === 'started' ? 'running' : status === 'missed' ? 'missed' : 'upcoming'}
                    tone={status === 'completed' ? 'good' : status === 'started' ? 'warn' : status === 'missed' ? 'bad' : 'dim'}
                  />
                </Row>
              </Card>
            );
          })}
        </View>
      ))}
      <Text style={s.note}>
        Turn order cycles by join order ({members.filter((m) => m.active).length} active members,
        {' '}{members.filter((m) => m.active).length ? `day ${dayNumber(today) % Math.max(members.filter((m) => m.active).length, 1) + 1} of the cycle` : 'no members'}).
      </Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { padding: 20, gap: 8, paddingBottom: 40 },
  week: { color: C.dim, fontSize: 13, fontWeight: '600', marginTop: 10, textTransform: 'uppercase', letterSpacing: 0.4 },
  row: { paddingVertical: 12 },
  date: { color: C.text, fontSize: 15, fontWeight: '600' },
  who: { color: C.dim, fontSize: 13, marginTop: 2 },
  note: { color: C.dim, fontSize: 12, marginTop: 12, textAlign: 'center' },
});
