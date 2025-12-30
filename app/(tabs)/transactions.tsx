import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useBudgetStore } from '../../src/store/budgetStore';
import { Transaction } from '../../src/types/budget';

export default function Transactions() {
  const { transactions } = useBudgetStore();
  const [filter, setFilter] = useState<'all' | 'income' | 'expense'>('all');

  const formatCurrency = (amount: number) => {
    return '$' + amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  };

  const filteredTransactions = transactions
    .filter(tx => filter === 'all' || tx.type === filter)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const renderTransaction = ({ item }: { item: Transaction }) => (
    <View style={styles.transactionCard}>
      <View style={styles.transactionLeft}>
        <View style={[
          styles.iconContainer,
          item.type === 'income' ? styles.incomeIcon : styles.expenseIcon
        ]}>
          <Ionicons
            name={item.type === 'income' ? 'arrow-up' : 'arrow-down'}
            size={20}
            color="#fff"
          />
        </View>
        <View style={styles.transactionInfo}>
          <Text style={styles.description} numberOfLines={1}>{item.description}</Text>
          <Text style={styles.category}>{item.category}</Text>
          <Text style={styles.date}>{item.date}</Text>
        </View>
      </View>
      <Text style={[
        styles.amount,
        item.type === 'income' ? styles.incomeText : styles.expenseText
      ]}>
        {item.type === 'income' ? '+' : '-'}{formatCurrency(item.amount)}
      </Text>
    </View>
  );

  if (transactions.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.empty}>
          <Ionicons name="receipt-outline" size={64} color="#8892b0" />
          <Text style={styles.title}>No Transactions</Text>
          <Text style={styles.subtitle}>Connect to Google Sheets to import data</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[styles.filterButton, filter === 'all' && styles.filterActive]}
          onPress={() => setFilter('all')}
        >
          <Text style={[styles.filterText, filter === 'all' && styles.filterTextActive]}>
            All
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, filter === 'income' && styles.filterActiveGreen]}
          onPress={() => setFilter('income')}
        >
          <Text style={[styles.filterText, filter === 'income' && styles.filterTextActive]}>
            Income
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, filter === 'expense' && styles.filterActiveRed]}
          onPress={() => setFilter('expense')}
        >
          <Text style={[styles.filterText, filter === 'expense' && styles.filterTextActive]}>
            Expenses
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.count}>
        {filteredTransactions.length} transaction{filteredTransactions.length !== 1 ? 's' : ''}
      </Text>

      <FlatList
        data={filteredTransactions}
        renderItem={renderTransaction}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      />
    </View>
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
  filterRow: {
    flexDirection: 'row',
    marginBottom: 16,
    backgroundColor: '#16213e',
    borderRadius: 8,
    padding: 4,
  },
  filterButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 6,
  },
  filterActive: {
    backgroundColor: '#e94560',
  },
  filterActiveGreen: {
    backgroundColor: '#4CAF50',
  },
  filterActiveRed: {
    backgroundColor: '#e94560',
  },
  filterText: {
    color: '#8892b0',
    fontSize: 14,
  },
  filterTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  count: {
    color: '#8892b0',
    fontSize: 14,
    marginBottom: 12,
  },
  list: {
    paddingBottom: 20,
  },
  transactionCard: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  transactionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  incomeIcon: {
    backgroundColor: '#4CAF50',
  },
  expenseIcon: {
    backgroundColor: '#e94560',
  },
  transactionInfo: {
    marginLeft: 12,
    flex: 1,
  },
  description: {
    color: '#fff',
    fontSize: 16,
  },
  category: {
    color: '#8892b0',
    fontSize: 12,
    marginTop: 2,
  },
  date: {
    color: '#666',
    fontSize: 11,
    marginTop: 2,
  },
  amount: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  incomeText: {
    color: '#4CAF50',
  },
  expenseText: {
    color: '#e94560',
  },
});
