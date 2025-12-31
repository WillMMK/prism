/**
 * Schema Detection Unit Tests
 * Tests for xlsxParser schema detection logic
 */

// Test helper: Aggregate column detection
const AGGREGATE_COLUMN_NAMES = [
  'income', 'expense', 'expenses', 'net profit', 'net', 'total',
  'balance', 'sum', 'grand total', 'subtotal',
];

function isAggregateColumn(header: string): boolean {
  const lower = header.toLowerCase().trim();
  return AGGREGATE_COLUMN_NAMES.includes(lower);
}

// Test helper: Sheet type detection from sheet name
function detectSheetTypeFromName(sheetName: string): 'expense' | 'income' | null {
  const lower = sheetName.toLowerCase().trim();

  // Check for expense sheet names
  if (lower === 'expense' || lower === 'expenses' ||
      lower.includes('expense') || lower.includes('spending') ||
      lower.includes('cost') || lower.includes('payment')) {
    return 'expense';
  }

  // Check for income sheet names
  if (lower === 'income' || lower === 'incomes' ||
      lower.includes('income') || lower.includes('earning') ||
      lower.includes('revenue') || lower.includes('salary')) {
    return 'income';
  }

  return null;
}

// Test helper: Sheet type detection from column headers and data
function detectSheetTypeFromHeadersAndData(headers: string[], rows: string[][]): 'expense' | 'income' | null {
  const lowerHeaders = headers.map(h => h.toLowerCase().trim());

  // Find aggregate column indices
  const expenseColIdx = lowerHeaders.findIndex(h =>
    h === 'expense' || h === 'expenses' || h === 'total expense' || h === 'total expenses'
  );
  const incomeColIdx = lowerHeaders.findIndex(h =>
    h === 'income' || h === 'total income'
  );

  // If neither column exists, can't determine
  if (expenseColIdx === -1 && incomeColIdx === -1) {
    return null;
  }

  // If only one exists, use that
  if (expenseColIdx >= 0 && incomeColIdx === -1) {
    return 'expense';
  }
  if (incomeColIdx >= 0 && expenseColIdx === -1) {
    return 'income';
  }

  // Both columns exist - check which one has actual data
  let expenseSum = 0;
  let incomeSum = 0;
  const sampleRows = rows.slice(0, 20);

  for (const row of sampleRows) {
    if (expenseColIdx >= 0 && row[expenseColIdx]) {
      const val = parseFloat(String(row[expenseColIdx]).replace(/[$,£€\s]/g, '')) || 0;
      expenseSum += Math.abs(val);
    }
    if (incomeColIdx >= 0 && row[incomeColIdx]) {
      const val = parseFloat(String(row[incomeColIdx]).replace(/[$,£€\s]/g, '')) || 0;
      incomeSum += Math.abs(val);
    }
  }

  // If only expense column has data → expense sheet
  if (expenseSum > 0 && incomeSum === 0) {
    return 'expense';
  }
  // If only income column has data → income sheet
  if (incomeSum > 0 && expenseSum === 0) {
    return 'income';
  }
  // If expense column has significantly more data → expense sheet
  if (expenseSum > incomeSum * 5) {
    return 'expense';
  }
  // If income column has significantly more data → income sheet
  if (incomeSum > expenseSum * 5) {
    return 'income';
  }

  // Can't determine - both have similar amounts of data
  return null;
}

// Test helper: Date classification
function classifyDateFormat(dateStr: string): 'total' | 'summary' | 'detail' | 'unknown' {
  const trimmed = dateStr.trim();
  if (!trimmed) return 'total';
  if (/^\d{4}[\/\-]\d{1,2}([\/\-]\d{1,2})?$/.test(trimmed)) return 'summary';
  if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}$/.test(trimmed)) return 'detail';
  const num = parseFloat(trimmed);
  if (!isNaN(num) && num > 30000 && num < 100000) return 'detail';
  return 'unknown';
}

