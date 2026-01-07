import * as XLSX from 'xlsx';
import * as FileSystem from 'expo-file-system/legacy';
import { Transaction, DateFormat } from '../types/budget';
import {
  findHeaderRowIndex,
  inferSchema as inferSheetSchema,
  looksLikeAmount,
  resolveCategoryValue,
  resolveTypeFromCategory,
} from './xlsxSchema';

// Detect month number (1-12) from tab/sheet name
export function detectMonthFromTabName(tabName: string): number | null {
  const name = tabName.trim().toLowerCase();
  const patterns: [RegExp, number][] = [
    [/^(jan|january)$/, 1],
    [/^(feb|february)$/, 2],
    [/^(mar|march)$/, 3],
    [/^(apr|april)$/, 4],
    [/^(may)$/, 5],
    [/^(jun|june)$/, 6],
    [/^(jul|july)$/, 7],
    [/^(aug|august)$/, 8],
    [/^(sep|sept|september)$/, 9],
    [/^(oct|october)$/, 10],
    [/^(nov|november)$/, 11],
    [/^(dec|december)$/, 12],
  ];
  for (const [pattern, month] of patterns) {
    if (pattern.test(name)) return month;
  }
  return null;
}

// Detect date format from sample dates, using tab month as a hint
export function detectDateFormat(
  dateValues: string[],
  tabName?: string
): DateFormat {
  const tabMonth = tabName ? detectMonthFromTabName(tabName) : null;

  for (const val of dateValues) {
    const trimmed = val.trim();
    if (!trimmed) continue;

    // YYYY-MM-DD or YYYY/MM/DD → YMD
    if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(trimmed)) {
      return 'YMD';
    }

    // XX/XX/XXXX format - ambiguous, need to analyze
    const match = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (match) {
      const first = parseInt(match[1], 10);
      const second = parseInt(match[2], 10);

      // If first number > 12, it must be the day → DMY
      if (first > 12) return 'DMY';
      // If second number > 12, it must be the day → MDY
      if (second > 12) return 'MDY';

      // Both ≤ 12 → ambiguous, use tab month as hint
      if (tabMonth !== null) {
        // If tab is "Jan" (month=1) and we see "3/1/2026":
        // - If month is in position 2 (second=1), then first=day → DMY
        // - If month is in position 1 (first=1), then second=day → MDY
        if (second === tabMonth) return 'DMY';
        if (first === tabMonth) return 'MDY';
      }
    }
  }

  // Default to DMY (more common globally)
  return 'DMY';
}

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

// Confidence scoring for parse quality
export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface ConfidenceIssue {
  type: 'missing_date' | 'missing_amount' | 'ambiguous_dates' | 'ambiguous_amounts' | 'mixed_signs' | 'unsupported_layout';
  message: string;
  severity: 'warning' | 'error';
}

export interface ParseConfidence {
  level: ConfidenceLevel;
  score: number;           // 0-100
  issues: ConfidenceIssue[];
}

export interface ParseResult {
  transactions: Transaction[];
  confidence: ParseConfidence;
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
// Only applies to sheets with BOTH aggregate columns - otherwise let per-cell detection work
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

  // If EITHER column is missing, can't determine sheet type from aggregates
  // This means it's likely a combined sheet - let per-cell sign detection handle it
  if (expenseColIdx === -1 || incomeColIdx === -1) {
    return null;
  }

  // Both columns exist - check which one has actual data
  let expenseSum = 0;
  let incomeSum = 0;
  const sampleRows = rows.slice(0, 20); // Check first 20 data rows

  for (const row of sampleRows) {
    if (row[expenseColIdx]) {
      expenseSum += Math.abs(parseCellAmount(row[expenseColIdx]));
    }
    if (row[incomeColIdx]) {
      incomeSum += Math.abs(parseCellAmount(row[incomeColIdx]));
    }
  }

  // Only use this detection if ONE aggregate column has data and the other is empty/zero
  // This indicates separate expense/income sheets, not a combined summary

  // If only expense column has meaningful data → expense sheet
  if (expenseSum > 0 && incomeSum === 0) {
    return 'expense';
  }
  // If only income column has meaningful data → income sheet
  if (incomeSum > 0 && expenseSum === 0) {
    return 'income';
  }

