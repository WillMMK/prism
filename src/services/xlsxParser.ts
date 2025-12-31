import * as XLSX from 'xlsx';
import * as FileSystem from 'expo-file-system/legacy';
import { Transaction } from '../types/budget';

export interface SheetData {
  name: string;
  headers: string[];
  rows: string[][];
  rowCount: number;
}

export interface ColumnMapping {
  dateColumn: number | null;
  descriptionColumn: number | null;
  amountColumn: number | null;
  categoryColumn: number | null;
  headers: string[];
}

export interface SummaryMapping {
  yearColumn: number | null;
  monthColumn: number | null;
  expenseCategories: { index: number; name: string }[];
  incomeCategories: { index: number; name: string }[];
  totalColumns: { index: number; name: string; type: 'expense' | 'income' | 'net'; sumOf: number[] }[];
}

// New: Mixed format with summary rows and detail rows
export interface MixedSheetAnalysis {
  dateColumnIndex: number;
  categoryColumns: { index: number; name: string }[];
  summaryRowIndices: number[];  // Rows that are monthly summaries
  detailRowIndices: number[];   // Rows that are daily details
  totalRowIndices: number[];    // Rows that are grand totals (skip)
  sheetType: 'expense' | 'income' | 'mixed';
}

export type DataFormat = 'transaction' | 'summary' | 'mixed';

export interface ParsedFile {
  sheets: SheetData[];
  inferredMapping: ColumnMapping;
  summaryMapping: SummaryMapping | null;
  mixedAnalysis: MixedSheetAnalysis | null;
  detectedFormat: DataFormat;
}

// Common expense category keywords
const EXPENSE_KEYWORDS = [
  'transport', 'transportation', 'travel', 'fuel', 'gas', 'petrol',
  'living', 'rent', 'housing', 'accommodation',
  'bill', 'bills', 'utilities', 'electricity', 'water', 'internet', 'phone',
  'groceries', 'grocery', 'food', 'supermarket',
  'dine', 'dining', 'restaurant', 'eat', 'eating', 'meals',
  'mortgage', 'loan', 'debt', 'payment',
  'childcare', 'child', 'kids', 'education', 'school', 'tuition',
  'insurance', 'health', 'medical', 'doctor',
  'entertainment', 'fun', 'leisure', 'hobby',
  'shopping', 'clothes', 'clothing',
  'maintenance', 'repair', 'service',
  'subscription', 'membership',
  'tax', 'taxes',
  'rmit',
];

// Common income category keywords (for breakdown categories, NOT totals)
const INCOME_KEYWORDS = [
  'salary', 'wage', 'wages', 'pay', 'paycheck',
  'earning', 'earnings',
  'interest', 'dividend', 'dividends',
  'bonus', 'commission',
  'refund', 'rebate', 'cashback',
  'gift', 'allowance',
  'rental', 'rent income',
  'investment', 'return',
  'freelance', 'consulting',
  'package',
];

// Aggregate/sum column names to always skip (these are totals, not categories)
const AGGREGATE_COLUMN_NAMES = [
  'income', 'expense', 'expenses', 'net profit', 'net', 'total',
  'balance', 'sum', 'grand total', 'subtotal',
];

// Check if column name is an aggregate/sum column
function isAggregateColumn(header: string): boolean {
  const lower = header.toLowerCase().trim();
  return AGGREGATE_COLUMN_NAMES.includes(lower);
}

// Detect sheet type from sheet name
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

class XLSXParserService {
  async parseFile(fileUri: string): Promise<ParsedFile> {
    const base64 = await FileSystem.readAsStringAsync(fileUri, {
      encoding: 'base64' as any,
    });

    const workbook = XLSX.read(base64, { type: 'base64' });
    const sheets: SheetData[] = [];

    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json<string[]>(worksheet, { header: 1 });

      if (jsonData.length > 0) {
        const headers = (jsonData[0] || []).map(h => String(h || ''));
        const rows = jsonData.slice(1).map(row =>
          (row || []).map(cell => String(cell ?? ''))
        );

        sheets.push({
          name: sheetName,
          headers,
          rows,
          rowCount: rows.length,
        });
      }
    }