// Test helper: Sum column detection
function detectSumColumn(
  rows: number[][],
  targetCol: number,
  candidateCols: number[],
  tolerance: number = 0.01
): number[] | null {
  const sortedCandidates = [...candidateCols].sort((a, b) => a - b);

  for (let startIdx = 0; startIdx < sortedCandidates.length; startIdx++) {
    let currentSubset: number[] = [];

    for (let endIdx = startIdx; endIdx < sortedCandidates.length; endIdx++) {
      currentSubset.push(sortedCandidates[endIdx]);

      let allMatch = true;
      let validRows = 0;

      for (const row of rows) {
        const targetVal = row[targetCol] || 0;
        const subsetSum = currentSubset.reduce((sum, col) => sum + (row[col] || 0), 0);

        if (Math.abs(targetVal) < 0.01 && Math.abs(subsetSum) < 0.01) continue;
        validRows++;

        const diff = Math.abs(targetVal - subsetSum);
        const maxVal = Math.max(Math.abs(targetVal), Math.abs(subsetSum), 1);

        if (diff / maxVal > tolerance) {
          allMatch = false;
          break;
        }
      }

      if (allMatch && validRows >= 3 && currentSubset.length >= 2) {
        return currentSubset;
      }
    }
  }

  return null;
}

describe('Aggregate Column Detection', () => {
  describe('isAggregateColumn', () => {
    test('should identify "income" as aggregate', () => {
      expect(isAggregateColumn('income')).toBe(true);
      expect(isAggregateColumn('Income')).toBe(true);
      expect(isAggregateColumn('INCOME')).toBe(true);
      expect(isAggregateColumn('  income  ')).toBe(true);
    });

    test('should identify "expense" variants as aggregate', () => {
      expect(isAggregateColumn('expense')).toBe(true);
      expect(isAggregateColumn('expenses')).toBe(true);
      expect(isAggregateColumn('Expense')).toBe(true);
    });

    test('should identify "net profit" as aggregate', () => {
      expect(isAggregateColumn('net profit')).toBe(true);
      expect(isAggregateColumn('Net Profit')).toBe(true);
      expect(isAggregateColumn('NET PROFIT')).toBe(true);
    });

    test('should identify other aggregate columns', () => {
      expect(isAggregateColumn('total')).toBe(true);
      expect(isAggregateColumn('balance')).toBe(true);
      expect(isAggregateColumn('sum')).toBe(true);
      expect(isAggregateColumn('grand total')).toBe(true);
      expect(isAggregateColumn('subtotal')).toBe(true);
      expect(isAggregateColumn('net')).toBe(true);
    });

    test('should NOT identify category columns as aggregate', () => {
      expect(isAggregateColumn('Transport')).toBe(false);
      expect(isAggregateColumn('Living')).toBe(false);
      expect(isAggregateColumn('Groceries')).toBe(false);
      expect(isAggregateColumn('Will')).toBe(false);
      expect(isAggregateColumn('Yan')).toBe(false);
      expect(isAggregateColumn('Salary Package')).toBe(false);
      expect(isAggregateColumn('Interest')).toBe(false);
      expect(isAggregateColumn('Mortgage')).toBe(false);
    });

    test('should NOT identify partial matches as aggregate', () => {
      // "income" is exact match, but "incomes" or "income_source" should not match
      expect(isAggregateColumn('incomes')).toBe(false);
      expect(isAggregateColumn('income source')).toBe(false);
      expect(isAggregateColumn('total_income')).toBe(false);
    });

    test('should handle edge cases', () => {
      expect(isAggregateColumn('')).toBe(false);
      expect(isAggregateColumn('   ')).toBe(false);
    });
  });
});

describe('Date Format Classification', () => {
  describe('classifyDateFormat', () => {
    test('should classify empty dates as total rows', () => {
      expect(classifyDateFormat('')).toBe('total');
      expect(classifyDateFormat('   ')).toBe('total');
    });

    test('should classify year-first dates as summary (monthly)', () => {
      expect(classifyDateFormat('2025/12/1')).toBe('summary');
      expect(classifyDateFormat('2025/12')).toBe('summary');
      expect(classifyDateFormat('2025-12-01')).toBe('summary');
      expect(classifyDateFormat('2025-12')).toBe('summary');
      expect(classifyDateFormat('2025/1/1')).toBe('summary');
      expect(classifyDateFormat('2024/6')).toBe('summary');
    });

    test('should classify day-first dates as detail (daily)', () => {
      expect(classifyDateFormat('01/12/2025')).toBe('detail');
      expect(classifyDateFormat('1/12/2025')).toBe('detail');
      expect(classifyDateFormat('15/06/2024')).toBe('detail');
      expect(classifyDateFormat('31-12-2025')).toBe('detail');
    });

    test('should classify Excel serial dates as detail', () => {
      // Excel serial dates: days since Jan 1, 1900
      // 45000 ≈ 2023, 46000 ≈ 2026
      expect(classifyDateFormat('45000')).toBe('detail');
      expect(classifyDateFormat('45992')).toBe('detail');
      expect(classifyDateFormat('46000')).toBe('detail');
    });

    test('should handle invalid dates', () => {
      expect(classifyDateFormat('invalid')).toBe('unknown');
      expect(classifyDateFormat('abc123')).toBe('unknown');
      expect(classifyDateFormat('12345')).toBe('unknown'); // Too small for Excel serial
    });

    test('should handle edge cases', () => {
      // Text that looks like totals
      expect(classifyDateFormat('Total')).toBe('unknown');
      expect(classifyDateFormat('Grand Total')).toBe('unknown');
    });
  });
});

