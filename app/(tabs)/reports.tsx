import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useBudgetStore } from '../../src/store/budgetStore';

export default function Reports() {
  const { transactions, getMonthlyReports, getCategorySpending } = useBudgetStore();
  const monthlyReports = getMonthlyReports(6);
  const categorySpending = getCategorySpending();

  const formatCurrency = (amount: number) => {
    return '$' + amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  };

  const formatMonth = (monthStr: string) => {
    const [year, month] = monthStr.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };

  if (transactions.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.empty}>
          <Ionicons name="bar-chart-outline" size={64} color="#8892b0" />
          <Text style={styles.title}>No Reports</Text>
          <Text style={styles.subtitle}>Import data to see spending reports</Text>
        </View>
      </View>
    );
  }

  const totalExpenses = categorySpending.reduce((sum, cat) => sum + cat.amount, 0);

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Category Breakdown</Text>
        <View style={styles.card}>
          {categorySpending.map((cat, index) => (
            <View key={index} style={styles.categoryItem}>
              <View style={styles.categoryHeader}>
                <View style={styles.categoryLeft}>
                  <View style={[styles.colorDot, { backgroundColor: cat.color }]} />
                  <Text style={styles.categoryName}>{cat.category}</Text>
                </View>
                <Text style={styles.categoryAmount}>{formatCurrency(cat.amount)}</Text>
              </View>
              <View style={styles.barContainer}>
                <View
                  style={[
                    styles.barFill,
                    {
                      width: `${cat.percentage}%`,
                      backgroundColor: cat.color
                    }
                  ]}
                />
              </View>
              <Text style={styles.percentage}>{cat.percentage.toFixed(1)}% of total</Text>
            </View>
          ))}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total Expenses</Text>
            <Text style={styles.totalAmount}>{formatCurrency(totalExpenses)}</Text>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Monthly Summary</Text>
        {monthlyReports.map((report, index) => (
          <View key={index} style={styles.monthCard}>
            <Text style={styles.monthTitle}>{formatMonth(report.month)}</Text>
            <View style={styles.monthStats}>
              <View style={styles.monthStat}>
                <Ionicons name="arrow-up-circle" size={20} color="#4CAF50" />
                <Text style={styles.monthStatLabel}>Income</Text>
                <Text style={styles.monthStatIncome}>{formatCurrency(report.income)}</Text>
              </View>
              <View style={styles.monthStat}>
                <Ionicons name="arrow-down-circle" size={20} color="#e94560" />
                <Text style={styles.monthStatLabel}>Expenses</Text>
                <Text style={styles.monthStatExpense}>{formatCurrency(report.expenses)}</Text>
              </View>
              <View style={styles.monthStat}>
                <Ionicons
                  name={report.savings >= 0 ? "trending-up" : "trending-down"}
                  size={20}
                  color={report.savings >= 0 ? "#4CAF50" : "#e94560"}
                />
                <Text style={styles.monthStatLabel}>Savings</Text>
                <Text style={[
                  styles.monthStatSavings,
                  report.savings < 0 && styles.negativeSavings
                ]}>
                  {formatCurrency(report.savings)}
                </Text>
              </View>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.bottomPadding} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    padding: 16,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    color: '#fff',
    fontSize: 20,
    marginTop: 16,
  },
  subtitle: {
    color: '#8892b0',
    fontSize: 14,
    marginTop: 8,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    marginBottom: 12,
  },
  card: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 16,
  },
  categoryItem: {
    marginBottom: 16,
  },
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  categoryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  colorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 10,
  },
  categoryName: {
    color: '#fff',
    fontSize: 14,
  },
  categoryAmount: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  barContainer: {
    height: 8,
    backgroundColor: '#0f3460',
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
  },
  percentage: {
    color: '#8892b0',
    fontSize: 12,
    marginTop: 4,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#0f3460',
    marginTop: 8,
  },
  totalLabel: {
    color: '#8892b0',
    fontSize: 14,
  },
  totalAmount: {
    color: '#e94560',
    fontSize: 16,
    fontWeight: 'bold',
  },
  monthCard: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  monthTitle: {
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
    alignItems: 'center',
    flex: 1,
  },
  monthStatLabel: {
    color: '#8892b0',
    fontSize: 11,
    marginTop: 4,
  },
  monthStatIncome: {
    color: '#4CAF50',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 2,
  },
  monthStatExpense: {
    color: '#e94560',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 2,
  },
  monthStatSavings: {
    color: '#4CAF50',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 2,
  },
  negativeSavings: {
    color: '#e94560',
  },
  bottomPadding: {
    height: 40,
  },
});
