import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useBudgetStore } from '../../src/store/budgetStore';
import { formatCurrency, formatDate } from '../../src/utils/formatters';
import { Transaction } from '../../src/types/budget';

type FilterType = 'all' | 'income' | 'expense';

export default function Transactions() {
  const { transactions, categories } = useBudgetStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showFilterModal, setShowFilterModal] = useState(false);

  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      const matchesSearch =
        tx.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tx.category.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = filterType === 'all' || tx.type === filterType;
      const matchesCategory = !selectedCategory || tx.category === selectedCategory;
      return matchesSearch && matchesType && matchesCategory;
    });
  }, [transactions, searchQuery, filterType, selectedCategory]);

  const groupedTransactions = useMemo(() => {
    const groups: { [key: string]: Transaction[] } = {};
    filteredTransactions.forEach((tx) => {
      const dateKey = tx.date;
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(tx);
    });
    return Object.entries(groups)
      .sort(([a], [b]) => new Date(b).getTime() - new Date(a).getTime())
      .map(([date, items]) => ({ date, data: items }));
  }, [filteredTransactions]);

  const renderTransaction = ({ item }: { item: Transaction }) => {
    const category = categories.find((c) => c.name === item.category);
    const iconName = category?.icon || 'ellipsis-horizontal';

    return (
      <View style={styles.transactionCard}>
        <View style={[styles.iconContainer, { backgroundColor: category?.color || '#607D8B' }]}>
          <Ionicons name={iconName as any} size={20} color="#fff" />
        </View>
        <View style={styles.transactionDetails}>
          <Text style={styles.transactionDesc}>{item.description}</Text>
          <Text style={styles.transactionCategory}>{item.category}</Text>
        </View>
        <Text
          style={[
            styles.transactionAmount,
            item.type === 'income' ? styles.income : styles.expense,
          ]}
        >
          {item.type === 'income' ? '+' : '-'}{formatCurrency(item.amount)}
        </Text>
      </View>
    );
  };

  const renderDateHeader = (date: string) => (
    <View style={styles.dateHeader}>
      <Text style={styles.dateText}>{formatDate(date)}</Text>
    </View>
  );

  const clearFilters = () => {
    setFilterType('all');
    setSelectedCategory(null);
    setSearchQuery('');
  };

  const hasActiveFilters = filterType !== 'all' || selectedCategory !== null || searchQuery !== '';

  return (
    <View style={styles.container}>
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color="#8892b0" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search transactions..."
            placeholderTextColor="#8892b0"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color="#8892b0" />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={[styles.filterButton, hasActiveFilters && styles.filterActive]}
          onPress={() => setShowFilterModal(true)}
        >
          <Ionicons name="filter" size={20} color={hasActiveFilters ? '#e94560' : '#8892b0'} />
        </TouchableOpacity>
      </View>

      {/* Filter Pills */}
      <View style={styles.filterPills}>
        <TouchableOpacity
          style={[styles.pill, filterType === 'all' && styles.pillActive]}
          onPress={() => setFilterType('all')}
        >
          <Text style={[styles.pillText, filterType === 'all' && styles.pillTextActive]}>All</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.pill, filterType === 'income' && styles.pillActive]}
          onPress={() => setFilterType('income')}
        >
          <Text style={[styles.pillText, filterType === 'income' && styles.pillTextActive]}>Income</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.pill, filterType === 'expense' && styles.pillActive]}
          onPress={() => setFilterType('expense')}
        >
          <Text style={[styles.pillText, filterType === 'expense' && styles.pillTextActive]}>Expenses</Text>
        </TouchableOpacity>
        {hasActiveFilters && (
          <TouchableOpacity style={styles.clearButton} onPress={clearFilters}>
            <Text style={styles.clearText}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Transaction List */}
      {groupedTransactions.length > 0 ? (
        <FlatList
          data={groupedTransactions}
          keyExtractor={(item) => item.date}
          renderItem={({ item }) => (
            <View>
              {renderDateHeader(item.date)}
              {item.data.map((tx) => (
                <View key={tx.id}>{renderTransaction({ item: tx })}</View>
              ))}
            </View>
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <View style={styles.emptyContainer}>
          <Ionicons name="receipt-outline" size={64} color="#8892b0" />
          <Text style={styles.emptyTitle}>No Transactions</Text>
          <Text style={styles.emptySubtitle}>
            {hasActiveFilters
              ? 'No transactions match your filters'
              : 'Connect to Google Sheets to import your budget data'}
          </Text>
        </View>
      )}

      {/* Category Filter Modal */}
      <Modal
        visible={showFilterModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowFilterModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filter by Category</Text>
              <TouchableOpacity onPress={() => setShowFilterModal(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[styles.categoryOption, !selectedCategory && styles.categorySelected]}
              onPress={() => {
                setSelectedCategory(null);
                setShowFilterModal(false);
              }}
            >
              <Text style={styles.categoryOptionText}>All Categories</Text>
              {!selectedCategory && <Ionicons name="checkmark" size={20} color="#e94560" />}
            </TouchableOpacity>
            {categories.map((cat) => (
              <TouchableOpacity
                key={cat.id}
                style={[styles.categoryOption, selectedCategory === cat.name && styles.categorySelected]}
                onPress={() => {
                  setSelectedCategory(cat.name);
                  setShowFilterModal(false);
                }}
              >
                <View style={styles.categoryOptionRow}>
                  <View style={[styles.categoryDot, { backgroundColor: cat.color }]} />
                  <Text style={styles.categoryOptionText}>{cat.name}</Text>
                </View>
                {selectedCategory === cat.name && <Ionicons name="checkmark" size={20} color="#e94560" />}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  searchContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16213e',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
  },
  filterButton: {
    width: 48,
    height: 48,
    backgroundColor: '#16213e',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterActive: {
    backgroundColor: 'rgba(233, 69, 96, 0.2)',
  },
  filterPills: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 8,
    gap: 8,
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#16213e',
    borderRadius: 20,
  },
  pillActive: {
    backgroundColor: '#e94560',
  },
  pillText: {
    color: '#8892b0',
    fontSize: 14,
    fontWeight: '500',
  },
  pillTextActive: {
    color: '#fff',
  },
  clearButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  clearText: {
    color: '#e94560',
    fontSize: 14,
  },
  listContent: {
    padding: 16,
    paddingTop: 8,
  },
  dateHeader: {
    marginTop: 16,
    marginBottom: 8,
  },
  dateText: {
    color: '#8892b0',
    fontSize: 14,
    fontWeight: '600',
  },
  transactionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  transactionDetails: {
    flex: 1,
  },
  transactionDesc: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  transactionCategory: {
    color: '#8892b0',
    fontSize: 13,
    marginTop: 2,
  },
  transactionAmount: {
    fontSize: 16,
    fontWeight: '600',
  },
  income: {
    color: '#4CAF50',
  },
  expense: {
    color: '#e94560',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
    marginTop: 16,
  },
  emptySubtitle: {
    color: '#8892b0',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#16213e',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  categoryOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#0f3460',
  },
  categorySelected: {
    backgroundColor: 'rgba(233, 69, 96, 0.1)',
    marginHorizontal: -20,
    paddingHorizontal: 20,
  },
  categoryOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  categoryDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  categoryOptionText: {
    color: '#fff',
    fontSize: 16,
  },
});
