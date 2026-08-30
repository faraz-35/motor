import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { C } from '../theme';
import { Btn, Card, Field } from '../components/ui';
import { useApp } from '../state/AppContext';
import { createHousehold, joinHousehold } from '../db/api';
import type { Profile } from '../types';

export function OnboardingScreen() {
  const { actions } = useApp();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);

  const trimmed = name.trim();
  const validName = trimmed.length >= 1 && trimmed.length <= 30;

  const submit = async (mode: 'create' | 'join') => {
    if (!validName) return;
    const upperCode = code.trim().toUpperCase();
    if (mode === 'join' && !/^[A-Z2-9]{6}$/.test(upperCode)) {
      Alert.alert('Household code', 'Enter the 6-character code from the Family screen.');
      return;
    }
    setBusy(mode);
    try {
      const row = mode === 'create'
        ? await createHousehold(trimmed)
        : await joinHousehold(upperCode, trimmed);
      await actions.completeOnboarding({
        householdId: row.household_id,
        memberId: row.member_id,
        code: row.code,
      });
    } catch (e) {
      Alert.alert('Could not set up', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <Text style={s.logo}>Motor</Text>
        <Text style={s.tag}>Household water-motor turns, tracked fairly.</Text>

        <Card>
          <Field label="Your name" value={name} onChangeText={setName} placeholder="e.g. Ayesha" />
          <Btn
            title="Start a new household"
            onPress={() => submit('create')}
            loading={busy === 'create'}
            disabled={!validName || busy !== null}
          />
        </Card>

        <Card>
          <Text style={s.or}>joining an existing one?</Text>
          <Field label="Household code" value={code} onChangeText={(t) => setCode(t.toUpperCase())} placeholder="ABC123" />
          <Btn
            title="Join household"
            kind="ghost"
            onPress={() => submit('join')}
            loading={busy === 'join'}
            disabled={!validName || busy !== null}
          />
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  scroll: { padding: 20, gap: 16, paddingTop: 80 },
  logo: { color: C.accent, fontSize: 44, fontWeight: '800', letterSpacing: -1 },
  tag: { color: C.dim, fontSize: 16, marginBottom: 16 },
  or: { color: C.dim, fontSize: 14 },
});
