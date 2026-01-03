import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Transaction, Category, GoogleSheetsConfig, DemoConfig, BudgetSummary, CategorySpending, MonthlyReport, YearlyReport, YearOverYearComparison, TrendData } from '../types/budget';

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
  demoConfig: DemoConfig;
  importMetadata: ImportMetadata | null;
  isLoading: boolean;
  error: string | null;
  _hasHydrated: boolean;

  // Actions
  setTransactions: (transactions: Transaction[], metadata?: Partial<ImportMetadata>) => void;
  addTransaction: (transaction: Transaction) => void;
  removeTransaction: (id: string) => void;
  setSheetsConfig: (config: Partial<GoogleSheetsConfig>) => void;
  setDemoConfig: (config: Partial<DemoConfig>) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearData: () => void;
  setHasHydrated: (state: boolean) => void;

  // Computed
  getBudgetSummary: () => BudgetSummary;
  getCategorySpending: () => CategorySpending[];
  getMonthlyReports: (months?: number) => MonthlyReport[];
  getRecentTransactions: (limit?: number) => Transaction[];
  getYearlyReports: () => YearlyReport[];
  getYearOverYearComparison: () => YearOverYearComparison[];
  getTrends: () => TrendData[];
  getAvailableYears: () => number[];
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

const getSignedAmount = (transaction: Transaction): number => {
  if (typeof transaction.signedAmount === 'number') {
    return transaction.signedAmount;
  }
  return transaction.type === 'income' ? transaction.amount : -transaction.amount;
};

const getNetExpenseTotal = (transactions: Transaction[]): number => {
  let outflow = 0;
  let rebates = 0;

  transactions.forEach((transaction) => {
    if (transaction.type !== 'expense') return;
    const signed = getSignedAmount(transaction);
    if (signed < 0) {
      outflow += Math.abs(signed);
    } else {
      rebates += signed;
    }
  });

  return Math.max(0, outflow - rebates);
};

