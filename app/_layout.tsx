import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from '../src/components/Toast';
import LoadingOverlay from '../src/components/LoadingOverlay';
import { useAutoSync } from '../src/hooks/useAutoSync';

function AutoSyncProvider() {
  useAutoSync();
  return null;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <AutoSyncProvider />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#1a1a2e' },
        }}
      >
        <Stack.Screen name="(tabs)" />
      </Stack>
      <Toast />
      <LoadingOverlay />
    </SafeAreaProvider>
  );
}
