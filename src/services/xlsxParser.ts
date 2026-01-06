import * as XLSX from 'xlsx';
import * as FileSystem from 'expo-file-system/legacy';
import { Transaction } from '../types/budget';
import {
  findHeaderRowIndex,
  inferSchema as inferSheetSchema,
  looksLikeAmount,
  resolveCategoryValue,
  resolveTypeFromCategory,
} from './xlsxSchema';

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
  selectedSheetIndex?: number;  // Track which sheet was auto-selected
}

// Sheet scoring for best-sheet selection
export interface SheetScore {
  sheetIndex: number;
  sheetName: string;
  score: number;
  headerRow: number;
  transactionBlock?: DataBlock;
}

// Column block detection for multi-region sheets
export interface DataBlock {
  startCol: number;
  endCol: number;
  headers: string[];
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

const EXCLUDED_CATEGORY_KEYWORDS = [
  'one off', 'one-off', 'oneoff',
];

const EXPENSE_AGGREGATE_HEADERS = [
  'expense', 'expenses', 'total expense', 'total expenses',
];

const INCOME_AGGREGATE_HEADERS = [
  'income', 'total income',
];

// Check if column name is an aggregate/sum column
function isAggregateColumn(header: string): boolean {
  const lower = header.toLowerCase().trim();
  return AGGREGATE_COLUMN_NAMES.includes(lower);
}

function isExcludedCategory(header: string): boolean {
  const lower = header.toLowerCase().trim();
  return EXCLUDED_CATEGORY_KEYWORDS.some(keyword => lower.includes(keyword));
}

function isAggregateLikeColumn(header: string): boolean {
  const lower = header.toLowerCase().trim();
  if (!lower) return false;
  if (isAggregateColumn(lower)) return true;
  return ['total', 'balance', 'net', 'profit'].some(keyword => lower.includes(keyword));
}

function hasExpenseIncomeAggregateColumns(headers: string[]): boolean {
  const lowerHeaders = headers.map(h => h.toLowerCase().trim());
  const hasExpense = lowerHeaders.some(h => EXPENSE_AGGREGATE_HEADERS.includes(h));
  const hasIncome = lowerHeaders.some(h => INCOME_AGGREGATE_HEADERS.includes(h));
  return hasExpense && hasIncome;
}

// Detect sheet type from sheet name
function detectSheetTypeFromName(sheetName: string): 'expense' | 'income' | null {
  const lower = sheetName.toLowerCase().trim();

  const hasExpense = lower.includes('expense') ||
    lower.includes('spending') ||
    lower.includes('cost') ||
    lower.includes('payment');

  const hasIncome = lower.includes('income') ||
    lower.includes('earning') ||
    lower.includes('revenue') ||
    lower.includes('salary');

  if (hasExpense && hasIncome) {
    return null;
  }

  // Check for expense sheet names
  if (lower === 'expense' || lower === 'expenses' || hasExpense) {
    return 'expense';
  }

  // Check for income sheet names
  if (lower === 'income' || lower === 'incomes' || hasIncome) {
    return 'income';
  }

  return null;
}

// Detect sheet type from column headers and data
// Checks which aggregate column (Expense/Income) actually has data
function detectSheetTypeFromHeadersAndData(headers: string[], rows: string[][]): 'expense' | 'income' | null {
  const lowerHeaders = headers.map(h => h.toLowerCase().trim());
  const parseCellAmount = (value: string): number => {
    const cleaned = String(value).replace(/[$,£€\s]/g, '').trim();
    if (cleaned.startsWith('(') && cleaned.endsWith(')')) {
      return -Math.abs(parseFloat(cleaned.slice(1, -1)) || 0);
    }
    return parseFloat(cleaned) || 0;
  };

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
  const sampleRows = rows.slice(0, 20); // Check first 20 data rows

  for (const row of sampleRows) {
    if (expenseColIdx >= 0 && row[expenseColIdx]) {
      expenseSum += Math.abs(parseCellAmount(row[expenseColIdx]));
    }
    if (incomeColIdx >= 0 && row[incomeColIdx]) {
      incomeSum += Math.abs(parseCellAmount(row[incomeColIdx]));
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

class XLSXParserService {
  private getSheetYear(sheetName: string): number | null {
    const match = sheetName.match(/(?:^|\D)((?:19|20)\d{2})(?!\d)/);
    if (!match) return null;
    const year = parseInt(match[1], 10);
    return Number.isNaN(year) ? null : year;
  }

  // Pattern to skip non-data sheets
  private static SKIP_SHEET_PATTERNS = /^(instructions?|totals?|summary|category\s*names?|networth|net\s*worth|example|template|dashboard|configuration|readme|about|help)$/i;

  // Score a sheet for transaction-log likelihood
  private scoreSheet(sheet: SheetData, sheetIndex: number): SheetScore {
    const score: SheetScore = {
      sheetIndex,
      sheetName: sheet.name,
      score: 0,
      headerRow: 0,
    };

    // Penalize known non-data sheets
    if (XLSXParserService.SKIP_SHEET_PATTERNS.test(sheet.name)) {
      score.score = -100;
      return score;
    }

    // Bonus for month-named sheets (common in annual planners)
    const monthPattern = /^(Jan|Feb|Mar|Apr|May|June?|Jul|Aug|Sept?|Oct|Nov|Dec)$/i;
    if (monthPattern.test(sheet.name)) {
      score.score += 10;
    }

    // Bonus for sheets named "Transactions"
    if (/^Transactions$/i.test(sheet.name)) {
      score.score += 15;
    }

    // Find best header row (scan first 10 rows)
    const { bestRow, headerScore } = this.findBestHeaderRow(sheet.headers, sheet.rows);
    score.headerRow = bestRow;
    score.score += headerScore;

    // Detect data blocks (for multi-region sheets)
    score.transactionBlock = this.detectDataBlock(sheet.headers, sheet.rows);

    return score;
  }

  // Find the best header row by scanning first 10 rows
  private findBestHeaderRow(headers: string[], rows: string[][]): { bestRow: number; headerScore: number } {
    let bestScore = this.scoreHeaderRow(headers);
    let bestRow = 0;

    // Also check first few data rows in case header detection was wrong
    const maxScan = Math.min(5, rows.length);
    for (let i = 0; i < maxScan; i++) {
      const rowScore = this.scoreHeaderRow(rows[i]);
      if (rowScore > bestScore) {
        bestScore = rowScore;
        bestRow = i + 1; // +1 because headers is row 0
      }
    }

    return { bestRow, headerScore: bestScore };
  }

  // Score a row based on transaction-header patterns
  private scoreHeaderRow(row: string[]): number {
    if (!row || row.length === 0) return 0;

    const patterns = {
      date: /^(date|time|when|day|posted|transaction\s*date|posting\s*date|tanggal)$/i,
      amount: /^(amount|total|sum|price|cost|value|credit|debit|jumlah)$/i,
      description: /^(description|desc|name|title|memo|note|detail|item|payee|merchant)$/i,
      category: /^(category|type|group|class|tag|label|account|bucket)$/i,
    };

    let score = 0;
    const matched = new Set<string>();

    for (const cell of row) {
      const value = String(cell || '').trim();
      if (!value) continue;

      if (!matched.has('date') && patterns.date.test(value)) {
        score += 25;
        matched.add('date');
      } else if (!matched.has('amount') && patterns.amount.test(value)) {
        score += 25;
        matched.add('amount');
      } else if (!matched.has('description') && patterns.description.test(value)) {
        score += 20;
        matched.add('description');
      } else if (!matched.has('category') && patterns.category.test(value)) {
        score += 20;
        matched.add('category');
      }
    }

    return score;
  }

  // Detect the first data block (stop at empty column gap)
  private detectDataBlock(headers: string[], rows: string[][]): DataBlock {
    let endCol = headers.length - 1;

    // Look for empty column gap (separator between regions)
    for (let col = 1; col < headers.length; col++) {
      const headerEmpty = !headers[col]?.trim();

      // Check if column is empty in first 10 data rows
      const colEmpty = rows.slice(0, 10).every(r => !r[col]?.trim());

      if (headerEmpty && colEmpty) {
        // Found separator - end block before it
        endCol = col - 1;
        break;
      }
    }

    return {
      startCol: 0,
      endCol,
      headers: headers.slice(0, endCol + 1),
    };
  }

  // Find the best sheet for transaction import
  private findBestSheet(sheets: SheetData[]): { bestIndex: number; bestScore: SheetScore } {
    if (sheets.length === 0) {
      return { bestIndex: 0, bestScore: { sheetIndex: 0, sheetName: '', score: 0, headerRow: 0 } };
    }

    const scores = sheets.map((sheet, index) => this.scoreSheet(sheet, index));

    // Find highest scoring sheet
    let bestScore = scores[0];
    for (const score of scores) {
      if (score.score > bestScore.score) {
        bestScore = score;
      }
    }

    return { bestIndex: bestScore.sheetIndex, bestScore };
  }


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
        const headerRowIndex = findHeaderRowIndex(jsonData);
        const hasHeader = headerRowIndex !== null;
        const headerRow = hasHeader ? jsonData[headerRowIndex] || [] : jsonData[0] || [];
        const dataStartIndex = hasHeader ? headerRowIndex + 1 : 0;
        const dataRows = jsonData.slice(dataStartIndex);
        const maxColumns = Math.max(0, ...jsonData.map(row => row.length));

        const headers = hasHeader
          ? Array.from({ length: maxColumns }, (_, index) =>
              String((headerRow || [])[index] ?? '')
            )
          : Array.from({ length: maxColumns }, () => '');
        const rows = dataRows.map(row =>
          Array.from({ length: maxColumns }, (_, index) =>
            String((row || [])[index] ?? '')
          )
        );

        sheets.push({
          name: sheetName,
          headers,
          rows,
          rowCount: rows.length,
        });
      }
    }

    // Find the best sheet for transaction import (not just first sheet)
    const { bestIndex, bestScore } = this.findBestSheet(sheets);
    const targetSheet = sheets[bestIndex];

    // Apply block detection if we have a transaction block
    let effectiveHeaders = targetSheet?.headers ?? [];
    let effectiveRows = targetSheet?.rows ?? [];

    if (bestScore.transactionBlock && targetSheet) {
      const block = bestScore.transactionBlock;
      // Limit to transaction block columns
      effectiveHeaders = block.headers;
      effectiveRows = effectiveRows.map(row => row.slice(block.startCol, block.endCol + 1));
    }

    const detectedFormat = targetSheet ? this.detectFormat({
      ...targetSheet,
      headers: effectiveHeaders,
      rows: effectiveRows,
    }) : 'transaction';

    let inferredMapping: ColumnMapping = {
      dateColumn: null,
      descriptionColumn: null,
      amountColumn: null,
      categoryColumn: null,
      headers: [],
    };

    let summaryMapping: SummaryMapping | null = null;
    let mixedAnalysis: MixedSheetAnalysis | null = null;

    if (targetSheet) {
      if (detectedFormat === 'mixed') {
        mixedAnalysis = this.analyzeMixedSheet({ ...targetSheet, headers: effectiveHeaders, rows: effectiveRows });
      } else if (detectedFormat === 'summary') {
        summaryMapping = this.inferSummaryMapping(effectiveHeaders, effectiveRows);
      } else {
        inferredMapping = inferSheetSchema(effectiveHeaders, effectiveRows);
      }
      inferredMapping.headers = effectiveHeaders;
    }

    return {
      sheets,
      inferredMapping,
      summaryMapping,
      mixedAnalysis,
      detectedFormat,
      selectedSheetIndex: bestIndex,
    };
  }

  detectFormat(sheet: SheetData): DataFormat {
    const headers = sheet.headers.map(h => h.toLowerCase().trim());

    // FIRST: Check for clear transaction-log headers
    // If we have Date+Description+Amount (or Date+Amount+Category), it's transaction format
    const hasDateHeader = headers.some(h => /^(date|time|posted|transaction\s*date)$/i.test(h));
    const hasDescriptionHeader = headers.some(h => /^(description|desc|memo|note|payee|merchant)$/i.test(h));
    const hasAmountHeader = headers.some(h => /^(amount|total|sum|price|cost|value|credit|debit)$/i.test(h));
    const hasCategoryHeader = headers.some(h => /^(category|type|group|class|tag|bucket)$/i.test(h));

    // Strong transaction-log signal: has at least 3 of 4 key headers
    const transactionHeaderCount = [hasDateHeader, hasDescriptionHeader, hasAmountHeader, hasCategoryHeader].filter(Boolean).length;
    if (transactionHeaderCount >= 3) {
      return 'transaction';
    }

    // Check if this looks like a mixed format (has dates in first column with mixed formats)
    const firstColValues = sheet.rows.map(r => r[0] || '');
    const dateFormats = this.analyzeFirstColumnDates(firstColValues);

    const numericColumns = this.countNumericColumns(headers, sheet.rows);
    const categoryColumns = headers.filter(h =>
      (this.isExpenseCategory(h) || this.isIncomeCategory(h)) && !isExcludedCategory(h)
    ).length;
    const hasDateColumn = this.hasDateLikeColumn(sheet.rows, headers.length);

    // Mixed format: has both monthly summaries and daily details.
    if (
      (dateFormats.hasYearFirstDates &&
        (dateFormats.hasDayFirstDates || dateFormats.hasSerialDates)) ||
      (dateFormats.hasMonthNameDates &&
        (dateFormats.hasDayFirstDates || dateFormats.hasSerialDates))
    ) {
      return 'mixed';
    }

    // Year-first dates or month name rows without daily detail indicates summary.
    if (dateFormats.hasYearFirstDates || dateFormats.hasMonthNameDates) {
      return 'summary';
    }

    // Check for YEAR/MONTH columns (pure summary format)
    const hasYearMonth = headers.some(h => h === 'year') && headers.some(h => h === 'month');

    if (hasYearMonth) {
      return 'summary';
    }

    // Daily detail sheet with date-like column and many numeric categories.
    if ((dateFormats.hasDayFirstDates || dateFormats.hasSerialDates) && categoryColumns >= 3) {
      return 'mixed';
    }

    // Many numeric columns or date columns + numeric density = summary format.
    if (
      numericColumns >= 5 ||
      (numericColumns >= 3 && categoryColumns >= 3) ||
      (hasDateColumn && numericColumns >= 3)
    ) {
      return 'summary';
    }

    return 'transaction';
  }

  // Analyze date formats in first column
  private analyzeFirstColumnDates(values: string[]): {
    hasYearFirstDates: boolean;
    hasDayFirstDates: boolean;
    hasMonthNameDates: boolean;
    hasSerialDates: boolean;
    hasEmptyDates: boolean;
  } {
    let yearFirst = 0;  // YYYY/M/D or YYYY/M
    let dayFirst = 0;   // DD/MM/YYYY
    let monthName = 0;  // Jan/Feb/Mar
    let serial = 0;     // Excel serial dates
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
      } else if (/^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)$/i.test(trimmed)) {
        monthName++;
      } else {
        const num = parseFloat(trimmed);
        if (!isNaN(num) && num > 30000 && num < 100000) {
          serial++;
        }
      }
    }

    return {
      hasYearFirstDates: yearFirst >= 3,
      hasDayFirstDates: dayFirst >= 3,
      hasMonthNameDates: monthName >= 3,
      hasSerialDates: serial >= 3,
      hasEmptyDates: empty > 0,
    };
  }

  private hasDateLikeColumn(rows: string[][], columnCount: number): boolean {
    for (let index = 0; index < columnCount; index += 1) {
      const values = rows.slice(0, 10).map(row => row[index] || '');
      if (this.looksLikeDateColumn(values)) {
        return true;
      }
    }

    return false;
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

      // Skip aggregate and excluded columns (income, expense, net profit, one-off, etc.)
      if (isAggregateColumn(header) || isAggregateLikeColumn(header) || isExcludedCategory(header)) {
        return;
      }

      const sampleValues = this.getColumnSampleValues(sheet.rows, index);
      if (looksLikeAmount(sampleValues)) {
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

      // Month name (JAN, FEB) or month number = monthly summary
      const monthToken = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)$/i;
      if (monthToken.test(dateVal)) {
        analysis.summaryRowIndices.push(rowIndex);
        return;
      }
      const monthNumber = parseInt(dateVal, 10);
      if (!isNaN(monthNumber) && monthNumber >= 1 && monthNumber <= 12) {
        analysis.summaryRowIndices.push(rowIndex);
        return;
      }

      // Excel serial date = likely daily detail
      const numDate = parseFloat(dateVal);
      if (!isNaN(numDate) && numDate > 30000 && numDate < 100000) {
        const rowValues = analysis.categoryColumns.map(col => this.parseAmount(row[col.index]));
        const nonZeroCount = rowValues.filter(val => Math.abs(val) > 0.01).length;
        const hasNetLikeHeader = sheet.headers.some(header => isAggregateLikeColumn(header));
        const isLikelySummary = nonZeroCount >= Math.max(4, analysis.categoryColumns.length * 0.6);

        if (hasNetLikeHeader && isLikelySummary) {
          analysis.summaryRowIndices.push(rowIndex);
        } else {
          analysis.detailRowIndices.push(rowIndex);
        }
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
          signedAmount: value,
          type,
        });
      }
    }

    return transactions;
  }

  // Parse date from first column (handles various formats)
  private parseDateFromFirstColumn(dateStr: string, defaultYear?: number): string {
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

    const monthName = trimmed.match(/^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)$/i);
    if (monthName) {
      const month = this.parseMonth(monthName[1]);
      const year = defaultYear || new Date().getFullYear();
      return `${year}-${String(month).padStart(2, '0')}-01`;
    }

    const monthNumber = parseInt(trimmed, 10);
    if (!isNaN(monthNumber) && monthNumber >= 1 && monthNumber <= 12) {
      const year = defaultYear || new Date().getFullYear();
      return `${year}-${String(monthNumber).padStart(2, '0')}-01`;
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

    headers.forEach((_, index) => {
      const values = this.getColumnSampleValues(rows, index, 20);
      if (looksLikeAmount(values)) {
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
    const dateHeaderPattern = /^(date|period)$/i;

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

      const trimmedHeader = header.trim();
      if (dateColumn === null && trimmedHeader && dateHeaderPattern.test(trimmedHeader)) {
        dateColumn = index;
        return;
      }

      const columnValues = rows.slice(0, 10).map(r => r[index] || '');

      // Check for date columns with blank headers (not just the first column).
      if (dateColumn === null && !trimmedHeader) {
        if (this.looksLikeDateColumn(columnValues)) {
          dateColumn = index;
          return;
        }
      }

      // Broader date column detection when header is non-empty.
      if (dateColumn === null && trimmedHeader) {
        if (this.looksLikeDateColumn(columnValues)) {
          dateColumn = index;
          return;
        }
      }

      if (!trimmedHeader) return;

      // Skip aggregate columns by name (income, expense, net profit, etc.)
      if (isAggregateColumn(header) || isAggregateLikeColumn(header) || isExcludedCategory(header)) {
        return;
      }

      const sampleValues = this.getColumnSampleValues(rows, index);
      if (looksLikeAmount(sampleValues)) {
        numericColumns.push(index);
      }
    });

    // Store the date column if found
    if (dateColumn !== null) {
      (mapping as any).dateColumn = dateColumn;
    }

    // Detect sum columns by analyzing data patterns
    const sumColumns = this.detectSumColumns(headers, rows, numericColumns);

    // Also mark aggregate columns as sum columns even if not detected
    headers.forEach((header, index) => {
      if (
        (isAggregateColumn(header) || isAggregateLikeColumn(header)) &&
        numericColumns.includes(index) &&
        !sumColumns.has(index)
      ) {
        sumColumns.set(index, []);  // Mark as sum column with empty components
      }
    });

    const categoryColumns = numericColumns.filter(idx => !sumColumns.has(idx));
    const categoryTotals = new Map<number, number>();

    categoryColumns.forEach((index) => {
      const total = rows.reduce((sum, row) => sum + this.parseAmount(row[index]), 0);
      if (total !== 0) {
        categoryTotals.set(index, total);
      }
    });

    categoryColumns.forEach(index => {
      const header = headers[index];

      // Double-check: skip if it's an aggregate or excluded column
      if (isAggregateColumn(header) || isAggregateLikeColumn(header) || isExcludedCategory(header)) return;

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

      const total = categoryTotals.get(index);
      if (total !== undefined) {
        if (total < 0) {
          mapping.expenseCategories.push({ index, name: header });
        } else if (total > 0) {
          mapping.incomeCategories.push({ index, name: header });
        } else if (isPartOfExpenseSum) {
          mapping.expenseCategories.push({ index, name: header });
        } else if (isPartOfIncomeSum) {
          mapping.incomeCategories.push({ index, name: header });
        } else if (this.isExpenseCategory(header)) {
          mapping.expenseCategories.push({ index, name: header });
        } else if (this.isIncomeCategory(header)) {
          mapping.incomeCategories.push({ index, name: header });
        } else {
          const looksLikePersonName = /^[A-Z][a-z]+$/.test(header.trim());
          const avgValue = this.getAverageValue(this.getColumnSampleValues(rows, index, 20));

          if (looksLikePersonName || avgValue > 1000) {
            mapping.incomeCategories.push({ index, name: header });
          } else {
            mapping.expenseCategories.push({ index, name: header });
          }
        }
      } else if (isPartOfExpenseSum) {
        mapping.expenseCategories.push({ index, name: header });
      } else if (isPartOfIncomeSum) {
        mapping.incomeCategories.push({ index, name: header });
      } else if (this.isExpenseCategory(header)) {
        mapping.expenseCategories.push({ index, name: header });
      } else if (this.isIncomeCategory(header)) {
        mapping.incomeCategories.push({ index, name: header });
      } else {
        const looksLikePersonName = /^[A-Z][a-z]+$/.test(header.trim());
        const avgValue = this.getAverageValue(this.getColumnSampleValues(rows, index, 20));

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
    let nonEmptyCount = 0;
    for (const val of values) {
      const trimmed = val.trim();
      if (!trimmed) continue;
      nonEmptyCount++;
      // Check for date patterns or Excel serial numbers
      if (/^\d{4}[\/\-]\d{1,2}/.test(trimmed) ||
        /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}/.test(trimmed)) {
        dateCount++;
      }
      if (/^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)$/i.test(trimmed)) {
        dateCount++;
      }
      // Excel serial date
      const num = parseFloat(trimmed);
      if (!isNaN(num) && num > 30000 && num < 100000) {
        dateCount++;
      }
    }
    if (nonEmptyCount === 0) return false;
    return dateCount >= nonEmptyCount * 0.5;
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

  private getColumnSampleValues(
    rows: string[][],
    index: number,
    maxSamples: number = 30
  ): string[] {
    const values: string[] = [];

    for (const row of rows) {
      if (values.length >= maxSamples) break;
      const cell = row[index];
      if (cell !== undefined && String(cell).trim().length > 0) {
        values.push(String(cell));
      }
    }

    if (values.length === 0) {
      return rows.slice(0, Math.min(maxSamples, rows.length)).map(row => row[index] || '');
    }

    return values;
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
    sheetTypeOverride?: 'expense' | 'income' | null,
    yearOverride?: number | null
  ): Transaction[] {
    const transactions: Transaction[] = [];
    const dateColumn = (mapping as any).dateColumn as number | undefined;
    const totalColumns = new Set(mapping.totalColumns.map(col => col.index));
    const allCategories = [...mapping.expenseCategories, ...mapping.incomeCategories];
    const categoryTypeDefaults = new Map<number, 'expense' | 'income'>();
    const categoryTotals = new Map<number, number>();

    allCategories.forEach((cat) => {
      categoryTypeDefaults.set(cat.index, mapping.expenseCategories.includes(cat) ? 'expense' : 'income');
      const total = sheetData.rows.reduce((sum, row) => sum + this.parseAmount(row[cat.index]), 0);
      if (total !== 0) {
        categoryTotals.set(cat.index, total);
      }
    });

    sheetData.rows.forEach((row, rowIndex) => {
      let dateStr: string;

      // Try different date sources in order of preference
      if (dateColumn !== undefined && row[dateColumn]) {
        // Parse from date column (first column with date values)
        dateStr = this.parseDateFromFirstColumn(row[dateColumn], yearOverride || undefined);
      } else if (mapping.yearColumn !== null) {
        // Parse from YEAR/MONTH columns
        let year = parseInt(row[mapping.yearColumn]) || yearOverride || new Date().getFullYear();
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
          if (totalColumns.has(cat.index)) return;
          const value = this.parseAmount(row[cat.index]);
          if (value !== 0) {
            transactions.push({
              id: `xlsx_exp_${rowIndex}_${cat.index}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
              date: dateStr,
              description: cat.name,
              category: cat.name,
              amount: Math.abs(value),
              signedAmount: value,
              type: 'expense',
            });
          }
        });
      } else if (sheetTypeOverride === 'income') {
        // All categories in this sheet are income
        [...mapping.expenseCategories, ...mapping.incomeCategories].forEach(cat => {
          if (totalColumns.has(cat.index)) return;
          const value = this.parseAmount(row[cat.index]);
          if (value !== 0) {
            transactions.push({
              id: `xlsx_inc_${rowIndex}_${cat.index}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
              date: dateStr,
              description: cat.name,
              category: cat.name,
              amount: Math.abs(value),
              signedAmount: value,
              type: 'income',
            });
          }
        });
      } else {
        // No sheet name override - infer per category, prefer column total sign.
        allCategories.forEach(cat => {
          if (totalColumns.has(cat.index)) return;
          const value = this.parseAmount(row[cat.index]);
          if (value === 0) return;

          const total = categoryTotals.get(cat.index);
          const fallback = categoryTypeDefaults.get(cat.index) || 'expense';
          const resolvedType = total === undefined ? fallback : total < 0 ? 'expense' : 'income';

          transactions.push({
            id: `xlsx_${resolvedType}_${rowIndex}_${cat.index}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            date: dateStr,
            description: cat.name,
            category: cat.name,
            amount: Math.abs(value),
            signedAmount: value,
            type: resolvedType,
          });
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
      'aug': 8, 'august': 8, 'sep': 9, 'sept': 9, 'september': 9,
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

  parseTransactions(
    sheetData: SheetData,
    mapping: ColumnMapping,
    sheetTypeOverride?: 'expense' | 'income' | null,
    yearOverride?: number | null
  ): Transaction[] {
    return sheetData.rows.map((row, index) => {
      const dateVal = mapping.dateColumn !== null ? row[mapping.dateColumn] : '';
      const descVal = mapping.descriptionColumn !== null ? row[mapping.descriptionColumn] : '';
      const amountVal = mapping.amountColumn !== null ? row[mapping.amountColumn] : '0';
      const categoryVal = mapping.categoryColumn !== null ? row[mapping.categoryColumn] : '';

      let type: 'income' | 'expense' = 'expense';
      const cleanedAmount = (amountVal || '0').replace(/[$,£€\s]/g, '').trim();
      let signedAmount = 0;

      if (cleanedAmount.startsWith('(') && cleanedAmount.endsWith(')')) {
        signedAmount = -Math.abs(parseFloat(cleanedAmount.slice(1, -1)) || 0);
        type = 'expense';
      } else {
        signedAmount = parseFloat(cleanedAmount) || 0;
        const categoryType = resolveTypeFromCategory(categoryVal);
        if (categoryType) {
          type = categoryType;
        } else if (sheetTypeOverride) {
          type = sheetTypeOverride;
        } else {
          // For transaction-log format: positive amounts = expense (typical budget behavior)
          // Negative amounts = income/refund
          type = signedAmount >= 0 ? 'expense' : 'income';
        }
      }

      const parsedDate = this.parseDateFromFirstColumn(dateVal, yearOverride || undefined);
      const resolvedCategory = resolveCategoryValue(categoryVal, descVal);
      const normalizedSignedAmount = type === 'expense' ? -Math.abs(signedAmount) : Math.abs(signedAmount);

      return {
        id: `xlsx_${index}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        date: parsedDate,
        description: descVal || 'No description',
        category: resolvedCategory || 'Uncategorized',
        amount: Math.abs(normalizedSignedAmount),
        signedAmount: normalizedSignedAmount,
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
        const yearOverride = this.getSheetYear(sheet.name);

        // Detect sheet type: prefer data-based detection when headers include both aggregates
        const sheetTypeFromName = detectSheetTypeFromName(sheet.name);
        let sheetType = sheetTypeFromName;
        const headerBasedType = detectSheetTypeFromHeadersAndData(sheet.headers, sheet.rows);
        const hasBothAggregates = hasExpenseIncomeAggregateColumns(sheet.headers);

        if (headerBasedType) {
          sheetType = headerBasedType;
        } else if (hasBothAggregates && !sheetTypeFromName) {
          sheetType = null;
        }

        // Re-analyze each sheet individually
        const format = this.detectFormat(sheet);

        if (format === 'mixed') {
          const analysis = this.analyzeMixedSheet(sheet);

          // Use analysis.sheetType as final fallback if still no type detected
          const finalSheetType = sheetType || analysis.sheetType;

          // If we have detail rows, import only those (avoid double counting)
          if (analysis.detailRowIndices.length > 0) {
            transactions = this.parseMixedSheet(sheet, analysis, finalSheetType !== 'mixed' ? finalSheetType : null);
          } else if (analysis.summaryRowIndices.length > 0) {
            // No detail rows - this is a pure monthly summary sheet
            // Import the summary rows as monthly data
            transactions = this.parseMixedSummaryOnly(
              sheet,
              analysis,
              finalSheetType !== 'mixed' ? finalSheetType : null,
              yearOverride
            );
          }
        } else if (format === 'summary') {
          const mapping = this.inferSummaryMapping(sheet.headers, sheet.rows);
          transactions = this.parseSummaryTransactions(sheet, mapping, sheetType, yearOverride);
        } else {
          const mapping = inferSheetSchema(sheet.headers, sheet.rows);
          transactions = this.parseTransactions(sheet, mapping, sheetType, yearOverride);
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
    sheetTypeOverride?: 'expense' | 'income' | null,
    yearOverride?: number | null
  ): Transaction[] {
    const transactions: Transaction[] = [];

    // Import summary rows as monthly data (skip totals)
    for (const rowIndex of analysis.summaryRowIndices) {
      const row = sheet.rows[rowIndex];
      const dateStr = this.parseDateFromFirstColumn(row[0] || '', yearOverride || undefined);

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
          signedAmount: value,
          type,
        });
      }
    }

    return transactions;
  }
}

export const xlsxParser = new XLSXParserService();
