import { useEffect, useRef } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppState, AppStateStatus, View } from 'react-native';
import Toast from '../src/components/Toast';
import LoadingOverlay from '../src/components/LoadingOverlay';

import { useAutoSync } from '../src/hooks/useAutoSync';
import { ThemeProvider, useTheme } from '../src/theme';
import { initializeRevenueCat, syncSubscriptionStatus } from '../src/services/revenuecat';

function AutoSyncProvider() {
  useAutoSync();
  return null;
}

function AuthenticatedLayout() {
  const { colors, isDark } = useTheme();
  const appState = useRef<AppStateStatus>(AppState.currentState);

  // Initialize RevenueCat SDK and sync subscription status on app startup
  useEffect(() => {
    const initialize = async () => {
      console.log('[App] Initializing RevenueCat...');
      await initializeRevenueCat();
      console.log('[App] Syncing subscription status...');
      await syncSubscriptionStatus();
    };
    initialize();

    // Also check subscription when app returns from background
    const subscription = AppState.addEventListener('change', async (nextAppState) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        console.log('[App] App foregrounded, syncing subscription...');
        await syncSubscriptionStatus();
      }
      appState.current = nextAppState;
    });

    return () => subscription?.remove();
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <AutoSyncProvider />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="add-transaction" options={{ presentation: 'modal' }} />
        <Stack.Screen name="dashboard-layout" options={{ presentation: 'card', title: 'Dashboard Layout' }} />
        <Stack.Screen name="category-styles" options={{ presentation: 'card', title: 'Category Styling' }} />
        <Stack.Screen name="monthly-report" options={{ headerShown: false }} />
        <Stack.Screen name="yearly-report" options={{ headerShown: false }} />
        <Stack.Screen name="paywall" options={{ presentation: 'modal', headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
      </Stack>
      <Toast />
      <LoadingOverlay />
    </View>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthenticatedLayout />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
