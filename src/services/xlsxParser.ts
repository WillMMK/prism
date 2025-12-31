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

// New: Summary format detection
export interface SummaryMapping {
  yearColumn: number | null;
  monthColumn: number | null;
  expenseCategories: { index: number; name: string }[];
  incomeCategories: { index: number; name: string }[];
  totalColumns: { index: number; name: string; type: 'expense' | 'income' | 'net' }[];
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
  'rmit', // User's specific category
];

// Common income category keywords
const INCOME_KEYWORDS = [
  'salary', 'wage', 'wages', 'pay', 'paycheck',
  'income', 'earning', 'earnings',
  'interest', 'dividend', 'dividends',
  'bonus', 'commission',
  'refund', 'rebate', 'cashback',
  'gift', 'allowance',
  'rental', 'rent income',
  'investment', 'return',
  'freelance', 'consulting',
  'package', // salary package
];

// Summary/total columns to skip when creating transactions
const SUMMARY_KEYWORDS = [
  'total', 'sum', 'net', 'gross', 'balance',
  'expense', 'expenses', 'spending',
  'income total', 'expense total',
  'profit', 'loss', 'net profit', 'net income',
];

class XLSXParserService {
  // Parse XLSX file from URI
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

    // Detect format and infer mappings
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

  // Detect if this is a summary/pivot format or transaction log
  detectFormat(sheet: SheetData): DataFormat {
    const headers = sheet.headers.map(h => h.toLowerCase().trim());

    // Check for YEAR/MONTH columns (common in summary format)
    const hasYearMonth = headers.some(h => h === 'year') && headers.some(h => h === 'month');

    // Count how many columns look like amounts (numeric data)
    const numericColumns = this.countNumericColumns(headers, sheet.rows);

    // Count columns that match expense/income keywords
    const categoryColumns = headers.filter(h =>
      this.isExpenseCategory(h) || this.isIncomeCategory(h)
    ).length;

    // Summary format: has year/month AND multiple numeric category columns
    if (hasYearMonth && categoryColumns >= 3) {
      return 'summary';
    }

    // Summary format: many numeric columns with category-like names
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
    // Exact match or contains keyword
    return EXPENSE_KEYWORDS.some(kw => lower === kw || lower.includes(kw));
  }

  private isIncomeCategory(header: string): boolean {
    const lower = header.toLowerCase().trim();
    return INCOME_KEYWORDS.some(kw => lower === kw || lower.includes(kw));
  }

  private isSummaryColumn(header: string): boolean {
    const lower = header.toLowerCase().trim();
    return SUMMARY_KEYWORDS.some(kw => lower === kw || lower.includes(kw));
  }

  // Infer summary format mapping
  inferSummaryMapping(headers: string[], rows: string[][]): SummaryMapping {
    const mapping: SummaryMapping = {
      yearColumn: null,
      monthColumn: null,
      expenseCategories: [],
      incomeCategories: [],
      totalColumns: [],
    };

    headers.forEach((header, index) => {
      const lower = header.toLowerCase().trim();

      // Find year/month columns
      if (lower === 'year') {
        mapping.yearColumn = index;
        return;
      }
      if (lower === 'month') {
        mapping.monthColumn = index;
        return;
      }

      // Skip empty headers
      if (!header.trim()) return;

      // Check if this column has numeric data
      const sampleValues = rows.slice(0, 10).map(row => row[index] || '');
      const isNumeric = this.looksLikeAmount(sampleValues);

      if (!isNumeric) return;

      // Categorize the column
      if (this.isSummaryColumn(header)) {
        // Determine if it's expense total, income total, or net
        let type: 'expense' | 'income' | 'net' = 'expense';
        if (lower.includes('income') && !lower.includes('net')) {
          type = 'income';
        } else if (lower.includes('net') || lower.includes('profit')) {
          type = 'net';
        }
        mapping.totalColumns.push({ index, name: header, type });
      } else if (this.isIncomeCategory(header)) {
        mapping.incomeCategories.push({ index, name: header });
      } else if (this.isExpenseCategory(header)) {
        mapping.expenseCategories.push({ index, name: header });
      } else {
        // Unknown category - try to infer from data
        // If values are mostly positive and column is after known income columns, might be income
        // Default to expense for safety
        const avgValue = this.getAverageValue(sampleValues);

        // Heuristic: names that look like person names might be income sources
        const looksLikePersonName = /^[A-Z][a-z]+$/.test(header.trim());

        if (looksLikePersonName || avgValue > 1000) {
          // Larger values or person names might be income
          mapping.incomeCategories.push({ index, name: header });
        } else {
          mapping.expenseCategories.push({ index, name: header });
        }
      }
    });

    return mapping;
  }

  private getAverageValue(values: string[]): number {
    const nums = values
      .map(v => parseFloat(v.replace(/[,$]/g, '')))
      .filter(n => !isNaN(n) && n !== 0);

    if (nums.length === 0) return 0;
    return nums.reduce((a, b) => a + b, 0) / nums.length;
  }

  // Parse summary format into transactions (unpivot)
  parseSummaryTransactions(
    sheetData: SheetData,
    mapping: SummaryMapping
  ): Transaction[] {
    const transactions: Transaction[] = [];

    sheetData.rows.forEach((row, rowIndex) => {
      // Build date from YEAR/MONTH
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

      // Create transactions for each expense category
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

      // Create transactions for each income category
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

    // Try numeric
    const num = parseInt(monthVal);
    if (!isNaN(num) && num >= 1 && num <= 12) {
      return num;
    }

    // Try month name
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

    // Handle accounting format
    if (cleaned.startsWith('(') && cleaned.endsWith(')')) {
      return -Math.abs(parseFloat(cleaned.slice(1, -1)) || 0);
    }

    return parseFloat(cleaned) || 0;
  }

  // Original transaction log schema inference
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

    // Infer from data patterns if headers didn't match
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

  // Parse traditional transaction log format
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

  // Main method to parse all selected sheets
  parseAllSheets(parsedFile: ParsedFile, selectedSheets: string[]): Transaction[] {
    const allTransactions: Transaction[] = [];

    for (const sheet of parsedFile.sheets) {
      if (selectedSheets.includes(sheet.name)) {
        if (parsedFile.detectedFormat === 'summary' && parsedFile.summaryMapping) {
          // Use summary parser (unpivot)
          const sheetMapping = this.inferSummaryMapping(sheet.headers, sheet.rows);
          const transactions = this.parseSummaryTransactions(sheet, sheetMapping);
          allTransactions.push(...transactions);
        } else {
          // Use transaction log parser
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
