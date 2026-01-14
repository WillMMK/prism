import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ActivityIndicator,
    ScrollView,
    Image,
    Modal,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../src/theme';
import { usePremiumStore } from '../src/store/premiumStore';
import { buildDemoTransactions } from '../src/services/demoData';
import { Transaction, MonthlyReport } from '../src/types/budget';
import {
    generateMonthlyReport,
    generateYearlyReport,
    getPreviousMonth,
    getSameMonthLastYear,
    getSixMonthAverage,
} from '../src/services/reportGenerator';
import { ReportStatus } from '../src/types/report';
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
        timing: 'Delivered on the 1st of each month',
    },
    {
        icon: 'calendar' as const,
        title: 'Yearly Review',
        description: 'Track your financial progress year over year',
        timing: 'Delivered on January 1st',
    },
];

const STATUS_COLORS: Record<ReportStatus, { bg: string; text: string }> = {
    progress: { bg: '#D1FAE5', text: '#065F46' },
    maintenance: { bg: '#FEF3C7', text: '#92400E' },
    regression: { bg: '#FEE2E2', text: '#991B1B' },
};

const STATUS_LABELS: Record<ReportStatus, string> = {
    progress: 'Progress',
    maintenance: 'Maintenance',
    regression: 'Regression',
};

const getSignedAmount = (transaction: Transaction): number =>
    typeof transaction.signedAmount === 'number'
        ? transaction.signedAmount
        : transaction.type === 'income'
            ? transaction.amount
            : -transaction.amount;

const getNetExpenseTotal = (transactions: Transaction[]): number => {
    let outflow = 0;
    let rebates = 0;

    transactions.forEach((transaction) => {
        if (transaction.type !== 'expense' && transaction.type !== 'rebate') return;
        const signed = getSignedAmount(transaction);
        if (signed < 0) {
            outflow += Math.abs(signed);
        } else {
            rebates += signed;
        }
    });

    return Math.max(0, outflow - rebates);
};

const getMonthKey = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

const formatMonthHeader = (monthStr: string): string => {
    const [year, month] = monthStr.split('-');
    const monthIndex = parseInt(month, 10) - 1;
    const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return `${monthNames[monthIndex]} ${year}`;
};

