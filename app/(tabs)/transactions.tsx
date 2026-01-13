import React, { useState } from 'react';
import { View, Text, StyleSheet, SectionList, TouchableOpacity, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useBudgetStore } from '../../src/store/budgetStore';
import { Transaction } from '../../src/types/budget';
import { TransactionDetailModal } from '../../src/components/TransactionDetailModal';

import { useTheme, lightPalette as palette } from '../../src/theme';
import OnboardingScreen from '../onboarding';
import DemoModeBanner from '../../src/components/DemoModeBanner';
import AuroraBackground from '../../src/components/AuroraBackground';

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

const formatDateHeader = (dateStr: string) => {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const txDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (txDate.getTime() === today.getTime()) {
    return 'Today';
  } else if (txDate.getTime() === yesterday.getTime()) {
    return 'Yesterday';
  } else {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
  }
};

const getSignedAmount = (transaction: Transaction): number =>
  typeof transaction.signedAmount === 'number'
    ? transaction.signedAmount
    : transaction.type === 'income'
      ? transaction.amount
      : -transaction.amount;

export default function Transactions() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { transactions, demoConfig, sheetsConfig, importMetadata, _hasHydrated } = useBudgetStore();
  const [filter, setFilter] = useState<'all' | 'income' | 'expense'>('all');
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const formatCurrencySafe = (amount: number) =>
    demoConfig.hideAmounts ? '•••' : formatCurrency(amount);

  const hasData = transactions.length > 0 || Boolean(importMetadata);
  const isOnboarded = _hasHydrated && (hasData || sheetsConfig.isConnected);

  // Show onboarding screen if not onboarded
  if (_hasHydrated && !isOnboarded) {
    return <OnboardingScreen />;
  }

  const filteredTransactions = transactions
    .filter((tx) => {
      // Filter by type
      if (filter !== 'all' && tx.type !== filter) return false;

      // Filter by search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const categoryMatch = tx.category.toLowerCase().includes(query);
        const descriptionMatch = tx.description?.toLowerCase().includes(query);
        const amountMatch = tx.amount.toString().includes(query);

        if (!categoryMatch && !descriptionMatch && !amountMatch) return false;
      }

      return true;
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Group transactions by date
  const groupedTransactions = filteredTransactions.reduce((acc, tx) => {
    const dateKey = tx.date.split('T')[0]; // Get YYYY-MM-DD part
    if (!acc[dateKey]) {
      acc[dateKey] = [];
    }
    acc[dateKey].push(tx);
    return acc;
  }, {} as Record<string, Transaction[]>);

  // Convert to section data
  const sections = Object.keys(groupedTransactions)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
    .map((dateKey) => ({
      title: dateKey,
      data: groupedTransactions[dateKey],
    }));

  const renderSectionHeader = ({ section }: { section: { title: string } }) => (
    <View style={[styles.sectionHeader, { backgroundColor: colors.background }]}>
      <Text style={[styles.sectionHeaderText, { color: colors.muted }]}>
        {formatDateHeader(section.title)}
      </Text>
    </View>
  );

  const renderTransaction = ({ item }: { item: Transaction }) => {
    const signed = getSignedAmount(item);
    const isPositive = signed > 0;
    const isExpense = item.type === 'expense';
    const amountColor = isExpense
      ? isPositive
        ? colors.positive
        : colors.negative
      : colors.positive;
    const sign = isPositive ? '+' : '-';
    const iconName = isPositive ? 'add' : 'remove';
    const iconBg = isExpense
      ? isPositive
        ? colors.positive
        : colors.negative
      : colors.accent;
    const hasDescription =
      item.description &&
      item.description.trim().length > 0 &&
      item.description.trim().toLowerCase() !== item.category.trim().toLowerCase();

    return (
      <TouchableOpacity
        style={[styles.transactionCard, { backgroundColor: colors.card, borderColor: colors.border }]}
        onPress={() => setSelectedTransaction(item)}
        activeOpacity={0.7}
      >
        <View style={styles.transactionLeft}>
          <View style={[styles.iconContainer, { backgroundColor: iconBg }]}>
            <Ionicons name={iconName as any} size={18} color="#fff" />
          </View>
          <View style={styles.transactionInfo}>
            <Text style={[styles.description, { color: colors.ink }]} numberOfLines={1}>
              {item.category}
            </Text>
            {hasDescription && (
              <Text style={[styles.subtext, { color: colors.muted }]} numberOfLines={1}>
                {item.description}
              </Text>
            )}
            <Text style={styles.date}>
              {formatShortDate(item.date)}
              {isExpense && isPositive ? ' • rebate' : ''}
              {item.breakdownAmounts && item.breakdownAmounts.length > 1 ? ' • itemized' : ''}
            </Text>
          </View>
        </View>
        <View style={styles.transactionRight}>
          <Text style={[styles.amount, { color: amountColor }]}>
            {sign}{formatCurrencySafe(Math.abs(signed))}
          </Text>
          {item.breakdownAmounts && item.breakdownAmounts.length > 1 && (
            <Ionicons name="chevron-forward" size={16} color={colors.muted} style={{ marginLeft: 4 }} />
          )}
        </View>
      </TouchableOpacity>
    );
  };

  if (transactions.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.empty}>
          {demoConfig.isDemoMode && <DemoModeBanner />}
          <Ionicons name="receipt-outline" size={64} color={colors.muted} />
          <Text style={[styles.title, { color: colors.ink }]}>No Transactions</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>Connect to Google Sheets to import data.</Text>
          <TouchableOpacity style={styles.emptyButton} onPress={() => router.push('/add-transaction')}>
            <Text style={styles.emptyButtonText}>Add a transaction</Text>
            <Ionicons name="add" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <AuroraBackground>
      <View style={[styles.container, { backgroundColor: 'transparent' }]}>
        {demoConfig.isDemoMode && <DemoModeBanner />}
        <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            style={[styles.searchInput, { color: colors.ink }]}
            placeholder="Search transactions..."
            placeholderTextColor={colors.muted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color={colors.muted} />
            </TouchableOpacity>
          )}
        </View>

        <View style={[styles.filterRow, { backgroundColor: colors.wash }]}>
          {(['all', 'income', 'expense'] as const).map((type) => (
            <TouchableOpacity
              key={type}
              style={[
                styles.filterButton,
                filter === type && styles.filterActive
              ]}
              onPress={() => setFilter(type)}
            >
              <Text
                style={[
                  styles.filterText,
                  { color: colors.muted },
                  filter === type && { color: colors.ink }
                ]}
              >
                {type === 'all' ? 'All' : type === 'income' ? 'Income' : 'Expenses'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[styles.count, { color: colors.muted }]}>
          {filteredTransactions.length} transaction{filteredTransactions.length !== 1 ? 's' : ''}
        </Text>

        <SectionList
          sections={sections}
          renderItem={renderTransaction}
          renderSectionHeader={renderSectionHeader}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
        />

        <TouchableOpacity style={styles.fab} onPress={() => router.push('/add-transaction')}>
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>

        <TransactionDetailModal
          visible={selectedTransaction !== null}
          transaction={selectedTransaction}
          onClose={() => setSelectedTransaction(null)}
        />
      </View>
    </AuroraBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background,
    padding: 20,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.card,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: palette.ink,
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
  emptyButton: {
    marginTop: 20,
    backgroundColor: palette.accent,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  emptyButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
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
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
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
  transactionCard: {
    backgroundColor: palette.card,
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  transactionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  transactionRight: {
    flexDirection: 'row',
    alignItems: 'center',
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
  sectionHeader: {
    paddingTop: 8,
    paddingBottom: 8,
    backgroundColor: palette.background,
  },
  sectionHeaderText: {
    fontSize: 13,
    fontWeight: '600',
    color: palette.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