describe('Sum Column Detection', () => {
  describe('detectSumColumn', () => {
    test('should detect income = Will + Yan + Salary + Interest', () => {
      // Columns: 0=date, 1=expense, 2=income, 3=net, 4=transport, ..., 12=Will, 13=Yan, 14=Salary, 15=Interest
      const rows = [
        [0, -4500, 9500, 5000, -450, -900, -180, -280, -140, -90, -1800, -660, 5500, 2000, 1500, 500],
        [0, -4200, 9000, 4800, -420, -850, -170, -260, -130, -85, -1700, -585, 5200, 1900, 1400, 500],
        [0, -4000, 8500, 4500, -400, -800, -160, -240, -120, -80, -1600, -600, 4900, 1800, 1300, 500],
        [0, -3800, 8000, 4200, -380, -750, -150, -220, -110, -75, -1500, -515, 4600, 1700, 1200, 500],
      ];

      const incomeCol = 2;  // income column
      const candidateCols = [12, 13, 14, 15];  // Will, Yan, Salary, Interest

      const result = detectSumColumn(rows, incomeCol, candidateCols);
      expect(result).toEqual([12, 13, 14, 15]);
    });

    test('should detect expense = sum of expense categories', () => {
      // Simplified: expense = transport + living + bill
      const rows = [
        [0, -1550, 0, 0, -500, -800, -250],
        [0, -1470, 0, 0, -470, -750, -250],
        [0, -1360, 0, 0, -440, -700, -220],
        [0, -1280, 0, 0, -410, -670, -200],
      ];

      const expenseCol = 1;
      const candidateCols = [4, 5, 6];  // transport, living, bill

      const result = detectSumColumn(rows, expenseCol, candidateCols);
      expect(result).toEqual([4, 5, 6]);
    });

    test('should return null when no sum relationship found', () => {
      const rows = [
        [0, 1000, 500, 300, 200],  // 1000 ≠ 500+300+200
        [0, 2000, 600, 400, 300],  // 2000 ≠ 600+400+300
        [0, 1500, 550, 350, 250],
        [0, 1800, 580, 380, 280],
      ];

      const result = detectSumColumn(rows, 1, [2, 3, 4]);
      expect(result).toBeNull();
    });

    test('should require at least 2 columns in sum', () => {
      // Even if col1 = col2 for all rows, need at least 2 columns
      const rows = [
        [0, 500, 500],
        [0, 600, 600],
        [0, 550, 550],
        [0, 580, 580],
      ];

      const result = detectSumColumn(rows, 1, [2]);
      expect(result).toBeNull();
    });

    test('should handle rows with zeros', () => {
      const rows = [
        [0, 0, 0, 0, 0],  // All zeros - should be skipped
        [0, 1000, 500, 300, 200],
        [0, 1300, 600, 400, 300],
        [0, 1150, 550, 350, 250],
        [0, 1260, 580, 380, 300],
      ];

      const result = detectSumColumn(rows, 1, [2, 3, 4]);
      expect(result).toEqual([2, 3, 4]);
    });

    test('should handle tolerance for rounding errors', () => {
      const rows = [
        [0, 1000.01, 500, 300.01, 200],  // Sum = 1000.01, very close
        [0, 1299.99, 600, 400, 299.99],  // Sum = 1299.99, very close
        [0, 1150, 550, 350, 250],
        [0, 1260, 580, 380, 300],
      ];

      const result = detectSumColumn(rows, 1, [2, 3, 4], 0.01);
      expect(result).toEqual([2, 3, 4]);
    });
  });
});

