import { useEffect, useRef, useCallback, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useBudgetStore } from '../store/budgetStore';
import { usePremiumStore } from '../store/premiumStore';
import { googleSheetsService } from '../services/googleSheets';
import { useLoadingOverlay } from '../store/loadingOverlayStore';
import { flushPendingTransactions } from '../services/transactionSync';
import { registerBackgroundSync, unregisterBackgroundSync } from '../services/backgroundSync';

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error' | 'offline';

interface UseAutoSyncOptions {
  onSyncComplete?: (success: boolean) => void;
  onSyncError?: (error: Error) => void;
  onExternalUpdate?: () => void;
  onSyncResult?: (result: { totalCount: number; newCount: number; isFirstSync: boolean }) => void;
}

export const useAutoSync = (options?: UseAutoSyncOptions) => {
  const { sheetsConfig, setTransactions, setSheetsConfig, transactions: currentTransactions } = useBudgetStore();
  const { isPremium, autoSyncEnabled, syncIntervalMinutes } = usePremiumStore();
  const { show: showLoading, hide: hideLoading } = useLoadingOverlay();

  const appState = useRef(AppState.currentState);
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isSyncingRef = useRef(false);

  // Track sync state
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(sheetsConfig.lastSync || null);
  const [isConnected, setIsConnected] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const lastSyncTimestampRef = useRef<number>(0);

  // Minimum 30 seconds between syncs to prevent API spam
  const MIN_SYNC_COOLDOWN = 30000;

  // Monitor network connectivity
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const connected = state.isConnected && state.isInternetReachable !== false;
      setIsConnected(connected ?? true);

      if (connected && syncStatus === 'offline') {
        setSyncStatus('idle');
      } else if (!connected && syncStatus !== 'syncing') {
        setSyncStatus('offline');
      }
    });

    return () => unsubscribe();
  }, [syncStatus]);

  // Register/unregister background sync based on premium status
  // Note: Background fetch only works in development/production builds, not Expo Go
  useEffect(() => {
    const setupBackgroundSync = async () => {
      try {
        if (isPremium && autoSyncEnabled) {
          await registerBackgroundSync();
        } else {
          await unregisterBackgroundSync();
        }
      } catch (error) {
        // Background fetch not available in Expo Go - this is expected
        console.log('[AutoSync] Background fetch not available (Expo Go?):', error);
      }
    };
    setupBackgroundSync();
  }, [isPremium, autoSyncEnabled]);

  const performSync = useCallback(async (showOverlay = true, force = false): Promise<boolean> => {
    // Skip if not connected to sheets or already syncing
    if (!sheetsConfig.isConnected || !sheetsConfig.spreadsheetId) {
      return false;
    }

    if (isSyncingRef.current) {
      return false;
    }

    // Enforce cooldown unless forced (manual tap)
    const now = Date.now();
    if (!force && now - lastSyncTimestampRef.current < MIN_SYNC_COOLDOWN) {
      console.log('[AutoSync] Skipping - too soon since last sync');
      return false;
    }

    // Check network connectivity
    if (!isConnected) {
      setSyncStatus('offline');
      return false;
    }

    try {
      isSyncingRef.current = true;
      setSyncStatus('syncing');

      // First, flush any pending transactions
      const { processed, remaining } = await flushPendingTransactions();
      setPendingCount(remaining);

      if (processed > 0) {
        console.log(`[AutoSync] Flushed ${processed} pending transactions`);
      }

      // Check if there are external updates
      const hasUpdates = await googleSheetsService.checkForUpdates(
        sheetsConfig.spreadsheetId,
        sheetsConfig.lastSync || null
      );

      if (!hasUpdates) {
        // Update last checked time even when no new data
        const now = new Date().toISOString();
        setSheetsConfig({ lastSync: now });
        setLastSyncTime(now);
        lastSyncTimestampRef.current = Date.now();
        isSyncingRef.current = false;
        setSyncStatus('success');
        return true; // No updates needed, data is up-to-date
      }

      // Notify that external updates were detected
      options?.onExternalUpdate?.();

      if (showOverlay) {
        showLoading('Syncing with Google Sheets...');
      }

      // Get selected tabs or default to the first sheet
      const sheetNames = sheetsConfig.selectedTabs?.length
        ? sheetsConfig.selectedTabs
        : [sheetsConfig.sheetName || 'Sheet1'];

      // Track previous count for diff
      const previousCount = currentTransactions.length;
      const isFirstSync = previousCount === 0;

      // Import data from sheets
      const transactions = await googleSheetsService.importAllSheets(
        sheetsConfig.spreadsheetId,
        sheetNames
      );

      // Calculate new transaction count
      const newCount = Math.max(0, transactions.length - previousCount);

      // Update store with new transactions
      setTransactions(transactions, {
        sourceFile: 'Google Sheets (Auto-sync)',
        sheetNames,
      });

      // Notify with sync result
      options?.onSyncResult?.({
        totalCount: transactions.length,
        newCount,
        isFirstSync,
      });

      // Update last sync time
      const now = new Date().toISOString();
      setSheetsConfig({
        lastSync: now,
      });
      setLastSyncTime(now);

      if (showOverlay) {
        hideLoading();
      }

      setSyncStatus('success');
      lastSyncTimestampRef.current = Date.now();
      options?.onSyncComplete?.(true);
      isSyncingRef.current = false;
      return true;
    } catch (error) {
      if (showOverlay) {
        hideLoading();
      }
      isSyncingRef.current = false;
      setSyncStatus('error');
      options?.onSyncError?.(error as Error);
      options?.onSyncComplete?.(false);
      return false;
    }
  }, [sheetsConfig, setTransactions, setSheetsConfig, showLoading, hideLoading, options, isConnected]);

  // Sync on app foreground (when premium + enabled)
  useEffect(() => {
    if (!isPremium || !autoSyncEnabled) return;

    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      // App came to foreground
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        performSync(false); // Silent sync on foreground
      }
      appState.current = nextAppState;
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription.remove();
    };
  }, [isPremium, autoSyncEnabled, performSync]);

  // Periodic sync interval (when premium + enabled)
  useEffect(() => {
    if (!isPremium || !autoSyncEnabled || !sheetsConfig.isConnected) {
      // Clear interval if conditions not met
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
        syncIntervalRef.current = null;
      }
      return;
    }

    // Set up periodic sync
    const intervalMs = syncIntervalMinutes * 60 * 1000;

    syncIntervalRef.current = setInterval(() => {
      // Only sync if app is in foreground
      if (appState.current === 'active') {
        performSync(false); // Silent periodic sync
      }
    }, intervalMs);

    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
        syncIntervalRef.current = null;
      }
    };
  }, [isPremium, autoSyncEnabled, syncIntervalMinutes, sheetsConfig.isConnected, performSync]);

  // Initial sync on app open (if premium + enabled)
  useEffect(() => {
    if (isPremium && autoSyncEnabled && sheetsConfig.isConnected) {
      // Delay initial sync to avoid blocking app startup
      const timeout = setTimeout(() => {
        performSync(false);
      }, 2000);

      return () => clearTimeout(timeout);
    }
  }, []); // Only run once on mount

  return {
    syncNow: performSync,
    syncStatus,
    lastSyncTime,
    isConnected,
    pendingCount,
    isSyncing: syncStatus === 'syncing',
  };
};

export default useAutoSync;
