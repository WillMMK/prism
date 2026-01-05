import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useBudgetStore } from '../../src/store/budgetStore';
import { usePremiumStore } from '../../src/store/premiumStore';
import { useToastStore } from '../../src/store/toastStore';
import { Transaction, CategorySpending, BudgetSummary } from '../../src/types/budget';
import { PieChart } from '../../src/components/PieChart';
import { SyncStatusIndicator } from '../../src/components/SyncStatusIndicator';
import GlassCard from '../../src/components/GlassCard';
import { useAutoSync } from '../../src/hooks/useAutoSync';
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

type Scope = 'month' | 'year';
type BalanceScope = 'year' | 'overall';

const formatCurrency = (amount: number) =>
  '$' + amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

const formatCompactCurrency = (amount: number) => {
  const abs = Math.abs(amount);
  if (abs >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}m`;
  if (abs >= 1_000) return `$${(amount / 1_000).toFixed(1)}k`;
  return `$${amount.toFixed(0)}`;
};

const formatShortDate = (dateStr: string) => {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  const now = new Date();
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
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

const getNetExpenseTotal = (transactions: Transaction[]): number => {
  let outflow = 0;
  let rebates = 0;

  transactions.forEach((transaction) => {
    if (transaction.type !== 'expense') return;
    const signed = getSignedAmount(transaction);
    if (signed < 0) {
      outflow += Math.abs(signed);
    } else {
      rebates += signed;
    }
  });

  return Math.max(0, outflow - rebates);
};

const buildBudgetSummary = (transactions: Transaction[]): BudgetSummary => {
  const totalIncome = transactions
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + Math.max(0, getSignedAmount(t)), 0);
  const totalExpenses = getNetExpenseTotal(transactions);
  const balance = totalIncome - totalExpenses;
  const savingsRate = totalIncome > 0 ? ((totalIncome - totalExpenses) / totalIncome) * 100 : 0;

  return { totalIncome, totalExpenses, balance, savingsRate };
};

const getYearRange = (transactions: Transaction[]): string => {
  const years = transactions
    .map((tx) => new Date(tx.date).getFullYear())
    .filter((year) => !isNaN(year));

  if (years.length === 0) return '—';
  const minYear = Math.min(...years);
  const maxYear = Math.max(...years);
  return minYear === maxYear ? `${minYear}` : `${minYear}–${maxYear}`;
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
  const categoryTotals = new Map<string, number>();

  expenses.forEach((tx) => {
    const signed = getSignedAmount(tx);
    const current = categoryTotals.get(tx.category) || 0;
    categoryTotals.set(tx.category, current + signed);
  });

  const netTotals = Array.from(categoryTotals.entries())
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

export default function Dashboard() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { transactions, categories, getRecentTransactions, getAvailableYears, demoConfig, sheetsConfig } = useBudgetStore();
  const { isPremium } = usePremiumStore();
  const { showToast } = useToastStore();
  const [categoryScope, setCategoryScope] = useState<Scope>('month');
  const [balanceScope, setBalanceScope] = useState<BalanceScope>('year');
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

  // Auto-sync hook
  const { syncNow, syncStatus, lastSyncTime } = useAutoSync({
    onSyncResult: ({ newCount, isFirstSync, totalCount }) => {
      if (isFirstSync) {
        showToast({ message: `Synced ${totalCount} transactions`, tone: 'success' });
      } else if (newCount > 0) {
        showToast({ message: `Synced ${newCount} new transaction${newCount > 1 ? 's' : ''}`, tone: 'success' });
      }
    },
  });

  // Auto-navigate first-time users to Settings
  const hasNavigatedRef = React.useRef(false);
  React.useEffect(() => {
    const isFirstTimeUser = transactions.length === 0 && !sheetsConfig.isConnected;
    if (isFirstTimeUser && !hasNavigatedRef.current) {
      hasNavigatedRef.current = true;
      // Small delay to ensure navigation stack is ready
      setTimeout(() => {
        router.push('/settings');
      }, 100);
    }
  }, [transactions.length, sheetsConfig.isConnected, router]);

  const recentTransactions = getRecentTransactions(4);
  const availableYears = getAvailableYears();
  const latestDate = useMemo(() => getLatestDate(transactions), [transactions]);
  const yearRange = useMemo(() => getYearRange(transactions), [transactions]);

  React.useEffect(() => {
    if (availableYears.length > 0 && !availableYears.includes(selectedYear)) {
      setSelectedYear(availableYears[0]);
    }
  }, [availableYears, selectedYear]);

  const balanceTransactions = useMemo(() => {
    if (balanceScope === 'overall') return transactions;
    return transactions.filter((tx) => new Date(tx.date).getFullYear() === selectedYear);
  }, [transactions, balanceScope, selectedYear]);

  const balanceSummary = useMemo(
    () => buildBudgetSummary(balanceTransactions),
    [balanceTransactions]
  );

  const scopedTransactions = useMemo(
    () => filterTransactionsByScope(transactions, categoryScope, latestDate),
    [transactions, categoryScope, latestDate]
  );

  const categorySpending = useMemo(() => {
    const base = buildCategorySpending(scopedTransactions, categories);
    return ensureDistinctColors(base);
  }, [scopedTransactions, categories]);

  const scopeLabel = categoryScope === 'month' ? 'This Month' : 'This Year';
  const maskAmount = demoConfig.hideAmounts;

  const formatCurrencySafe = (amount: number) =>
    maskAmount ? '•••' : formatCurrency(amount);

  const formatCompactCurrencySafe = (amount: number) =>
    maskAmount ? '•••' : formatCompactCurrency(amount);

  const [selectedCategoryIndex, setSelectedCategoryIndex] = useState<number | null>(null);
  const pieCategories = categorySpending.slice(0, 6);
  const activeCategory = selectedCategoryIndex === null ? null : pieCategories[selectedCategoryIndex];
  const totalCategorySpend = pieCategories.reduce((sum, cat) => sum + cat.amount, 0);

  if (transactions.length === 0) {
    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={[styles.headerGradient, { backgroundColor: 'rgba(15, 118, 110, 0.06)' }]} />
          <View style={styles.emptyCard}>
            <Ionicons name="wallet-outline" size={48} color={palette.accent} />
            <Text style={styles.emptyTitle}>Budget Tracker</Text>
            <Text style={styles.emptySubtitle}>Connect your Google Sheet to get started.</Text>
          </View>
          <View style={styles.emptySteps}>
            <Text style={styles.stepTitle}>Quick start</Text>
            <Text style={styles.stepText}>1. Open Settings</Text>
            <Text style={styles.stepText}>2. Upload your sheet</Text>
            <Text style={styles.stepText}>3. Tap Analyze, then Import</Text>
          </View>
        </ScrollView>
        <TouchableOpacity style={styles.fab} onPress={() => router.push('/add-transaction')}>
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Gradient header that reflects financial health */}
        <View
          style={[
            styles.headerGradient,
            {
              backgroundColor: balanceSummary.balance >= 0
                ? (isDark ? 'rgba(20, 184, 166, 0.15)' : 'rgba(15, 118, 110, 0.08)')
                : (isDark ? 'rgba(214, 69, 80, 0.15)' : 'rgba(214, 69, 80, 0.06)')
            }
          ]}
        />


        {/* Budget Overview Card - Glassmorphism */}
        <GlassCard>
          <View style={{ marginBottom: 16 }}>
            {/* Title Row */}
            <View style={{ marginBottom: 12 }}>
              <Text style={[styles.cardTitle, { color: colors.ink }]}>Budget Overview</Text>
              <Text style={[styles.cardSubtitle, { color: colors.muted }]}>
                {balanceScope === 'year' ? `${selectedYear}` : 'All Time'}
              </Text>
            </View>

            {/* Controls Row: Sync button + Segmented control */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View>
                {isPremium && sheetsConfig.isConnected && (
                  <SyncStatusIndicator
                    status={syncStatus}
                    lastSyncTime={lastSyncTime}
                    onPress={() => syncNow(false, true)}
                    compact
                  />
                )}
              </View>
              <View style={[styles.segmentedControl, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : colors.wash, marginTop: 0 }]}>
                {(['year', 'overall'] as BalanceScope[]).map((scope) => (
                  <TouchableOpacity
                    key={scope}
                    style={[
                      styles.segmentedButton,
                      balanceScope === scope && {
                        backgroundColor: isDark ? 'rgba(255,255,255,0.15)' : colors.card,
                        shadowColor: colors.ink,
                        shadowOpacity: 0.05
                      }
                    ]}
                    onPress={() => setBalanceScope(scope)}
                  >
                    <Text
                      style={[
                        styles.segmentedText,
                        { color: colors.muted },
                        balanceScope === scope && { color: colors.ink, fontWeight: '600' }
                      ]}
                    >
                      {scope === 'year' ? 'This Year' : 'Overall'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>

          {balanceScope === 'year' && availableYears.length > 1 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.yearPicker}
            >
              {availableYears.map((year) => (
                <TouchableOpacity
                  key={year}
                  style={[
                    styles.yearChip,
                    { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : colors.wash },
                    selectedYear === year && { backgroundColor: colors.ink }
                  ]}
                  onPress={() => setSelectedYear(year)}
                >
                  <Text style={[
                    styles.yearChipText,
                    { color: colors.ink },
                    selectedYear === year && { color: colors.background }
                  ]}>
                    {year}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          <View style={styles.heroStats}>
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: colors.positive }]}>
                  {formatCompactCurrencySafe(balanceSummary.totalIncome)}
                </Text>
                <Text style={[styles.statLabel, { color: colors.muted }]}>Income</Text>
              </View>
              <View style={[styles.statDivider, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : colors.border }]} />
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: colors.ink }]}>
                  {formatCompactCurrencySafe(balanceSummary.totalExpenses)}
                </Text>
                <Text style={[styles.statLabel, { color: colors.muted }]}>Expenses</Text>
              </View>
              <View style={[styles.statDivider, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : colors.border }]} />
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: balanceSummary.balance >= 0 ? colors.positive : colors.negative }]}>
                  {formatCompactCurrencySafe(balanceSummary.balance)}
                </Text>
                <Text style={[styles.statLabel, { color: colors.muted }]}>Net</Text>
              </View>
            </View>
          </View>
        </GlassCard>

        {/* Category Spending Card - Glassmorphism */}
        <GlassCard style={{ marginTop: 24 }}>
          <View style={styles.cardHeader}>
            <View>
              <Text style={[styles.cardTitle, { color: colors.ink }]}>Category Breakdown</Text>
            </View>
            <View style={[styles.segmentedControl, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : colors.wash }]}>
              {(['month', 'year'] as Scope[]).map((scope) => (
                <TouchableOpacity
                  key={scope}
                  style={[
                    styles.segmentedButton,
                    categoryScope === scope && {
                      backgroundColor: isDark ? 'rgba(255,255,255,0.15)' : colors.card,
                      shadowColor: colors.ink,
                      shadowOpacity: 0.05
                    }
                  ]}
                  onPress={() => setCategoryScope(scope)}
                >
                  <Text
                    style={[
                      styles.segmentedText,
                      { color: colors.muted },
                      categoryScope === scope && { color: colors.ink, fontWeight: '600' }
                    ]}
                  >
                    {scope === 'month' ? 'Monthly' : 'Yearly'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <Text style={[styles.cardSubtitle, { color: colors.muted }]}>{scopeLabel} spending</Text>
          {categorySpending.length === 0 ? (
            <Text style={[styles.emptyChartText, { color: colors.muted }]}>No expenses recorded for this period.</Text>
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
                    <Text style={[styles.pieCenterSub, { color: colors.muted }]}>
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
                    style={[
                      styles.legendChip,
                      { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : colors.wash },
                      isActive && { backgroundColor: colors.accent }
                    ]}
                    onPress={() => setSelectedCategoryIndex(isActive ? null : index)}
                  >
                    <View style={[styles.legendDot, { backgroundColor: cat.color }]} />
                    <Text style={[
                      styles.legendChipText,
                      { color: isActive ? '#fff' : colors.ink }
                    ]} numberOfLines={1}>
                      {cat.category}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </GlassCard>

        {recentTransactions.length > 0 && (
          <GlassCard style={{ marginTop: 24 }}>
            <View style={styles.sectionHeaderInline}>
              <Text style={[styles.sectionTitle, { color: colors.ink }]}>Latest Activity</Text>
              <Text style={[styles.sectionHint, { color: colors.muted }]}>Newest 4</Text>
            </View>
            {recentTransactions.map((tx, index) => {
              const signed = getSignedAmount(tx);
              const isPositive = signed > 0;
              const isExpense = tx.type === 'expense';
              const amountColor = isExpense
                ? isPositive
                  ? colors.positive
                  : colors.negative
                : colors.positive;
              const sign = isPositive ? '+' : '-';
              const hasDescription =
                tx.description &&
                tx.description.trim().length > 0 &&
                tx.description.trim().toLowerCase() !== tx.category.trim().toLowerCase();

              return (
                <View
                  key={tx.id}
                  style={[
                    styles.transactionRow,
                    { borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : colors.border },
                    index === recentTransactions.length - 1 && { borderBottomWidth: 0 }
                  ]}
                >
                  <View style={styles.transactionInfo}>
                    <Text style={[styles.transactionDesc, { color: colors.ink }]} numberOfLines={1}>
                      {tx.category}
                    </Text>
                    {hasDescription && (
                      <Text style={[styles.transactionMeta, { color: colors.muted }]}>{tx.description}</Text>
                    )}
                    <Text style={[styles.transactionMeta, { color: colors.muted }]}>{formatShortDate(tx.date)}</Text>
                  </View>
                  <Text style={[styles.transactionAmount, { color: amountColor }]}>
                    {sign}{formatCurrencySafe(Math.abs(signed))}
                  </Text>
                </View>
              );
            })}
          </GlassCard>
        )}

        <View style={styles.bottomPadding} />
      </ScrollView>
      <TouchableOpacity style={[styles.fab, { backgroundColor: colors.highlight }]} onPress={() => router.push('/add-transaction')}>
        <Ionicons name="add" size={24} color="#fff" />
      </TouchableOpacity>
    </View>
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
  fab: {
    position: 'absolute',
    bottom: 28,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: palette.highlight,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 6,
  },
  headerGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 280,
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
  },
  heroCard: {
    backgroundColor: palette.card,
    borderRadius: 22,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: palette.border,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  heroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  heroControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  heroLabel: {
    color: palette.muted,
    fontSize: 13,
    letterSpacing: 0.4,
    fontFamily: 'Avenir Next',
    textTransform: 'uppercase',
  },
  heroHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  heroSegmentedControl: {
    padding: 3,
  },
  rangePill: {
    backgroundColor: palette.accentSoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  yearPicker: {
    marginTop: 10,
    paddingBottom: 4,
    gap: 8,
  },
  yearChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#EFE8DD',
    borderWidth: 1,
    borderColor: palette.border,
  },
  yearChipActive: {
    backgroundColor: palette.card,
  },
  yearChipText: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  yearChipTextActive: {
    color: palette.ink,
  },
  rangeText: {
    color: palette.accent,
    fontSize: 12,
    fontWeight: '600',
  },
  heroAmount: {
    color: palette.ink,
    fontSize: 34,
    fontWeight: '700',
    marginTop: 10,
  },
  heroStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
  },
  heroStatItem: {
    flex: 1,
  },
  heroStatDivider: {
    width: 1,
    height: 32,
    backgroundColor: palette.border,
    marginHorizontal: 8,
  },
  heroStatLabel: {
    color: palette.muted,
    fontSize: 12,
  },
  heroStatValue: {
    color: palette.ink,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
  },
  heroStatValuePositive: {
    color: palette.positive,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
  },
  heroStatValueNegative: {
    color: palette.negative,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionHeaderInline: {
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
  transactionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  transactionInfo: {
    flex: 1,
    marginRight: 12,
  },
  transactionDesc: {
    color: palette.ink,
    fontSize: 14,
    fontWeight: '600',
  },
  transactionMeta: {
    color: palette.muted,
    fontSize: 12,
    marginTop: 2,
  },
  transactionAmount: {
    fontSize: 14,
    fontWeight: '600',
  },
  bottomPadding: {
    height: 20,
  },
  emptyCard: {
    backgroundColor: palette.card,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: palette.border,
  },
  emptyTitle: {
    color: palette.ink,
    fontSize: 22,
    fontWeight: '600',
    marginTop: 12,
  },
  emptySubtitle: {
    color: palette.muted,
    fontSize: 13,
    marginTop: 8,
    textAlign: 'center',
  },
  emptySteps: {
    backgroundColor: '#FFF7EE',
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#F0E2D6',
  },
  stepTitle: {
    color: palette.ink,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 10,
  },
  stepText: {
    color: palette.muted,
    fontSize: 13,
    marginBottom: 6,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: palette.ink,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingTop: 8,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  statDivider: {
    width: 1,
    height: 32,
  },
});