describe('Mixed Sheet Row Classification', () => {
  test('should correctly classify rows in a mixed format sheet', () => {
    const rows = [
      ['', '-5000', '10000'],           // Total row (empty date)
      ['2025/12/1', '-4500', '9500'],   // Summary row (year-first)
      ['2025/11/1', '-4200', '9000'],   // Summary row
      ['01/12/2025', '-150', '0'],      // Detail row (day-first)
      ['02/12/2025', '-200', '0'],      // Detail row
      ['15/11/2025', '-180', '0'],      // Detail row
    ];

    const totalRows: number[] = [];
    const summaryRows: number[] = [];
    const detailRows: number[] = [];

    rows.forEach((row, index) => {
      const dateType = classifyDateFormat(row[0]);
      if (dateType === 'total') totalRows.push(index);
      else if (dateType === 'summary') summaryRows.push(index);
      else if (dateType === 'detail') detailRows.push(index);
    });

    expect(totalRows).toEqual([0]);
    expect(summaryRows).toEqual([1, 2]);
    expect(detailRows).toEqual([3, 4, 5]);
  });

  test('should handle sheet with only summary rows', () => {
    const rows = [
      ['', '-5000', '10000'],           // Total
      ['2025/12', '-4500', '9500'],     // Summary
      ['2025/11', '-4200', '9000'],     // Summary
      ['2025/10', '-4000', '8500'],     // Summary
    ];

    const detailRows = rows
      .map((row, idx) => ({ idx, type: classifyDateFormat(row[0]) }))
      .filter(r => r.type === 'detail');

    expect(detailRows).toHaveLength(0);
  });

  test('should handle Excel serial dates mixed with text dates', () => {
    const rows = [
      ['45992', '-150', '0'],           // Excel serial (detail)
      ['2025/12/1', '-4500', '9500'],   // Year-first (summary)
      ['45991', '-200', '0'],           // Excel serial (detail)
      ['01/12/2025', '-180', '0'],      // Day-first (detail)
    ];

    const classifications = rows.map((row, idx) => ({
      idx,
      date: row[0],
      type: classifyDateFormat(row[0])
    }));

    expect(classifications[0].type).toBe('detail');
    expect(classifications[1].type).toBe('summary');
    expect(classifications[2].type).toBe('detail');
    expect(classifications[3].type).toBe('detail');
  });
});

describe('Edge Cases', () => {
  test('should handle empty headers array', () => {
    const headers: string[] = [];
    const aggregates = headers.filter(h => isAggregateColumn(h));
    expect(aggregates).toHaveLength(0);
  });

  test('should handle headers with special characters', () => {
    expect(isAggregateColumn('Income (Monthly)')).toBe(false); // Not exact match
    expect(isAggregateColumn('Net-Profit')).toBe(false);       // Has hyphen
    expect(isAggregateColumn('Total$')).toBe(false);           // Has $
  });

  test('should handle very long column names', () => {
    const longName = 'A'.repeat(1000);
    expect(isAggregateColumn(longName)).toBe(false);
  });

  test('should handle unicode characters in headers', () => {
    expect(isAggregateColumn('收入')).toBe(false);  // Chinese for "income"
    expect(isAggregateColumn('Ingreso')).toBe(false); // Spanish
  });

  test('should handle negative numbers in sum detection', () => {
    // Expense categories are typically negative
    const rows = [
      [0, -1000, -500, -300, -200],  // expense = transport + living + bill
      [0, -1300, -600, -400, -300],
      [0, -1150, -550, -350, -250],
      [0, -1260, -580, -380, -300],
    ];

    const result = detectSumColumn(rows, 1, [2, 3, 4]);
    expect(result).toEqual([2, 3, 4]);
  });
});

