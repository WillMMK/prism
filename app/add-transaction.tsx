import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useBudgetStore } from '../src/store/budgetStore';
import { Transaction } from '../src/types/budget';
import { googleSheetsService } from '../src/services/googleSheets';
import { enqueuePendingTransaction } from '../src/services/transactionSync';

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
  highlight: '#F2A15F',
};

const formatDate = (value: string) => value.slice(0, 10);

const parseAmount = (raw: string) => {
  const cleaned = raw.replace(/[$,\s]/g, '').trim();
  const parsed = parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
};

const buildTransaction = (
  amount: number,
  type: 'income' | 'expense',
  date: string,
  category: string,
  note: string
): Transaction => {
  const signedAmount = type === 'income' ? amount : -amount;
  return {
    id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    date: date || new Date().toISOString().split('T')[0],
    description: note.trim() || category,
    category: category || 'Uncategorized',
    amount,
    signedAmount,
    type,
  };
};

const resolveTargetSheet = (
  type: 'income' | 'expense',
  config: { sheetName: string; expenseSheetName?: string; incomeSheetName?: string }
) => {
  if (type === 'income') {
    return config.incomeSheetName || config.sheetName;
  }
  return config.expenseSheetName || config.sheetName;
};

export default function AddTransaction() {
  const router = useRouter();
  const { transactions, addTransaction, sheetsConfig } = useBudgetStore();
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<'income' | 'expense'>('expense');
  const [category, setCategory] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  const topCategories = useMemo(() => {
    const counts = new Map<string, number>();
    transactions.forEach((tx) => {
      if (tx.type !== type) return;
      counts.set(tx.category, (counts.get(tx.category) || 0) + 1);
    });

    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name)
      .slice(0, 5);
  }, [transactions, type]);

  React.useEffect(() => {
    if (!category && topCategories.length > 0) {
      setCategory(topCategories[0]);
    }
  }, [category, topCategories]);

  const handleSave = async () => {
    const parsedAmount = parseAmount(amount);
    const finalCategory = category.trim();

    if (!parsedAmount || parsedAmount <= 0) {
      Alert.alert('Amount required', 'Enter a valid amount to continue.');
      return;
    }

    if (!finalCategory) {
      Alert.alert('Category required', 'Pick a category from your imported sheet.');
      return;
    }

    const transaction = buildTransaction(parsedAmount, type, formatDate(date), finalCategory, note);
    addTransaction(transaction);
    router.back();

    if (!sheetsConfig.isConnected || !sheetsConfig.spreadsheetId || !sheetsConfig.sheetName) {
      Alert.alert('Saved locally', 'Connect Google Sheets to sync new transactions.');
      return;
    }

    const targetSheet = resolveTargetSheet(type, sheetsConfig);
    if (!targetSheet) {
      Alert.alert('Select a write sheet', 'Pick an expense/income sheet in Settings to sync new transactions.');
      return;
    }

    void (async () => {
      try {
        await googleSheetsService.appendTransaction(
          sheetsConfig.spreadsheetId,
          targetSheet,
          transaction
        );
        Alert.alert('Synced', `Added to ${targetSheet}`);
      } catch (error) {
        await enqueuePendingTransaction(
          transaction,
          sheetsConfig.spreadsheetId,
          targetSheet
        );
        Alert.alert('Sync pending', 'We will retry this transaction when you are back online.');
      }
    })();
  };

  return (
    <View style={styles.container}>
      <View style={styles.backgroundOrb} />
      <View style={styles.backgroundOrbAlt} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboard}
      >
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
              <Ionicons name="chevron-back" size={22} color={palette.ink} />
            </TouchableOpacity>
            <Text style={styles.title}>New Transaction</Text>
            <View style={styles.spacer} />
          </View>

          <View style={styles.amountCard}>
            <Text style={styles.amountLabel}>Amount</Text>
            <View style={styles.amountRow}>
              <Text style={styles.amountCurrency}>$</Text>
              <TextInput
                style={styles.amountInput}
                value={amount}
                onChangeText={setAmount}
                placeholder="0.00"
                placeholderTextColor="#B4ABA0"
                keyboardType="decimal-pad"
                autoFocus
              />
            </View>
          </View>

          <View style={styles.typeRow}>
            {(['expense', 'income'] as const).map((value) => (
              <TouchableOpacity
                key={value}
                style={[styles.typePill, type === value && styles.typePillActive]}
                onPress={() => setType(value)}
              >
                <Text style={[styles.typeText, type === value && styles.typeTextActive]}>
                  {value === 'expense' ? 'Expense' : 'Income'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Category</Text>
            {topCategories.length === 0 ? (
              <View style={styles.emptyCategoryCard}>
                <Ionicons name="alert-circle-outline" size={18} color={palette.muted} />
                <Text style={styles.emptyCategoryText}>
                  Import transactions first to populate categories.
                </Text>
              </View>
            ) : (
              <View style={styles.chipRow}>
                {topCategories.map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.chip, category === cat && styles.chipActive]}
                    onPress={() => setCategory(cat)}
                  >
                    <Text style={[styles.chipText, category === cat && styles.chipTextActive]}>
                      {cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          <View style={styles.sectionRow}>
            <View style={styles.sectionHalf}>
              <Text style={styles.sectionTitle}>Date</Text>
              <TextInput
                style={styles.textInput}
                value={date}
                onChangeText={setDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#B0A69C"
                keyboardType="numbers-and-punctuation"
                maxLength={10}
              />
            </View>
            <View style={styles.sectionHalf}>
              <Text style={styles.sectionTitle}>Note</Text>
              <TextInput
                style={styles.textInput}
                value={note}
                onChangeText={setNote}
                placeholder="Optional"
                placeholderTextColor="#B0A69C"
              />
            </View>
          </View>

          <TouchableOpacity
            style={[styles.saveButton, topCategories.length === 0 && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={topCategories.length === 0}
          >
            <Text style={styles.saveText}>Save</Text>
            <Ionicons name="arrow-forward" size={18} color="#fff" />
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background,
  },
  backgroundOrb: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: palette.accentSoft,
    opacity: 0.6,
    top: -80,
    right: -60,
  },
  backgroundOrbAlt: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: '#FDE7D3',
    opacity: 0.7,
    bottom: 80,
    left: -90,
  },
  keyboard: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: palette.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: palette.border,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    color: palette.ink,
  },
  spacer: {
    width: 36,
  },
  amountCard: {
    backgroundColor: palette.card,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: palette.border,
    marginBottom: 16,
  },
  amountLabel: {
    color: palette.muted,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  amountCurrency: {
    fontSize: 28,
    fontWeight: '700',
    color: palette.ink,
    marginRight: 6,
  },
  amountInput: {
    fontSize: 32,
    fontWeight: '700',
    color: palette.ink,
    flex: 1,
  },
  typeRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 18,
  },
  typePill: {
    flex: 1,
    borderRadius: 18,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
  },
  typePillActive: {
    backgroundColor: palette.accent,
    borderColor: palette.accent,
  },
  typeText: {
    fontSize: 13,
    fontWeight: '600',
    color: palette.muted,
  },
  typeTextActive: {
    color: '#fff',
  },
  section: {
    marginBottom: 18,
  },
  sectionRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 22,
  },
  sectionHalf: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: palette.ink,
    marginBottom: 8,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
  },
  chipActive: {
    backgroundColor: palette.accent,
    borderColor: palette.accent,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: palette.ink,
  },
  chipTextActive: {
    color: '#fff',
  },
  emptyCategoryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: palette.card,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: palette.border,
  },
  emptyCategoryText: {
    color: palette.muted,
    fontSize: 12,
  },
  textInput: {
    backgroundColor: palette.card,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: palette.border,
    color: palette.ink,
  },
  saveButton: {
    backgroundColor: palette.highlight,
    paddingVertical: 16,
    borderRadius: 18,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
});
