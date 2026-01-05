import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import NetInfo from '@react-native-community/netinfo';
import { flushPendingTransactions } from './transactionSync';
import { googleSheetsService } from './googleSheets';

const BACKGROUND_SYNC_TASK = 'PRISM_BACKGROUND_SYNC';

// Define the background task
TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
    try {
        // Check network connectivity first
        const netState = await NetInfo.fetch();
        if (!netState.isConnected || !netState.isInternetReachable) {
            console.log('[BackgroundSync] No network connection, skipping');
            return BackgroundFetch.BackgroundFetchResult.NoData;
        }

        // Try to flush any pending transactions
        const { processed, errors } = await flushPendingTransactions();

        if (processed > 0) {
            console.log(`[BackgroundSync] Flushed ${processed} pending transactions`);
            return BackgroundFetch.BackgroundFetchResult.NewData;
        }

        if (errors > 0) {
            console.log(`[BackgroundSync] ${errors} transactions failed to sync`);
            return BackgroundFetch.BackgroundFetchResult.Failed;
        }

        return BackgroundFetch.BackgroundFetchResult.NoData;
    } catch (error) {
        console.error('[BackgroundSync] Task error:', error);
        return BackgroundFetch.BackgroundFetchResult.Failed;
    }
});

/**
 * Register the background sync task.
 * Should be called once during app initialization.
 */
export async function registerBackgroundSync(): Promise<boolean> {
    try {
        const status = await BackgroundFetch.getStatusAsync();

        if (status === BackgroundFetch.BackgroundFetchStatus.Restricted) {
            console.log('[BackgroundSync] Background fetch is restricted');
            return false;
        }

        if (status === BackgroundFetch.BackgroundFetchStatus.Denied) {
            console.log('[BackgroundSync] Background fetch is denied');
            return false;
        }

        // Check if already registered
        const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);
        if (isRegistered) {
            console.log('[BackgroundSync] Task already registered');
            return true;
        }

        // Register with minimum 15 minute interval (iOS minimum)
        await BackgroundFetch.registerTaskAsync(BACKGROUND_SYNC_TASK, {
            minimumInterval: 15 * 60, // 15 minutes
            stopOnTerminate: false,
            startOnBoot: true,
        });

        console.log('[BackgroundSync] Task registered successfully');
        return true;
    } catch (error) {
        // This is expected in Expo Go - background fetch requires a native build
        console.log('[BackgroundSync] Not available (requires native build):', (error as Error).message);
        return false;
    }
}

/**
 * Unregister the background sync task.
 * Call when user disables auto-sync.
 */
export async function unregisterBackgroundSync(): Promise<void> {
    try {
        const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);
        if (isRegistered) {
            await BackgroundFetch.unregisterTaskAsync(BACKGROUND_SYNC_TASK);
            console.log('[BackgroundSync] Task unregistered');
        }
    } catch (error) {
        console.error('[BackgroundSync] Unregistration failed:', error);
    }
}

/**
 * Check if background sync is currently registered.
 */
export async function isBackgroundSyncRegistered(): Promise<boolean> {
    try {
        return await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);
    } catch {
        return false;
    }
}

/**
 * Get the current background fetch status.
 */
export async function getBackgroundSyncStatus(): Promise<{
    available: boolean;
    registered: boolean;
    status: BackgroundFetch.BackgroundFetchStatus | null;
}> {
    const status = await BackgroundFetch.getStatusAsync();
    const registered = await isBackgroundSyncRegistered();

    return {
        available: status === BackgroundFetch.BackgroundFetchStatus.Available,
        registered,
        status,
    };
}