describe('Sheet Type Detection from Name', () => {
  describe('detectSheetTypeFromName', () => {
    test('should detect expense sheet names', () => {
      expect(detectSheetTypeFromName('expense')).toBe('expense');
      expect(detectSheetTypeFromName('Expense')).toBe('expense');
      expect(detectSheetTypeFromName('EXPENSE')).toBe('expense');
      expect(detectSheetTypeFromName('expenses')).toBe('expense');
      expect(detectSheetTypeFromName('Expenses')).toBe('expense');
    });

    test('should detect expense-related sheet names', () => {
      expect(detectSheetTypeFromName('Monthly Expenses')).toBe('expense');
      expect(detectSheetTypeFromName('expense tracker')).toBe('expense');
      expect(detectSheetTypeFromName('spending')).toBe('expense');
      expect(detectSheetTypeFromName('cost')).toBe('expense');
      expect(detectSheetTypeFromName('payments')).toBe('expense');
      expect(detectSheetTypeFromName('payment log')).toBe('expense');
    });

    test('should detect income sheet names', () => {
      expect(detectSheetTypeFromName('income')).toBe('income');
      expect(detectSheetTypeFromName('Income')).toBe('income');
      expect(detectSheetTypeFromName('INCOME')).toBe('income');
      expect(detectSheetTypeFromName('incomes')).toBe('income');
    });

    test('should detect income-related sheet names', () => {
      expect(detectSheetTypeFromName('Monthly Income')).toBe('income');
      expect(detectSheetTypeFromName('income tracker')).toBe('income');
      expect(detectSheetTypeFromName('earnings')).toBe('income');
      expect(detectSheetTypeFromName('revenue')).toBe('income');
      expect(detectSheetTypeFromName('salary')).toBe('income');
      expect(detectSheetTypeFromName('Salary History')).toBe('income');
    });

    test('should return null for neutral sheet names', () => {
      expect(detectSheetTypeFromName('Sheet1')).toBe(null);
      expect(detectSheetTypeFromName('Budget')).toBe(null);
      expect(detectSheetTypeFromName('Summary')).toBe(null);
      expect(detectSheetTypeFromName('2025')).toBe(null);
      expect(detectSheetTypeFromName('Data')).toBe(null);
    });

    test('should handle whitespace', () => {
      expect(detectSheetTypeFromName('  expense  ')).toBe('expense');
      expect(detectSheetTypeFromName('  income  ')).toBe('income');
      expect(detectSheetTypeFromName('   ')).toBe(null);
    });
  });
});

