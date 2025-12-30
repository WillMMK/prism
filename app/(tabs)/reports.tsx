import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useBudgetStore } from '../../src/store/budgetStore';
import { formatCurrency, formatPercent } from '../../src/utils/formatters';

export default function Reports() {
  const { getBudgetSummary, getCategorySpending, getMonthlyReports } = useBudgetStore();

  const summary = getBudgetSummary();
  const categorySpending = getCategorySpending();
  const monthlyReports = getMonthlyReports(6);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Summary Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Total Income</Text>
          <Text style={[styles.statValue, styles.income]}>{formatCurrency(summary.totalIncome)}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Total Expenses</Text>
          <Text style={[styles.statValue, styles.expense]}>{formatCurrency(summary.totalExpenses)}</Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={[styles.statCard, styles.fullWidth]}>
          <View style={styles.statRow}>
            <View>
              <Text style={styles.statLabel}>Net Savings</Text>
              <Text style={[styles.statValue, summary.balance >= 0 ? styles.positive : styles.negative]}>
                {formatCurrency(summary.balance)}
              </Text>
            </View>
            <View style={styles.savingsRateContainer}>
              <Text style={styles.savingsRateLabel}>Savings Rate</Text>
              <Text style={styles.savingsRateValue}>{formatPercent(summary.savingsRate)}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Category Breakdown */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Spending by Category</Text>
        {categorySpending.length > 0 ? (
          <View style={styles.categoryList}>
            {categorySpending.map((cat) => (
              <View key={cat.category} style={styles.categoryRow}>
                <View style={styles.categoryInfo}>
                  <View style={[styles.categoryDot, { backgroundColor: cat.color }]} />
                  <Text style={styles.categoryName}>{cat.category}</Text>
                </View>
                <View style={styles.categoryValues}>
                  <Text style={styles.categoryAmount}>{formatCurrency(cat.amount)}</Text>
                  <Text style={styles.categoryPercent}>{formatPercent(cat.percentage)}</Text>
                </View>
                <View style={styles.progressBarBg}>
                  <View style={[styles.progressBar, { width: `${cat.percentage}%`, backgroundColor: cat.color }]} />
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="pie-chart-outline" size={48} color="#8892b0" />
            <Text style={styles.emptyText}>No spending data</Text>
            <Text style={styles.emptySubtext}>Connect to Google Sheets to see reports</Text>
          </View>
        )}
      </View>

      {/* Monthly Summary */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Monthly Summary</Text>
        {monthlyReports.length > 0 ? (
          <View style={styles.monthlyList}>
            {monthlyReports.map((report) => (
              <View key={report.month} style={styles.monthCard}>
                <Text style={styles.monthLabel}>{report.month}</Text>
                <View style={styles.monthStats}>
                  <View style={styles.monthStat}>
                    <Ionicons name="arrow-down" size={16} color="#4CAF50" />
                    <Text style={styles.monthIncome}>{formatCurrency(report.income)}</Text>
                  </View>
                  <View style={styles.monthStat}>
                    <Ionicons name="arrow-up" size={16} color="#e94560" />
                    <Text style={styles.monthExpense}>{formatCurrency(report.expenses)}</Text>
                  </View>
                  <View style={styles.monthStat}>
                    <Ionicons name="wallet" size={16} color="#64ffda" />
                    <Text style={[styles.monthSavings, report.savings >= 0 ? styles.positive : styles.negative]}>
                      {formatCurrency(report.savings)}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={48} color="#8892b0" />
            <Text style={styles.emptyText}>No monthly data</Text>
          </View>
        )}
      </View>

      {/* Insights */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Insights</Text>
        <View style={styles.insightCard}>
          <Ionicons name="bulb" size={24} color="#FFCE56" />
          <View style={styles.insightContent}>
            <Text style={styles.insightTitle}>Top Spending Category</Text>
            <Text style={styles.insightText}>
              {categorySpending.length > 0
                ? `${categorySpending[0].category} accounts for ${formatPercent(categorySpending[0].percentage)} of your spending`
                : 'Connect to Google Sheets to see insights'}
            </Text>
          </View>
        </View>
        <View style={styles.insightCard}>
          <Ionicons name="trending-up" size={24} color="#4CAF50" />
          <View style={styles.insightContent}>
            <Text style={styles.insightTitle}>Savings Goal</Text>
            <Text style={styles.insightText}>
              {summary.savingsRate >= 20
                ? "Great job! You're saving more than 20% of your income"
                : summary.savingsRate > 0
                ? 'Try to increase your savings rate to 20% for better financial health'
                : 'Start tracking your budget to set savings goals'}
            </Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#16213e',
    borderRadius: 16,
    padding: 16,
  },
  fullWidth: {
    flex: 1,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statLabel: {
    color: '#8892b0',
    fontSize: 13,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
  },
  income: {
    color: '#4CAF50',
  },
  expense: {
    color: '#e94560',
  },
  positive: {
    color: '#4CAF50',
  },
  negative: {
    color: '#e94560',
  },
  savingsRateContainer: {
    alignItems: 'flex-end',
  },
  savingsRateLabel: {
    color: '#8892b0',
    fontSize: 12,
  },
  savingsRateValue: {
    color: '#64ffda',
    fontSize: 24,
    fontWeight: '700',
  },
  section: {
    marginTop: 20,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  categoryList: {
    backgroundColor: '#16213e',
    borderRadius: 16,
    padding: 16,
  },
  categoryRow: {
    marginBottom: 16,
  },
  categoryInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  categoryDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  categoryName: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
  },
  categoryValues: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  categoryAmount: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  categoryPercent: {
    color: '#8892b0',
    fontSize: 14,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: '#0f3460',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 3,
  },
  emptyState: {
    backgroundColor: '#16213e',
    borderRadius: 16,
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: '#8892b0',
    fontSize: 14,
    marginTop: 12,
  },
  emptySubtext: {
    color: '#8892b0',
    fontSize: 12,
    marginTop: 4,
    opacity: 0.7,
  },
  monthlyList: {
    gap: 12,
  },
  monthCard: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 16,
  },
  monthLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  monthStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  monthStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  monthIncome: {
    color: '#4CAF50',
    fontSize: 14,
    fontWeight: '600',
  },
  monthExpense: {
    color: '#e94560',
    fontSize: 14,
    fontWeight: '600',
  },
  monthSavings: {
    fontSize: 14,
    fontWeight: '600',
  },
  insightCard: {
    flexDirection: 'row',
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    gap: 14,
  },
  insightContent: {
    flex: 1,
  },
  insightTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  insightText: {
    color: '#8892b0',
    fontSize: 13,
    lineHeight: 18,
  },
});
