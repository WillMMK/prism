import React from 'react';
import { Tabs, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Alert, AppState } from 'react-native';
import { flushPendingTransactions } from '../../src/services/transactionSync';
import * as Clipboard from 'expo-clipboard';

import { useTheme } from '../../src/theme';
import { extractSpreadsheetId, googleSheetsService } from '../../src/services/googleSheets';
import { useBudgetStore } from '../../src/store/budgetStore';
import { useShallow } from 'zustand/react/shallow';

export default function TabsLayout() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const lastClipboardRef = React.useRef<string | null>(null);
  const lastPromptedRef = React.useRef<string | null>(null);
  const { sheetsConfig, importMetadata, hasHydrated, demoConfig } = useBudgetStore(
    useShallow((state) => ({
      sheetsConfig: state.sheetsConfig,
      importMetadata: state.importMetadata,
      hasHydrated: state._hasHydrated,
      demoConfig: state.demoConfig,
    }))
  );
  const isOnboarded = hasHydrated && (sheetsConfig.isConnected || demoConfig.isDemoMode) && Boolean(importMetadata);


  // Clipboard detection for Google Sheets URLs
  // Enabled when Google is authenticated (token exists) but no spreadsheet is linked yet
  // This helps users who have authorized but still need to paste their sheet URL

  React.useEffect(() => {
    let isMounted = true;
    const checkClipboard = async () => {
      if (!isMounted) return;

      // Check if a spreadsheet is already linked - if so, no need for smart paste
      if (sheetsConfig.spreadsheetId) return;

      // Check if Google is connected by looking for a stored token
      const token = await googleSheetsService.getStoredToken();
      if (!token) return;
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

    // Only check clipboard when returning from background, not on initial mount
    // This prevents a confusing permission dialog on first app open
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void checkClipboard();
      }
    });

    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, [router, sheetsConfig.spreadsheetId]);

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
          ...(isOnboarded ? null : { display: 'none' }),
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarButton: isOnboarded ? undefined : () => null,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
          title: 'Transactions',
          tabBarButton: isOnboarded ? undefined : () => null,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'list' : 'list-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: 'Reports',
          tabBarButton: isOnboarded ? undefined : () => null,
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