const buildMonthlyReports = (transactions: Transaction[]): MonthlyReport[] => {
    const reports = new Map<string, { income: number; outflow: number; rebates: number }>();

    transactions.forEach((t) => {
        const date = new Date(t.date);
        if (isNaN(date.getTime())) return;
        const monthKey = getMonthKey(date);
        const current = reports.get(monthKey) || { income: 0, outflow: 0, rebates: 0 };
        if (t.type === 'income') {
            current.income += Math.max(0, getSignedAmount(t));
        } else {
            const signed = getSignedAmount(t);
            if (signed < 0) {
                current.outflow += Math.abs(signed);
            } else {
                current.rebates += signed;
            }
        }
        reports.set(monthKey, current);
    });

    return Array.from(reports.entries())
        .map(([month, data]) => {
            const expenses = Math.max(0, data.outflow - data.rebates);
            return {
                month,
                income: data.income,
                expenses,
                savings: data.income - expenses,
            };
        })
        .sort((a, b) => b.month.localeCompare(a.month));
};

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
    const [sampleReportType, setSampleReportType] = useState<'monthly' | 'yearly' | null>(null);
    const demoTransactions = React.useMemo(() => buildDemoTransactions(), []);
    const lastFullMonthKey = React.useMemo(() => {
        const now = new Date();
        const monthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        return getMonthKey(monthDate);
    }, []);
    const lastFullYear = React.useMemo(() => new Date().getFullYear() - 1, []);
    const demoMonthlyReports = React.useMemo(
        () => buildMonthlyReports(demoTransactions),
        [demoTransactions]
    );
    const currentMonthKey = React.useMemo(() => {
        const now = new Date();
        return getMonthKey(new Date(now.getFullYear(), now.getMonth(), 1));
    }, []);
    const completedMonthlyReports = React.useMemo(
        () => demoMonthlyReports.filter((report) => report.month < currentMonthKey),
        [demoMonthlyReports, currentMonthKey]
    );
    const targetMonth = React.useMemo(
        () => completedMonthlyReports.find((r) => r.month === lastFullMonthKey)?.month,
        [completedMonthlyReports, lastFullMonthKey]
    );
    const monthlySampleReport = React.useMemo(() => {
        if (!targetMonth) return null;
        const currentData = demoMonthlyReports.find((r) => r.month === targetMonth);
        if (!currentData) return null;
        const prevMonth = getPreviousMonth(targetMonth);
        const prevData = demoMonthlyReports.find((r) => r.month === prevMonth);
        const sameMonthLastYear = getSameMonthLastYear(targetMonth, demoMonthlyReports);
        const sixMonthAvg = getSixMonthAverage(targetMonth, demoMonthlyReports);
        return generateMonthlyReport(
            targetMonth,
            currentData,
            demoTransactions,
            prevData,
            sameMonthLastYear,
            sixMonthAvg
        );
    }, [demoMonthlyReports, demoTransactions, targetMonth]);
    const yearlySampleReport = React.useMemo(() => {
        const yearReports = demoMonthlyReports.filter((report) => report.month.startsWith(`${lastFullYear}-`));
        if (yearReports.length === 0) return null;

        // Generate full MonthlyFinancialReport objects for each month (with status)
        const sortedReports = [...yearReports].sort((a, b) => a.month.localeCompare(b.month));
        const fullMonthlyReports: ReturnType<typeof generateMonthlyReport>[] = [];

        for (let i = 0; i < sortedReports.length; i++) {
            const currentData = sortedReports[i];
            const prevData = i > 0 ? sortedReports[i - 1] : undefined;
            const sameMonthLastYear = getSameMonthLastYear(currentData.month, demoMonthlyReports);
            const sixMonthAvg = getSixMonthAverage(currentData.month, demoMonthlyReports);
            const fullReport = generateMonthlyReport(
                currentData.month,
                currentData,
                demoTransactions,
                prevData,
                sameMonthLastYear,
                sixMonthAvg
            );
            fullMonthlyReports.push(fullReport);
        }

        const prevYear = lastFullYear - 1;
        const prevYearReports = demoMonthlyReports.filter((report) => report.month.startsWith(`${prevYear}-`));
        const prevYearTotals = prevYearReports.length > 0
            ? {
                income: prevYearReports.reduce((sum, r) => sum + r.income, 0),
                expenses: prevYearReports.reduce((sum, r) => sum + r.expenses, 0),
                savings: prevYearReports.reduce((sum, r) => sum + r.savings, 0),
            }
            : undefined;
        return generateYearlyReport(lastFullYear, fullMonthlyReports, demoTransactions, prevYearTotals);
    }, [demoMonthlyReports, demoTransactions, lastFullYear]);

    // Load packages on mount
    useEffect(() => {
        loadPackages();
    }, []);

    const loadPackages = async () => {
        setLoading(true);
        setError(null); // Clear previous errors
        try {
            const pkgs = await getPackages();
            if (pkgs.length === 0) {
                // No packages returned - this is the error Apple reviewers may be seeing
                setError('Unable to load subscription options. Please try again later.');
                console.warn('[Paywall] No packages returned from RevenueCat');
            } else {
                setPackages(pkgs);
                console.log('[Paywall] Loaded', pkgs.length, 'packages');
            }
        } catch (err: any) {
            console.error('[Paywall] Failed to load packages:', err);
            setError(err.message || 'There was a problem with the App Store.');
        }
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
                    {FEATURES.map((feature, index) => {
                        const reportType = feature.icon === 'document-text' ? 'monthly' : 'yearly';
                        return (
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
                                    <Text style={[styles.featureTiming, { color: colors.accent }]}>
                                        {feature.timing}
                                    </Text>
                                    <TouchableOpacity onPress={() => setSampleReportType(reportType)} style={styles.viewSampleLink}>
                                        <Text style={[styles.viewSampleText, { color: colors.accent }]}>View sample →</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        );
                    })}
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
                        <TouchableOpacity
                            style={styles.retryButton}
                            onPress={loadPackages}
                            disabled={loading}
                        >
                            <Text style={styles.retryButtonText}>
                                {loading ? 'Loading...' : 'Tap to retry'}
                            </Text>
                        </TouchableOpacity>
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

                {/* Footer Links */}
                <View style={styles.footer}>
                    <Text style={[styles.disclaimer, { color: colors.muted }]}>
                        By continuing, you agree to our{' '}
                        <Text style={{ textDecorationLine: 'underline' }} onPress={() => router.push('/terms-of-service')}>Terms of Service</Text>
                        {' '}and{' '}
                        <Text style={{ textDecorationLine: 'underline' }} onPress={() => router.push('/privacy-policy')}>Privacy Policy</Text>
                        .{'\n\n'}
                        Your subscription will automatically renew for the same price and period unless auto-renew is turned off at least 24 hours before the end of the current period.
                        Your account will be charged for renewal within 24 hours prior to the end of the current period.
                        You can manage subscriptions and turn off auto-renewal in your iTunes Account Settings after purchase.
                    </Text>
                </View>
            </ScrollView>

            {/* Sample Report Modal */}
            <Modal
                visible={sampleReportType !== null}
                animationType="slide"
                presentationStyle="pageSheet"
                onRequestClose={() => setSampleReportType(null)}
            >
                <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
                    <View style={styles.modalHeader}>
                        <Text style={[styles.modalTitle, { color: colors.ink }]}>
                            {sampleReportType === 'monthly' ? 'Monthly Report Sample' : 'Yearly Report Sample'}
                        </Text>
                        <TouchableOpacity onPress={() => setSampleReportType(null)} style={styles.modalClose}>
                            <Ionicons name="close" size={24} color={colors.ink} />
                        </TouchableOpacity>
                    </View>
                    <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
                        {sampleReportType === 'monthly' && monthlySampleReport && (
                            <View style={[styles.previewCard, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : colors.wash }]}>
                                <View style={styles.previewHeader}>
                                    <Ionicons name="document-text" size={18} color={colors.accent} />
                                    <Text style={[styles.previewLabel, { color: colors.ink }]}>Monthly Report (Sample)</Text>
                                    <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[monthlySampleReport.status].bg }]}>
                                        <Text style={[styles.statusText, { color: STATUS_COLORS[monthlySampleReport.status].text }]}>
                                            {STATUS_LABELS[monthlySampleReport.status]}
                                        </Text>
                                    </View>
                                </View>
                                <Text style={[styles.previewHeadline, { color: colors.ink }]}>
                                    {formatMonthHeader(monthlySampleReport.month)}
                                </Text>

                                {/* Key Numbers */}
                                <View style={styles.reportMetrics}>
                                    <View style={styles.metricItem}>
                                        <Text style={[styles.metricValue, { color: colors.positive }]}>
                                            ${monthlySampleReport.income.toLocaleString()}
                                        </Text>
                                        <Text style={[styles.metricLabel, { color: colors.muted }]}>Income</Text>
                                    </View>
                                    <View style={styles.metricItem}>
                                        <Text style={[styles.metricValue, { color: colors.ink }]}>
                                            ${monthlySampleReport.expenses.toLocaleString()}
                                        </Text>
                                        <Text style={[styles.metricLabel, { color: colors.muted }]}>Expenses</Text>
                                    </View>
                                    <View style={styles.metricItem}>
                                        <Text style={[styles.metricValue, { color: monthlySampleReport.savings >= 0 ? colors.positive : colors.negative }]}>
                                            ${monthlySampleReport.savings.toLocaleString()}
                                        </Text>
                                        <Text style={[styles.metricLabel, { color: colors.muted }]}>Saved</Text>
                                    </View>
                                </View>

                                {/* Executive Summary */}
                                <Text style={[styles.sectionTitle, { color: colors.ink }]}>Summary</Text>
                                <Text style={[styles.previewBody, { color: colors.muted }]}>
                                    {monthlySampleReport.executiveSummary}
                                </Text>

                                {/* What Changed */}
                                <Text style={[styles.sectionTitle, { color: colors.ink }]}>What Changed</Text>
                                {monthlySampleReport.whatChanged.map((item, index) => (
                                    <View key={`change-${index}`} style={styles.previewBullet}>
                                        <Ionicons name="chevron-forward" size={14} color={colors.accent} />
                                        <Text style={[styles.previewBulletText, { color: colors.muted }]}>{item}</Text>
                                    </View>
                                ))}

                                {/* Category Insights */}
                                {monthlySampleReport.categoryInsights && monthlySampleReport.categoryInsights.length > 0 && (
                                    <>
                                        <Text style={[styles.sectionTitle, { color: colors.ink }]}>Category Insights</Text>
                                        {monthlySampleReport.categoryInsights.map((item, index) => (
                                            <View key={`cat-${index}`} style={styles.previewBullet}>
                                                <Ionicons name="analytics" size={14} color={colors.accent} />
                                                <Text style={[styles.previewBulletText, { color: colors.muted }]}>{item}</Text>
                                            </View>
                                        ))}
                                    </>
                                )}

                                {/* Patterns */}
                                {monthlySampleReport.patterns && monthlySampleReport.patterns.length > 0 && (
                                    <>
                                        <Text style={[styles.sectionTitle, { color: colors.ink }]}>Patterns Detected</Text>
                                        {monthlySampleReport.patterns.map((item, index) => (
                                            <View key={`pattern-${index}`} style={styles.previewBullet}>
                                                <Ionicons name="trending-up" size={14} color={colors.accent} />
                                                <Text style={[styles.previewBulletText, { color: colors.muted }]}>{item}</Text>
                                            </View>
                                        ))}
                                    </>
                                )}

                                {/* Safety Message */}
                                <View style={[styles.safetyBox, { backgroundColor: isDark ? 'rgba(20,184,166,0.1)' : 'rgba(20,184,166,0.08)' }]}>
                                    <Ionicons name="shield-checkmark" size={18} color={colors.accent} />
                                    <Text style={[styles.safetyText, { color: colors.ink }]}>
                                        {monthlySampleReport.safetyMessage}
                                    </Text>
                                </View>

                                {/* One Decision */}
                                {monthlySampleReport.oneDecision && (
                                    <View style={[styles.decisionBox, { borderColor: colors.accent }]}>
                                        <Text style={[styles.decisionLabel, { color: colors.accent }]}>ONE DECISION</Text>
                                        <Text style={[styles.decisionText, { color: colors.ink }]}>
                                            {monthlySampleReport.oneDecision}
                                        </Text>
                                    </View>
                                )}

                                <Text style={[styles.previewNote, { color: colors.muted, marginTop: 20 }]}>
                                    ✨ This is a sample generated from demo data. Upgrade to see reports based on your real transactions.
                                </Text>
                            </View>
                        )}
                        {sampleReportType === 'yearly' && yearlySampleReport && (
                            <View style={[styles.previewCard, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : colors.wash }]}>
                                <View style={styles.previewHeader}>
                                    <Ionicons name="calendar" size={18} color={colors.accent} />
                                    <Text style={[styles.previewLabel, { color: colors.ink }]}>Yearly Report (Sample)</Text>
                                    <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[yearlySampleReport.status].bg }]}>
                                        <Text style={[styles.statusText, { color: STATUS_COLORS[yearlySampleReport.status].text }]}>
                                            {STATUS_LABELS[yearlySampleReport.status]}
                                        </Text>
                                    </View>
                                </View>
                                <Text style={[styles.previewHeadline, { color: colors.ink }]}>
                                    {yearlySampleReport.year} Annual Summary
                                </Text>

                                {/* Key Numbers */}
                                <View style={styles.reportMetrics}>
                                    <View style={styles.metricItem}>
                                        <Text style={[styles.metricValue, { color: colors.positive }]}>
                                            ${yearlySampleReport.totalIncome.toLocaleString()}
                                        </Text>
                                        <Text style={[styles.metricLabel, { color: colors.muted }]}>Total Income</Text>
                                    </View>
                                    <View style={styles.metricItem}>
                                        <Text style={[styles.metricValue, { color: colors.ink }]}>
                                            ${yearlySampleReport.totalExpenses.toLocaleString()}
                                        </Text>
                                        <Text style={[styles.metricLabel, { color: colors.muted }]}>Total Spent</Text>
                                    </View>
                                    <View style={styles.metricItem}>
                                        <Text style={[styles.metricValue, { color: yearlySampleReport.totalSavings >= 0 ? colors.positive : colors.negative }]}>
                                            ${yearlySampleReport.totalSavings.toLocaleString()}
                                        </Text>
                                        <Text style={[styles.metricLabel, { color: colors.muted }]}>Net Saved</Text>
                                    </View>
                                </View>

                                {/* Savings Rate */}
                                <View style={styles.savingsRateRow}>
                                    <Text style={[styles.savingsRateLabel, { color: colors.muted }]}>Savings Rate:</Text>
                                    <Text style={[styles.savingsRateValue, { color: colors.accent }]}>
                                        {yearlySampleReport.savingsRate.toFixed(1)}%
                                    </Text>
                                </View>

                                {/* Monthly Breakdown */}
                                <View style={styles.monthlyBreakdown}>
                                    <View style={[styles.breakdownItem, { backgroundColor: STATUS_COLORS.progress.bg }]}>
                                        <Text style={[styles.breakdownNumber, { color: STATUS_COLORS.progress.text }]}>
                                            {yearlySampleReport.progressMonths}
                                        </Text>
                                        <Text style={[styles.breakdownLabel, { color: STATUS_COLORS.progress.text }]}>Progress</Text>
                                    </View>
                                    <View style={[styles.breakdownItem, { backgroundColor: STATUS_COLORS.maintenance.bg }]}>
                                        <Text style={[styles.breakdownNumber, { color: STATUS_COLORS.maintenance.text }]}>
                                            {yearlySampleReport.maintenanceMonths}
                                        </Text>
                                        <Text style={[styles.breakdownLabel, { color: STATUS_COLORS.maintenance.text }]}>Maintenance</Text>
                                    </View>
                                    <View style={[styles.breakdownItem, { backgroundColor: STATUS_COLORS.regression.bg }]}>
                                        <Text style={[styles.breakdownNumber, { color: STATUS_COLORS.regression.text }]}>
                                            {yearlySampleReport.regressionMonths}
                                        </Text>
                                        <Text style={[styles.breakdownLabel, { color: STATUS_COLORS.regression.text }]}>Regression</Text>
                                    </View>
                                </View>

                                {/* Executive Summary */}
                                <Text style={[styles.sectionTitle, { color: colors.ink }]}>Year in Review</Text>
                                <Text style={[styles.previewBody, { color: colors.muted }]}>
                                    {yearlySampleReport.executiveSummary}
                                </Text>

                                {/* Highlights */}
                                <Text style={[styles.sectionTitle, { color: colors.ink }]}>Key Highlights</Text>
                                {yearlySampleReport.yearHighlights.map((item, index) => (
                                    <View key={`highlight-${index}`} style={styles.previewBullet}>
                                        <Ionicons name="star" size={14} color={colors.accent} />
                                        <Text style={[styles.previewBulletText, { color: colors.muted }]}>{item}</Text>
                                    </View>
                                ))}

                                {/* Category Insights */}
                                {yearlySampleReport.categoryInsights && yearlySampleReport.categoryInsights.length > 0 && (
                                    <>
                                        <Text style={[styles.sectionTitle, { color: colors.ink }]}>Category Analysis</Text>
                                        {yearlySampleReport.categoryInsights.map((item, index) => (
                                            <View key={`cat-${index}`} style={styles.previewBullet}>
                                                <Ionicons name="pie-chart" size={14} color={colors.accent} />
                                                <Text style={[styles.previewBulletText, { color: colors.muted }]}>{item}</Text>
                                            </View>
                                        ))}
                                    </>
                                )}

                                {/* Look Ahead */}
                                {yearlySampleReport.lookAhead && (
                                    <View style={[styles.decisionBox, { borderColor: colors.accent }]}>
                                        <Text style={[styles.decisionLabel, { color: colors.accent }]}>LOOKING AHEAD</Text>
                                        <Text style={[styles.decisionText, { color: colors.ink }]}>
                                            {yearlySampleReport.lookAhead}
                                        </Text>
                                    </View>
                                )}

                                <Text style={[styles.previewNote, { color: colors.muted, marginTop: 20 }]}>
                                    ✨ This is a sample generated from demo data. Upgrade to see reports based on your real transactions.
                                </Text>
                            </View>
                        )}
                    </ScrollView>
                </View>
            </Modal>
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
    featureTiming: {
        fontSize: 12,
        fontWeight: '500',
        marginTop: 4,
    },
    trustLine: {
        fontSize: 12,
        textAlign: 'center',
        marginBottom: 16,
    },
    previewSection: {
        marginBottom: 24,
    },
    previewTitle: {
        fontSize: 18,
        fontWeight: '700',
    },
    previewSubtitle: {
        fontSize: 13,
        marginTop: 6,
        marginBottom: 12,
    },
    previewCard: {
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
    },
    previewHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 12,
        flexWrap: 'wrap',
    },
    previewLabel: {
        fontSize: 14,
        fontWeight: '600',
    },
    previewNote: {
        fontSize: 12,
        marginTop: 10,
    },
    previewHeadline: {
        fontSize: 16,
        fontWeight: '700',
        marginBottom: 8,
    },
    previewBody: {
        fontSize: 13,
        lineHeight: 18,
        marginBottom: 10,
    },
    previewBullet: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 6,
    },
    previewBulletText: {
        fontSize: 12,
        lineHeight: 16,
        flex: 1,
    },
    statusBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
    },
    statusText: {
        fontSize: 11,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.6,
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
    retryButton: {
        marginTop: 8,
        padding: 8,
    },
    retryButtonText: {
        color: '#D64550',
        fontSize: 14,
        textAlign: 'center',
        fontWeight: '600',
        textDecorationLine: 'underline',
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
    footer: {
        marginTop: 32,
        marginBottom: 20,
        alignItems: 'center',
        gap: 12,
    },
    disclaimer: {
        fontSize: 12,
        textAlign: 'center',
    },
    legalLinks: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    legalLink: {
        fontSize: 12,
        textDecorationLine: 'underline',
    },
    legalDivider: {
        fontSize: 12,
    },
    viewSampleLink: {
        marginTop: 4,
    },
    viewSampleText: {
        fontSize: 13,
        fontWeight: '500',
    },
    modalContainer: {
        flex: 1,
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 12,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: '700',
    },
    modalClose: {
        padding: 4,
    },
    modalContent: {
        paddingHorizontal: 20,
        paddingBottom: 40,
    },
    reportMetrics: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginVertical: 16,
        paddingVertical: 12,
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderColor: 'rgba(128,128,128,0.2)',
    },
    metricItem: {
        alignItems: 'center',
        flex: 1,
    },
    metricValue: {
        fontSize: 18,
        fontWeight: '700',
    },
    metricLabel: {
        fontSize: 11,
        marginTop: 4,
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: '700',
        marginTop: 16,
        marginBottom: 8,
    },
    safetyBox: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        padding: 14,
        borderRadius: 12,
        marginTop: 16,
    },
    safetyText: {
        fontSize: 13,
        lineHeight: 18,
        flex: 1,
    },
    decisionBox: {
        borderWidth: 1,
        borderRadius: 12,
        padding: 14,
        marginTop: 16,
    },
    decisionLabel: {
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 0.5,
        marginBottom: 6,
    },
    decisionText: {
        fontSize: 14,
        lineHeight: 20,
    },
    savingsRateRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 8,
    },
    savingsRateLabel: {
        fontSize: 13,
    },
    savingsRateValue: {
        fontSize: 18,
        fontWeight: '700',
    },
    monthlyBreakdown: {
        flexDirection: 'row',
        gap: 8,
        marginTop: 16,
    },
    breakdownItem: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: 10,
        borderRadius: 10,
    },
    breakdownNumber: {
        fontSize: 20,
        fontWeight: '700',
    },
    breakdownLabel: {
        fontSize: 10,
        fontWeight: '600',
        marginTop: 2,
    },
});
