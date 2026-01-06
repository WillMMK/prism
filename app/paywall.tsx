import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ActivityIndicator,
    ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../src/theme';
import { usePremiumStore } from '../src/store/premiumStore';
import {
    getPackages,
    purchasePackage,
    restorePurchases,
} from '../src/services/revenuecat';

// ─────────────────────────────────────────────────────────────────────────────
// Feature List
// ─────────────────────────────────────────────────────────────────────────────

const FEATURES = [
    {
        icon: 'document-text' as const,
        title: 'Monthly Financial Reports',
        description: 'Get opinionated insights on your spending patterns',
    },
    {
        icon: 'calendar' as const,
        title: 'Yearly Review',
        description: 'Track your financial progress year over year',
    },
    {
        icon: 'sync' as const,
        title: 'Auto-Sync',
        description: 'Keep your data up-to-date automatically',
    },
    {
        icon: 'shield-checkmark' as const,
        title: 'Priority Support',
        description: 'Get help when you need it',
    },
];

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function PaywallScreen() {
    const { colors, isDark } = useTheme();
    const insets = useSafeAreaInsets();
    const { setPremium } = usePremiumStore();

    const [packages, setPackages] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [purchasing, setPurchasing] = useState(false);
    const [restoring, setRestoring] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Load packages on mount
    useEffect(() => {
        loadPackages();
    }, []);

    const loadPackages = async () => {
        setLoading(true);
        const pkgs = await getPackages();
        setPackages(pkgs);
        setLoading(false);
    };

    const handlePurchase = async () => {
        if (packages.length === 0) return;

        setPurchasing(true);
        setError(null);

        const result = await purchasePackage(packages[0]);

        if (result.success) {
            setPremium(true, 'purchase');
            router.back();
        } else if (result.error && result.error !== 'Purchase cancelled') {
            setError(result.error);
        }

        setPurchasing(false);
    };

    const handleRestore = async () => {
        setRestoring(true);
        setError(null);

        const result = await restorePurchases();

        if (result.success) {
            setPremium(true, 'restored');
            router.back();
        } else if (result.error) {
            setError(result.error);
        }

        setRestoring(false);
    };

    const pkg = packages[0];
    const priceString = pkg?.product?.priceString || '$4.99';

    return (
        <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
            {/* Close Button */}
            <TouchableOpacity
                style={styles.closeButton}
                onPress={() => router.back()}
            >
                <Ionicons name="close" size={28} color={colors.ink} />
            </TouchableOpacity>

            <ScrollView
                contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 20 }]}
                showsVerticalScrollIndicator={false}
            >
                {/* Header */}
                <View style={styles.header}>
                    <View style={[styles.iconContainer, { backgroundColor: isDark ? 'rgba(20, 184, 166, 0.2)' : 'rgba(20, 184, 166, 0.1)' }]}>
                        <Ionicons name="diamond" size={48} color={colors.accent} />
                    </View>
                    <Text style={[styles.title, { color: colors.ink }]}>Prism Plus</Text>
                    <Text style={[styles.subtitle, { color: colors.muted }]}>
                        Unlock the full power of your finances
                    </Text>
                </View>

                {/* Features */}
                <View style={styles.features}>
                    {FEATURES.map((feature, index) => (
                        <View
                            key={index}
                            style={[
                                styles.featureItem,
                                { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : colors.wash },
                            ]}
                        >
                            <View style={[styles.featureIcon, { backgroundColor: isDark ? 'rgba(20, 184, 166, 0.2)' : 'rgba(20, 184, 166, 0.1)' }]}>
                                <Ionicons name={feature.icon} size={20} color={colors.accent} />
                            </View>
                            <View style={styles.featureText}>
                                <Text style={[styles.featureTitle, { color: colors.ink }]}>
                                    {feature.title}
                                </Text>
                                <Text style={[styles.featureDesc, { color: colors.muted }]}>
                                    {feature.description}
                                </Text>
                            </View>
                        </View>
                    ))}
                </View>

                {/* Pricing */}
                <View style={[styles.pricingCard, { backgroundColor: isDark ? colors.card : '#FFF', borderColor: colors.accent }]}>
                    <Text style={[styles.priceAmount, { color: colors.ink }]}>{priceString}</Text>
                    <Text style={[styles.priceLabel, { color: colors.muted }]}>One-time purchase</Text>
                    <Text style={[styles.priceNote, { color: colors.muted }]}>Pay once, yours forever</Text>
                </View>

                {/* Error */}
                {error && (
                    <View style={[styles.errorBox, { backgroundColor: 'rgba(214, 69, 80, 0.1)' }]}>
                        <Text style={styles.errorText}>{error}</Text>
                    </View>
                )}

                {/* Purchase Button */}
                <TouchableOpacity
                    style={[styles.purchaseButton, { backgroundColor: colors.accent }]}
                    onPress={handlePurchase}
                    disabled={purchasing || loading}
                >
                    {purchasing ? (
                        <ActivityIndicator color="#FFF" />
                    ) : (
                        <Text style={styles.purchaseButtonText}>Get Prism Plus</Text>
                    )}
                </TouchableOpacity>

                {/* Restore */}
                <TouchableOpacity
                    style={styles.restoreButton}
                    onPress={handleRestore}
                    disabled={restoring}
                >
                    {restoring ? (
                        <ActivityIndicator color={colors.muted} size="small" />
                    ) : (
                        <Text style={[styles.restoreText, { color: colors.muted }]}>
                            Restore Purchase
                        </Text>
                    )}
                </TouchableOpacity>

                {/* Terms */}
                <Text style={[styles.terms, { color: colors.muted }]}>
                    Payment will be charged to your Apple ID. By purchasing, you agree to our Terms of Service and Privacy Policy.
                </Text>
            </ScrollView>
        </View>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    closeButton: {
        position: 'absolute',
        top: 60,
        right: 20,
        zIndex: 10,
        padding: 8,
    },
    content: {
        paddingHorizontal: 24,
        paddingTop: 60,
    },
    header: {
        alignItems: 'center',
        marginBottom: 32,
    },
    iconContainer: {
        width: 96,
        height: 96,
        borderRadius: 48,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    title: {
        fontSize: 32,
        fontWeight: '700',
        letterSpacing: -0.5,
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 16,
        textAlign: 'center',
    },
    features: {
        gap: 12,
        marginBottom: 32,
    },
    featureItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderRadius: 16,
    },
    featureIcon: {
        width: 44,
        height: 44,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 14,
    },
    featureText: {
        flex: 1,
    },
    featureTitle: {
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 2,
    },
    featureDesc: {
        fontSize: 13,
    },
    pricingCard: {
        alignItems: 'center',
        padding: 24,
        borderRadius: 20,
        borderWidth: 2,
        marginBottom: 24,
    },
    priceAmount: {
        fontSize: 48,
        fontWeight: '700',
        letterSpacing: -1,
    },
    priceLabel: {
        fontSize: 16,
        marginTop: 4,
    },
    priceNote: {
        fontSize: 13,
        marginTop: 8,
    },
    errorBox: {
        padding: 12,
        borderRadius: 12,
        marginBottom: 16,
    },
    errorText: {
        color: '#D64550',
        fontSize: 14,
        textAlign: 'center',
    },
    purchaseButton: {
        height: 56,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    purchaseButtonText: {
        color: '#FFF',
        fontSize: 18,
        fontWeight: '700',
    },
    restoreButton: {
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24,
    },
    restoreText: {
        fontSize: 15,
        fontWeight: '500',
    },
    terms: {
        fontSize: 11,
        textAlign: 'center',
        lineHeight: 16,
    },
});