export const useBudgetStore = create<BudgetState>()(
  persist(
    (set, get) => ({
      transactions: [],
      categories: defaultCategories,
      sheetsConfig: {
        spreadsheetId: '',
        sheetName: 'Sheet1',
        expenseSheetName: '',
        incomeSheetName: '',
        isConnected: false,
        selectedTabs: [],
        lastKnownTabs: [],
      },
      demoConfig: {
        hideAmounts: false,
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

      setDemoConfig: (config) =>
        set((state) => ({
          demoConfig: { ...state.demoConfig, ...config },
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
          .reduce((sum, t) => sum + Math.max(0, getSignedAmount(t)), 0);
        const totalExpenses = getNetExpenseTotal(transactions);
        const balance = totalIncome - totalExpenses;
        const savingsRate = totalIncome > 0 ? ((totalIncome - totalExpenses) / totalIncome) * 100 : 0;

        return { totalIncome, totalExpenses, balance, savingsRate };
      },

      getCategorySpending: () => {
        const { transactions, categories } = get();
        const expenses = transactions.filter((t) => t.type === 'expense');
        const totalExpenses = getNetExpenseTotal(expenses);

        const categoryTotals = new Map<string, number>();
        expenses.forEach((t) => {
          const current = categoryTotals.get(t.category) || 0;
          categoryTotals.set(t.category, current + getSignedAmount(t));
        });

        return Array.from(categoryTotals.entries())
          .map(([category, signedTotal]) => {
            const amount = Math.max(0, -signedTotal);
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
        const reports = new Map<string, { income: number; outflow: number; rebates: number }>();

        transactions.forEach((t) => {
          const date = new Date(t.date);
          const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

          const current = reports.get(monthKey) || { income: 0, outflow: 0, rebates: 0 };
          if (t.type === 'income') {
            current.income += Math.max(0, getSignedAmount(t));
          } else {
            const signed = getSignedAmount(t);
            if (signed < 0) {
              current.outflow += Math.abs(signed);
            } else {
              current.rebates += signed;
            }
          }
          reports.set(monthKey, current);
        });

        return Array.from(reports.entries())
          .map(([month, data]) => {
            const expenses = Math.max(0, data.outflow - data.rebates);
            return {
              month,
              income: data.income,
              expenses,
              savings: data.income - expenses,
            };
          })
          .sort((a, b) => b.month.localeCompare(a.month))
          .slice(0, months);
      },

      getRecentTransactions: (limit = 10) => {
        const { transactions } = get();
        return [...transactions]
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
          .slice(0, limit);
      },

      getAvailableYears: () => {
        const { transactions } = get();
        const years = new Set<number>();
        transactions.forEach((t) => {
          const year = new Date(t.date).getFullYear();
          if (!isNaN(year)) years.add(year);
        });
        return Array.from(years).sort((a, b) => b - a);
      },

      getYearlyReports: () => {
        const { transactions } = get();
        const yearlyData = new Map<number, { income: number; outflow: number; rebates: number; months: Set<number> }>();

        transactions.forEach((t) => {
          const date = new Date(t.date);
          const year = date.getFullYear();
          const month = date.getMonth();
          if (isNaN(year)) return;

          const current = yearlyData.get(year) || { income: 0, outflow: 0, rebates: 0, months: new Set<number>() };
          current.months.add(month);
          if (t.type === 'income') {
            current.income += Math.max(0, getSignedAmount(t));
          } else {
            const signed = getSignedAmount(t);
            if (signed < 0) {
              current.outflow += Math.abs(signed);
            } else {
              current.rebates += signed;
            }
          }
          yearlyData.set(year, current);
        });

        return Array.from(yearlyData.entries())
          .map(([year, data]) => {
            const monthCount = data.months.size || 1;
            const totalExpenses = Math.max(0, data.outflow - data.rebates);
            const savings = data.income - totalExpenses;
            return {
              year,
              totalIncome: data.income,
              totalExpenses,
              savings,
              savingsRate: data.income > 0 ? (savings / data.income) * 100 : 0,
              monthlyAvgIncome: data.income / monthCount,
              monthlyAvgExpense: totalExpenses / monthCount,
            };
          })
          .sort((a, b) => b.year - a.year);
      },

      getYearOverYearComparison: () => {
        const { transactions } = get();
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        // Group by month and year
        const monthYearData = new Map<string, { income: number; outflow: number; rebates: number }>();
        const allYears = new Set<number>();

        transactions.forEach((t) => {
          const date = new Date(t.date);
          const year = date.getFullYear();
          const month = date.getMonth() + 1;
          if (isNaN(year)) return;

          allYears.add(year);
          const key = `${month}-${year}`;
          const current = monthYearData.get(key) || { income: 0, outflow: 0, rebates: 0 };
          if (t.type === 'income') {
            current.income += Math.max(0, getSignedAmount(t));
          } else {
            const signed = getSignedAmount(t);
            if (signed < 0) {
              current.outflow += Math.abs(signed);
            } else {
              current.rebates += signed;
            }
          }
          monthYearData.set(key, current);
        });

        const yearsArray = Array.from(allYears).sort((a, b) => a - b);

        // Build comparison for each month
        const comparisons: YearOverYearComparison[] = [];
        for (let month = 1; month <= 12; month++) {
          const yearsData = yearsArray.map((year) => {
            const key = `${month}-${year}`;
            const data = monthYearData.get(key) || { income: 0, outflow: 0, rebates: 0 };
            const expenses = Math.max(0, data.outflow - data.rebates);
            return {
              year,
              income: data.income,
              expenses,
              savings: data.income - expenses,
            };
          }).filter((d) => d.income > 0 || d.expenses > 0);

          if (yearsData.length > 0) {
            comparisons.push({
              month,
              monthName: monthNames[month - 1],
              years: yearsData,
            });
          }
        }

        return comparisons;
      },

      getTrends: () => {
        const { transactions } = get();
        const trends: TrendData[] = [];

        // Get monthly totals sorted by date
        const monthlyTotals = new Map<string, { income: number; outflow: number; rebates: number }>();
        transactions.forEach((t) => {
          const date = new Date(t.date);
          const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          const current = monthlyTotals.get(monthKey) || { income: 0, outflow: 0, rebates: 0 };
          if (t.type === 'income') {
            current.income += Math.max(0, getSignedAmount(t));
          } else {
            const signed = getSignedAmount(t);
            if (signed < 0) {
              current.outflow += Math.abs(signed);
            } else {
              current.rebates += signed;
            }
          }
          monthlyTotals.set(monthKey, current);
        });

        const sortedMonths = Array.from(monthlyTotals.entries())
          .sort((a, b) => a[0].localeCompare(b[0]));

        if (sortedMonths.length < 2) return trends;

        // Calculate trends (compare recent 3 months vs previous 3 months)
        const recentMonths = sortedMonths.slice(-3);
        const previousMonths = sortedMonths.slice(-6, -3);

        if (previousMonths.length === 0) return trends;

        const calcAvg = (months: typeof sortedMonths, type: 'income' | 'expenses') =>
          months.reduce((sum, [, data]) => {
            if (type === 'income') return sum + data.income;
            const expenses = Math.max(0, data.outflow - data.rebates);
            return sum + expenses;
          }, 0) / months.length;

        // Income trend
        const recentIncome = calcAvg(recentMonths, 'income');
        const prevIncome = calcAvg(previousMonths, 'income');
        const incomeChange = prevIncome > 0 ? ((recentIncome - prevIncome) / prevIncome) * 100 : 0;
        trends.push({
          type: 'income',
          direction: incomeChange > 5 ? 'up' : incomeChange < -5 ? 'down' : 'stable',
          percentChange: incomeChange,
          recentAvg: recentIncome,
          previousAvg: prevIncome,
        });

        // Expense trend
        const recentExpense = calcAvg(recentMonths, 'expenses');
        const prevExpense = calcAvg(previousMonths, 'expenses');
        const expenseChange = prevExpense > 0 ? ((recentExpense - prevExpense) / prevExpense) * 100 : 0;
        trends.push({
          type: 'expense',
          direction: expenseChange > 5 ? 'up' : expenseChange < -5 ? 'down' : 'stable',
          percentChange: expenseChange,
          recentAvg: recentExpense,
          previousAvg: prevExpense,
        });

        // Savings trend
        const recentSavings = recentIncome - recentExpense;
        const prevSavings = prevIncome - prevExpense;
        const savingsChange = prevSavings !== 0 ? ((recentSavings - prevSavings) / Math.abs(prevSavings)) * 100 : 0;
        trends.push({
          type: 'savings',
          direction: savingsChange > 5 ? 'up' : savingsChange < -5 ? 'down' : 'stable',
          percentChange: savingsChange,
          recentAvg: recentSavings,
          previousAvg: prevSavings,
        });

        return trends;
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
