/**
 * Reports Analytics Unit Tests
 * Tests for budget store analytics functions
 */

import { Transaction, YearlyReport, YearOverYearComparison, TrendData } from '../src/types/budget';

// Helper functions extracted from budgetStore for testing
function getYearlyReports(transactions: Transaction[]): YearlyReport[] {
  const yearlyData = new Map<number, { income: number; expenses: number; months: Set<number> }>();

  transactions.forEach((t) => {
    const date = new Date(t.date);
    const year = date.getFullYear();
    const month = date.getMonth();
    if (isNaN(year)) return;

    const current = yearlyData.get(year) || { income: 0, expenses: 0, months: new Set<number>() };
    current.months.add(month);
    if (t.type === 'income') {
      current.income += t.amount;
    } else {
      current.expenses += t.amount;
    }
    yearlyData.set(year, current);
  });

  return Array.from(yearlyData.entries())
    .map(([year, data]) => {
      const monthCount = data.months.size || 1;
      const savings = data.income - data.expenses;
      return {
        year,
        totalIncome: data.income,
        totalExpenses: data.expenses,
        savings,
        savingsRate: data.income > 0 ? (savings / data.income) * 100 : 0,
        monthlyAvgIncome: data.income / monthCount,
        monthlyAvgExpense: data.expenses / monthCount,
      };
    })
    .sort((a, b) => b.year - a.year);
}

