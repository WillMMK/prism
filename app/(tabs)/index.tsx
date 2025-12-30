import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useBudgetStore } from '../../src/store/budgetStore';
import { formatCurrency, formatPercent } from '../../src/utils/formatters';

export default function Dashboard() {
  const [refreshing, setRefreshing] = React.useState(false);
  const { getBudgetSummary, getCategorySpending, getRecentTransactions, sheetsConfig } =
    useBudgetStore();

  const summary = getBudgetSummary();
  const categorySpending = getCategorySpending();
  const recentTransactions = getRecentTransactions(5);

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#e94560" />
      }
    >
      {/* Connection Status */}
      <View style={[styles.statusBar, sheetsConfig.isConnected ? styles.connected : styles.disconnected]}>
        <Ionicons
          name={sheetsConfig.isConnected ? 'cloud-done' : 'cloud-offline'}
          size={16}
          color="#fff"
        />
        <Text style={styles.statusText}>
          {sheetsConfig.isConnected ? 'Connected to Google Sheets' : 'Not connected - Go to Settings'}
        </Text>
      </View>

      {/* Summary Cards */}
      <View style={styles.summaryContainer}>
        <View style={[styles.summaryCard, styles.incomeCard]}>
          <Ionicons name="arrow-down-circle" size={28} color="#4CAF50" />
          <Text style={styles.cardLabel}>Income</Text>
          <Text style={styles.cardAmount}>{formatCurrency(summary.totalIncome)}</Text>
        </View>
        <View style={[styles.summaryCard, styles.expenseCard]}>
          <Ionicons name="arrow-up-circle" size={28} color="#e94560" />
          <Text style={styles.cardLabel}>Expenses</Text>
          <Text style={styles.cardAmount}>{formatCurrency(summary.totalExpenses)}</Text>
        </View>
      </View>

      <View style={styles.balanceCard}>
        <View style={styles.balanceRow}>
          <View>
            <Text style={styles.balanceLabel}>Current Balance</Text>
            <Text style={[styles.balanceAmount, summary.balance >= 0 ? styles.positive : styles.negative]}>
              {formatCurrency(summary.balance)}
            </Text>
          </View>
          <View style={styles.savingsContainer}>
            <Text style={styles.savingsLabel}>Savings Rate</Text>
            <Text style={styles.savingsAmount}>{formatPercent(summary.savingsRate)}</Text>
          </View>
        </View>
      </View>

      {/* Top Categories */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Top Spending Categories</Text>
        {categorySpending.length > 0 ? (
          categorySpending.slice(0, 4).map((cat, index) => (
            <View key={cat.category} style={styles.categoryRow}>
              <View style={[styles.categoryColor, { backgroundColor: cat.color }]} />
              <Text style={styles.categoryName}>{cat.category}</Text>
              <View style={styles.categoryStats}>
                <Text style={styles.categoryAmount}>{formatCurrency(cat.amount)}</Text>
                <Text style={styles.categoryPercent}>{formatPercent(cat.percentage)}</Text>
              </View>
            </View>
          ))
        ) : (
          <View style={styles.emptyCategories}>
            <Ionicons name="pie-chart-outline" size={48} color="#8892b0" />
            <Text style={styles.emptyText}>No spending data yet</Text>
            <Text style={styles.emptySubtext}>Connect to Google Sheets to import data</Text>
          </View>
        )}
      </View>

      {/* Recent Transactions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recent Transactions</Text>
        {recentTransactions.length > 0 ? (
          recentTransactions.map((tx) => (
            <View key={tx.id} style={styles.transactionRow}>
              <View style={styles.transactionInfo}>
                <Text style={styles.transactionDesc}>{tx.description}</Text>
                <Text style={styles.transactionCategory}>{tx.category}</Text>
              </View>
              <Text
                style={[
                  styles.transactionAmount,
                  tx.type === 'income' ? styles.positive : styles.negative,
                ]}
              >
                {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount)}
              </Text>
            </View>
          ))
        ) : (
          <View style={styles.emptyTransactions}>
            <Ionicons name="receipt-outline" size={48} color="#8892b0" />
            <Text style={styles.emptyText}>No transactions yet</Text>
            <Text style={styles.emptySubtext}>Connect your Google Sheet to import data</Text>
          </View>
        )}
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
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
    gap: 8,
  },
  connected: {
    backgroundColor: 'rgba(76, 175, 80, 0.2)',
  },
  disconnected: {
    backgroundColor: 'rgba(233, 69, 96, 0.2)',
  },
  statusText: {
    color: '#fff',
    fontSize: 14,
  },
  summaryContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: '#16213e',
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  incomeCard: {
    borderLeftWidth: 3,
    borderLeftColor: '#4CAF50',
  },
  expenseCard: {
    borderLeftWidth: 3,
    borderLeftColor: '#e94560',
  },
  cardLabel: {
    color: '#8892b0',
    fontSize: 14,
    marginTop: 8,
  },
  cardAmount: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    marginTop: 4,
  },
  balanceCard: {
    backgroundColor: '#16213e',
    padding: 20,
    borderRadius: 16,
    marginBottom: 24,
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  balanceLabel: {
    color: '#8892b0',
    fontSize: 14,
  },
  balanceAmount: {
    fontSize: 28,
    fontWeight: '700',
    marginTop: 4,
  },
  positive: {
    color: '#4CAF50',
  },
  negative: {
    color: '#e94560',
  },
  savingsContainer: {
    alignItems: 'flex-end',
  },
  savingsLabel: {
    color: '#8892b0',
    fontSize: 12,
  },
  savingsAmount: {
    color: '#64ffda',
    fontSize: 24,
    fontWeight: '700',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  emptyText: {
    color: '#8892b0',
    fontSize: 14,
    marginTop: 12,
    textAlign: 'center',
  },
  emptySubtext: {
    color: '#8892b0',
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
    opacity: 0.7,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16213e',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  categoryColor: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  categoryName: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
  },
  categoryStats: {
    alignItems: 'flex-end',
  },
  categoryAmount: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  categoryPercent: {
    color: '#8892b0',
    fontSize: 12,
  },
  emptyCategories: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 40,
    alignItems: 'center',
  },
  transactionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#16213e',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  transactionInfo: {
    flex: 1,
  },
  transactionDesc: {
    color: '#fff',
    fontSize: 16,
  },
  transactionCategory: {
    color: '#8892b0',
    fontSize: 12,
    marginTop: 2,
  },
  transactionAmount: {
    fontSize: 16,
    fontWeight: '600',
  },
  emptyTransactions: {
    backgroundColor: '#16213e',
    borderRadius: 16,
    padding: 40,
    alignItems: 'center',
  },
});
