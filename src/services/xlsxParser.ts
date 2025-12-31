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

export type DataFormat = 'transaction' | 'summary';

export interface ParsedFile {
  sheets: SheetData[];
  inferredMapping: ColumnMapping;
  summaryMapping: SummaryMapping | null;
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

// Common income category keywords
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

    if (firstSheet) {
      if (detectedFormat === 'summary') {
        summaryMapping = this.inferSummaryMapping(firstSheet.headers, firstSheet.rows);
      } else {
        inferredMapping = this.inferSchema(firstSheet.headers, firstSheet.rows);
      }
      inferredMapping.headers = firstSheet.headers;
    }

    return { sheets, inferredMapping, summaryMapping, detectedFormat };
  }

  detectFormat(sheet: SheetData): DataFormat {
    const headers = sheet.headers.map(h => h.toLowerCase().trim());
    const hasYearMonth = headers.some(h => h === 'year') && headers.some(h => h === 'month');
    const numericColumns = this.countNumericColumns(headers, sheet.rows);
    const categoryColumns = headers.filter(h =>
      this.isExpenseCategory(h) || this.isIncomeCategory(h)
    ).length;

    if (hasYearMonth && categoryColumns >= 3) {
      return 'summary';
    }

    if (numericColumns >= 5 && categoryColumns >= 3) {
      return 'summary';
    }

    return 'transaction';
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

  // Smart summary mapping that analyzes data to find sum columns
  inferSummaryMapping(headers: string[], rows: string[][]): SummaryMapping {
    const mapping: SummaryMapping = {
      yearColumn: null,
      monthColumn: null,
      expenseCategories: [],
      incomeCategories: [],
      totalColumns: [],
    };

    // Step 1: Find year/month columns and identify all numeric columns
    const numericColumns: number[] = [];

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

      if (!header.trim()) return;

      const sampleValues = rows.slice(0, 10).map(row => row[index] || '');
      if (this.looksLikeAmount(sampleValues)) {
        numericColumns.push(index);
      }
    });

    // Step 2: Analyze data to find which columns are sums of other columns
    const sumColumns = this.detectSumColumns(headers, rows, numericColumns);

    // Step 3: Columns that are NOT sum columns are the actual categories
    const categoryColumns = numericColumns.filter(idx => !sumColumns.has(idx));

    // Step 4: Categorize each non-sum column as expense or income
    categoryColumns.forEach(index => {
      const header = headers[index];
      const lower = header.toLowerCase().trim();

      // Check if this column is part of an expense sum or income sum
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

      // Determine type based on what sum it belongs to, then name hints
      if (isPartOfExpenseSum) {
        mapping.expenseCategories.push({ index, name: header });
      } else if (isPartOfIncomeSum) {
        mapping.incomeCategories.push({ index, name: header });
      } else if (this.isExpenseCategory(header)) {
        mapping.expenseCategories.push({ index, name: header });
      } else if (this.isIncomeCategory(header)) {
        mapping.incomeCategories.push({ index, name: header });
      } else {
        // Unknown - use heuristics
        const looksLikePersonName = /^[A-Z][a-z]+$/.test(header.trim());
        const avgValue = this.getAverageValue(rows.slice(0, 10).map(r => r[index] || ''));

        if (looksLikePersonName || avgValue > 1000) {
          mapping.incomeCategories.push({ index, name: header });
        } else {
          mapping.expenseCategories.push({ index, name: header });
        }
      }
    });

    // Step 5: Add detected sum columns to totalColumns
    sumColumns.forEach((sumOf, index) => {
      const header = headers[index];
      const lower = header.toLowerCase().trim();

      let type: 'expense' | 'income' | 'net' = 'expense';
      if (lower.includes('income') || lower === 'income') {
        type = 'income';
      } else if (lower.includes('net') || lower.includes('profit')) {
        type = 'net';
      }

      mapping.totalColumns.push({ index, name: header, type, sumOf });
    });

    return mapping;
  }

  // Detect which columns are sums of other columns by analyzing data
  private detectSumColumns(
    headers: string[],
    rows: string[][],
    numericColumns: number[]
  ): Map<number, number[]> {
    const sumColumns = new Map<number, number[]>();
    const tolerance = 0.01; // Allow 1% tolerance for floating point

    // For each numeric column, check if it's approximately equal to sum of some other columns
    numericColumns.forEach(potentialSumCol => {
      // Try to find a subset of other columns that sum to this column
      const otherColumns = numericColumns.filter(c => c !== potentialSumCol);

      // Get values for potential sum column
      const sumValues = rows.map(row => this.parseAmount(row[potentialSumCol]));

      // Skip columns with all zeros or very small values
      const nonZeroCount = sumValues.filter(v => Math.abs(v) > 0.01).length;
      if (nonZeroCount < Math.min(3, rows.length * 0.3)) return;

      // Try different subsets - start with finding consecutive column groups
      // that might sum to this column
      const foundSubset = this.findSumSubset(rows, potentialSumCol, otherColumns, tolerance);

      if (foundSubset && foundSubset.length >= 2) {
        sumColumns.set(potentialSumCol, foundSubset);
      }
    });

    return sumColumns;
  }

  // Find a subset of columns that sum to the target column
  private findSumSubset(
    rows: string[][],
    targetCol: number,
    candidateCols: number[],
    tolerance: number
  ): number[] | null {
    const sampleRows = rows.slice(0, Math.min(10, rows.length));

    // Try finding consecutive groups that sum correctly
    // This is a greedy approach - try adding columns one by one

    // Sort candidates by their position (consecutive columns often belong together)
    const sortedCandidates = [...candidateCols].sort((a, b) => a - b);

    // Try to find a group of columns that sums to target
    for (let startIdx = 0; startIdx < sortedCandidates.length; startIdx++) {
      let currentSubset: number[] = [];
      let matchCount = 0;

      for (let endIdx = startIdx; endIdx < sortedCandidates.length; endIdx++) {
        currentSubset.push(sortedCandidates[endIdx]);

        // Check if current subset sums to target across all sample rows
        let allMatch = true;
        let validRows = 0;

        for (const row of sampleRows) {
          const targetVal = this.parseAmount(row[targetCol]);
          const subsetSum = currentSubset.reduce(
            (sum, col) => sum + this.parseAmount(row[col]),
            0
          );

          // Skip rows where both are zero (empty data)
          if (Math.abs(targetVal) < 0.01 && Math.abs(subsetSum) < 0.01) {
            continue;
          }

          validRows++;

          // Check if they match within tolerance
          const diff = Math.abs(targetVal - subsetSum);
          const maxVal = Math.max(Math.abs(targetVal), Math.abs(subsetSum), 1);

          if (diff / maxVal > tolerance) {
            allMatch = false;
            break;
          }
        }

        // If we have enough valid rows and all match, we found it!
        if (allMatch && validRows >= Math.min(3, sampleRows.length * 0.5)) {
          if (currentSubset.length >= 2) {
            return currentSubset;
          }
        }
      }
    }

    // Also try non-consecutive combinations for smaller sets
    if (candidateCols.length <= 10) {
      // Try all pairs
      for (let i = 0; i < candidateCols.length; i++) {
        for (let j = i + 1; j < candidateCols.length; j++) {
          const subset = [candidateCols[i], candidateCols[j]];
          if (this.checkSubsetMatch(rows, targetCol, subset, tolerance)) {
            return subset;
          }
        }
      }

      // Try triples
      for (let i = 0; i < candidateCols.length; i++) {
        for (let j = i + 1; j < candidateCols.length; j++) {
          for (let k = j + 1; k < candidateCols.length; k++) {
            const subset = [candidateCols[i], candidateCols[j], candidateCols[k]];
            if (this.checkSubsetMatch(rows, targetCol, subset, tolerance)) {
              return subset;
            }
          }
        }
      }
    }

    return null;
  }

  private checkSubsetMatch(
    rows: string[][],
    targetCol: number,
    subset: number[],
    tolerance: number
  ): boolean {
    const sampleRows = rows.slice(0, Math.min(10, rows.length));
    let validRows = 0;
    let matchCount = 0;

    for (const row of sampleRows) {
      const targetVal = this.parseAmount(row[targetCol]);
      const subsetSum = subset.reduce(
        (sum, col) => sum + this.parseAmount(row[col]),
        0
      );

      if (Math.abs(targetVal) < 0.01 && Math.abs(subsetSum) < 0.01) {
        continue;
      }

      validRows++;

      const diff = Math.abs(targetVal - subsetSum);
      const maxVal = Math.max(Math.abs(targetVal), Math.abs(subsetSum), 1);

      if (diff / maxVal <= tolerance) {
        matchCount++;
      }
    }

    // At least 80% of valid rows should match
    return validRows >= 2 && matchCount >= validRows * 0.8;
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
    mapping: SummaryMapping
  ): Transaction[] {
    const transactions: Transaction[] = [];

    sheetData.rows.forEach((row, rowIndex) => {
      let year = new Date().getFullYear();
      let month = 1;

      if (mapping.yearColumn !== null) {
        year = parseInt(row[mapping.yearColumn]) || year;
      }
      if (mapping.monthColumn !== null) {
        const monthVal = row[mapping.monthColumn];
        month = this.parseMonth(monthVal);
      }

      const dateStr = `${year}-${String(month).padStart(2, '0')}-01`;

      // Create transactions for expense categories only (not sum columns)
      mapping.expenseCategories.forEach(cat => {
        const value = this.parseAmount(row[cat.index]);
        if (value !== 0) {
          transactions.push({
            id: `xlsx_exp_${rowIndex}_${cat.index}_${Date.now()}`,
            date: dateStr,
            description: cat.name,
            category: cat.name,
            amount: Math.abs(value),
            type: 'expense',
          });
        }
      });

      // Create transactions for income categories only (not sum columns)
      mapping.incomeCategories.forEach(cat => {
        const value = this.parseAmount(row[cat.index]);
        if (value !== 0) {
          transactions.push({
            id: `xlsx_inc_${rowIndex}_${cat.index}_${Date.now()}`,
            date: dateStr,
            description: cat.name,
            category: cat.name,
            amount: Math.abs(value),
            type: 'income',
          });
        }
      });
    });

    return transactions;
  }

  private parseMonth(monthVal: string): number {
    if (!monthVal) return 1;

    const num = parseInt(monthVal);
    if (!isNaN(num) && num >= 1 && num <= 12) {
      return num;
    }

    const monthNames: { [key: string]: number } = {
      'jan': 1, 'january': 1,
      'feb': 2, 'february': 2,
      'mar': 3, 'march': 3,
      'apr': 4, 'april': 4,
      'may': 5,
      'jun': 6, 'june': 6,
      'jul': 7, 'july': 7,
      'aug': 8, 'august': 8,
      'sep': 9, 'september': 9,
      'oct': 10, 'october': 10,
      'nov': 11, 'november': 11,
      'dec': 12, 'december': 12,
    };

    const lower = monthVal.toLowerCase().trim();
    return monthNames[lower] || 1;
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
    mapping: ColumnMapping
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
        type = amount < 0 ? 'expense' : 'income';
        amount = Math.abs(amount);
      }

      const parsedDate = this.parseDate(dateVal);

      return {
        id: `xlsx_${index}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        date: parsedDate,
        description: descVal || 'No description',
        category: categoryVal || 'Uncategorized',
        amount,
        type,
      };
    }).filter(tx => tx.date || tx.amount !== 0);
  }

  private parseDate(dateStr: string): string {
    if (!dateStr) return new Date().toISOString().split('T')[0];

    const numDate = parseFloat(dateStr);
    if (!isNaN(numDate) && numDate > 30000 && numDate < 100000) {
      const excelEpoch = new Date(1899, 11, 30);
      const date = new Date(excelEpoch.getTime() + numDate * 24 * 60 * 60 * 1000);
      return date.toISOString().split('T')[0];
    }

    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }

    const ddmmyyyy = dateStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (ddmmyyyy) {
      const [, day, month, year] = ddmmyyyy;
      const fullYear = year.length === 2 ? `20${year}` : year;
      return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }

    return new Date().toISOString().split('T')[0];
  }

  parseAllSheets(parsedFile: ParsedFile, selectedSheets: string[]): Transaction[] {
    const allTransactions: Transaction[] = [];

    for (const sheet of parsedFile.sheets) {
      if (selectedSheets.includes(sheet.name)) {
        if (parsedFile.detectedFormat === 'summary' && parsedFile.summaryMapping) {
          const sheetMapping = this.inferSummaryMapping(sheet.headers, sheet.rows);
          const transactions = this.parseSummaryTransactions(sheet, sheetMapping);
          allTransactions.push(...transactions);
        } else {
          const mapping = this.inferSchema(sheet.headers, sheet.rows);
          const transactions = this.parseTransactions(sheet, mapping);
          allTransactions.push(...transactions);
        }
      }
    }

    return allTransactions;
  }
}

export const xlsxParser = new XLSXParserService();
