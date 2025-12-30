import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useBudgetStore } from '../../src/store/budgetStore';

export default function Dashboard() {
  const { transactions, getBudgetSummary, getCategorySpending, getRecentTransactions } = useBudgetStore();
  const summary = getBudgetSummary();
  const categorySpending = getCategorySpending();
  const recentTransactions = getRecentTransactions(5);

  const formatCurrency = (amount: number) => {
    return '$' + amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  };

  if (transactions.length === 0) {
    return (
      <ScrollView style={styles.container}>
        <View style={styles.card}>
          <Ionicons name="wallet-outline" size={48} color="#e94560" />
          <Text style={styles.title}>Budget Tracker</Text>
          <Text style={styles.subtitle}>Connect to Google Sheets to get started</Text>
        </View>

        <View style={styles.row}>
          <View style={styles.statCard}>
            <Text style={styles.label}>Income</Text>
            <Text style={styles.amount}>$0</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.label}>Expenses</Text>
            <Text style={styles.amountRed}>$0</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Getting Started</Text>
          <Text style={styles.text}>1. Go to Settings tab</Text>
          <Text style={styles.text}>2. Sign in with Google</Text>
          <Text style={styles.text}>3. Enter your Spreadsheet ID</Text>
          <Text style={styles.text}>4. Tap Analyze, then Import</Text>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Current Balance</Text>
        <Text style={[styles.balanceAmount, summary.balance < 0 && styles.negativeBalance]}>
          {formatCurrency(summary.balance)}
        </Text>
        <Text style={styles.savingsRate}>
          Savings Rate: {summary.savingsRate.toFixed(1)}%
        </Text>
      </View>

      <View style={styles.row}>
        <View style={styles.statCard}>
          <Ionicons name="arrow-up-circle" size={24} color="#4CAF50" />
          <Text style={styles.label}>Income</Text>
          <Text style={styles.amount}>{formatCurrency(summary.totalIncome)}</Text>
        </View>
        <View style={styles.statCard}>
          <Ionicons name="arrow-down-circle" size={24} color="#e94560" />
          <Text style={styles.label}>Expenses</Text>
          <Text style={styles.amountRed}>{formatCurrency(summary.totalExpenses)}</Text>
        </View>
      </View>

      {categorySpending.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Spending by Category</Text>
          {categorySpending.slice(0, 5).map((cat, index) => (
            <View key={index} style={styles.categoryRow}>
              <View style={styles.categoryInfo}>
                <View style={[styles.categoryDot, { backgroundColor: cat.color }]} />
                <Text style={styles.categoryName}>{cat.category}</Text>
              </View>
              <View style={styles.categoryAmountContainer}>
                <Text style={styles.categoryAmount}>{formatCurrency(cat.amount)}</Text>
                <Text style={styles.categoryPercent}>{cat.percentage.toFixed(1)}%</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {recentTransactions.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Recent Transactions</Text>
          {recentTransactions.map((tx, index) => (
            <View key={tx.id || index} style={styles.transactionRow}>
              <View style={styles.transactionInfo}>
                <Text style={styles.transactionDesc} numberOfLines={1}>
                  {tx.description}
                </Text>
                <Text style={styles.transactionDate}>{tx.date}</Text>
              </View>
              <Text style={[
                styles.transactionAmount,
                tx.type === 'income' ? styles.incomeText : styles.expenseText
              ]}>
                {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount)}
              </Text>
            </View>
          ))}
        </View>
      )}

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
  card: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
  },
  balanceCard: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
  },
  balanceLabel: {
    color: '#8892b0',
    fontSize: 14,
  },
  balanceAmount: {
    color: '#4CAF50',
    fontSize: 36,
    fontWeight: 'bold',
    marginTop: 8,
  },
  negativeBalance: {
    color: '#e94560',
  },
  savingsRate: {
    color: '#8892b0',
    fontSize: 14,
    marginTop: 8,
  },
  title: {
    color: '#fff',
    fontSize: 24,
    marginTop: 12,
  },
  subtitle: {
    color: '#8892b0',
    fontSize: 14,
    marginTop: 4,
  },
  row: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  label: {
    color: '#8892b0',
    fontSize: 14,
    marginTop: 8,
  },
  amount: {
    color: '#4CAF50',
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 4,
  },
  amountRed: {
    color: '#e94560',
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 4,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    marginBottom: 16,
    alignSelf: 'flex-start',
  },
  text: {
    color: '#8892b0',
    fontSize: 14,
    marginBottom: 8,
    alignSelf: 'flex-start',
  },
  categoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#0f3460',
  },
  categoryInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  categoryDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 10,
  },
  categoryName: {
    color: '#fff',
    fontSize: 14,
  },
  categoryAmountContainer: {
    alignItems: 'flex-end',
  },
  categoryAmount: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  categoryPercent: {
    color: '#8892b0',
    fontSize: 12,
    marginTop: 2,
  },
  transactionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#0f3460',
  },
  transactionInfo: {
    flex: 1,
    marginRight: 12,
  },
  transactionDesc: {
    color: '#fff',
    fontSize: 14,
  },
  transactionDate: {
    color: '#8892b0',
    fontSize: 12,
    marginTop: 2,
  },
  transactionAmount: {
    fontSize: 14,
    fontWeight: '600',
  },
  incomeText: {
    color: '#4CAF50',
  },
  expenseText: {
    color: '#e94560',
  },
  bottomPadding: {
    height: 40,
  },
});
