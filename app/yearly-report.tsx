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
    generateYearlyReport,
    getSameMonthLastYear,
    getSixMonthAverage,
    getPreviousMonth,
} from '../src/services/reportGenerator';
import { ReportStatus } from '../src/types/report';

const STATUS_COLORS: Record<ReportStatus, { bg: string; text: string }> = {
    progress: { bg: '#D1FAE5', text: '#065F46' },
    maintenance: { bg: '#FEF3C7', text: '#92400E' },
    regression: { bg: '#FEE2E2', text: '#991B1B' },
};

const STATUS_LABELS: Record<ReportStatus, string> = {
    progress: 'Progress Year',
    maintenance: 'Maintenance Year',
    regression: 'Challenging Year',
};

const formatCurrency = (amount: number): string => {
    return '$' + Math.abs(amount).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

export default function YearlyReportScreen() {
    const { colors, isDark } = useTheme();
    const insets = useSafeAreaInsets();
    const params = useLocalSearchParams<{ year?: string }>();

    const { getMonthlyReports, getAvailableYears, transactions } = useBudgetStore();
    const { getYearlyReport, setYearlyReport, getMonthlyReport, setMonthlyReport } = useReportStore();
    const { canUseFeature } = usePremiumStore();
    const hasAccess = canUseFeature('advanced_reports');

    // Only show COMPLETED years (not current year)
    const currentYear = new Date().getFullYear();
    const availableYears = useMemo(() => getAvailableYears(), [transactions]);
    const completedYears = useMemo(
        () => availableYears.filter(y => y < currentYear),
        [availableYears, currentYear]
    );
    const targetYear = params.year ? parseInt(params.year, 10) : completedYears[0];

    // Get all monthly data for the year
    const allMonthlyData = useMemo(() => getMonthlyReports(120), [transactions]);

    // Generate monthly reports for the year first (needed for yearly report)
    const yearMonthlyReports = useMemo(() => {
        if (!targetYear || !hasAccess) return [];

        const yearMonths = allMonthlyData.filter(r => r.month.startsWith(`${targetYear}-`));

        return yearMonths.map(monthData => {
            // Check cache
            const cached = getMonthlyReport(monthData.month);
            if (cached) return cached;

            // Generate
            const prevMonth = getPreviousMonth(monthData.month);
            const prevData = allMonthlyData.find(r => r.month === prevMonth);
            const sameMonthLastYear = getSameMonthLastYear(monthData.month, allMonthlyData);
            const sixMonthAvg = getSixMonthAverage(monthData.month, allMonthlyData);

            return generateMonthlyReport(
                monthData.month,
                monthData,
                prevData,
                sameMonthLastYear,
                sixMonthAvg
            );
        });
    }, [targetYear, allMonthlyData, hasAccess, getMonthlyReport]);

    // Cache monthly reports
    useEffect(() => {
        yearMonthlyReports.forEach(report => {
            if (!getMonthlyReport(report.month)) {
                setMonthlyReport(report);
            }
        });
    }, [yearMonthlyReports, getMonthlyReport, setMonthlyReport]);

    // Get or generate yearly report
    // Note: We always regenerate to ensure the latest algorithm is used
    const report = useMemo(() => {
        if (!targetYear || !hasAccess || yearMonthlyReports.length === 0) return null;

        // Get previous year totals for comparison
        const prevYearMonths = allMonthlyData.filter(r => r.month.startsWith(`${targetYear - 1}-`));
        const prevYearTotals = prevYearMonths.length > 0 ? {
            income: prevYearMonths.reduce((sum, r) => sum + r.income, 0),
            expenses: prevYearMonths.reduce((sum, r) => sum + r.expenses, 0),
            savings: prevYearMonths.reduce((sum, r) => sum + r.savings, 0),
        } : undefined;

        return generateYearlyReport(targetYear, yearMonthlyReports, prevYearTotals);
    }, [targetYear, yearMonthlyReports, hasAccess, allMonthlyData]);

    // Cache yearly report
    useEffect(() => {
        if (report && !getYearlyReport(report.year)) {
            setYearlyReport(report);
        }
    }, [report, getYearlyReport, setYearlyReport]);

    // Navigation - only allow completed years
    const hasPrevYear = completedYears.includes(targetYear - 1);
    const hasNextYear = completedYears.includes(targetYear + 1);

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
                        Yearly Financial Reports are available with Prism Premium.
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
                    <Ionicons name="calendar-outline" size={48} color={colors.muted} />
                    <Text style={[styles.emptyTitle, { color: colors.ink }]}>No Yearly Report</Text>
                    <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
                        A full year of data is needed to generate this report.
                    </Text>
                </View>
            </View>
        );
    }

    const statusStyle = STATUS_COLORS[report.status];

    return (
        <View style={[styles.container, { backgroundColor: isDark ? colors.background : '#F8F6F3', paddingTop: insets.top }]}>
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
                    <Text style={[styles.yearTitle, { color: colors.ink }]}>{report.year} Year in Review</Text>
                    <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
                        <Text style={[styles.statusText, { color: statusStyle.text }]}>
                            {STATUS_LABELS[report.status]}
                        </Text>
                    </View>
                    <Text style={[styles.statusExplanation, { color: colors.muted }]}>
                        {report.statusExplanation}
                    </Text>
                </View>

                {/* Year Navigation */}
                <View style={styles.navPills}>
                    <TouchableOpacity
                        style={[styles.navPill, !hasPrevYear && styles.navPillDisabled]}
                        onPress={() => hasPrevYear && router.setParams({ year: String(targetYear - 1) })}
                        disabled={!hasPrevYear}
                    >
                        <Ionicons name="chevron-back" size={16} color={hasPrevYear ? colors.ink : colors.muted} />
                        <Text style={[styles.navPillText, { color: hasPrevYear ? colors.ink : colors.muted }]}>
                            {targetYear - 1}
                        </Text>
                    </TouchableOpacity>

                    <View style={[styles.navPillCurrent, { backgroundColor: colors.card, borderColor: colors.border }]}>
                        <Text style={[styles.navPillCurrentText, { color: colors.ink }]}>{targetYear}</Text>
                    </View>

                    <TouchableOpacity
                        style={[styles.navPill, !hasNextYear && styles.navPillDisabled]}
                        onPress={() => hasNextYear && router.setParams({ year: String(targetYear + 1) })}
                        disabled={!hasNextYear}
                    >
                        <Text style={[styles.navPillText, { color: hasNextYear ? colors.ink : colors.muted }]}>
                            {targetYear + 1}
                        </Text>
                        <Ionicons name="chevron-forward" size={16} color={hasNextYear ? colors.ink : colors.muted} />
                    </TouchableOpacity>
                </View>

                {/* Executive Summary */}
                <View style={styles.section}>
                    <Text style={[styles.sectionLabel, { color: colors.muted }]}>Summary</Text>
                    <Text style={[styles.executiveSummary, { color: colors.ink }]}>
                        {report.executiveSummary}
                    </Text>
                </View>

                {/* Key Metrics */}
                <View style={styles.section}>
                    <Text style={[styles.sectionLabel, { color: colors.muted }]}>Key Numbers</Text>
                    <View style={[styles.metricsGrid, { backgroundColor: colors.card, borderColor: colors.border }]}>
                        <View style={styles.metricItem}>
                            <Text style={[styles.metricValue, { color: '#16A34A' }]}>
                                {formatCurrency(report.totalIncome)}
                            </Text>
                            <Text style={[styles.metricLabel, { color: colors.muted }]}>Total Income</Text>
                        </View>
                        <View style={styles.metricItem}>
                            <Text style={[styles.metricValue, { color: '#DC2626' }]}>
                                {formatCurrency(report.totalExpenses)}
                            </Text>
                            <Text style={[styles.metricLabel, { color: colors.muted }]}>Total Expenses</Text>
                        </View>
                        <View style={styles.metricItem}>
                            <Text style={[styles.metricValue, { color: report.totalSavings >= 0 ? '#16A34A' : '#DC2626' }]}>
                                {report.totalSavings >= 0 ? '+' : '-'}{formatCurrency(report.totalSavings)}
                            </Text>
                            <Text style={[styles.metricLabel, { color: colors.muted }]}>Net Savings</Text>
                        </View>
                        <View style={styles.metricItem}>
                            <Text style={[styles.metricValue, { color: colors.ink }]}>
                                {report.savingsRate.toFixed(0)}%
                            </Text>
                            <Text style={[styles.metricLabel, { color: colors.muted }]}>Savings Rate</Text>
                        </View>
                    </View>
                </View>

                {/* Month Status Breakdown */}
                <View style={styles.section}>
                    <Text style={[styles.sectionLabel, { color: colors.muted }]}>Monthly Breakdown</Text>
                    <View style={styles.statusBreakdown}>
                        <View style={[styles.statusBreakdownItem, { backgroundColor: STATUS_COLORS.progress.bg }]}>
                            <Text style={[styles.statusBreakdownCount, { color: STATUS_COLORS.progress.text }]}>
                                {report.progressMonths}
                            </Text>
                            <Text style={[styles.statusBreakdownLabel, { color: STATUS_COLORS.progress.text }]}>
                                Progress
                            </Text>
                        </View>
                        <View style={[styles.statusBreakdownItem, { backgroundColor: STATUS_COLORS.maintenance.bg }]}>
                            <Text style={[styles.statusBreakdownCount, { color: STATUS_COLORS.maintenance.text }]}>
                                {report.maintenanceMonths}
                            </Text>
                            <Text style={[styles.statusBreakdownLabel, { color: STATUS_COLORS.maintenance.text }]}>
                                Maintenance
                            </Text>
                        </View>
                        <View style={[styles.statusBreakdownItem, { backgroundColor: STATUS_COLORS.regression.bg }]}>
                            <Text style={[styles.statusBreakdownCount, { color: STATUS_COLORS.regression.text }]}>
                                {report.regressionMonths}
                            </Text>
                            <Text style={[styles.statusBreakdownLabel, { color: STATUS_COLORS.regression.text }]}>
                                Regression
                            </Text>
                        </View>
                    </View>
                </View>

                {/* Highlights */}
                <View style={styles.section}>
                    <Text style={[styles.sectionLabel, { color: colors.muted }]}>Highlights</Text>
                    {report.yearHighlights.map((highlight, index) => (
                        <View key={index} style={styles.bulletRow}>
                            <View style={[styles.bulletDot, { backgroundColor: colors.accent }]} />
                            <Text style={[styles.bulletText, { color: colors.ink }]}>{highlight}</Text>
                        </View>
                    ))}
                </View>

                {/* Look Ahead */}
                {report.lookAhead && (
                    <View style={[styles.section, styles.lookAheadSection, { backgroundColor: isDark ? colors.card : '#EFF6FF', borderColor: isDark ? colors.border : '#BFDBFE' }]}>
                        <Ionicons name="arrow-forward-circle-outline" size={20} color={isDark ? colors.accent : '#2563EB'} />
                        <Text style={[styles.lookAheadText, { color: isDark ? colors.ink : '#1E40AF' }]}>
                            {report.lookAhead}
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
    yearTitle: {
        fontSize: 28,
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
    statusExplanation: {
        fontSize: 13,
        marginTop: 8,
        fontStyle: 'italic',
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
    metricsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        borderRadius: 16,
        borderWidth: 1,
        overflow: 'hidden',
    },
    metricItem: {
        width: '50%',
        padding: 16,
        alignItems: 'center',
    },
    metricValue: {
        fontSize: 22,
        fontWeight: '700',
        marginBottom: 4,
    },
    metricLabel: {
        fontSize: 12,
    },
    statusBreakdown: {
        flexDirection: 'row',
        gap: 12,
    },
    statusBreakdownItem: {
        flex: 1,
        padding: 16,
        borderRadius: 12,
        alignItems: 'center',
    },
    statusBreakdownCount: {
        fontSize: 28,
        fontWeight: '700',
        marginBottom: 4,
    },
    statusBreakdownLabel: {
        fontSize: 11,
        fontWeight: '600',
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
    lookAheadSection: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
        gap: 12,
    },
    lookAheadText: {
        flex: 1,
        fontSize: 15,
        lineHeight: 22,
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