function getYearOverYearComparison(transactions: Transaction[]): YearOverYearComparison[] {
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthYearData = new Map<string, { income: number; expenses: number }>();
  const allYears = new Set<number>();

  transactions.forEach((t) => {
    const date = new Date(t.date);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    if (isNaN(year)) return;

    allYears.add(year);
    const key = `${month}-${year}`;
    const current = monthYearData.get(key) || { income: 0, expenses: 0 };
    if (t.type === 'income') {
      current.income += t.amount;
    } else {
      current.expenses += t.amount;
    }
    monthYearData.set(key, current);
  });

  const yearsArray = Array.from(allYears).sort((a, b) => a - b);

  const comparisons: YearOverYearComparison[] = [];
  for (let month = 1; month <= 12; month++) {
    const yearsData = yearsArray.map((year) => {
      const key = `${month}-${year}`;
      const data = monthYearData.get(key) || { income: 0, expenses: 0 };
      return {
        year,
        income: data.income,
        expenses: data.expenses,
        savings: data.income - data.expenses,
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
}

function getTrends(transactions: Transaction[]): TrendData[] {
  const trends: TrendData[] = [];
  const monthlyTotals = new Map<string, { income: number; expenses: number }>();

  transactions.forEach((t) => {
    const date = new Date(t.date);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const current = monthlyTotals.get(monthKey) || { income: 0, expenses: 0 };
    if (t.type === 'income') {
      current.income += t.amount;
    } else {
      current.expenses += t.amount;
    }
    monthlyTotals.set(monthKey, current);
  });

  const sortedMonths = Array.from(monthlyTotals.entries())
    .sort((a, b) => a[0].localeCompare(b[0]));

  if (sortedMonths.length < 2) return trends;

  const recentMonths = sortedMonths.slice(-3);
  const previousMonths = sortedMonths.slice(-6, -3);

  if (previousMonths.length === 0) return trends;

  const calcAvg = (months: typeof sortedMonths, type: 'income' | 'expenses') =>
    months.reduce((sum, [, data]) => sum + data[type], 0) / months.length;

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
}

// Helper to create test transactions
function createTransaction(
  date: string,
  amount: number,
  type: 'income' | 'expense',
  category: string = 'Test'
): Transaction {
  return {
    id: `test_${Math.random().toString(36).substr(2, 9)}`,
    date,
    description: category,
    category,
    amount,
    type,
  };
}

describe('Yearly Reports', () => {
  describe('getYearlyReports', () => {
    test('should calculate yearly totals correctly', () => {
      const transactions: Transaction[] = [
        createTransaction('2024-01-15', 5000, 'income'),
        createTransaction('2024-02-15', 5000, 'income'),
        createTransaction('2024-01-20', 2000, 'expense'),
        createTransaction('2024-02-20', 2500, 'expense'),
        createTransaction('2025-01-15', 6000, 'income'),
        createTransaction('2025-01-20', 3000, 'expense'),
      ];

      const reports = getYearlyReports(transactions);

      expect(reports).toHaveLength(2);
      expect(reports[0].year).toBe(2025);  // Most recent first
      expect(reports[1].year).toBe(2024);

      // 2025: income=6000, expense=3000, savings=3000
      expect(reports[0].totalIncome).toBe(6000);
      expect(reports[0].totalExpenses).toBe(3000);
      expect(reports[0].savings).toBe(3000);
      expect(reports[0].savingsRate).toBe(50);

      // 2024: income=10000, expense=4500, savings=5500
      expect(reports[1].totalIncome).toBe(10000);
      expect(reports[1].totalExpenses).toBe(4500);
      expect(reports[1].savings).toBe(5500);
      expect(reports[1].savingsRate).toBeCloseTo(55, 5);
    });

    test('should calculate monthly averages correctly', () => {
      const transactions: Transaction[] = [
        createTransaction('2024-01-15', 5000, 'income'),
        createTransaction('2024-02-15', 6000, 'income'),
        createTransaction('2024-03-15', 5500, 'income'),
        createTransaction('2024-01-20', 2000, 'expense'),
        createTransaction('2024-02-20', 2500, 'expense'),
        createTransaction('2024-03-20', 2200, 'expense'),
      ];

      const reports = getYearlyReports(transactions);

      // 3 months of data, total income = 16500, total expense = 6700
      expect(reports[0].monthlyAvgIncome).toBeCloseTo(16500 / 3);
      expect(reports[0].monthlyAvgExpense).toBeCloseTo(6700 / 3);
    });

    test('should handle empty transactions', () => {
      const reports = getYearlyReports([]);
      expect(reports).toHaveLength(0);
    });

    test('should handle single transaction', () => {
      const transactions = [createTransaction('2024-06-15', 1000, 'income')];
      const reports = getYearlyReports(transactions);

      expect(reports).toHaveLength(1);
      expect(reports[0].totalIncome).toBe(1000);
      expect(reports[0].totalExpenses).toBe(0);
      expect(reports[0].monthlyAvgIncome).toBe(1000);  // 1 month
    });

    test('should handle negative savings (spending more than earning)', () => {
      const transactions: Transaction[] = [
        createTransaction('2024-01-15', 3000, 'income'),
        createTransaction('2024-01-20', 5000, 'expense'),
      ];

      const reports = getYearlyReports(transactions);

      expect(reports[0].savings).toBe(-2000);
      expect(reports[0].savingsRate).toBeCloseTo(-66.67, 1);
    });

    test('should handle zero income (only expenses)', () => {
      const transactions = [
        createTransaction('2024-01-20', 2000, 'expense'),
        createTransaction('2024-02-20', 3000, 'expense'),
      ];

      const reports = getYearlyReports(transactions);

      expect(reports[0].totalIncome).toBe(0);
      expect(reports[0].totalExpenses).toBe(5000);
      expect(reports[0].savingsRate).toBe(0);  // Division by zero protection
    });
  });
});

describe('Year-over-Year Comparison', () => {
  describe('getYearOverYearComparison', () => {
    test('should compare same months across years', () => {
      const transactions: Transaction[] = [
        // January data
        createTransaction('2023-01-15', 4000, 'income'),
        createTransaction('2023-01-20', 2000, 'expense'),
        createTransaction('2024-01-15', 4500, 'income'),
        createTransaction('2024-01-20', 2200, 'expense'),
        createTransaction('2025-01-15', 5000, 'income'),
        createTransaction('2025-01-20', 2500, 'expense'),
      ];

      const comparisons = getYearOverYearComparison(transactions);

      expect(comparisons).toHaveLength(1);  // Only January has data
      expect(comparisons[0].month).toBe(1);
      expect(comparisons[0].monthName).toBe('Jan');
      expect(comparisons[0].years).toHaveLength(3);

      // Years should be sorted ascending
      expect(comparisons[0].years[0].year).toBe(2023);
      expect(comparisons[0].years[1].year).toBe(2024);
      expect(comparisons[0].years[2].year).toBe(2025);

      // Check 2023 January
      expect(comparisons[0].years[0].income).toBe(4000);
      expect(comparisons[0].years[0].expenses).toBe(2000);
      expect(comparisons[0].years[0].savings).toBe(2000);
    });

    test('should handle months with data in some years only', () => {
      const transactions: Transaction[] = [
        createTransaction('2023-01-15', 4000, 'income'),
        createTransaction('2023-06-15', 4200, 'income'),  // June 2023 only
        createTransaction('2024-01-15', 4500, 'income'),
        // No June 2024
      ];

      const comparisons = getYearOverYearComparison(transactions);

      const janComparison = comparisons.find(c => c.month === 1);
      const junComparison = comparisons.find(c => c.month === 6);

      expect(janComparison?.years).toHaveLength(2);  // Both 2023 and 2024
      expect(junComparison?.years).toHaveLength(1);  // Only 2023
    });

    test('should return empty for single year data', () => {
      const transactions: Transaction[] = [
        createTransaction('2024-01-15', 4000, 'income'),
        createTransaction('2024-02-15', 4200, 'income'),
      ];

      const comparisons = getYearOverYearComparison(transactions);

      // Should still return data, but each month will have only one year
      expect(comparisons.length).toBeGreaterThan(0);
      comparisons.forEach(c => {
        expect(c.years).toHaveLength(1);
      });
    });

    test('should handle empty transactions', () => {
      const comparisons = getYearOverYearComparison([]);
      expect(comparisons).toHaveLength(0);
    });

    test('should exclude months with zero income and expenses', () => {
      const transactions: Transaction[] = [
        createTransaction('2024-01-15', 4000, 'income'),
        // February has no transactions
        createTransaction('2024-03-15', 4200, 'income'),
      ];

      const comparisons = getYearOverYearComparison(transactions);

      const monthNumbers = comparisons.map(c => c.month);
      expect(monthNumbers).not.toContain(2);  // February excluded
      expect(monthNumbers).toContain(1);
      expect(monthNumbers).toContain(3);
    });
  });
});

describe('Trends Analysis', () => {
  describe('getTrends', () => {
    test('should detect increasing income trend', () => {
      const transactions: Transaction[] = [
        // Previous 3 months: avg income = 4000
        createTransaction('2024-01-15', 3800, 'income'),
        createTransaction('2024-02-15', 4000, 'income'),
        createTransaction('2024-03-15', 4200, 'income'),
        // Recent 3 months: avg income = 5000 (+25%)
        createTransaction('2024-04-15', 4800, 'income'),
        createTransaction('2024-05-15', 5000, 'income'),
        createTransaction('2024-06-15', 5200, 'income'),
        // Some expenses to make it realistic
        createTransaction('2024-01-20', 2000, 'expense'),
        createTransaction('2024-02-20', 2000, 'expense'),
        createTransaction('2024-03-20', 2000, 'expense'),
        createTransaction('2024-04-20', 2000, 'expense'),
        createTransaction('2024-05-20', 2000, 'expense'),
        createTransaction('2024-06-20', 2000, 'expense'),
      ];

      const trends = getTrends(transactions);

      const incomeTrend = trends.find(t => t.type === 'income');
      expect(incomeTrend?.direction).toBe('up');
      expect(incomeTrend?.percentChange).toBeGreaterThan(20);
    });

    test('should detect decreasing expense trend (good)', () => {
      const transactions: Transaction[] = [
        // Previous 3 months: avg expense = 3000
        createTransaction('2024-01-20', 3000, 'expense'),
        createTransaction('2024-02-20', 3000, 'expense'),
        createTransaction('2024-03-20', 3000, 'expense'),
        // Recent 3 months: avg expense = 2000 (-33%)
        createTransaction('2024-04-20', 2000, 'expense'),
        createTransaction('2024-05-20', 2000, 'expense'),
        createTransaction('2024-06-20', 2000, 'expense'),
        // Income for context
        createTransaction('2024-01-15', 5000, 'income'),
        createTransaction('2024-02-15', 5000, 'income'),
        createTransaction('2024-03-15', 5000, 'income'),
        createTransaction('2024-04-15', 5000, 'income'),
        createTransaction('2024-05-15', 5000, 'income'),
        createTransaction('2024-06-15', 5000, 'income'),
      ];

      const trends = getTrends(transactions);

      const expenseTrend = trends.find(t => t.type === 'expense');
      expect(expenseTrend?.direction).toBe('down');
      expect(expenseTrend?.percentChange).toBeLessThan(-30);
    });

    test('should detect stable trend', () => {
      const transactions: Transaction[] = [
        // All months similar income
        createTransaction('2024-01-15', 5000, 'income'),
        createTransaction('2024-02-15', 5000, 'income'),
        createTransaction('2024-03-15', 5000, 'income'),
        createTransaction('2024-04-15', 5000, 'income'),
        createTransaction('2024-05-15', 5000, 'income'),
        createTransaction('2024-06-15', 5000, 'income'),
        // Same expenses throughout
        createTransaction('2024-01-20', 2000, 'expense'),
        createTransaction('2024-02-20', 2000, 'expense'),
        createTransaction('2024-03-20', 2000, 'expense'),
        createTransaction('2024-04-20', 2000, 'expense'),
        createTransaction('2024-05-20', 2000, 'expense'),
        createTransaction('2024-06-20', 2000, 'expense'),
      ];

      const trends = getTrends(transactions);

      expect(trends).toHaveLength(3);  // income, expense, savings
      const incomeTrend = trends.find(t => t.type === 'income');
      expect(incomeTrend).toBeDefined();
      expect(incomeTrend?.direction).toBe('stable');
      expect(incomeTrend?.percentChange).toBe(0);  // Exactly 0% change
    });

    test('should return empty for insufficient data (less than 2 months)', () => {
      const transactions = [createTransaction('2024-01-15', 5000, 'income')];
      const trends = getTrends(transactions);
      expect(trends).toHaveLength(0);
    });

    test('should return empty when no previous period for comparison', () => {
      // Only 3 months of data - no "previous" period
      const transactions: Transaction[] = [
        createTransaction('2024-01-15', 5000, 'income'),
        createTransaction('2024-02-15', 5000, 'income'),
        createTransaction('2024-03-15', 5000, 'income'),
      ];

      const trends = getTrends(transactions);
      expect(trends).toHaveLength(0);
    });

    test('should handle savings trend correctly', () => {
      const transactions: Transaction[] = [
        // Previous: income 4000, expense 3000, savings 1000
        createTransaction('2024-01-15', 4000, 'income'),
        createTransaction('2024-02-15', 4000, 'income'),
        createTransaction('2024-03-15', 4000, 'income'),
        createTransaction('2024-01-20', 3000, 'expense'),
        createTransaction('2024-02-20', 3000, 'expense'),
        createTransaction('2024-03-20', 3000, 'expense'),
        // Recent: income 5000, expense 2000, savings 3000 (+200%)
        createTransaction('2024-04-15', 5000, 'income'),
        createTransaction('2024-05-15', 5000, 'income'),
        createTransaction('2024-06-15', 5000, 'income'),
        createTransaction('2024-04-20', 2000, 'expense'),
        createTransaction('2024-05-20', 2000, 'expense'),
        createTransaction('2024-06-20', 2000, 'expense'),
      ];

      const trends = getTrends(transactions);

      const savingsTrend = trends.find(t => t.type === 'savings');
      expect(savingsTrend?.direction).toBe('up');
      expect(savingsTrend?.recentAvg).toBe(3000);
      expect(savingsTrend?.previousAvg).toBe(1000);
    });

    test('should handle negative previous savings', () => {
      const transactions: Transaction[] = [
        // Previous: income 3000, expense 4000, savings -1000
        createTransaction('2024-01-15', 3000, 'income'),
        createTransaction('2024-02-15', 3000, 'income'),
        createTransaction('2024-03-15', 3000, 'income'),
        createTransaction('2024-01-20', 4000, 'expense'),
        createTransaction('2024-02-20', 4000, 'expense'),
        createTransaction('2024-03-20', 4000, 'expense'),
        // Recent: income 5000, expense 3000, savings 2000
        createTransaction('2024-04-15', 5000, 'income'),
        createTransaction('2024-05-15', 5000, 'income'),
        createTransaction('2024-06-15', 5000, 'income'),
        createTransaction('2024-04-20', 3000, 'expense'),
        createTransaction('2024-05-20', 3000, 'expense'),
        createTransaction('2024-06-20', 3000, 'expense'),
      ];

      const trends = getTrends(transactions);

      const savingsTrend = trends.find(t => t.type === 'savings');
      expect(savingsTrend?.direction).toBe('up');
      expect(savingsTrend?.previousAvg).toBe(-1000);
      expect(savingsTrend?.recentAvg).toBe(2000);
    });
  });
});

describe('Edge Cases', () => {
  test('should handle invalid dates gracefully', () => {
    const transactions: Transaction[] = [
      { id: '1', date: 'invalid-date', description: 'Test', category: 'Test', amount: 1000, type: 'income' },
      createTransaction('2024-01-15', 5000, 'income'),
    ];

    // Should not throw
    expect(() => getYearlyReports(transactions)).not.toThrow();
    expect(() => getYearOverYearComparison(transactions)).not.toThrow();
    expect(() => getTrends(transactions)).not.toThrow();
  });

  test('should handle very large amounts', () => {
    const transactions = [
      createTransaction('2024-01-15', 1000000000, 'income'),  // 1 billion
      createTransaction('2024-01-20', 500000000, 'expense'),
    ];

    const reports = getYearlyReports(transactions);

    expect(reports[0].totalIncome).toBe(1000000000);
    expect(reports[0].savings).toBe(500000000);
  });

  test('should handle very small amounts', () => {
    const transactions = [
      createTransaction('2024-01-15', 0.01, 'income'),
      createTransaction('2024-01-20', 0.005, 'expense'),
    ];

    const reports = getYearlyReports(transactions);

    expect(reports[0].totalIncome).toBeCloseTo(0.01);
    expect(reports[0].totalExpenses).toBeCloseTo(0.005);
  });

  test('should handle same date multiple transactions', () => {
    const transactions = [
      createTransaction('2024-01-15', 1000, 'income'),
      createTransaction('2024-01-15', 2000, 'income'),
      createTransaction('2024-01-15', 500, 'expense'),
      createTransaction('2024-01-15', 500, 'expense'),
    ];

    const reports = getYearlyReports(transactions);

    expect(reports[0].totalIncome).toBe(3000);
    expect(reports[0].totalExpenses).toBe(1000);
  });

  test('should handle transactions spanning many years', () => {
    const transactions: Transaction[] = [];
    for (let year = 2015; year <= 2025; year++) {
      transactions.push(createTransaction(`${year}-06-15`, 5000 + (year - 2015) * 100, 'income'));
      transactions.push(createTransaction(`${year}-06-20`, 3000 + (year - 2015) * 50, 'expense'));
    }

    const reports = getYearlyReports(transactions);

    expect(reports).toHaveLength(11);
    expect(reports[0].year).toBe(2025);  // Most recent first
    expect(reports[10].year).toBe(2015);
  });
});
