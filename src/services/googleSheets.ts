import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import * as SecureStore from 'expo-secure-store';
import { Transaction } from '../types/budget';

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID';
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly'];

const discovery = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};

export interface SheetInfo {
  sheetId: number;
  title: string;
  rowCount: number;
  columnCount: number;
}

export interface ColumnMapping {
  dateColumn: number | null;
  descriptionColumn: number | null;
  amountColumn: number | null;
  categoryColumn: number | null;
  headers: string[];
}

export interface InferredSchema {
  sheets: SheetInfo[];
  columns: ColumnMapping;
  sampleData: string[][];
}

export class GoogleSheetsService {
  private accessToken: string | null = null;

  async getStoredToken(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync('google_access_token');
    } catch {
      return null;
    }
  }

  async storeToken(token: string): Promise<void> {
    await SecureStore.setItemAsync('google_access_token', token);
    this.accessToken = token;
  }

  async clearToken(): Promise<void> {
    await SecureStore.deleteItemAsync('google_access_token');
    this.accessToken = null;
  }

  private async getToken(): Promise<string> {
    const token = this.accessToken || (await this.getStoredToken());
    if (!token) {
      throw new Error('Not authenticated with Google');
    }
    return token;
  }

  // Get all sheets in a spreadsheet
  async getSpreadsheetInfo(spreadsheetId: string): Promise<SheetInfo[]> {
    const token = await this.getToken();
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      if (response.status === 401) {
        await this.clearToken();
        throw new Error('Authentication expired. Please sign in again.');
      }
      throw new Error(`Failed to fetch spreadsheet: ${response.statusText}`);
    }

    const data = await response.json();
    return data.sheets.map((sheet: any) => ({
      sheetId: sheet.properties.sheetId,
      title: sheet.properties.title,
      rowCount: sheet.properties.gridProperties?.rowCount || 0,
      columnCount: sheet.properties.gridProperties?.columnCount || 0,
    }));
  }

  // Fetch data from a specific sheet
  async fetchSheetData(spreadsheetId: string, sheetName: string, range?: string): Promise<string[][]> {
    const token = await this.getToken();
    const fullRange = range ? `'${sheetName}'!${range}` : `'${sheetName}'`;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(fullRange)}`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      if (response.status === 401) {
        await this.clearToken();
        throw new Error('Authentication expired. Please sign in again.');
      }
      throw new Error(`Failed to fetch data: ${response.statusText}`);
    }

    const data = await response.json();
    return data.values || [];
  }

  // Infer schema from sheet data
  inferSchema(headers: string[], sampleRows: string[][]): ColumnMapping {
    const mapping: ColumnMapping = {
      dateColumn: null,
      descriptionColumn: null,
      amountColumn: null,
      categoryColumn: null,
      headers,
    };

    // Common patterns for each field type
    const datePatterns = /date|time|when|day|month|year|period|tanggal/i;
    const amountPatterns = /amount|total|sum|price|cost|value|money|expense|income|credit|debit|balance|jumlah|\$|£|€/i;
    const categoryPatterns = /category|type|group|class|kind|tag|label|department|account|kategori/i;
    const descriptionPatterns = /description|desc|name|title|memo|note|detail|item|what|merchant|vendor|payee|keterangan/i;

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
    ];

    const matchCount = values.filter(v =>
      v && datePatterns.some(pattern => pattern.test(v.trim()))
    ).length;

    return matchCount >= values.length * 0.5;
  }

  private looksLikeAmount(values: string[]): boolean {
    const matchCount = values.filter(v => {
      const cleaned = v.replace(/[$,£€\s]/g, '').trim();
      return cleaned && !isNaN(parseFloat(cleaned));
    }).length;

    return matchCount >= values.length * 0.5;
  }

  private looksLikeText(values: string[]): boolean {
    const textCount = values.filter(v =>
      v && v.trim().length > 2 && !/^[\d.,\-$€£%()]+$/.test(v.trim())
    ).length;

    return textCount >= values.length * 0.4;
  }

  // Parse transactions using inferred or custom mapping
  parseTransactionsWithMapping(
    rows: string[][],
    mapping: ColumnMapping,
    hasHeader: boolean = true
  ): Transaction[] {
    const dataRows = hasHeader ? rows.slice(1) : rows;

    return dataRows.map((row, index) => {
      const dateVal = mapping.dateColumn !== null ? row[mapping.dateColumn] : '';
      const descVal = mapping.descriptionColumn !== null ? row[mapping.descriptionColumn] : '';
      const amountVal = mapping.amountColumn !== null ? row[mapping.amountColumn] : '0';
      const categoryVal = mapping.categoryColumn !== null ? row[mapping.categoryColumn] : 'Uncategorized';

      // Parse amount - handle various formats
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
        id: `tx_${index}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
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

    // Try to parse various date formats
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

  // Get full schema inference for a spreadsheet
  async analyzeSpreadsheet(spreadsheetId: string): Promise<InferredSchema> {
    const sheets = await this.getSpreadsheetInfo(spreadsheetId);

    // Get data from first sheet for initial analysis
    const firstSheet = sheets[0];
    const sampleData = await this.fetchSheetData(spreadsheetId, firstSheet.title, 'A1:Z20');

    const headers = sampleData[0] || [];
    const dataRows = sampleData.slice(1);

    const columns = this.inferSchema(headers, dataRows);

    return {
      sheets,
      columns,
      sampleData: sampleData.slice(0, 6),
    };
  }

  // Import all data from multiple sheets
  async importAllSheets(
    spreadsheetId: string,
    sheetNames: string[]
  ): Promise<Transaction[]> {
    const allTransactions: Transaction[] = [];

    for (const sheetName of sheetNames) {
      try {
        const data = await this.fetchSheetData(spreadsheetId, sheetName);
        if (data.length > 1) {
          const headers = data[0];
          const dataRows = data.slice(1);
          const mapping = this.inferSchema(headers, dataRows);
          const transactions = this.parseTransactionsWithMapping(data, mapping, true);
          allTransactions.push(...transactions);
        }
      } catch (error) {
        console.warn(`Failed to import sheet ${sheetName}:`, error);
      }
    }

    return allTransactions;
  }
}

export const googleSheetsService = new GoogleSheetsService();
