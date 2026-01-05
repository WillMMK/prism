import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SyncStatus } from '../hooks/useAutoSync';

interface SyncStatusIndicatorProps {
    status: SyncStatus;
    lastSyncTime: string | null;
    pendingCount?: number;
    onPress?: () => void;
    compact?: boolean;
}

export const SyncStatusIndicator: React.FC<SyncStatusIndicatorProps> = ({
    status,
    lastSyncTime,
    pendingCount = 0,
    onPress,
    compact = false,
}) => {
    const getStatusConfig = () => {
        switch (status) {
            case 'syncing':
                return {
                    color: '#667eea',
                    icon: null, // Use ActivityIndicator instead
                    label: 'Syncing...',
                };
            case 'success':
                return {
                    color: '#2f9e44',
                    icon: 'checkmark-circle' as const,
                    label: 'Synced',
                };
            case 'error':
                return {
                    color: '#d64550',
                    icon: 'alert-circle' as const,
                    label: 'Sync failed',
                };
            case 'offline':
                return {
                    color: '#868e96',
                    icon: 'cloud-offline' as const,
                    label: 'Offline',
                };
            case 'idle':
            default:
                return {
                    color: '#868e96',
                    icon: 'cloud-outline' as const,
                    label: 'Tap to sync',
                };
        }
    };

    const formatLastSync = (isoString: string | null): { text: string; isFresh: boolean } => {
        if (!isoString) return { text: 'Tap to sync', isFresh: false };

        const date = new Date(isoString);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);

        // Consider "fresh" if checked within last 5 minutes
        if (diffMins < 5) return { text: 'Up to date', isFresh: true };
        if (diffMins < 60) return { text: `Checked ${diffMins}m ago`, isFresh: false };

        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return { text: `Checked ${diffHours}h ago`, isFresh: false };

        const diffDays = Math.floor(diffHours / 24);
        return { text: `Checked ${diffDays}d ago`, isFresh: false };
    };

    const config = getStatusConfig();
    const syncInfo = formatLastSync(lastSyncTime);
    const displayColor = syncInfo.isFresh ? '#2f9e44' : '#868e96'; // Green if fresh, gray otherwise

    if (compact) {
        return (
            <TouchableOpacity
                onPress={onPress}
                style={styles.compactContainer}
                disabled={status === 'syncing'}
            >
                {status === 'syncing' ? (
                    <>
                        <ActivityIndicator size="small" color="#667eea" />
                        <Text style={styles.compactText}>Syncing</Text>
                    </>
                ) : (
                    <>
                        <Ionicons
                            name={syncInfo.isFresh ? 'checkmark-circle' : 'cloud-done-outline'}
                            size={16}
                            color={displayColor}
                        />
                        <Text style={[styles.compactText, { color: displayColor }]}>
                            {syncInfo.text}
                        </Text>
                    </>
                )}
                {pendingCount > 0 && (
                    <View style={styles.badge}>
                        <Text style={styles.badgeText}>{pendingCount}</Text>
                    </View>
                )}
            </TouchableOpacity>
        );
    }

    return (
        <TouchableOpacity
            onPress={onPress}
            style={styles.container}
            disabled={status === 'syncing'}
        >
            <View style={styles.iconContainer}>
                {status === 'syncing' ? (
                    <ActivityIndicator size="small" color="#667eea" />
                ) : (
                    <Ionicons
                        name={syncInfo.isFresh ? 'checkmark-circle' : config.icon!}
                        size={24}
                        color={syncInfo.isFresh ? '#2f9e44' : config.color}
                    />
                )}
                {pendingCount > 0 && (
                    <View style={styles.badge}>
                        <Text style={styles.badgeText}>{pendingCount}</Text>
                    </View>
                )}
            </View>
            <View style={styles.textContainer}>
                <Text style={[styles.label, { color: syncInfo.isFresh ? '#2f9e44' : config.color }]}>
                    {status === 'syncing' ? 'Syncing...' : syncInfo.text}
                </Text>
                {!syncInfo.isFresh && status !== 'syncing' && (
                    <Text style={styles.lastSync}>Tap to check for updates</Text>
                )}
            </View>
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        backgroundColor: '#f8f9fa',
        borderRadius: 12,
        gap: 12,
    },
    compactContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 6,
        backgroundColor: '#f8f9fa',
        borderRadius: 16,
        gap: 4,
    },
    compactText: {
        fontSize: 11,
        fontWeight: '600',
    },
    iconContainer: {
        position: 'relative',
    },
    textContainer: {
        flex: 1,
    },
    label: {
        fontSize: 14,
        fontWeight: '600',
    },
    lastSync: {
        fontSize: 12,
        color: '#868e96',
        marginTop: 2,
    },
    badge: {
        position: 'absolute',
        top: -4,
        right: -4,
        backgroundColor: '#ff6b6b',
        borderRadius: 8,
        minWidth: 16,
        height: 16,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 4,
    },
    badgeText: {
        color: 'white',
        fontSize: 10,
        fontWeight: 'bold',
    },
});

export default SyncStatusIndicator;
