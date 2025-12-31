import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Transaction, Category, GoogleSheetsConfig, BudgetSummary, CategorySpending, MonthlyReport } from '../types/budget';

export interface ImportMetadata {
  lastImportDate: string;
  sourceFile: string;
  rowCount: number;
  sheetNames: string[];
}

interface BudgetState {
  transactions: Transaction[];
  categories: Category[];
  sheetsConfig: GoogleSheetsConfig;
  importMetadata: ImportMetadata | null;
  isLoading: boolean;
  error: string | null;
  _hasHydrated: boolean;

  // Actions
  setTransactions: (transactions: Transaction[], metadata?: Partial<ImportMetadata>) => void;
  addTransaction: (transaction: Transaction) => void;
  removeTransaction: (id: string) => void;
  setSheetsConfig: (config: Partial<GoogleSheetsConfig>) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearData: () => void;
  setHasHydrated: (state: boolean) => void;

  // Computed
  getBudgetSummary: () => BudgetSummary;
  getCategorySpending: () => CategorySpending[];
  getMonthlyReports: (months?: number) => MonthlyReport[];
  getRecentTransactions: (limit?: number) => Transaction[];
}

const defaultCategories: Category[] = [
  { id: '1', name: 'Food & Dining', color: '#FF6384', icon: 'restaurant' },
  { id: '2', name: 'Transportation', color: '#36A2EB', icon: 'car' },
  { id: '3', name: 'Shopping', color: '#FFCE56', icon: 'cart' },
  { id: '4', name: 'Entertainment', color: '#4BC0C0', icon: 'game-controller' },
  { id: '5', name: 'Bills & Utilities', color: '#9966FF', icon: 'flash' },
  { id: '6', name: 'Health', color: '#FF9F40', icon: 'medical' },
  { id: '7', name: 'Income', color: '#4CAF50', icon: 'cash' },
  { id: '8', name: 'Other', color: '#607D8B', icon: 'ellipsis-horizontal' },
];

export const useBudgetStore = create<BudgetState>()(
  persist(
    (set, get) => ({
      transactions: [],
      categories: defaultCategories,
      sheetsConfig: {
        spreadsheetId: '',
        sheetName: 'Sheet1',
        isConnected: false,
      },
      importMetadata: null,
      isLoading: false,
      error: null,
      _hasHydrated: false,

      setTransactions: (transactions, metadata) => set({
        transactions,
        importMetadata: metadata ? {
          lastImportDate: new Date().toISOString(),
          sourceFile: metadata.sourceFile || 'Unknown',
          rowCount: transactions.length,
          sheetNames: metadata.sheetNames || [],
        } : get().importMetadata,
      }),

      addTransaction: (transaction) =>
        set((state) => ({ transactions: [transaction, ...state.transactions] })),

      removeTransaction: (id) =>
        set((state) => ({
          transactions: state.transactions.filter((t) => t.id !== id),
        })),

      setSheetsConfig: (config) =>
        set((state) => ({
          sheetsConfig: { ...state.sheetsConfig, ...config },
        })),

      setLoading: (isLoading) => set({ isLoading }),

      setError: (error) => set({ error }),

      clearData: () => set({
        transactions: [],
        importMetadata: null,
        error: null,
      }),

      setHasHydrated: (state) => set({ _hasHydrated: state }),

      getBudgetSummary: () => {
        const { transactions } = get();
        const totalIncome = transactions
          .filter((t) => t.type === 'income')
          .reduce((sum, t) => sum + t.amount, 0);
        const totalExpenses = transactions
          .filter((t) => t.type === 'expense')
          .reduce((sum, t) => sum + t.amount, 0);
        const balance = totalIncome - totalExpenses;
        const savingsRate = totalIncome > 0 ? ((totalIncome - totalExpenses) / totalIncome) * 100 : 0;

        return { totalIncome, totalExpenses, balance, savingsRate };
      },

      getCategorySpending: () => {
        const { transactions, categories } = get();
        const expenses = transactions.filter((t) => t.type === 'expense');
        const totalExpenses = expenses.reduce((sum, t) => sum + t.amount, 0);

        const categoryTotals = new Map<string, number>();
        expenses.forEach((t) => {
          const current = categoryTotals.get(t.category) || 0;
          categoryTotals.set(t.category, current + t.amount);
        });

        return Array.from(categoryTotals.entries())
          .map(([category, amount]) => {
            const cat = categories.find((c) => c.name === category);
            return {
              category,
              amount,
              percentage: totalExpenses > 0 ? (amount / totalExpenses) * 100 : 0,
              color: cat?.color || '#607D8B',
            };
          })
          .sort((a, b) => b.amount - a.amount);
      },

      getMonthlyReports: (months = 6) => {
        const { transactions } = get();
        const reports = new Map<string, { income: number; expenses: number }>();

        transactions.forEach((t) => {
          const date = new Date(t.date);
          const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

          const current = reports.get(monthKey) || { income: 0, expenses: 0 };
          if (t.type === 'income') {
            current.income += t.amount;
          } else {
            current.expenses += t.amount;
          }
          reports.set(monthKey, current);
        });

        return Array.from(reports.entries())
          .map(([month, data]) => ({
            month,
            income: data.income,
            expenses: data.expenses,
            savings: data.income - data.expenses,
          }))
          .sort((a, b) => b.month.localeCompare(a.month))
          .slice(0, months);
      },

      getRecentTransactions: (limit = 10) => {
        const { transactions } = get();
        return [...transactions]
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
          .slice(0, limit);
      },
    }),
    {
      name: 'budget-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        transactions: state.transactions,
        categories: state.categories,
        importMetadata: state.importMetadata,
        sheetsConfig: state.sheetsConfig,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
