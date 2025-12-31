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

export interface ParsedFile {
  sheets: SheetData[];
  inferredMapping: ColumnMapping;
}

class XLSXParserService {
  // Parse XLSX file from URI
  async parseFile(fileUri: string): Promise<ParsedFile> {
    // Read file as base64 using string literal for encoding
    const base64 = await FileSystem.readAsStringAsync(fileUri, {
      encoding: 'base64' as any,
    });

    // Parse workbook
    const workbook = XLSX.read(base64, { type: 'base64' });

    const sheets: SheetData[] = [];

    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json<string[]>(worksheet, { header: 1 });

      if (jsonData.length > 0) {
        const headers = (jsonData[0] || []).map(h => String(h || ''));
        const rows = jsonData.slice(1).map(row =>
          (row || []).map(cell => String(cell || ''))
        );

        sheets.push({
          name: sheetName,
          headers,
          rows,
          rowCount: rows.length,
        });
      }
    }

    // Infer mapping from first sheet
    const inferredMapping = sheets.length > 0
      ? this.inferSchema(sheets[0].headers, sheets[0].rows)
      : { dateColumn: null, descriptionColumn: null, amountColumn: null, categoryColumn: null, headers: [] };

    return { sheets, inferredMapping };
  }

  // Infer schema from headers and sample data
  inferSchema(headers: string[], sampleRows: string[][]): ColumnMapping {
    const mapping: ColumnMapping = {
      dateColumn: null,
      descriptionColumn: null,
      amountColumn: null,
      categoryColumn: null,
      headers,
    };

    // Common patterns for each field type
    const datePatterns = /date|time|when|day|month|year|period|tanggal|fecha|datum/i;
    const amountPatterns = /amount|total|sum|price|cost|value|money|expense|income|credit|debit|balance|jumlah|\$|£|€|price|qty|quantity/i;
    const categoryPatterns = /category|type|group|class|kind|tag|label|department|account|kategori|categoria/i;
    const descriptionPatterns = /description|desc|name|title|memo|note|detail|item|what|merchant|vendor|payee|keterangan|remarks|particulars/i;

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

    // If headers didn't match, try to infer from data patterns
    if (sampleRows.length > 0) {
      headers.forEach((_, index) => {
        const sampleValues = sampleRows.slice(0, 5).map(row => row[index] || '');

        // Check for date patterns in data
        if (mapping.dateColumn === null && this.looksLikeDate(sampleValues)) {
          mapping.dateColumn = index;
        }

        // Check for numeric/currency patterns
        if (mapping.amountColumn === null && this.looksLikeAmount(sampleValues)) {
          mapping.amountColumn = index;
        }
      });

      // Default: first text column after date/amount is description
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
      /^\d{4}-\d{2}-\d{2}/, // 2024-01-15
      /^\d{2}\/\d{2}\/\d{4}/, // 01/15/2024
      /^\d{2}-\d{2}-\d{4}/, // 15-01-2024
      /^\d{1,2}\/\d{1,2}\/\d{2,4}/, // 1/15/24
      /^[A-Za-z]{3}\s+\d{1,2}/, // Jan 15
      /^\d{1,2}\s+[A-Za-z]{3}/, // 15 Jan
    ];

    const matchCount = values.filter(v =>
      v && datePatterns.some(pattern => pattern.test(v.trim()))
    ).length;

    return matchCount >= values.length * 0.5;
  }

  private looksLikeAmount(values: string[]): boolean {
    const matchCount = values.filter(v => {
      const cleaned = v.replace(/[$,£€\s()]/g, '').trim();
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

  // Parse transactions from sheet data with mapping
  parseTransactions(
    sheetData: SheetData,
    mapping: ColumnMapping
  ): Transaction[] {
    return sheetData.rows.map((row, index) => {
      const dateVal = mapping.dateColumn !== null ? row[mapping.dateColumn] : '';
      const descVal = mapping.descriptionColumn !== null ? row[mapping.descriptionColumn] : '';
      const amountVal = mapping.amountColumn !== null ? row[mapping.amountColumn] : '0';
      const categoryVal = mapping.categoryColumn !== null ? row[mapping.categoryColumn] : 'Uncategorized';

      // Parse amount
      let amount = 0;
      let type: 'income' | 'expense' = 'expense';

      const cleanedAmount = (amountVal || '0').replace(/[$,£€\s]/g, '').trim();

      // Handle accounting format (negative in parentheses)
      if (cleanedAmount.startsWith('(') && cleanedAmount.endsWith(')')) {
        amount = Math.abs(parseFloat(cleanedAmount.slice(1, -1)) || 0);
        type = 'expense';
      } else {
        amount = parseFloat(cleanedAmount) || 0;
        type = amount < 0 ? 'expense' : 'income';
        amount = Math.abs(amount);
      }

      // Parse date
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

    // Handle Excel serial date numbers
    const numDate = parseFloat(dateStr);
    if (!isNaN(numDate) && numDate > 30000 && numDate < 100000) {
      // Excel serial date (days since 1900-01-01)
      const excelEpoch = new Date(1899, 11, 30);
      const date = new Date(excelEpoch.getTime() + numDate * 24 * 60 * 60 * 1000);
      return date.toISOString().split('T')[0];
    }

    // Try standard parsing
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }

    // Try DD/MM/YYYY format
    const ddmmyyyy = dateStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (ddmmyyyy) {
      const [, day, month, year] = ddmmyyyy;
      const fullYear = year.length === 2 ? `20${year}` : year;
      return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }

    return new Date().toISOString().split('T')[0];
  }

  // Import all sheets
  parseAllSheets(parsedFile: ParsedFile, selectedSheets: string[]): Transaction[] {
    const allTransactions: Transaction[] = [];

    for (const sheet of parsedFile.sheets) {
      if (selectedSheets.includes(sheet.name)) {
        const mapping = this.inferSchema(sheet.headers, sheet.rows);
        const transactions = this.parseTransactions(sheet, mapping);
        allTransactions.push(...transactions);
      }
    }

    return allTransactions;
  }
}

export const xlsxParser = new XLSXParserService();
