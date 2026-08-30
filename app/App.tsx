import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { DarkTheme, NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { C } from './src/theme';
import { AppProvider, useApp } from './src/state/AppContext';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { TodayScreen } from './src/screens/TodayScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { FamilyScreen } from './src/screens/FamilyScreen';

const Tabs = createBottomTabNavigator();

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: C.bg,
    card: C.card,
    border: C.border,
    text: C.text,
    primary: C.accent,
  },
};

function Root() {
  const { phase, error } = useApp();

  if (phase === 'boot') {
    return (
      <View style={s.center}>
        <ActivityIndicator color={C.accent} size="large" />
        <Text style={s.bootText}>waking this phone up…</Text>
      </View>
    );
  }

  if (phase === 'error') {
    return (
      <View style={s.center}>
        <Text style={s.errorTitle}>Can't reach the server</Text>
        <Text style={s.errorBody}>{error}</Text>
        <Text style={s.errorBody}>Alarms already scheduled on this phone still work.</Text>
      </View>
    );
  }

  if (phase === 'needOnboarding') return <OnboardingScreen />;

  return (
    <Tabs.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.accent,
        tabBarInactiveTintColor: C.dim,
        tabBarStyle: { backgroundColor: C.card, borderTopColor: C.border },
      }}
    >
      <Tabs.Screen name="Today" component={TodayScreen} />
      <Tabs.Screen name="History" component={HistoryScreen} />
      <Tabs.Screen name="Family" component={FamilyScreen} />
    </Tabs.Navigator>
  );
}

export default function App() {
  return (
    <AppProvider>
      <NavigationContainer theme={navTheme}>
        <StatusBar style="light" />
        <Root />
      </NavigationContainer>
    </AppProvider>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  bootText: { color: C.dim, fontSize: 14 },
  errorTitle: { color: C.bad, fontSize: 20, fontWeight: '700' },
  errorBody: { color: C.dim, fontSize: 14, textAlign: 'center' },
});
