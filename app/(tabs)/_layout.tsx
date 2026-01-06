import React from 'react';
import { Tabs, useRouter, useSegments } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Alert, AppState } from 'react-native';
import { flushPendingTransactions } from '../../src/services/transactionSync';
import * as Clipboard from 'expo-clipboard';

import { useTheme } from '../../src/theme';
import { extractSpreadsheetId } from '../../src/services/googleSheets';
import { useBudgetStore } from '../../src/store/budgetStore';

export default function TabsLayout() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const segments = useSegments();
  const lastClipboardRef = React.useRef<string | null>(null);
  const lastPromptedRef = React.useRef<string | null>(null);
  const isOnSettings = segments.includes('settings');
  const sheetsConfig = useBudgetStore((state) => state.sheetsConfig);
  const hasConnectedSheet = Boolean(sheetsConfig.isConnected || sheetsConfig.spreadsheetId);

  React.useEffect(() => {
    let isMounted = true;
    const checkClipboard = async () => {
      if (!isMounted || isOnSettings || hasConnectedSheet) return;
      const clipboardText = (await Clipboard.getStringAsync()).trim();
      if (!clipboardText || clipboardText === lastClipboardRef.current) return;
      lastClipboardRef.current = clipboardText;
      if (!extractSpreadsheetId(clipboardText)) return;
      if (clipboardText === lastPromptedRef.current) return;
      lastPromptedRef.current = clipboardText;
      Alert.alert(
        'Google Sheets URL detected',
        'Paste this sheet into Settings?',
        [
          { text: 'Not now', style: 'cancel' },
          {
            text: 'Paste',
            onPress: () => {
              router.push({
                pathname: '/(tabs)/settings',
                params: { sheetUrl: clipboardText, autoLoad: '1' },
              });
            },
          },
        ]
      );
    };

    void checkClipboard();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void checkClipboard();
      }
    });

    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, [router, isOnSettings]);

  React.useEffect(() => {
    const tryFlush = () => {
      void flushPendingTransactions();
    };

    tryFlush();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        tryFlush();
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  return (
    <Tabs
      screenOptions={{
        headerStyle: {
          backgroundColor: colors.card,
        },
        headerTintColor: colors.ink,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
          title: 'Transactions',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'list' : 'list-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: 'Reports',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'bar-chart' : 'bar-chart-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'settings' : 'settings-outline'} size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
