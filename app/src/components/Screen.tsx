import React from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C } from '../theme';

/** Full-screen container that respects the status-bar (notch) inset. */
export function Screen({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      {children}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
});