    const firstSheet = sheets[0];
    const detectedFormat = firstSheet ? this.detectFormat(firstSheet) : 'transaction';

    let inferredMapping: ColumnMapping = {
      dateColumn: null,
      descriptionColumn: null,
      amountColumn: null,
      categoryColumn: null,
      headers: [],
    };

    let summaryMapping: SummaryMapping | null = null;
    let mixedAnalysis: MixedSheetAnalysis | null = null;

    if (firstSheet) {
      if (detectedFormat === 'mixed') {
        mixedAnalysis = this.analyzeMixedSheet(firstSheet);
      } else if (detectedFormat === 'summary') {
        summaryMapping = this.inferSummaryMapping(firstSheet.headers, firstSheet.rows);
      } else {
        inferredMapping = this.inferSchema(firstSheet.headers, firstSheet.rows);
      }
      inferredMapping.headers = firstSheet.headers;
    }

    return { sheets, inferredMapping, summaryMapping, mixedAnalysis, detectedFormat };
  }

  detectFormat(sheet: SheetData): DataFormat {
    const headers = sheet.headers.map(h => h.toLowerCase().trim());

    // Check if this looks like a mixed format (has dates in first column with mixed formats)
    const firstColValues = sheet.rows.map(r => r[0] || '');
    const dateFormats = this.analyzeFirstColumnDates(firstColValues);

    const numericColumns = this.countNumericColumns(headers, sheet.rows);
    const categoryColumns = headers.filter(h =>
      this.isExpenseCategory(h) || this.isIncomeCategory(h)
    ).length;

    // Mixed format: has both monthly summaries (YYYY/M) and daily details (DD/MM/YYYY)
    if (dateFormats.hasYearFirstDates && dateFormats.hasDayFirstDates) {
      return 'mixed';
    }

    // Check if first column has year-first dates (likely mixed/summary with date-based rows)
    // This must be checked BEFORE the numeric/category columns check
    if (dateFormats.hasYearFirstDates && categoryColumns >= 3) {
      return 'mixed';
    }

    // Check for YEAR/MONTH columns (pure summary format)
    const hasYearMonth = headers.some(h => h === 'year') && headers.some(h => h === 'month');

    if (hasYearMonth && categoryColumns >= 3) {
      return 'summary';
    }

    // Many category columns = summary format (only if no year-first dates detected)
    if (numericColumns >= 5 && categoryColumns >= 3) {
      return 'summary';
    }

    return 'transaction';
  }

  // Analyze date formats in first column
  private analyzeFirstColumnDates(values: string[]): {
    hasYearFirstDates: boolean;
    hasDayFirstDates: boolean;
    hasEmptyDates: boolean;
  } {
    let yearFirst = 0;  // YYYY/M/D or YYYY/M
    let dayFirst = 0;   // DD/MM/YYYY
    let empty = 0;

    for (const val of values) {
      const trimmed = val.trim();
      if (!trimmed) {
        empty++;
        continue;
      }

      // Year-first format: 2025/1/1 or 2025/1
      if (/^\d{4}[\/\-]\d{1,2}([\/\-]\d{1,2})?$/.test(trimmed)) {
        yearFirst++;
      }
      // Day-first format: 01/01/2025 or 1/1/2025
      else if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}$/.test(trimmed)) {
        dayFirst++;
      }
    }

    return {
      hasYearFirstDates: yearFirst >= 3,
      hasDayFirstDates: dayFirst >= 3,
      hasEmptyDates: empty > 0,
    };
  }

  // Analyze mixed sheet to separate summary rows from detail rows
  analyzeMixedSheet(sheet: SheetData): MixedSheetAnalysis {
    const analysis: MixedSheetAnalysis = {
      dateColumnIndex: 0,  // Assume first column is date
      categoryColumns: [],
      summaryRowIndices: [],
      detailRowIndices: [],
      totalRowIndices: [],
      sheetType: 'mixed',
    };

    // Find category columns (numeric columns with category-like headers)
    sheet.headers.forEach((header, index) => {
      if (index === 0) return; // Skip date column
      if (!header.trim()) return;

      // Skip aggregate columns (income, expense, net profit, etc.)
      if (isAggregateColumn(header)) {
        return;
      }

      const sampleValues = sheet.rows.slice(0, 20).map(row => row[index] || '');
      if (this.looksLikeAmount(sampleValues)) {
        analysis.categoryColumns.push({ index, name: header });
      }
    });

    // Classify each row
    sheet.rows.forEach((row, rowIndex) => {
      const dateVal = row[0]?.trim() || '';

      // Empty date = total row (grand total at top)
      if (!dateVal) {
        analysis.totalRowIndices.push(rowIndex);
        return;
      }

      // Year-first format (2025/1/1, 2025/2) = monthly summary
      if (/^\d{4}[\/\-]\d{1,2}([\/\-]\d{1,2})?$/.test(dateVal)) {
        analysis.summaryRowIndices.push(rowIndex);
        return;
      }

      // Day-first format (01/01/2025) = daily detail
      if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}$/.test(dateVal)) {
        analysis.detailRowIndices.push(rowIndex);
        return;
      }

      // Excel serial date = likely daily detail
      const numDate = parseFloat(dateVal);
      if (!isNaN(numDate) && numDate > 30000 && numDate < 100000) {
        analysis.detailRowIndices.push(rowIndex);
        return;
      }

      // Default to detail
      analysis.detailRowIndices.push(rowIndex);
    });

    // Detect sheet type based on values
    // If most values are negative, it's expense-focused
    // If most values are positive, it's income-focused
    let negativeCount = 0;
    let positiveCount = 0;

    for (const rowIdx of analysis.detailRowIndices.slice(0, 50)) {
      const row = sheet.rows[rowIdx];
      for (const col of analysis.categoryColumns) {
        const val = this.parseAmount(row[col.index]);
        if (val < 0) negativeCount++;
        if (val > 0) positiveCount++;
      }
    }

    if (negativeCount > positiveCount * 2) {
      analysis.sheetType = 'expense';
    } else if (positiveCount > negativeCount * 2) {
      analysis.sheetType = 'income';
    }

    return analysis;
  }

  // Parse mixed format sheet - only import detail rows
  parseMixedSheet(
    sheet: SheetData,
    analysis: MixedSheetAnalysis,
    sheetTypeOverride?: 'expense' | 'income' | null
  ): Transaction[] {
    const transactions: Transaction[] = [];

    // Only process detail rows (skip summary and total rows)
    for (const rowIndex of analysis.detailRowIndices) {
      const row = sheet.rows[rowIndex];
      const dateStr = this.parseDateFromFirstColumn(row[0] || '');

      // Process each category column
      for (const col of analysis.categoryColumns) {
        const value = this.parseAmount(row[col.index]);
        if (value === 0) continue; // Skip empty cells

        // Use sheet name override if available, otherwise fall back to sign-based detection
        let type: 'expense' | 'income';
        if (sheetTypeOverride) {
          type = sheetTypeOverride;
        } else {
          type = value < 0 ? 'expense' : 'income';
        }

        transactions.push({
          id: `xlsx_${rowIndex}_${col.index}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          date: dateStr,
          description: col.name,
          category: col.name,
          amount: Math.abs(value),
          type,
        });
      }
    }

    return transactions;
  }

  // Parse date from first column (handles various formats)
  private parseDateFromFirstColumn(dateStr: string): string {
    if (!dateStr) return new Date().toISOString().split('T')[0];

    const trimmed = dateStr.trim();

    // Excel serial date
    const numDate = parseFloat(trimmed);
    if (!isNaN(numDate) && numDate > 30000 && numDate < 100000) {
      const excelEpoch = new Date(1899, 11, 30);
      const date = new Date(excelEpoch.getTime() + numDate * 24 * 60 * 60 * 1000);
      return date.toISOString().split('T')[0];
    }

    // Year-first: 2025/1/1 or 2025/1
    const yearFirst = trimmed.match(/^(\d{4})[\/\-](\d{1,2})([\/\-](\d{1,2}))?$/);
    if (yearFirst) {
      const year = yearFirst[1];
      const month = yearFirst[2].padStart(2, '0');
      const day = yearFirst[4]?.padStart(2, '0') || '01';
      return `${year}-${month}-${day}`;
    }

    // Day-first: 01/01/2025 or 1/1/2025
    const dayFirst = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (dayFirst) {
      const day = dayFirst[1].padStart(2, '0');
      const month = dayFirst[2].padStart(2, '0');
      const year = dayFirst[3];
      return `${year}-${month}-${day}`;
    }

    // Try standard Date parsing
    const date = new Date(trimmed);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }

    return new Date().toISOString().split('T')[0];
  }

  private countNumericColumns(headers: string[], rows: string[][]): number {
    let count = 0;
    const sampleRows = rows.slice(0, 10);

    headers.forEach((_, index) => {
      const values = sampleRows.map(row => row[index] || '');
      if (this.looksLikeAmount(values)) {
        count++;
      }
    });

    return count;
  }

  private isExpenseCategory(header: string): boolean {
    const lower = header.toLowerCase().trim();
    return EXPENSE_KEYWORDS.some(kw => lower === kw || lower.includes(kw));
  }

  private isIncomeCategory(header: string): boolean {
    const lower = header.toLowerCase().trim();
    return INCOME_KEYWORDS.some(kw => lower === kw || lower.includes(kw));
  }

  // For summary format (YEAR/MONTH columns or date-first column)
  inferSummaryMapping(headers: string[], rows: string[][]): SummaryMapping {
    const mapping: SummaryMapping = {
      yearColumn: null,
      monthColumn: null,
      expenseCategories: [],
      incomeCategories: [],
      totalColumns: [],
    };

    const numericColumns: number[] = [];
    let dateColumn: number | null = null;

    headers.forEach((header, index) => {
      const lower = header.toLowerCase().trim();

      if (lower === 'year') {
        mapping.yearColumn = index;
        return;
      }
      if (lower === 'month') {
        mapping.monthColumn = index;
        return;
      }

      // Check if first column looks like dates
      if (index === 0 && !header.trim()) {
        const firstColValues = rows.slice(0, 10).map(r => r[0] || '');
        if (this.looksLikeDateColumn(firstColValues)) {
          dateColumn = 0;
          return;
        }
      }

      if (!header.trim()) return;

      // Skip aggregate columns by name (income, expense, net profit, etc.)
      if (isAggregateColumn(header)) {
        return;
      }

      const sampleValues = rows.slice(0, 10).map(row => row[index] || '');
      if (this.looksLikeAmount(sampleValues)) {
        numericColumns.push(index);
      }
    });

    // Store the date column if found
    if (dateColumn !== null) {
      (mapping as any).dateColumn = dateColumn;
    }

    // Detect sum columns by analyzing data patterns
    const sumColumns = this.detectSumColumns(headers, rows, numericColumns);
    const categoryColumns = numericColumns.filter(idx => !sumColumns.has(idx));

    // Also mark aggregate columns as sum columns even if not detected
    headers.forEach((header, index) => {
      if (isAggregateColumn(header) && numericColumns.includes(index) && !sumColumns.has(index)) {
        sumColumns.set(index, []);  // Mark as sum column with empty components
      }
    });

    categoryColumns.forEach(index => {
      const header = headers[index];

      // Double-check: skip if it's an aggregate column
      if (isAggregateColumn(header)) return;

      let isPartOfExpenseSum = false;
      let isPartOfIncomeSum = false;

      sumColumns.forEach((sumOf, sumIdx) => {
        if (sumOf.includes(index)) {
          const sumHeader = headers[sumIdx].toLowerCase();
          if (sumHeader.includes('expense') || sumHeader === 'expense') {
            isPartOfExpenseSum = true;
          } else if (sumHeader.includes('income') || sumHeader === 'income') {
            isPartOfIncomeSum = true;
          }
        }
      });

      if (isPartOfExpenseSum) {
        mapping.expenseCategories.push({ index, name: header });
      } else if (isPartOfIncomeSum) {
        mapping.incomeCategories.push({ index, name: header });
      } else if (this.isExpenseCategory(header)) {
        mapping.expenseCategories.push({ index, name: header });
      } else if (this.isIncomeCategory(header)) {
        mapping.incomeCategories.push({ index, name: header });
      } else {
        const looksLikePersonName = /^[A-Z][a-z]+$/.test(header.trim());
        const avgValue = this.getAverageValue(rows.slice(0, 10).map(r => r[index] || ''));

        if (looksLikePersonName || avgValue > 1000) {
          mapping.incomeCategories.push({ index, name: header });
        } else {
          mapping.expenseCategories.push({ index, name: header });
        }
      }
    });

    sumColumns.forEach((sumOf, index) => {
      const header = headers[index];
      const lower = header.toLowerCase().trim();

      let type: 'expense' | 'income' | 'net' = 'expense';
      if (lower.includes('income') || lower === 'income') {
        type = 'income';
      } else if (lower.includes('net') || lower.includes('profit')) {
        type = 'net';
      } else if (lower.includes('expense')) {
        type = 'expense';
      }

      mapping.totalColumns.push({ index, name: header, type, sumOf });
    });

    return mapping;
  }

  // Check if column values look like dates
  private looksLikeDateColumn(values: string[]): boolean {
    let dateCount = 0;
    for (const val of values) {
      const trimmed = val.trim();
      if (!trimmed) continue;
      // Check for date patterns or Excel serial numbers
      if (/^\d{4}[\/\-]\d{1,2}/.test(trimmed) ||
          /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}/.test(trimmed)) {
        dateCount++;
      }
      // Excel serial date
      const num = parseFloat(trimmed);
      if (!isNaN(num) && num > 30000 && num < 100000) {
        dateCount++;
      }
    }
    return dateCount >= values.length * 0.5;
  }

  private detectSumColumns(
    headers: string[],
    rows: string[][],
    numericColumns: number[]
  ): Map<number, number[]> {
    const sumColumns = new Map<number, number[]>();
    const tolerance = 0.01;

    numericColumns.forEach(potentialSumCol => {
      const otherColumns = numericColumns.filter(c => c !== potentialSumCol);
      const sumValues = rows.map(row => this.parseAmount(row[potentialSumCol]));
      const nonZeroCount = sumValues.filter(v => Math.abs(v) > 0.01).length;
      if (nonZeroCount < Math.min(3, rows.length * 0.3)) return;

      const foundSubset = this.findSumSubset(rows, potentialSumCol, otherColumns, tolerance);
      if (foundSubset && foundSubset.length >= 2) {
        sumColumns.set(potentialSumCol, foundSubset);
      }
    });

    return sumColumns;
  }

  private findSumSubset(
    rows: string[][],
    targetCol: number,
    candidateCols: number[],
    tolerance: number
  ): number[] | null {
    const sampleRows = rows.slice(0, Math.min(10, rows.length));
    const sortedCandidates = [...candidateCols].sort((a, b) => a - b);

    for (let startIdx = 0; startIdx < sortedCandidates.length; startIdx++) {
      let currentSubset: number[] = [];

      for (let endIdx = startIdx; endIdx < sortedCandidates.length; endIdx++) {
        currentSubset.push(sortedCandidates[endIdx]);

        let allMatch = true;
        let validRows = 0;

        for (const row of sampleRows) {
          const targetVal = this.parseAmount(row[targetCol]);
          const subsetSum = currentSubset.reduce(
            (sum, col) => sum + this.parseAmount(row[col]),
            0
          );

          if (Math.abs(targetVal) < 0.01 && Math.abs(subsetSum) < 0.01) continue;
          validRows++;

          const diff = Math.abs(targetVal - subsetSum);
          const maxVal = Math.max(Math.abs(targetVal), Math.abs(subsetSum), 1);

          if (diff / maxVal > tolerance) {
            allMatch = false;
            break;
          }
        }

        if (allMatch && validRows >= Math.min(3, sampleRows.length * 0.5)) {
          if (currentSubset.length >= 2) return currentSubset;
        }
      }
    }

    return null;
  }

  private getAverageValue(values: string[]): number {
    const nums = values
      .map(v => this.parseAmount(v))
      .filter(n => !isNaN(n) && n !== 0);

    if (nums.length === 0) return 0;
    return nums.reduce((a, b) => a + b, 0) / nums.length;
  }

  parseSummaryTransactions(
    sheetData: SheetData,
    mapping: SummaryMapping,
    sheetTypeOverride?: 'expense' | 'income' | null
  ): Transaction[] {
    const transactions: Transaction[] = [];
    const dateColumn = (mapping as any).dateColumn as number | undefined;

    sheetData.rows.forEach((row, rowIndex) => {
      let dateStr: string;

      // Try different date sources in order of preference
      if (dateColumn !== undefined && row[dateColumn]) {
        // Parse from date column (first column with date values)
        dateStr = this.parseDateFromFirstColumn(row[dateColumn]);
      } else if (mapping.yearColumn !== null) {
        // Parse from YEAR/MONTH columns
        let year = parseInt(row[mapping.yearColumn]) || new Date().getFullYear();
        let month = 1;
        if (mapping.monthColumn !== null) {
          month = this.parseMonth(row[mapping.monthColumn]);
        }
        dateStr = `${year}-${String(month).padStart(2, '0')}-01`;
      } else {
        // Skip rows without date info
        return;
      }

      // Skip empty/total rows
      if (!dateStr || dateStr === new Date().toISOString().split('T')[0]) {
        // Check if this is a total row (first col empty or has "total" text)
        const firstCol = (row[0] || '').toLowerCase().trim();
        if (!firstCol || firstCol.includes('total')) {
          return;
        }
      }

      // If sheet name indicates expense, treat all categories as expense
      // If sheet name indicates income, treat all categories as income
      if (sheetTypeOverride === 'expense') {
        // All categories in this sheet are expenses
        [...mapping.expenseCategories, ...mapping.incomeCategories].forEach(cat => {
          const value = this.parseAmount(row[cat.index]);
          if (value !== 0) {
            transactions.push({
              id: `xlsx_exp_${rowIndex}_${cat.index}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
              date: dateStr,
              description: cat.name,
              category: cat.name,
              amount: Math.abs(value),
              type: 'expense',
            });
          }
        });
      } else if (sheetTypeOverride === 'income') {
        // All categories in this sheet are income
        [...mapping.expenseCategories, ...mapping.incomeCategories].forEach(cat => {
          const value = this.parseAmount(row[cat.index]);
          if (value !== 0) {
            transactions.push({
              id: `xlsx_inc_${rowIndex}_${cat.index}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
              date: dateStr,
              description: cat.name,
              category: cat.name,
              amount: Math.abs(value),
              type: 'income',
            });
          }
        });
      } else {
        // No sheet name override - use inferred categories
        mapping.expenseCategories.forEach(cat => {
          const value = this.parseAmount(row[cat.index]);
          if (value !== 0) {
            transactions.push({
              id: `xlsx_exp_${rowIndex}_${cat.index}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
              date: dateStr,
              description: cat.name,
              category: cat.name,
              amount: Math.abs(value),
              type: 'expense',
            });
          }
        });

        mapping.incomeCategories.forEach(cat => {
          const value = this.parseAmount(row[cat.index]);
          if (value !== 0) {
            transactions.push({
              id: `xlsx_inc_${rowIndex}_${cat.index}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
              date: dateStr,
              description: cat.name,
              category: cat.name,
              amount: Math.abs(value),
              type: 'income',
            });
          }
        });
      }
    });

    return transactions;
  }

  private parseMonth(monthVal: string): number {
    if (!monthVal) return 1;

    const num = parseInt(monthVal);
    if (!isNaN(num) && num >= 1 && num <= 12) return num;

    const monthNames: { [key: string]: number } = {
      'jan': 1, 'january': 1, 'feb': 2, 'february': 2,
      'mar': 3, 'march': 3, 'apr': 4, 'april': 4,
      'may': 5, 'jun': 6, 'june': 6, 'jul': 7, 'july': 7,
      'aug': 8, 'august': 8, 'sep': 9, 'september': 9,
      'oct': 10, 'october': 10, 'nov': 11, 'november': 11,
      'dec': 12, 'december': 12,
    };

    return monthNames[monthVal.toLowerCase().trim()] || 1;
  }

  private parseAmount(val: string): number {
    if (!val) return 0;
    const cleaned = String(val).replace(/[$,£€\s]/g, '').trim();

    if (cleaned.startsWith('(') && cleaned.endsWith(')')) {
      return -Math.abs(parseFloat(cleaned.slice(1, -1)) || 0);
    }

    return parseFloat(cleaned) || 0;
  }

  inferSchema(headers: string[], sampleRows: string[][]): ColumnMapping {
    const mapping: ColumnMapping = {
      dateColumn: null,
      descriptionColumn: null,
      amountColumn: null,
      categoryColumn: null,
      headers,
    };

    const datePatterns = /^(date|time|when|day|tanggal|fecha|datum)$/i;
    const amountPatterns = /^(amount|total|sum|price|cost|value|money|credit|debit|jumlah)$/i;
    const categoryPatterns = /^(category|type|group|class|kind|tag|label|kategori|categoria)$/i;
    const descriptionPatterns = /^(description|desc|name|title|memo|note|detail|item|merchant|vendor|payee|keterangan|remarks|particulars)$/i;

    headers.forEach((header, index) => {
      const headerLower = header.toLowerCase().trim();

      if (mapping.dateColumn === null && datePatterns.test(headerLower)) {
        mapping.dateColumn = index;
      } else if (mapping.amountColumn === null && amountPatterns.test(headerLower)) {
        mapping.amountColumn = index;
      } else if (mapping.categoryColumn === null && categoryPatterns.test(headerLower)) {
        mapping.categoryColumn = index;
      } else if (mapping.descriptionColumn === null && descriptionPatterns.test(headerLower)) {
        mapping.descriptionColumn = index;
      }
    });

    if (sampleRows.length > 0) {
      headers.forEach((_, index) => {
        const sampleValues = sampleRows.slice(0, 5).map(row => row[index] || '');

        if (mapping.dateColumn === null && this.looksLikeDate(sampleValues)) {
          mapping.dateColumn = index;
        }

        if (mapping.amountColumn === null && this.looksLikeAmount(sampleValues)) {
          mapping.amountColumn = index;
        }
      });

      if (mapping.descriptionColumn === null) {
        for (let i = 0; i < headers.length; i++) {
          if (i !== mapping.dateColumn && i !== mapping.amountColumn && i !== mapping.categoryColumn) {
            const sampleValues = sampleRows.slice(0, 5).map(row => row[i] || '');
            if (this.looksLikeText(sampleValues)) {
              mapping.descriptionColumn = i;
              break;
            }
          }
        }
      }
    }

    return mapping;
  }

  private looksLikeDate(values: string[]): boolean {
    const datePatterns = [
      /^\d{4}-\d{2}-\d{2}/,
      /^\d{2}\/\d{2}\/\d{4}/,
      /^\d{2}-\d{2}-\d{4}/,
      /^\d{1,2}\/\d{1,2}\/\d{2,4}/,
      /^[A-Za-z]{3}\s+\d{1,2}/,
      /^\d{1,2}\s+[A-Za-z]{3}/,
    ];

    const matchCount = values.filter(v =>
      v && datePatterns.some(pattern => pattern.test(v.trim()))
    ).length;

    return matchCount >= values.length * 0.5;
  }

  private looksLikeAmount(values: string[]): boolean {
    const matchCount = values.filter(v => {
      const cleaned = String(v).replace(/[$,£€\s()]/g, '').trim();
      return cleaned && !isNaN(parseFloat(cleaned)) && cleaned.length > 0;
    }).length;

    return matchCount >= values.length * 0.5;
  }

  private looksLikeText(values: string[]): boolean {
    const textCount = values.filter(v =>
      v && v.trim().length > 2 && !/^[\d.,\-$€£%()]+$/.test(v.trim())
    ).length;

    return textCount >= values.length * 0.4;
  }

  parseTransactions(
    sheetData: SheetData,
    mapping: ColumnMapping,
    sheetTypeOverride?: 'expense' | 'income' | null
  ): Transaction[] {
    return sheetData.rows.map((row, index) => {
      const dateVal = mapping.dateColumn !== null ? row[mapping.dateColumn] : '';
      const descVal = mapping.descriptionColumn !== null ? row[mapping.descriptionColumn] : '';
      const amountVal = mapping.amountColumn !== null ? row[mapping.amountColumn] : '0';
      const categoryVal = mapping.categoryColumn !== null ? row[mapping.categoryColumn] : 'Uncategorized';

      let amount = 0;
      let type: 'income' | 'expense' = 'expense';

      const cleanedAmount = (amountVal || '0').replace(/[$,£€\s]/g, '').trim();

      if (cleanedAmount.startsWith('(') && cleanedAmount.endsWith(')')) {
        amount = Math.abs(parseFloat(cleanedAmount.slice(1, -1)) || 0);
        type = 'expense';
      } else {
        amount = parseFloat(cleanedAmount) || 0;
        // Use sheet name override if available, otherwise use sign-based detection
        if (sheetTypeOverride) {
          type = sheetTypeOverride;
        } else {
          type = amount < 0 ? 'expense' : 'income';
        }
        amount = Math.abs(amount);
      }

      const parsedDate = this.parseDateFromFirstColumn(dateVal);

      return {
        id: `xlsx_${index}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        date: parsedDate,
        description: descVal || 'No description',
        category: categoryVal || 'Uncategorized',
        amount,
        type,
      };
    }).filter(tx => tx.amount !== 0);
  }

  // Main method to parse all selected sheets
  parseAllSheets(parsedFile: ParsedFile, selectedSheets: string[]): Transaction[] {
    const allTransactions: Transaction[] = [];

    for (const sheet of parsedFile.sheets) {
      if (selectedSheets.includes(sheet.name)) {
        let transactions: Transaction[] = [];

        // Detect sheet type from sheet name (expense/income)
        const sheetTypeFromName = detectSheetTypeFromName(sheet.name);

        // Re-analyze each sheet individually
        const format = this.detectFormat(sheet);

        if (format === 'mixed') {
          const analysis = this.analyzeMixedSheet(sheet);

          // If we have detail rows, import only those (avoid double counting)
          if (analysis.detailRowIndices.length > 0) {
            transactions = this.parseMixedSheet(sheet, analysis, sheetTypeFromName);
          } else if (analysis.summaryRowIndices.length > 0) {
            // No detail rows - this is a pure monthly summary sheet
            // Import the summary rows as monthly data
            transactions = this.parseMixedSummaryOnly(sheet, analysis, sheetTypeFromName);
          }
        } else if (format === 'summary') {
          const mapping = this.inferSummaryMapping(sheet.headers, sheet.rows);
          transactions = this.parseSummaryTransactions(sheet, mapping, sheetTypeFromName);
        } else {
          const mapping = this.inferSchema(sheet.headers, sheet.rows);
          transactions = this.parseTransactions(sheet, mapping, sheetTypeFromName);
        }

        allTransactions.push(...transactions);
      }
    }

    return allTransactions;
  }

  // Parse mixed format sheet with only summary rows (no daily details)
  private parseMixedSummaryOnly(
    sheet: SheetData,
    analysis: MixedSheetAnalysis,
    sheetTypeOverride?: 'expense' | 'income' | null
  ): Transaction[] {
    const transactions: Transaction[] = [];

    // Import summary rows as monthly data (skip totals)
    for (const rowIndex of analysis.summaryRowIndices) {
      const row = sheet.rows[rowIndex];
      const dateStr = this.parseDateFromFirstColumn(row[0] || '');

      // Process each category column
      for (const col of analysis.categoryColumns) {
        const value = this.parseAmount(row[col.index]);
        if (value === 0) continue;

        // Use sheet name override if available, otherwise fall back to sign-based detection
        let type: 'expense' | 'income';
        if (sheetTypeOverride) {
          type = sheetTypeOverride;
        } else {
          type = value < 0 ? 'expense' : 'income';
        }

        transactions.push({
          id: `xlsx_sum_${rowIndex}_${col.index}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          date: dateStr,
          description: col.name,
          category: col.name,
          amount: Math.abs(value),
          type,
        });
      }
    }

    return transactions;
  }
}

export const xlsxParser = new XLSXParserService();