  // Both have data (even if unequal) - this is likely a combined sheet
  // Let per-cell sign detection handle the category columns
  return null;
}

class XLSXParserService {
  private getSheetYear(sheetName: string): number | null {
    const match = sheetName.match(/(?:^|\D)((?:19|20)\d{2})(?!\d)/);
    if (!match) return null;
    const year = parseInt(match[1], 10);
    return Number.isNaN(year) ? null : year;
  }

  // Detect sheet type from name and headers (for summary/transaction formats)
  private detectSheetType(sheet: SheetData): 'expense' | 'income' | null {
    // Try name-based detection first
    const nameType = detectSheetTypeFromName(sheet.name);
    if (nameType) return nameType;

    // Try header-based detection (only applies if BOTH aggregate columns exist)
    const headerType = detectSheetTypeFromHeadersAndData(sheet.headers, sheet.rows);
    return headerType;
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
  // Simplified type detection: header keyword first, then sign
  parseMixedSheet(
    sheet: SheetData,
    analysis: MixedSheetAnalysis
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

        // Determine type: header keyword first, then sign
        const type = this.determineTypeForColumn(col.name, value);

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

  // Determine expense/income type for a column
  // Priority: 1) Header keyword, 2) Value sign
  private determineTypeForColumn(columnName: string, value: number): 'expense' | 'income' {
    // Check if column name matches expense keywords
    if (this.isExpenseCategory(columnName)) {
      return 'expense';
    }
    // Check if column name matches income keywords
    if (this.isIncomeCategory(columnName)) {
      return 'income';
    }
    // Unknown category - use sign (negative = expense, positive = income)
    return value < 0 ? 'expense' : 'income';
  }

  // Parse date from first column (handles various formats)
  private parseDateFromFirstColumn(
    dateStr: string,
    defaultYear?: number,
    format: DateFormat = 'DMY'
  ): string {
    if (!dateStr) return new Date().toISOString().split('T')[0];

    const trimmed = dateStr.trim();

    // Excel serial date
    const numDate = parseFloat(trimmed);
    if (!isNaN(numDate) && numDate > 30000 && numDate < 100000) {
      const excelEpoch = new Date(1899, 11, 30);
      const date = new Date(excelEpoch.getTime() + numDate * 24 * 60 * 60 * 1000);
      return date.toISOString().split('T')[0];
    }

    // Year-first: 2025/1/1 or 2025/1 → YMD format
    const yearFirst = trimmed.match(/^(\d{4})[\/\-](\d{1,2})([\/\-](\d{1,2}))?$/);
    if (yearFirst) {
      const year = yearFirst[1];
      const month = yearFirst[2].padStart(2, '0');
      const day = yearFirst[4]?.padStart(2, '0') || '01';
      return `${year}-${month}-${day}`;
    }

    // XX/XX/XXXX format - parse based on detected format
    const ambiguous = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (ambiguous) {
      const first = parseInt(ambiguous[1], 10);
      const second = parseInt(ambiguous[2], 10);
      const year = ambiguous[3];

      let day: number;
      let month: number;

      // If one number is > 12, it's unambiguous
      if (first > 12) {
        day = first;
        month = second;
      } else if (second > 12) {
        month = first;
        day = second;
      } else {
        // Ambiguous - use the provided format
        if (format === 'MDY') {
          month = first;
          day = second;
        } else {
          // DMY (default) or YMD (shouldn't reach here)
          day = first;
          month = second;
        }
      }

      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
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

  // Parse transaction log format
  // Pre-scan approach: detect which column to use for type detection
  parseTransactions(
    sheetData: SheetData,
    mapping: ColumnMapping,
    _sheetTypeOverride?: 'expense' | 'income' | null,
    yearOverride?: number | null
  ): Transaction[] {
    // Pre-scan: Determine how to detect type
    const typeStrategy = this.detectTypeStrategy(sheetData.rows, mapping);

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

        // Apply the detected strategy
        if (typeStrategy === 'category-value') {
          // Category column has "Income" / "Expense" values
          const categoryType = resolveTypeFromCategory(categoryVal);
          type = categoryType || 'expense';
        } else if (typeStrategy === 'category-keyword') {
          // Category column has keywords like "Groceries", "Salary"
          if (this.isExpenseCategory(categoryVal)) {
            type = 'expense';
          } else if (this.isIncomeCategory(categoryVal)) {
            type = 'income';
          } else {
            type = signedAmount < 0 ? 'expense' : 'income';
          }
        } else if (typeStrategy === 'description-keyword') {
          // Description column has keywords
          if (this.isExpenseCategory(descVal)) {
            type = 'expense';
          } else if (this.isIncomeCategory(descVal)) {
            type = 'income';
          } else {
            type = signedAmount < 0 ? 'expense' : 'income';
          }
        } else {
          // No reliable column - use sign only
          type = signedAmount < 0 ? 'expense' : 'income';
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

  // Pre-scan data to detect how to infer type
  private detectTypeStrategy(
    rows: string[][],
    mapping: ColumnMapping
  ): 'category-value' | 'category-keyword' | 'description-keyword' | 'sign-only' {
    const sampleSize = Math.min(20, rows.length);
    let categoryValueMatches = 0;
    let categoryKeywordMatches = 0;
    let descKeywordMatches = 0;

    for (let i = 0; i < sampleSize; i++) {
      const row = rows[i];
      const categoryVal = mapping.categoryColumn !== null ? row[mapping.categoryColumn] || '' : '';
      const descVal = mapping.descriptionColumn !== null ? row[mapping.descriptionColumn] || '' : '';

      // Check if category has "Income" or "Expense" type values
      if (resolveTypeFromCategory(categoryVal)) {
        categoryValueMatches++;
      }
      // Check if category has expense/income keywords
      if (this.isExpenseCategory(categoryVal) || this.isIncomeCategory(categoryVal)) {
        categoryKeywordMatches++;
      }
      // Check if description has expense/income keywords
      if (this.isExpenseCategory(descVal) || this.isIncomeCategory(descVal)) {
        descKeywordMatches++;
      }
    }

    // Decide strategy based on what we found
    if (categoryValueMatches >= sampleSize * 0.5) {
      return 'category-value'; // Most rows have "Income"/"Expense" in category
    }
    if (categoryKeywordMatches >= sampleSize * 0.3) {
      return 'category-keyword'; // Category has keywords like "Groceries"
    }
    if (descKeywordMatches >= sampleSize * 0.3) {
      return 'description-keyword'; // Description has keywords
    }
    return 'sign-only'; // Fall back to sign
  }

  // Main method to parse all selected sheets
  parseAllSheets(parsedFile: ParsedFile, selectedSheets: string[]): Transaction[] {
    const allTransactions: Transaction[] = [];

    for (const sheet of parsedFile.sheets) {
      if (selectedSheets.includes(sheet.name)) {
        let transactions: Transaction[] = [];
        const yearOverride = this.getSheetYear(sheet.name);
        const format = this.detectFormat(sheet);

        if (format === 'mixed') {
          // Mixed format uses per-column type detection (header keywords + sign)
          const analysis = this.analyzeMixedSheet(sheet);

          if (analysis.detailRowIndices.length > 0) {
            transactions = this.parseMixedSheet(sheet, analysis);
          } else if (analysis.summaryRowIndices.length > 0) {
            transactions = this.parseMixedSummaryOnly(sheet, analysis, yearOverride);
          }
        } else if (format === 'summary') {
          // Summary format - try to detect sheet type for column grouping
          const sheetType = this.detectSheetType(sheet);
          const mapping = this.inferSummaryMapping(sheet.headers, sheet.rows);
          transactions = this.parseSummaryTransactions(sheet, mapping, sheetType, yearOverride);
        } else {
          // Transaction log format
          const sheetType = this.detectSheetType(sheet);
          const mapping = inferSheetSchema(sheet.headers, sheet.rows);
          transactions = this.parseTransactions(sheet, mapping, sheetType, yearOverride);
        }

        allTransactions.push(...transactions);
      }
    }

    return allTransactions;
  }

  // Parse mixed format sheet with only summary rows (no daily details)
  // Simplified type detection: header keyword first, then sign
  private parseMixedSummaryOnly(
    sheet: SheetData,
    analysis: MixedSheetAnalysis,
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

        // Determine type: header keyword first, then sign
        const type = this.determineTypeForColumn(col.name, value);

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

  // Calculate confidence score for a parsed result
  private calculateConfidence(
    parsedFile: ParsedFile,
    selectedSheets: string[],
    transactions: Transaction[]
  ): ParseConfidence {
    const issues: ConfidenceIssue[] = [];
    let score = 0;

    // Get the primary sheet for analysis
    const primarySheet = parsedFile.sheets.find(s => selectedSheets.includes(s.name));
    if (!primarySheet) {
      return { level: 'low', score: 0, issues: [{ type: 'unsupported_layout', message: 'No sheets selected', severity: 'error' }] };
    }

    const format = parsedFile.detectedFormat;
    const mapping = parsedFile.inferredMapping;

    // For transaction log format, check column detection
    if (format === 'transaction') {
      // Date column found: +25
      if (mapping.dateColumn !== null) {
        score += 25;
      } else {
        issues.push({ type: 'missing_date', message: 'Date column not detected', severity: 'error' });
      }

      // Amount column found: +25
      if (mapping.amountColumn !== null) {
        score += 25;
      } else {
        issues.push({ type: 'missing_amount', message: 'Amount column not detected', severity: 'error' });
      }

      // Description or category found: +15
      if (mapping.descriptionColumn !== null || mapping.categoryColumn !== null) {
        score += 15;
      }
    } else {
      // For summary/mixed formats, assume date and amounts are handled differently
      score += 40; // Base score for detecting complex format
    }

    // Check date quality
    if (transactions.length > 0) {
      const dateSet = new Set<string>();
      let invalidDates = 0;
      let ambiguousDates = 0;

      for (const tx of transactions.slice(0, 50)) {
        const date = tx.date;
        if (!date || date === new Date().toISOString().split('T')[0]) {
          invalidDates++;
        } else {
          dateSet.add(date);
        }
        // Check for ambiguous date pattern (could be DD/MM or MM/DD)
        const match = date?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (match) {
          const month = parseInt(match[2], 10);
          const day = parseInt(match[3], 10);
          if (month <= 12 && day <= 12 && month !== day) {
            ambiguousDates++;
          }
        }
      }

      // All dates parseable: +15
      if (invalidDates === 0) {
        score += 15;
      } else if (invalidDates > transactions.length * 0.3) {
        issues.push({ type: 'ambiguous_dates', message: `${invalidDates} transactions have unclear dates`, severity: 'warning' });
      }

      // Unambiguous date format: +10
      if (ambiguousDates < transactions.length * 0.5) {
        score += 10;
      } else {
        issues.push({ type: 'ambiguous_dates', message: 'Date format may be ambiguous (DD/MM vs MM/DD)', severity: 'warning' });
      }
    }

    // Check amount sign consistency: +10
    if (transactions.length > 0) {
      const positiveExpenses = transactions.filter(tx => tx.type === 'expense' && (tx.signedAmount ?? 0) > 0).length;
      const negativeIncome = transactions.filter(tx => tx.type === 'income' && (tx.signedAmount ?? 0) < 0).length;
      const inconsistentSigns = positiveExpenses + negativeIncome;

      if (inconsistentSigns < transactions.length * 0.1) {
        score += 10;
      } else {
        issues.push({
          type: 'mixed_signs',
          message: `${inconsistentSigns} transactions have unusual amount signs`,
          severity: 'warning'
        });
      }
    }

    // Determine level based on score
    let level: ConfidenceLevel;
    if (score >= 70) {
      level = 'high';
    } else if (score >= 40) {
      level = 'medium';
    } else {
      level = 'low';
    }

    // Downgrade to low if we have any error-severity issues
    if (issues.some(i => i.severity === 'error')) {
      level = 'low';
    }

    return { level, score, issues };
  }

  // Main method to parse all selected sheets WITH confidence scoring
  parseAllSheetsWithConfidence(parsedFile: ParsedFile, selectedSheets: string[]): ParseResult {
    const transactions = this.parseAllSheets(parsedFile, selectedSheets);
    const confidence = this.calculateConfidence(parsedFile, selectedSheets, transactions);
    return { transactions, confidence };
  }
}

export const xlsxParser = new XLSXParserService();
