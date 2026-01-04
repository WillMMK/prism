import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from '../src/components/Toast';
import LoadingOverlay from '../src/components/LoadingOverlay';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
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
