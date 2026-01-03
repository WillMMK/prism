import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useBudgetStore } from '../../src/store/budgetStore';
import { Transaction } from '../../src/types/budget';

const palette = {
  background: '#F6F3EF',
  card: '#FFFFFF',
  ink: '#1E1B16',
  muted: '#6B645C',
  accent: '#0F766E',
  accentSoft: '#D6EFE8',
  positive: '#2F9E44',
  negative: '#D64550',
  border: '#E6DED4',
  wash: '#F2ECE4',
};

const formatCurrency = (amount: number) =>
  '$' + amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

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

export default function Transactions() {
  const { transactions, demoConfig } = useBudgetStore();
  const [filter, setFilter] = useState<'all' | 'income' | 'expense'>('all');
  const formatCurrencySafe = (amount: number) =>
    demoConfig.hideAmounts ? '•••' : formatCurrency(amount);

  const filteredTransactions = transactions
    .filter((tx) => filter === 'all' || tx.type === filter)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const renderTransaction = ({ item }: { item: Transaction }) => {
    const signed = getSignedAmount(item);
    const isPositive = signed > 0;
    const isExpense = item.type === 'expense';
    const amountColor = isExpense
      ? isPositive
        ? palette.positive
        : palette.negative
      : palette.positive;
    const sign = isPositive ? '+' : '-';
    const iconName = isPositive ? 'arrow-up' : 'arrow-down';
    const iconBg = isExpense
      ? isPositive
        ? palette.positive
        : palette.negative
      : palette.accent;
    const hasDescription =
      item.description &&
      item.description.trim().length > 0 &&
      item.description.trim().toLowerCase() !== item.category.trim().toLowerCase();

    return (
      <View style={styles.transactionCard}>
        <View style={styles.transactionLeft}>
          <View style={[styles.iconContainer, { backgroundColor: iconBg }]}>
            <Ionicons name={iconName as any} size={18} color="#fff" />
          </View>
          <View style={styles.transactionInfo}>
            <Text style={styles.description} numberOfLines={1}>
              {item.category}
            </Text>
            {hasDescription && (
              <Text style={styles.subtext} numberOfLines={1}>
                {item.description}
              </Text>
            )}
            <Text style={styles.date}>
              {formatShortDate(item.date)}
              {isExpense && isPositive ? ' • rebate' : ''}
            </Text>
          </View>
        </View>
        <Text style={[styles.amount, { color: amountColor }]}>
          {sign}{formatCurrencySafe(Math.abs(signed))}
        </Text>
      </View>
    );
  };

  if (transactions.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.backgroundOrb} />
        <View style={styles.backgroundOrbAlt} />
        <View style={styles.empty}>
          <Ionicons name="receipt-outline" size={64} color={palette.muted} />
          <Text style={styles.title}>No Transactions</Text>
          <Text style={styles.subtitle}>Connect to Google Sheets to import data.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.backgroundOrb} />
      <View style={styles.backgroundOrbAlt} />
      <View style={styles.filterRow}>
        {(['all', 'income', 'expense'] as const).map((type) => (
          <TouchableOpacity
            key={type}
            style={[
              styles.filterButton,
              filter === type && styles.filterActive,
            ]}
            onPress={() => setFilter(type)}
          >
            <Text
              style={[
                styles.filterText,
                filter === type && styles.filterTextActive,
              ]}
            >
              {type === 'all' ? 'All' : type === 'income' ? 'Income' : 'Expenses'}
            </Text>
          </TouchableOpacity>
        ))}
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
    backgroundColor: palette.background,
    padding: 20,
  },
  backgroundOrb: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: palette.accentSoft,
    opacity: 0.6,
    top: -70,
    right: -70,
  },
  backgroundOrbAlt: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
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
  filterRow: {
    flexDirection: 'row',
    backgroundColor: palette.wash,
    borderRadius: 20,
    padding: 4,
    marginBottom: 16,
  },
  filterButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 16,
  },
  filterActive: {
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
  },
  filterText: {
    color: palette.muted,
    fontSize: 13,
    fontWeight: '600',
  },
  filterTextActive: {
    color: palette.ink,
  },
  count: {
    color: palette.muted,
    fontSize: 12,
    marginBottom: 12,
  },
  list: {
    paddingBottom: 20,
  },
  transactionCard: {
    backgroundColor: palette.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: palette.border,
  },
  transactionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  transactionInfo: {
    marginLeft: 12,
    flex: 1,
  },
  description: {
    color: palette.ink,
    fontSize: 15,
    fontWeight: '600',
  },
  subtext: {
    color: palette.muted,
    fontSize: 12,
    marginTop: 2,
  },
  date: {
    color: '#9D948A',
    fontSize: 11,
    marginTop: 2,
  },
  amount: {
    fontSize: 15,
    fontWeight: '700',
  },
});
