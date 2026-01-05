import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from '../src/components/Toast';
import LoadingOverlay from '../src/components/LoadingOverlay';

import { useAutoSync } from '../src/hooks/useAutoSync';
import { ThemeProvider, useTheme } from '../src/theme';
import { View } from 'react-native';

function AutoSyncProvider() {
  useAutoSync();
  return null;
}

function AuthenticatedLayout() {
  const { colors, isDark } = useTheme();

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
