import React, { useMemo, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../src/theme';
import { useBudgetStore } from '../src/store/budgetStore';
import { useReportStore } from '../src/store/reportStore';
import { usePremiumStore } from '../src/store/premiumStore';
import {
    generateMonthlyReport,
    getSameMonthLastYear,
    getSixMonthAverage,
    getPreviousMonth,
    getNextMonth,
} from '../src/services/reportGenerator';
import { ReportStatus } from '../src/types/report';

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

const formatMonthHeader = (monthStr: string): string => {
    const [year, month] = monthStr.split('-');
    const monthIndex = parseInt(month, 10) - 1;
    const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return `${monthNames[monthIndex]} ${year}`;
};

const formatMonthShort = (monthStr: string): string => {
    const [, month] = monthStr.split('-');
    const monthIndex = parseInt(month, 10) - 1;
    const shortNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return shortNames[monthIndex];
};

export default function MonthlyReportScreen() {
    const { colors, isDark } = useTheme();
    const insets = useSafeAreaInsets();
    const params = useLocalSearchParams<{ month?: string }>();

    const { getMonthlyReports, transactions } = useBudgetStore();
    const { getMonthlyReport, setMonthlyReport } = useReportStore();
    const { canUseFeature } = usePremiumStore();
    const hasAccess = canUseFeature('advanced_reports');

    // Determine which month to show - only COMPLETED months (not current month)
    const allMonthlyData = useMemo(() => getMonthlyReports(24), [transactions]);
    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const completedMonthlyData = useMemo(
        () => allMonthlyData.filter(r => r.month < currentMonthKey),
        [allMonthlyData, currentMonthKey]
    );
    const targetMonth = params.month || completedMonthlyData[0]?.month;

    // Get or generate report
    const report = useMemo(() => {
        if (!targetMonth || !hasAccess) return null;

        // Check cache first
        const cached = getMonthlyReport(targetMonth);
        if (cached) return cached;

        // Generate new report
        const currentData = allMonthlyData.find(r => r.month === targetMonth);
        if (!currentData) return null;

        const prevMonth = getPreviousMonth(targetMonth);
        const prevData = allMonthlyData.find(r => r.month === prevMonth);
        const sameMonthLastYear = getSameMonthLastYear(targetMonth, allMonthlyData);
        const sixMonthAvg = getSixMonthAverage(targetMonth, allMonthlyData);

        const generated = generateMonthlyReport(
            targetMonth,
            currentData,
            prevData,
            sameMonthLastYear,
            sixMonthAvg
        );

        return generated;
    }, [targetMonth, allMonthlyData, hasAccess, getMonthlyReport]);

    // Cache the generated report
    useEffect(() => {
        if (report && !getMonthlyReport(report.month)) {
            setMonthlyReport(report);
        }
    }, [report, getMonthlyReport, setMonthlyReport]);

    // Navigation helpers - only allow navigating to completed months
    const prevMonth = targetMonth ? getPreviousMonth(targetMonth) : null;
    const nextMonth = targetMonth ? getNextMonth(targetMonth) : null;
    const hasPrevData = prevMonth && completedMonthlyData.some(r => r.month === prevMonth);
    // Only allow next if it's a completed month (before current month)
    const hasNextData = nextMonth && nextMonth < currentMonthKey && completedMonthlyData.some(r => r.month === nextMonth);

    const navigateToMonth = (month: string) => {
        router.setParams({ month });
    };

    // Premium gate
    if (!hasAccess) {
        return (
            <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                        <Ionicons name="arrow-back" size={24} color={colors.ink} />
                    </TouchableOpacity>
                </View>
                <View style={styles.premiumGate}>
                    <Ionicons name="lock-closed" size={48} color={colors.muted} />
                    <Text style={[styles.gateTitle, { color: colors.ink }]}>Premium Feature</Text>
                    <Text style={[styles.gateSubtitle, { color: colors.muted }]}>
                        Monthly Financial Reports are available with Prism Premium.
                    </Text>
                    <TouchableOpacity
                        style={[styles.upgradeButton, { backgroundColor: colors.accent }]}
                        onPress={() => router.push('/settings')}
                    >
                        <Text style={styles.upgradeButtonText}>Unlock Premium</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    if (!report) {
        return (
            <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                        <Ionicons name="arrow-back" size={24} color={colors.ink} />
                    </TouchableOpacity>
                </View>
                <View style={styles.empty}>
                    <Ionicons name="document-text-outline" size={48} color={colors.muted} />
                    <Text style={[styles.emptyTitle, { color: colors.ink }]}>No Report Available</Text>
                    <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
                        Import transaction data to generate your first report.
                    </Text>
                </View>
            </View>
        );
    }

    const statusStyle = STATUS_COLORS[report.status];

    return (
        <View style={[styles.container, { backgroundColor: isDark ? colors.background : '#F8F6F3', paddingTop: insets.top }]}>
            {/* Subtle background gradient */}
            <View style={[styles.bgGradient, { backgroundColor: isDark ? colors.card : '#FFFBF5', opacity: isDark ? 0.5 : 1 }]} />

            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
                showsVerticalScrollIndicator={false}
            >
                {/* Back Button */}
                <TouchableOpacity onPress={() => router.back()} style={styles.backButtonFloat}>
                    <Ionicons name="arrow-back" size={24} color={colors.ink} />
                </TouchableOpacity>

                {/* Header */}
                <View style={styles.headerSection}>
                    <Text style={[styles.monthTitle, { color: colors.ink }]}>
                        {formatMonthHeader(report.month)}
                    </Text>
                    <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
                        <Text style={[styles.statusText, { color: statusStyle.text }]}>
                            {STATUS_LABELS[report.status]}
                        </Text>
                    </View>
                </View>

                {/* Month Navigation Pills */}
                <View style={styles.navPills}>
                    <TouchableOpacity
                        style={[styles.navPill, !hasPrevData && styles.navPillDisabled]}
                        onPress={() => hasPrevData && prevMonth && navigateToMonth(prevMonth)}
                        disabled={!hasPrevData}
                    >
                        <Ionicons name="chevron-back" size={16} color={hasPrevData ? colors.ink : colors.muted} />
                        <Text style={[styles.navPillText, { color: hasPrevData ? colors.ink : colors.muted }]}>
                            {prevMonth ? formatMonthShort(prevMonth) : ''}
                        </Text>
                    </TouchableOpacity>

                    <View style={[styles.navPillCurrent, { backgroundColor: colors.card, borderColor: colors.border }]}>
                        <Text style={[styles.navPillCurrentText, { color: colors.ink }]}>
                            {formatMonthShort(report.month)}
                        </Text>
                    </View>

                    <TouchableOpacity
                        style={[styles.navPill, !hasNextData && styles.navPillDisabled]}
                        onPress={() => hasNextData && nextMonth && navigateToMonth(nextMonth)}
                        disabled={!hasNextData}
                    >
                        <Text style={[styles.navPillText, { color: hasNextData ? colors.ink : colors.muted }]}>
                            {nextMonth ? formatMonthShort(nextMonth) : ''}
                        </Text>
                        <Ionicons name="chevron-forward" size={16} color={hasNextData ? colors.ink : colors.muted} />
                    </TouchableOpacity>
                </View>

                {/* Section 1: Executive Summary */}
                <View style={styles.section}>
                    <Text style={[styles.sectionLabel, { color: colors.muted }]}>Summary</Text>
                    <Text style={[styles.executiveSummary, { color: colors.ink }]}>
                        {report.executiveSummary}
                    </Text>
                </View>

                {/* Section 2: What Changed */}
                <View style={styles.section}>
                    <Text style={[styles.sectionLabel, { color: colors.muted }]}>What Changed</Text>
                    {report.whatChanged.map((bullet, index) => (
                        <View key={index} style={styles.bulletRow}>
                            <View style={[styles.bulletDot, { backgroundColor: colors.accent }]} />
                            <Text style={[styles.bulletText, { color: colors.ink }]}>{bullet}</Text>
                        </View>
                    ))}
                </View>

                {/* Section 3: Safety & Comfort Check */}
                <View style={[styles.section, styles.safetySection, { backgroundColor: isDark ? colors.card : '#FEFCE8', borderColor: isDark ? colors.border : '#FEF08A' }]}>
                    <View style={styles.safetyIcon}>
                        <Ionicons name="shield-checkmark-outline" size={20} color={isDark ? colors.accent : '#CA8A04'} />
                    </View>
                    <Text style={[styles.safetyText, { color: isDark ? colors.ink : '#713F12' }]}>
                        {report.safetyMessage}
                    </Text>
                </View>

                {/* Section 4: One Decision */}
                {report.oneDecision && (
                    <View style={styles.section}>
                        <Text style={[styles.sectionLabel, { color: colors.muted }]}>One Decision</Text>
                        <Text style={[styles.decisionText, { color: colors.ink }]}>
                            {report.oneDecision}
                        </Text>
                    </View>
                )}

                {/* Footer */}
                <View style={styles.footer}>
                    <Text style={[styles.footerText, { color: colors.muted }]}>
                        Generated from your Google Sheet
                    </Text>
                    <Text style={[styles.footerText, { color: colors.muted }]}>
                        {new Date(report.generatedAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                        })}
                    </Text>
                </View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    bgGradient: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 300,
    },
    scrollView: {
        flex: 1,
    },
    content: {
        paddingHorizontal: 24,
        paddingTop: 16,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    backButton: {
        padding: 8,
    },
    backButtonFloat: {
        marginBottom: 24,
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerSection: {
        marginBottom: 20,
    },
    monthTitle: {
        fontSize: 32,
        fontWeight: '700',
        letterSpacing: -0.5,
        marginBottom: 12,
    },
    statusBadge: {
        alignSelf: 'flex-start',
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: 16,
    },
    statusText: {
        fontSize: 13,
        fontWeight: '600',
    },
    navPills: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 32,
        gap: 8,
    },
    navPill: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        gap: 4,
    },
    navPillDisabled: {
        opacity: 0.4,
    },
    navPillText: {
        fontSize: 14,
        fontWeight: '500',
    },
    navPillCurrent: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1,
    },
    navPillCurrentText: {
        fontSize: 14,
        fontWeight: '600',
    },
    section: {
        marginBottom: 28,
    },
    sectionLabel: {
        fontSize: 11,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 8,
    },
    executiveSummary: {
        fontSize: 18,
        lineHeight: 28,
        fontWeight: '400',
    },
    bulletRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 10,
    },
    bulletDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        marginTop: 8,
        marginRight: 12,
    },
    bulletText: {
        flex: 1,
        fontSize: 16,
        lineHeight: 24,
    },
    safetySection: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
    },
    safetyIcon: {
        marginRight: 12,
        marginTop: 2,
    },
    safetyText: {
        flex: 1,
        fontSize: 15,
        lineHeight: 22,
    },
    decisionText: {
        fontSize: 16,
        lineHeight: 24,
        fontStyle: 'italic',
    },
    footer: {
        alignItems: 'center',
        marginTop: 24,
        paddingTop: 24,
        borderTopWidth: 1,
        borderTopColor: 'rgba(0,0,0,0.06)',
        gap: 4,
    },
    footerText: {
        fontSize: 12,
    },
    premiumGate: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 32,
    },
    gateTitle: {
        fontSize: 20,
        fontWeight: '600',
        marginTop: 16,
        marginBottom: 8,
    },
    gateSubtitle: {
        fontSize: 15,
        textAlign: 'center',
        marginBottom: 24,
    },
    upgradeButton: {
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 20,
    },
    upgradeButtonText: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '600',
    },
    empty: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 32,
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: '600',
        marginTop: 16,
        marginBottom: 8,
    },
    emptySubtitle: {
        fontSize: 14,
        textAlign: 'center',
    },
});
