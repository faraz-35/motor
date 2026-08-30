import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  ViewStyle,
} from 'react-native';
import { C, R } from '../theme';

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

type BtnProps = {
  title: string;
  onPress: () => void;
  kind?: 'primary' | 'ghost' | 'danger';
  loading?: boolean;
  disabled?: boolean;
};

export function Btn({ title, onPress, kind = 'primary', loading, disabled }: BtnProps) {
  const bg = kind === 'primary' ? C.accentBg : kind === 'danger' ? C.badBg : 'transparent';
  const fg = kind === 'primary' ? C.accent : kind === 'danger' ? C.bad : C.dim;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn, { backgroundColor: bg, borderColor: fg, opacity: disabled || loading ? 0.5 : pressed ? 0.8 : 1 },
      ]}
    >
      {loading ? <ActivityIndicator color={fg} size="small" /> : (
        <Text style={[styles.btnText, { color: fg }]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Pill({ text, tone }: { text: string; tone: 'good' | 'warn' | 'bad' | 'dim' }) {
  const map = { good: [C.good, C.goodBg], warn: [C.warn, C.warnBg], bad: [C.bad, C.badBg], dim: [C.dim, C.cardRaised] };
  const [fg, bg] = map[tone];
  return <View style={[styles.pill, { backgroundColor: bg }]}><Text style={[styles.pillText, { color: fg }]}>{text}</Text></View>;
}

export function Field({
  label, value, onChangeText, placeholder, keyboardType = 'default',
}: {
  label: string; value: string; onChangeText: (s: string) => void;
  placeholder?: string; keyboardType?: 'default' | 'number-pad';
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={C.dim}
        keyboardType={keyboardType}
        autoCapitalize="none"
        autoCorrect={false}
      />
    </View>
  );
}

export function Row({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 10 }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.card,
    borderRadius: R.card,
    borderWidth: 1,
    borderColor: C.border,
    padding: 18,
    gap: 10,
  },
  sectionTitle: {
    color: C.dim,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: -4,
  },
  btn: {
    borderRadius: R.btn,
    borderWidth: 1,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { fontSize: 15, fontWeight: '600' },
  pill: {
    borderRadius: R.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  pillText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },
  label: { color: C.dim, fontSize: 13, fontWeight: '500' },
  input: {
    backgroundColor: C.cardRaised,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    color: C.text,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
});
