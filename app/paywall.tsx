import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ActivityIndicator,
    ScrollView,
    Image,
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
        description: 'Get clear insights from your spending patterns',
    },
    {
        icon: 'calendar' as const,
        title: 'Yearly Review',
        description: 'Track your financial progress year over year',
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
    const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
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

    useEffect(() => {
        if (!packages.length) return;
        if (selectedPackageId) return;
        const yearly = packages.find((pkg) => pkg?.product?.identifier?.includes('yearly'));
        setSelectedPackageId((yearly || packages[0])?.product?.identifier ?? null);
    }, [packages, selectedPackageId]);

    const getPlanLabel = (identifier?: string) => {
        if (!identifier) return 'Plan';
        if (identifier.includes('yearly')) return 'Yearly';
        return 'Monthly';
    };

    const getPeriodLabel = (identifier?: string) => {
        if (!identifier) return 'per month';
        if (identifier.includes('yearly')) return 'per year';
        return 'per month';
    };

    const getYearlySavings = () => {
        const monthly = packages.find((pkg) => pkg?.product?.identifier?.includes('monthly'));
        const yearly = packages.find((pkg) => pkg?.product?.identifier?.includes('yearly'));
        const monthlyPrice = monthly?.product?.price;
        const yearlyPrice = yearly?.product?.price;
        if (!monthlyPrice || !yearlyPrice) return null;
        const annualFromMonthly = monthlyPrice * 12;
        if (annualFromMonthly <= 0) return null;
        const percentSaved = Math.round((1 - yearlyPrice / annualFromMonthly) * 100);
        const monthsFree = Math.round(12 - yearlyPrice / monthlyPrice);
        if (percentSaved <= 0 || monthsFree <= 0) return null;
        return { percentSaved, monthsFree };
    };

    const handlePurchase = async () => {
        if (packages.length === 0) return;
        const selectedPackage = packages.find(
            (pkg) => pkg?.product?.identifier === selectedPackageId
        ) ?? packages[0];

        setPurchasing(true);
        setError(null);

        const result = await purchasePackage(selectedPackage);

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

    const selectedPackage = packages.find(
        (pkg) => pkg?.product?.identifier === selectedPackageId
    ) ?? packages[0];
    const priceString = selectedPackage?.product?.priceString || '$4.99';
    const periodLabel = getPeriodLabel(selectedPackage?.product?.identifier);
    const yearlySavings = getYearlySavings();

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
                    <View style={styles.iconContainer}>
                        <Image
                            source={require('../assets/prism-plus.png')}
                            style={styles.iconImage}
                            resizeMode="contain"
                        />
                    </View>
                    <Text style={[styles.title, { color: colors.ink }]}>Prism Plus</Text>
                    <Text style={[styles.subtitle, { color: colors.muted }]}>
                        Stop guessing what your budget means
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
                <Text style={[styles.trustLine, { color: colors.muted }]}>
                    Your data stays in your Google account and on your device.
                </Text>

                {/* Pricing */}
                <View style={[styles.pricingCard, { backgroundColor: isDark ? colors.card : '#FFF', borderColor: colors.accent }]}>
                    <Text style={[styles.priceAmount, { color: colors.ink }]}>{priceString}</Text>
                    <Text style={[styles.priceLabel, { color: colors.muted }]}>{periodLabel}</Text>
                    <Text style={[styles.priceNote, { color: colors.muted }]}>Auto-renews until canceled</Text>
                    <View style={styles.planList}>
                        {packages.map((pkg) => {
                            const id = pkg?.product?.identifier;
                            const isSelected = id === selectedPackageId;
                            return (
                                <TouchableOpacity
                                    key={id || pkg.identifier}
                                    style={[
                                        styles.planOption,
                                        {
                                            borderColor: isSelected ? colors.accent : colors.border,
                                            backgroundColor: isSelected
                                                ? (isDark ? 'rgba(20, 184, 166, 0.12)' : 'rgba(20, 184, 166, 0.08)')
                                                : 'transparent',
                                        },
                                    ]}
                                    onPress={() => setSelectedPackageId(id ?? null)}
                                >
                                    <Text style={[styles.planTitle, { color: colors.ink }]}>
                                        {getPlanLabel(id)}
                                    </Text>
                                    <View style={styles.planPriceStack}>
                                        <Text style={[styles.planPrice, { color: colors.muted }]}>
                                            {pkg?.product?.priceString || '--'}
                                        </Text>
                                        {id?.includes('yearly') && yearlySavings ? (
                                            <Text style={[styles.planSavings, { color: colors.accent }]}>
                                                Save {yearlySavings.percentSaved}% • {yearlySavings.monthsFree} months free
                                            </Text>
                                        ) : null}
                                    </View>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
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
                            Restore Subscription
                        </Text>
                    )}
                </TouchableOpacity>

                {/* Terms */}
                <Text style={[styles.terms, { color: colors.muted }]}>
                    Payment will be charged to your Apple ID. Subscription auto-renews unless canceled. By purchasing, you agree to our Terms of Service and Privacy Policy.
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
        width: 120,
        height: 120,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    iconImage: {
        width: 120,
        height: 120,
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
    trustLine: {
        fontSize: 12,
        textAlign: 'center',
        marginBottom: 16,
    },
    pricingCard: {
        alignItems: 'center',
        padding: 24,
        borderRadius: 20,
        borderWidth: 2,
        marginBottom: 24,
    },
    planList: {
        width: '100%',
        marginTop: 16,
        gap: 10,
    },
    planOption: {
        borderWidth: 1,
        borderRadius: 14,
        paddingVertical: 12,
        paddingHorizontal: 14,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    planPriceStack: {
        alignItems: 'flex-end',
        gap: 2,
    },
    planTitle: {
        fontSize: 16,
        fontWeight: '600',
    },
    planPrice: {
        fontSize: 15,
        fontWeight: '500',
    },
    planSavings: {
        fontSize: 11,
        fontWeight: '600',
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