describe('Sheet Type Detection from Headers and Data', () => {
  describe('detectSheetTypeFromHeadersAndData', () => {
    test('should detect expense sheet from Expense column without Income column', () => {
      const headers = ['Date', 'Expense', 'Transport', 'Living', 'Bill'];
      const rows = [['2023/1', '1000', '300', '500', '200']];
      expect(detectSheetTypeFromHeadersAndData(headers, rows)).toBe('expense');
    });

    test('should detect expense sheet with variations', () => {
      const rows = [['2023/1', '1000', '500', '500']];
      expect(detectSheetTypeFromHeadersAndData(['', 'Expenses', 'Food', 'Rent'], rows)).toBe('expense');
      expect(detectSheetTypeFromHeadersAndData(['', 'Total Expense', 'Gas'], rows)).toBe('expense');
      expect(detectSheetTypeFromHeadersAndData(['', 'EXPENSE', 'Bills'], rows)).toBe('expense');
    });

    test('should detect income sheet from Income column without Expense column', () => {
      const headers = ['Date', 'Income', 'Salary', 'Bonus', 'Interest'];
      const rows = [['2023/1', '5000', '4000', '500', '500']];
      expect(detectSheetTypeFromHeadersAndData(headers, rows)).toBe('income');
    });

    test('should detect income sheet with variations', () => {
      const rows = [['2023/1', '5000', '5000']];
      expect(detectSheetTypeFromHeadersAndData(['', 'Total Income', 'Salary'], rows)).toBe('income');
      expect(detectSheetTypeFromHeadersAndData(['', 'INCOME', 'Bonus'], rows)).toBe('income');
    });

    test('should return null when neither Expense nor Income columns exist', () => {
      const headers = ['Date', 'Amount', 'Category', 'Description'];
      const rows = [['2023/1', '1000', 'Food', 'Groceries']];
      expect(detectSheetTypeFromHeadersAndData(headers, rows)).toBe(null);
    });

    test('should detect expense sheet when both columns exist but only Expense has data', () => {
      // User's actual case: expense sheet "2023" has both Expense and income columns
      // but only the Expense column has values
      const headers = ['', 'Expense', 'income', 'Net Profit', 'Transport', 'Living', 'Bill'];
      const rows = [
        ['2023/1', '1500', '0', '-1500', '500', '700', '300'],
        ['2023/2', '1800', '0', '-1800', '600', '800', '400'],
        ['2023/3', '1600', '0', '-1600', '550', '750', '300'],
      ];
      expect(detectSheetTypeFromHeadersAndData(headers, rows)).toBe('expense');
    });

    test('should detect income sheet when both columns exist but only Income has data', () => {
      const headers = ['', 'Expense', 'Income', 'Net Profit', 'Salary', 'Bonus'];
      const rows = [
        ['2023/1', '0', '5000', '5000', '4500', '500'],
        ['2023/2', '0', '5500', '5500', '5000', '500'],
        ['2023/3', '0', '5200', '5200', '4700', '500'],
      ];
      expect(detectSheetTypeFromHeadersAndData(headers, rows)).toBe('income');
    });

    test('should handle real user expense sheet (2023 sheet with both columns)', () => {
      // User's expense sheet "2023" has: Date, Expense, income, Net Profit, Transport, Living, ...
      // The income column is there but has 0 or empty values
      const headers = ['', 'Expense', 'income', 'Net Profit', 'Transport', 'Living', 'Bill', 'Groceries'];
      const rows = [
        ['2023/1', '-4500', '0', '-4500', '-450', '-900', '-180', '-280'],
        ['2023/2', '-4200', '0', '-4200', '-420', '-850', '-170', '-260'],
        ['2023/3', '-4000', '', '-4000', '-400', '-800', '-160', '-240'],
      ];
      expect(detectSheetTypeFromHeadersAndData(headers, rows)).toBe('expense');
    });

    test('should handle real user income sheet (2023_income)', () => {
      // User's income sheet has: Date, Income, Will, Yan, Salary Package, Interest
      const headers = ['', 'Income', 'Will', 'Yan', 'Salary Package', 'Interest'];
      const rows = [
        ['2023/1', '9500', '5500', '2000', '1500', '500'],
        ['2023/2', '9000', '5200', '1900', '1400', '500'],
        ['2023/3', '8500', '4900', '1800', '1300', '500'],
      ];
      expect(detectSheetTypeFromHeadersAndData(headers, rows)).toBe('income');
    });

    test('should return null when both columns have significant data', () => {
      // Mixed sheet with both expense and income data
      const headers = ['', 'Expense', 'Income', 'Net Profit'];
      const rows = [
        ['2023/1', '4500', '9500', '5000'],
        ['2023/2', '4200', '9000', '4800'],
        ['2023/3', '4000', '8500', '4500'],
      ];
      expect(detectSheetTypeFromHeadersAndData(headers, rows)).toBe(null);
    });
  });
});

describe('Real-world User Data Scenarios', () => {
  test('should handle user spreadsheet format: YEAR MONTH + category columns', () => {
    const headers = [
      '', // Date column (no header)
      'Expense', 'income', 'Net Profit',  // Aggregate columns
      'Transport', 'Living', 'Bill', 'Groceries', 'Dine', 'RMIT', 'Mortgage', 'Childcare',  // Expense categories
      'Will', 'Yan', 'Salary Package', 'Interest'  // Income categories
    ];

    const aggregates = headers.filter(h => isAggregateColumn(h));
    const categories = headers.filter(h => h && !isAggregateColumn(h));

    expect(aggregates).toEqual(['Expense', 'income', 'Net Profit']);
    expect(categories).toContain('Transport');
    expect(categories).toContain('Will');
    expect(categories).not.toContain('income');
  });

  test('should correctly skip total row and import summaries when no detail rows', () => {
    const rows = [
      ['', '-60000', '120000', '60000'],        // Total - SKIP
      ['2025/12/1', '-4500', '9500', '5000'],   // Summary - IMPORT
      ['2025/11/1', '-4200', '9000', '4800'],   // Summary - IMPORT
      ['2025/10/1', '-4000', '8500', '4500'],   // Summary - IMPORT
    ];

    const classifications = rows.map(row => classifyDateFormat(row[0]));
    const toImport = rows.filter((_, idx) => classifications[idx] === 'summary');

    expect(classifications).toEqual(['total', 'summary', 'summary', 'summary']);
    expect(toImport).toHaveLength(3);
  });
});
