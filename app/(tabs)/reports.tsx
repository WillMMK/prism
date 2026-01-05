import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useBudgetStore } from '../../src/store/budgetStore';
import { CategorySpending, Transaction } from '../../src/types/budget';
import { PieChart } from '../../src/components/PieChart';
import { Sparkline } from '../../src/components/Sparkline';

import { useTheme, lightPalette as palette } from '../../src/theme';

const fallbackCategoryColors = [
  '#0072B2',
  '#E69F00',
  '#009E73',
  '#D55E00',
  '#CC79A7',
  '#56B4E9',
  '#F0E442',
  '#000000',
  '#6A3D9A',
  '#B15928',
  '#1B9E77',
  '#E7298A',
];

type TabType = 'overview' | 'yearly' | 'trends';

type Scope = 'month' | 'year';

const formatCurrency = (amount: number) =>
  '$' + amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

const formatCompactCurrency = (amount: number) => {
  const abs = Math.abs(amount);
  if (abs >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}m`;
  if (abs >= 1_000) return `$${(amount / 1_000).toFixed(1)}k`;
  return `$${amount.toFixed(0)}`;
};

const formatMonth = (monthStr: string) => {
  const [year, month] = monthStr.split('-');
  const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1);
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
};

const getSignedAmount = (transaction: Transaction): number =>
  typeof transaction.signedAmount === 'number'
    ? transaction.signedAmount
    : transaction.type === 'income'
      ? transaction.amount
      : -transaction.amount;

const getLatestDate = (transactions: Transaction[]): Date => {
  const latest = transactions.reduce<Date | null>((max, tx) => {
    const date = new Date(tx.date);
    if (isNaN(date.getTime())) return max;
    if (!max || date > max) return date;
    return max;
  }, null);

  return latest || new Date();
};

const filterTransactionsByScope = (
  transactions: Transaction[],
  scope: Scope,
  latestDate: Date
) => {
  const year = latestDate.getFullYear();
  const month = latestDate.getMonth();

  return transactions.filter((tx) => {
    const date = new Date(tx.date);
    if (isNaN(date.getTime())) return false;
    if (scope === 'month') {
      return date.getFullYear() === year && date.getMonth() === month;
    }
    return date.getFullYear() === year;
  });
};

const buildCategorySpending = (
  transactions: Transaction[],
  categories: { name: string; color: string }[]
): CategorySpending[] => {
  const getCategoryColor = (category: string) => {
    const match = categories.find((c) => c.name === category)?.color;
    if (match) return match;
    let hash = 0;
    for (let i = 0; i < category.length; i += 1) {
      hash = (hash * 31 + category.charCodeAt(i)) % 2147483647;
    }
    return fallbackCategoryColors[Math.abs(hash) % fallbackCategoryColors.length];
  };

  const expenses = transactions.filter((tx) => tx.type === 'expense');
  const totals = new Map<string, number>();

  expenses.forEach((tx) => {
    const signed = getSignedAmount(tx);
    const current = totals.get(tx.category) || 0;
    totals.set(tx.category, current + signed);
  });

  const netTotals = Array.from(totals.entries())
    .map(([category, signedTotal]) => {
      const amount = Math.max(0, -signedTotal);
      const color = getCategoryColor(category);
      return { category, amount, color, percentage: 0 };
    })
    .filter((item) => item.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  const totalExpenses = netTotals.reduce((sum, item) => sum + item.amount, 0);
  return netTotals.map((item) => ({
    ...item,
    percentage: totalExpenses > 0 ? (item.amount / totalExpenses) * 100 : 0,
  }));
};

const ensureDistinctColors = (items: CategorySpending[]) =>
  items.map((item, index) => ({
    ...item,
    color: fallbackCategoryColors[index % fallbackCategoryColors.length],
  }));

export default function Reports() {
  const { colors, isDark } = useTheme();
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [categoryScope, setCategoryScope] = useState<Scope>('month');
  const [timelineScope, setTimelineScope] = useState<Scope>('month');
  const [focusedYear, setFocusedYear] = useState<number>(new Date().getFullYear());
  const [selectedCategoryIndex, setSelectedCategoryIndex] = useState<number | null>(null);
  const [selectedYearCategoryIndex, setSelectedYearCategoryIndex] = useState<number | null>(null);
  const [selectedTimelineIndex, setSelectedTimelineIndex] = useState<number | null>(null);

  const {
    transactions,
    categories,
    getMonthlyReports,
    getYearlyReports,
    getTrends,
    getAvailableYears,
    demoConfig,
  } = useBudgetStore();

  const monthlyReports = getMonthlyReports(12);
  const yearlyReports = getYearlyReports();
  const trends = getTrends();
  const availableYears = getAvailableYears();
  const maskAmount = demoConfig.hideAmounts;
  const formatCurrencySafe = (amount: number) =>
    maskAmount ? '•••' : formatCurrency(amount);
  const formatCompactCurrencySafe = (amount: number) =>
    maskAmount ? '•••' : formatCompactCurrency(amount);

  useEffect(() => {
    if (availableYears.length > 0 && !availableYears.includes(focusedYear)) {
      setFocusedYear(availableYears[0]);
    }
  }, [availableYears, focusedYear]);

  const latestDate = useMemo(() => getLatestDate(transactions), [transactions]);
  const scopedTransactions = useMemo(
    () => filterTransactionsByScope(transactions, categoryScope, latestDate),
    [transactions, categoryScope, latestDate]
  );
  const categorySpending = useMemo(() => {
    const base = buildCategorySpending(scopedTransactions, categories);
    return ensureDistinctColors(base);
  }, [scopedTransactions, categories]);

  const yearTransactions = useMemo(
    () => transactions.filter((tx) => new Date(tx.date).getFullYear() === focusedYear),
    [transactions, focusedYear]
  );
  const yearCategorySpending = useMemo(() => {
    const base = buildCategorySpending(yearTransactions, categories);
    return ensureDistinctColors(base);
  }, [yearTransactions, categories]);

  const timelineData = useMemo(() => {
    if (timelineScope === 'year') {
      return yearlyReports
        .slice(0, 6)
        .reverse()
        .map((report) => ({
          label: String(report.year),
          value: report.totalExpenses,
        }));
    }

    return monthlyReports
      .slice(0, 8)
      .reverse()
      .map((report) => ({
        label: formatMonth(report.month).slice(0, 3),
        value: report.expenses,
      }));
  }, [timelineScope, yearlyReports, monthlyReports]);

  const maxTimelineValue = Math.max(...timelineData.map((item) => item.value), 0);
  const averageTimelineValue =
    timelineData.length > 0
      ? timelineData.reduce((sum, item) => sum + item.value, 0) / timelineData.length
      : 0;
  const timelineHeight = 140;
  const timelineLineOffset =
    maxTimelineValue > 0
      ? (1 - averageTimelineValue / maxTimelineValue) * timelineHeight
      : timelineHeight;

  const pieCategories = categorySpending.slice(0, 6);
  const activeCategory = selectedCategoryIndex === null ? null : pieCategories[selectedCategoryIndex];
  const totalCategorySpend = pieCategories.reduce((sum, cat) => sum + cat.amount, 0);

  const yearPieCategories = yearCategorySpending.slice(0, 6);
  const activeYearCategory =
    selectedYearCategoryIndex === null ? null : yearPieCategories[selectedYearCategoryIndex];
  const totalYearCategorySpend = yearPieCategories.reduce((sum, cat) => sum + cat.amount, 0);

  const yearlyByYear = useMemo(() => {
    const map = new Map<number, typeof yearlyReports[number]>();
    yearlyReports.forEach((report) => map.set(report.year, report));
    return map;
  }, [yearlyReports]);

  const trendSeries = useMemo(() => {
    const chrono = [...monthlyReports].reverse().slice(-6);
    const income = chrono.map((report) => report.income);
    const expenses = chrono.map((report) => report.expenses);
    const savings = chrono.map((report) => report.savings);
    return { income, expenses, savings };
  }, [monthlyReports]);

  if (transactions.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.empty}>
          <Ionicons name="bar-chart-outline" size={64} color={colors.muted} />
          <Text style={[styles.title, { color: colors.ink }]}>No Reports</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>Import data to see spending reports.</Text>
        </View>
      </View>
    );
  }

  const renderTabs = () => (
    <View style={[styles.tabContainer, { backgroundColor: colors.wash }]}>
      {(['overview', 'yearly', 'trends'] as TabType[]).map((tab) => (
        <TouchableOpacity
          key={tab}
          style={[
            styles.tab,
            activeTab === tab && {
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border
            }
          ]}
          onPress={() => setActiveTab(tab)}
        >
          <Text style={[
            styles.tabText,
            { color: colors.muted },
            activeTab === tab && { color: colors.ink }
          ]}>
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderOverview = () => (
    <>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Expense Categories</Text>
        <View style={styles.segmentedControl}>
          {(['month', 'year'] as Scope[]).map((scope) => (
            <TouchableOpacity
              key={scope}
              style={[
                styles.segmentedButton,
                categoryScope === scope && styles.segmentedButtonActive,
              ]}
              onPress={() => setCategoryScope(scope)}
            >
              <Text
                style={[
                  styles.segmentedText,
                  categoryScope === scope && styles.segmentedTextActive,
                ]}
              >
                {scope === 'month' ? 'Monthly' : 'Yearly'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.card}>
        {categorySpending.length === 0 ? (
          <Text style={styles.emptyChartText}>No expenses for this period.</Text>
        ) : (
          <View style={styles.pieLayout}>
            <View style={styles.pieWrapper}>
              <PieChart
                data={pieCategories.map((cat) => ({
                  value: cat.amount,
                  color: cat.color,
                }))}
                size={200}
                innerRadius={72}
                selectedIndex={selectedCategoryIndex}
                onSlicePress={(index) =>
                  setSelectedCategoryIndex((prev) => (prev === index ? null : index))
                }
              />
              <View style={styles.pieCenter}>
                <Text style={[styles.pieCenterLabel, { color: colors.muted }]}>
                  {activeCategory ? activeCategory.category : 'Total Spend'}
                </Text>
                <Text style={[styles.pieCenterValue, { color: colors.ink }]}>
                  {formatCompactCurrencySafe(activeCategory ? activeCategory.amount : totalCategorySpend)}
                </Text>
                {activeCategory && (
                  <Text style={styles.pieCenterSub}>
                    {activeCategory.percentage.toFixed(1)}% of total
                  </Text>
                )}
              </View>
            </View>
          </View>
        )}
        {categorySpending.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.legendChips}
          >
            {pieCategories.map((cat, index) => {
              const isActive = selectedCategoryIndex === index;
              return (
                <TouchableOpacity
                  key={cat.category}
                  style={[styles.legendChip, isActive && styles.legendChipActive]}
                  onPress={() => setSelectedCategoryIndex(isActive ? null : index)}
                >
                  <View style={[styles.legendDot, { backgroundColor: cat.color }]} />
                  <Text style={styles.legendChipText} numberOfLines={1}>{cat.category}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Recent Months</Text>
        <Text style={styles.sectionHint}>Last 6 months</Text>
      </View>

      {monthlyReports.slice(0, 6).map((report) => (
        <View key={report.month} style={styles.monthCard}>
          <Text style={styles.monthTitle}>{formatMonth(report.month)}</Text>
          <View style={styles.monthStats}>
            <View style={styles.monthStat}>
              <Text style={styles.monthStatLabel}>Income</Text>
              <Text style={styles.monthStatIncome}>{formatCurrencySafe(report.income)}</Text>
            </View>
            <View style={styles.monthStat}>
              <Text style={styles.monthStatLabel}>Expenses</Text>
              <Text style={styles.monthStatExpense}>{formatCurrencySafe(report.expenses)}</Text>
            </View>
            <View style={styles.monthStat}>
              <Text style={styles.monthStatLabel}>Savings</Text>
              <Text style={[styles.monthStatSavings, report.savings < 0 && styles.negativeSavings]}>
                {formatCurrencySafe(report.savings)}
              </Text>
            </View>
          </View>
        </View>
      ))}
    </>
  );

  const renderYearly = () => (
    <>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Yearly Summary</Text>
        <Text style={styles.sectionHint}>Net by year</Text>
      </View>

      {yearlyReports.map((report) => (
        <View key={report.year} style={styles.yearCard}>
          <View style={styles.yearHeader}>
            <Text style={styles.yearTitle}>{report.year}</Text>
            <View style={[
              styles.savingsRateBadge,
              { backgroundColor: report.savingsRate >= 20 ? palette.positive : report.savingsRate >= 0 ? palette.highlight : palette.negative }
            ]}>
              <Text style={styles.savingsRateText}>{report.savingsRate.toFixed(0)}% saved</Text>
            </View>
          </View>
          <View style={styles.yearStats}>
            <View style={styles.yearStatRow}>
              <View style={styles.yearStat}>
                <Text style={styles.yearStatLabel}>Total Income</Text>
                <Text style={styles.yearStatIncome}>{formatCompactCurrencySafe(report.totalIncome)}</Text>
              </View>
              <View style={styles.yearStat}>
                <Text style={styles.yearStatLabel}>Total Expenses</Text>
                <Text style={styles.yearStatExpense}>{formatCompactCurrencySafe(report.totalExpenses)}</Text>
                {yearlyByYear.has(report.year - 1) && (
                  <Text style={styles.yearDelta}>
                    {(() => {
                      const prev = yearlyByYear.get(report.year - 1);
                      if (!prev || prev.totalExpenses <= 0) return '—';
                      const change = ((report.totalExpenses - prev.totalExpenses) / prev.totalExpenses) * 100;
                      const direction = change <= 0 ? '▼' : '▲';
                      return `${direction} ${Math.abs(change).toFixed(0)}% vs ${report.year - 1}`;
                    })()}
                  </Text>
                )}
              </View>
            </View>
            <View style={styles.yearStatRow}>
              <View style={styles.yearStat}>
                <Text style={styles.yearStatLabel}>Net Savings</Text>
                <Text style={[styles.yearStatSavings, report.savings < 0 && styles.negativeSavings]}>
                  {formatCompactCurrencySafe(report.savings)}
                </Text>
              </View>
              <View style={styles.yearStat}>
                <Text style={styles.yearStatLabel}>Avg Spend/mo</Text>
                <Text style={styles.yearStatAvg}>
                  {formatCompactCurrencySafe(report.monthlyAvgExpense)}
                </Text>
              </View>
            </View>
          </View>
        </View>
      ))}

      {availableYears.length > 0 && (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Year Focus</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.yearPicker}
          >
            {availableYears.map((year) => (
              <TouchableOpacity
                key={year}
                style={[styles.yearChip, focusedYear === year && styles.yearChipActive]}
                onPress={() => setFocusedYear(year)}
              >
                <Text style={[styles.yearChipText, focusedYear === year && styles.yearChipTextActive]}>
                  {year}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.cardSubtitle}>Top categories for {focusedYear}</Text>
        {yearCategorySpending.length === 0 ? (
          <Text style={styles.emptyChartText}>No expense data for this year.</Text>
        ) : (
          <View style={styles.pieLayout}>
            <View style={styles.pieWrapper}>
              <PieChart
                data={yearPieCategories.map((cat) => ({
                  value: cat.amount,
                  color: cat.color,
                }))}
                size={200}
                innerRadius={72}
                selectedIndex={selectedYearCategoryIndex}
                onSlicePress={(index) =>
                  setSelectedYearCategoryIndex((prev) => (prev === index ? null : index))
                }
              />
              <View style={styles.pieCenter}>
                <Text style={styles.pieCenterLabel}>
                  {activeYearCategory ? activeYearCategory.category : 'Total Spend'}
                </Text>
                <Text style={styles.pieCenterValue}>
                  {formatCompactCurrencySafe(activeYearCategory ? activeYearCategory.amount : totalYearCategorySpend)}
                </Text>
                {activeYearCategory && (
                  <Text style={styles.pieCenterSub}>
                    {activeYearCategory.percentage.toFixed(1)}% of total
                  </Text>
                )}
              </View>
            </View>
          </View>
        )}
        {yearCategorySpending.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.legendChips}
          >
            {yearPieCategories.map((cat, index) => {
              const isActive = selectedYearCategoryIndex === index;
              return (
                <TouchableOpacity
                  key={cat.category}
                  style={[styles.legendChip, isActive && styles.legendChipActive]}
                  onPress={() => setSelectedYearCategoryIndex(isActive ? null : index)}
                >
                  <View style={[styles.legendDot, { backgroundColor: cat.color }]} />
                  <Text style={styles.legendChipText} numberOfLines={1}>{cat.category}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>
    </>
  );

  const renderTrends = () => (
    <>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Momentum</Text>
        <Text style={styles.sectionHint}>Recent vs previous 3 months</Text>
      </View>

      {trends.length > 0 && (
        <View style={styles.card}>
          {trends.map((trend) => {
            const icon = trend.direction === 'up' ? 'trending-up' :
              trend.direction === 'down' ? 'trending-down' : 'remove';
            const isGood = trend.type === 'expense'
              ? trend.direction === 'down'
              : trend.direction === 'up';
            const color = trend.direction === 'stable' ? palette.muted : isGood ? palette.positive : palette.negative;
            const series = trend.type === 'income'
              ? trendSeries.income
              : trend.type === 'expense'
                ? trendSeries.expenses
                : trendSeries.savings;

            return (
              <View key={trend.type} style={styles.trendRow}>
                <View style={styles.trendLeft}>
                  <Ionicons name={icon as any} size={22} color={color} />
                  <View style={styles.trendInfo}>
                    <Text style={styles.trendLabel}>
                      {trend.type.charAt(0).toUpperCase() + trend.type.slice(1)}
                    </Text>
                    <Text style={styles.trendAvg}>Avg: {formatCurrencySafe(trend.recentAvg)}/mo</Text>
                  </View>
                </View>
                <View style={styles.trendRight}>
                  <Sparkline data={series} color={color} width={72} height={24} />
                  <Text style={[styles.trendChange, { color }]}>
                    {trend.percentChange > 0 ? '+' : ''}{trend.percentChange.toFixed(1)}%
                  </Text>
                  <Text style={styles.trendDirection}>
                    {trend.direction === 'stable' ? 'Stable' : trend.direction === 'up' ? 'Rising' : 'Falling'}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      )}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Expense Timeline</Text>
        <View style={styles.segmentedControl}>
          {(['month', 'year'] as Scope[]).map((scope) => (
            <TouchableOpacity
              key={scope}
              style={[
                styles.segmentedButton,
                timelineScope === scope && styles.segmentedButtonActive,
              ]}
              onPress={() => setTimelineScope(scope)}
            >
              <Text
                style={[
                  styles.segmentedText,
                  timelineScope === scope && styles.segmentedTextActive,
                ]}
              >
                {scope === 'month' ? 'Monthly' : 'Yearly'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.card}>
        {timelineData.length === 0 ? (
          <Text style={styles.emptyChartText}>No expense data yet.</Text>
        ) : (
          <View>
            <Text style={styles.timelineHint}>
              {selectedTimelineIndex === null
                ? `Average: ${formatCompactCurrencySafe(averageTimelineValue)}`
                : `${timelineData[selectedTimelineIndex]?.label}: ${formatCompactCurrencySafe(timelineData[selectedTimelineIndex]?.value || 0)}`}
            </Text>
            <View style={styles.timelineChart}>
              <View style={[styles.referenceLine, { top: timelineLineOffset }]} />
              {timelineData.map((item, index) => {
                const height = maxTimelineValue > 0 ? (item.value / maxTimelineValue) * timelineHeight : 0;
                const isActive = selectedTimelineIndex === index;
                return (
                  <TouchableOpacity
                    key={item.label}
                    style={styles.timelineItem}
                    onPress={() =>
                      setSelectedTimelineIndex((prev) => (prev === index ? null : index))
                    }
                  >
                    <View style={styles.timelineTrack}>
                      <View style={[styles.timelineFill, isActive && styles.timelineFillActive, { height }]} />
                    </View>
                    <Text style={styles.timelineLabel}>{item.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}
      </View>
    </>
  );

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
      <View style={[styles.backgroundOrb, { backgroundColor: colors.accentSoft, opacity: isDark ? 0.2 : 0.6 }]} />
      <View style={[styles.backgroundOrbAlt, { backgroundColor: isDark ? colors.card : '#FDE7D3', opacity: isDark ? 0.1 : 0.7 }]} />
      {renderTabs()}
      {activeTab === 'overview' && renderOverview()}
      {activeTab === 'yearly' && renderYearly()}
      {activeTab === 'trends' && renderTrends()}
      <View style={styles.bottomPadding} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background,
  },
  content: {
    padding: 20,
  },
  backgroundOrb: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: palette.accentSoft,
    opacity: 0.6,
    top: -80,
    right: -60,
  },
  backgroundOrbAlt: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: '#FDE7D3',
    opacity: 0.7,
    bottom: 140,
    left: -80,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    color: palette.ink,
    fontSize: 20,
    marginTop: 16,
    fontWeight: '600',
  },
  subtitle: {
    color: palette.muted,
    fontSize: 14,
    marginTop: 8,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: palette.wash,
    borderRadius: 20,
    padding: 4,
    marginBottom: 18,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 16,
  },
  activeTab: {
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
  },
  tabText: {
    color: palette.muted,
    fontSize: 13,
    fontWeight: '600',
  },
  activeTabText: {
    color: palette.ink,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    color: palette.ink,
    fontSize: 18,
    fontWeight: '600',
  },
  sectionHint: {
    color: palette.muted,
    fontSize: 12,
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: '#EFE8DD',
    borderRadius: 20,
    padding: 4,
  },
  segmentedButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  segmentedButtonActive: {
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
  },
  segmentedText: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  segmentedTextActive: {
    color: palette.ink,
  },
  card: {
    backgroundColor: palette.card,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: palette.border,
    marginBottom: 18,
  },
  cardSubtitle: {
    color: palette.muted,
    fontSize: 12,
    marginBottom: 12,
  },
  emptyChartText: {
    color: palette.muted,
    fontSize: 13,
  },
  pieLayout: {
    alignItems: 'center',
  },
  pieWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pieCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    width: 120,
  },
  pieCenterLabel: {
    color: palette.muted,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  pieCenterValue: {
    color: palette.ink,
    fontSize: 18,
    fontWeight: '700',
    marginTop: 4,
  },
  pieCenterSub: {
    color: palette.muted,
    fontSize: 11,
    marginTop: 2,
  },
  legendChips: {
    marginTop: 12,
    paddingBottom: 4,
    gap: 10,
  },
  legendChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#EFE8DD',
    borderWidth: 1,
    borderColor: palette.border,
  },
  legendChipActive: {
    backgroundColor: palette.card,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  legendChipText: {
    color: palette.ink,
    fontSize: 12,
    fontWeight: '600',
  },
  monthCard: {
    backgroundColor: palette.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: palette.border,
  },
  monthTitle: {
    color: palette.ink,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 10,
  },
  monthStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  monthStat: {
    alignItems: 'center',
    flex: 1,
  },
  monthStatLabel: {
    color: palette.muted,
    fontSize: 11,
  },
  monthStatIncome: {
    color: palette.positive,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
  },
  monthStatExpense: {
    color: palette.negative,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
  },
  monthStatSavings: {
    color: palette.positive,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
  },
  negativeSavings: {
    color: palette.negative,
  },
  yearCard: {
    backgroundColor: palette.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: palette.border,
  },
  yearHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  yearTitle: {
    color: palette.ink,
    fontSize: 24,
    fontWeight: '700',
  },
  savingsRateBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  savingsRateText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  yearStats: {
    gap: 10,
  },
  yearStatRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  yearStat: {
    flex: 1,
  },
  yearStatLabel: {
    color: palette.muted,
    fontSize: 12,
    marginBottom: 4,
  },
  yearStatIncome: {
    color: palette.positive,
    fontSize: 18,
    fontWeight: '600',
  },
  yearStatExpense: {
    color: palette.negative,
    fontSize: 18,
    fontWeight: '600',
  },
  yearStatSavings: {
    color: palette.positive,
    fontSize: 18,
    fontWeight: '600',
  },
  yearStatAvg: {
    color: palette.accent,
    fontSize: 18,
    fontWeight: '600',
  },
  yearDelta: {
    color: palette.muted,
    fontSize: 11,
    marginTop: 4,
  },
  yearPicker: {
    flexDirection: 'row',
    gap: 6,
  },
  yearChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: palette.wash,
  },
  yearChipActive: {
    backgroundColor: palette.accentSoft,
  },
  yearChipText: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  yearChipTextActive: {
    color: palette.accent,
  },
  trendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  trendLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  trendInfo: {
    marginLeft: 12,
  },
  trendLabel: {
    color: palette.ink,
    fontSize: 15,
    fontWeight: '600',
  },
  trendAvg: {
    color: palette.muted,
    fontSize: 11,
    marginTop: 2,
  },
  trendRight: {
    alignItems: 'flex-end',
  },
  trendChange: {
    fontSize: 14,
    fontWeight: '700',
  },
  trendDirection: {
    color: palette.muted,
    fontSize: 11,
  },
  timelineChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 10,
    position: 'relative',
    height: 160,
  },
  timelineItem: {
    flex: 1,
    alignItems: 'center',
  },
  timelineTrack: {
    height: 140,
    width: '100%',
    backgroundColor: palette.wash,
    borderRadius: 12,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  timelineFill: {
    width: '100%',
    backgroundColor: palette.accent,
    borderRadius: 12,
  },
  timelineFillActive: {
    backgroundColor: palette.highlight,
  },
  timelineLabel: {
    color: palette.muted,
    fontSize: 11,
    marginTop: 6,
  },
  timelineHint: {
    color: palette.muted,
    fontSize: 12,
    marginBottom: 10,
  },
  referenceLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderColor: palette.highlight,
  },
  bottomPadding: {
    height: 30,
  },
});
