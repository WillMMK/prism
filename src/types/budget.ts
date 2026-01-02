export interface Transaction {
  id: string;
  date: string;
  description: string;
  category: string;
  amount: number;
  signedAmount?: number;
  type: 'income' | 'expense';
}

export interface Category {
  id: string;
  name: string;
  color: string;
  icon: string;
  budget?: number;
}

export interface BudgetSummary {
  totalIncome: number;
  totalExpenses: number;
  balance: number;
  savingsRate: number;
}

export interface MonthlyReport {
  month: string;
  income: number;
  expenses: number;
  savings: number;
}

export interface CategorySpending {
  category: string;
  amount: number;
  percentage: number;
  color: string;
}

export interface GoogleSheetsConfig {
  spreadsheetId: string;
  sheetName: string;
  isConnected: boolean;
  lastSync?: string;
  selectedTabs?: string[];
  lastKnownTabs?: string[];
}

export interface ChartData {
  labels: string[];
  datasets: {
    data: number[];
    color?: (opacity: number) => string;
    strokeWidth?: number;
  }[];
}

export interface YearlyReport {
  year: number;
  totalIncome: number;
  totalExpenses: number;
  savings: number;
  savingsRate: number;
  monthlyAvgIncome: number;
  monthlyAvgExpense: number;
}

export interface YearOverYearComparison {
  month: number; // 1-12
  monthName: string;
  years: {
    year: number;
    income: number;
    expenses: number;
    savings: number;
  }[];
}

export interface TrendData {
  type: 'income' | 'expense' | 'savings';
  direction: 'up' | 'down' | 'stable';
  percentChange: number;
  recentAvg: number;
  previousAvg: number;
}
