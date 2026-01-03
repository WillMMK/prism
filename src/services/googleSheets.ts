import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import type * as SecureStoreType from 'expo-secure-store';
import { Transaction } from '../types/budget';
import { xlsxParser, SheetData, ParsedFile } from './xlsxParser';

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_WEB_CLIENT_ID = '907648461438-2q8au98sdpogg0hiu3sc9g5o3uruhqmf.apps.googleusercontent.com';
const GOOGLE_IOS_CLIENT_ID = '907648461438-lttve08jch0tc7639k16hill7smkbqur.apps.googleusercontent.com';
const GOOGLE_ANDROID_CLIENT_ID = '';
const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.readonly',
];

const discovery = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};

export const GOOGLE_AUTH_CONFIG = {
  webClientId: GOOGLE_WEB_CLIENT_ID,
  iosClientId: GOOGLE_IOS_CLIENT_ID,
  androidClientId: GOOGLE_ANDROID_CLIENT_ID,
  scopes: SCOPES,
  discovery,
};

export interface SpreadsheetFile {
  id: string;
  name: string;
  modifiedTime: string;
}

export interface SheetInfo {
  sheetId: number;
  title: string;
  rowCount: number;
  columnCount: number;
}

export interface SpreadsheetMetadata {
  title: string;
  sheets: SheetInfo[];
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
  private secureStore: typeof SecureStoreType | null = null;
  private readonly webTokenKey = 'google_access_token';

  private getClientIdForPlatform(): string {
    if (Platform.OS === 'ios') return GOOGLE_AUTH_CONFIG.iosClientId;
    if (Platform.OS === 'android') return GOOGLE_AUTH_CONFIG.androidClientId || GOOGLE_AUTH_CONFIG.webClientId;
    return GOOGLE_AUTH_CONFIG.webClientId;
  }

  private getSecureStore(): typeof SecureStoreType {
    if (!this.secureStore) {
      this.secureStore = require('expo-secure-store') as typeof SecureStoreType;
    }
    return this.secureStore;
  }

  async getStoredToken(): Promise<{ accessToken: string; refreshToken?: string; expiresAt?: number } | null> {
    try {
      if (Platform.OS === 'web') {
        const raw = localStorage.getItem(this.webTokenKey);
        return raw ? JSON.parse(raw) : null;
      }
      const secureStore = this.getSecureStore();
      const raw = await secureStore.getItemAsync(this.webTokenKey);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  async storeToken(
    token: string,
    refreshToken?: string,
    expiresInSeconds?: number
  ): Promise<void> {
    const existing = await this.getStoredToken();
    const payload = {
      accessToken: token,
      refreshToken: refreshToken || existing?.refreshToken,
      expiresAt: expiresInSeconds ? Date.now() + expiresInSeconds * 1000 : existing?.expiresAt,
    };
    if (Platform.OS === 'web') {
      localStorage.setItem(this.webTokenKey, JSON.stringify(payload));
    } else {
      const secureStore = this.getSecureStore();
      await secureStore.setItemAsync(this.webTokenKey, JSON.stringify(payload));
    }
    this.accessToken = token;
  }

  async clearToken(): Promise<void> {
    if (Platform.OS === 'web') {
      localStorage.removeItem(this.webTokenKey);
    } else {
      const secureStore = this.getSecureStore();
      await secureStore.deleteItemAsync(this.webTokenKey);
    }
    this.accessToken = null;
  }

  private async refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresIn?: number }> {
    const response = await fetch(discovery.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.getClientIdForPlatform(),
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to refresh access token.');
    }

    const data = await response.json();
    return {
      accessToken: data.access_token,
      expiresIn: data.expires_in,
    };
  }

  private async getToken(): Promise<string> {
    const stored = await this.getStoredToken();
    const token = this.accessToken || stored?.accessToken;
    if (!token) {
      throw new Error('Not authenticated with Google');
    }
    if (stored?.expiresAt && stored.expiresAt <= Date.now()) {
      if (!stored.refreshToken) {
        throw new Error('Authentication expired. Please sign in again.');
      }
      const refreshed = await this.refreshAccessToken(stored.refreshToken);
      await this.storeToken(refreshed.accessToken, stored.refreshToken, refreshed.expiresIn);
      return refreshed.accessToken;
    }

    return token;
  }

  // List all spreadsheets from Google Drive
  async listSpreadsheets(query?: string): Promise<SpreadsheetFile[]> {
    const token = await this.getToken();
    const escapedQuery = (query || '').replace(/'/g, "\\'");
    const q = escapedQuery
      ? `mimeType='application/vnd.google-apps.spreadsheet' and name contains '${escapedQuery}'`
      : "mimeType='application/vnd.google-apps.spreadsheet'";
    const url = 'https://www.googleapis.com/drive/v3/files?' + new URLSearchParams({
      q,
      fields: 'files(id,name,modifiedTime)',
      orderBy: 'modifiedTime desc',
      pageSize: '50',
    });

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      if (response.status === 401) {
        await this.clearToken();
        throw new Error('Authentication expired. Please sign in again.');
      }
      throw new Error(`Failed to list spreadsheets: ${response.statusText}`);
    }

    const data = await response.json();
    return data.files || [];
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

  async getSpreadsheetMetadata(spreadsheetId: string): Promise<SpreadsheetMetadata> {
    const token = await this.getToken();
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=properties.title,sheets.properties`;

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
    const sheets = (data.sheets || []).map((sheet: any) => ({
      sheetId: sheet.properties.sheetId,
      title: sheet.properties.title,
      rowCount: sheet.properties.gridProperties?.rowCount || 0,
      columnCount: sheet.properties.gridProperties?.columnCount || 0,
    }));

    return {
      title: data.properties?.title || 'Google Sheets',
      sheets,
    };
  }

  // Fetch data from a specific sheet
  async fetchSheetData(
    spreadsheetId: string,
    sheetName: string,
    range?: string,
    options?: { valueRenderOption?: 'FORMATTED_VALUE' | 'UNFORMATTED_VALUE' | 'FORMULA' }
  ): Promise<string[][]> {
    const token = await this.getToken();
    const fullRange = range ? `'${sheetName}'!${range}` : `'${sheetName}'`;
    const query = new URLSearchParams();
    if (options?.valueRenderOption) {
      query.set('valueRenderOption', options.valueRenderOption);
    }
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(fullRange)}${query.toString() ? `?${query.toString()}` : ''}`;

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

  private buildAppendRow(
    mapping: ColumnMapping,
    transaction: Transaction,
    columnCount: number,
    formulaColumns: Set<number>
  ): (string | number)[] {
    const row = Array.from({ length: columnCount }, () => '');
    const signedAmount =
      typeof transaction.signedAmount === 'number'
        ? transaction.signedAmount
        : transaction.type === 'income'
        ? transaction.amount
        : -transaction.amount;

    const safeSet = (index: number | null, value: string | number) => {
      if (index === null || index < 0) return;
      if (formulaColumns.has(index)) return;
      if (index >= row.length) return;
      row[index] = value;
    };

    safeSet(mapping.dateColumn, transaction.date || new Date().toISOString().split('T')[0]);
    safeSet(mapping.descriptionColumn, transaction.description || '');
    safeSet(mapping.amountColumn, signedAmount);
    safeSet(mapping.categoryColumn, transaction.category || '');

    return row;
  }

  private async getWriteSchema(spreadsheetId: string, sheetName: string): Promise<{
    mapping: ColumnMapping;
    columnCount: number;
    formulaColumns: Set<number>;
  }> {
    const sampleData = await this.fetchSheetData(spreadsheetId, sheetName, 'A1:Z20', {
      valueRenderOption: 'FORMULA',
    });
    const headerRow = sampleData[0] || [];
    const hasHeader = this.isLikelyHeaderRow(headerRow, sampleData.slice(1));
    const maxColumns = Math.max(
      headerRow.length,
      0,
      ...sampleData.map(row => row.length)
    );

    const headers = hasHeader
      ? headerRow
      : Array.from({ length: maxColumns }, () => '');
    const dataRows = hasHeader ? sampleData.slice(1) : sampleData;
    const mapping = this.inferSchema(headers, dataRows);
    const formulaColumns = new Set<number>();
    const sampleRow = dataRows.find(row => row.some(cell => String(cell ?? '').trim().length > 0)) || [];

    sampleRow.forEach((cell, index) => {
      const value = String(cell ?? '').trim();
      if (value.startsWith('=')) {
        formulaColumns.add(index);
      }
    });

    return {
      mapping,
      columnCount: Math.max(1, maxColumns),
      formulaColumns,
    };
  }

  async appendTransaction(
    spreadsheetId: string,
    sheetName: string,
    transaction: Transaction
  ): Promise<void> {
    const token = await this.getToken();
    const { mapping, columnCount, formulaColumns } = await this.getWriteSchema(spreadsheetId, sheetName);

    if (mapping.amountColumn === null && mapping.dateColumn === null && mapping.descriptionColumn === null) {
      throw new Error('Could not detect a column mapping for this sheet.');
    }

    const row = this.buildAppendRow(mapping, transaction, columnCount, formulaColumns);
    const range = `'${sheetName}'!A1`;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append?` +
      new URLSearchParams({
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
      }).toString();

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values: [row] }),
    });

    if (!response.ok) {
      if (response.status === 401) {
        await this.clearToken();
        throw new Error('Authentication expired. Please sign in again.');
      }
      const text = await response.text();
      throw new Error(`Failed to append row: ${text || response.statusText}`);
    }
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
    const datePatterns = /date|time|when|day|month|year|period|posted|posting|transaction|tanggal/i;
    const amountPatterns =
      /amount|total|sum|price|cost|value|money|expense|income|credit|debit|withdrawal|deposit|inflow|outflow|balance|jumlah|\$|£|€/i;
    const categoryPatterns = /category|type|group|class|kind|tag|label|department|account|bucket|subcategory|kategori/i;
    const descriptionPatterns =
      /description|desc|name|title|memo|note|detail|details|item|transaction|what|merchant|vendor|payee|narration|reference|ref|keterangan/i;

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

  private isLikelyHeaderRow(firstRow: string[], rows: string[][]): boolean {
    if (!firstRow || firstRow.length === 0) return false;

    const firstMetrics = this.getRowMetrics(firstRow);
    if (firstMetrics.nonEmpty === 0) return false;

    const nextRow = rows[0] || [];
    const nextMetrics = this.getRowMetrics(nextRow);

    const textDominant =
      firstMetrics.textCount >= Math.max(2, Math.ceil(firstMetrics.nonEmpty * 0.5));
    const numericLight =
      firstMetrics.numericCount <= Math.max(1, Math.floor(firstMetrics.nonEmpty * 0.2));
    const nextHasNumeric =
      nextMetrics.numericCount >= Math.max(1, Math.ceil(nextMetrics.nonEmpty * 0.3));

    if (textDominant && numericLight) {
      if (nextHasNumeric) return true;
      return true;
    }

    if (firstMetrics.numericCount >= Math.ceil(firstMetrics.nonEmpty * 0.6)) {
      return false;
    }

    if (textDominant && nextHasNumeric) return true;
    return false;
  }

  private getRowMetrics(row: string[]): {
    nonEmpty: number;
    textCount: number;
    numericCount: number;
  } {
    let nonEmpty = 0;
    let textCount = 0;
    let numericCount = 0;

    row.forEach(cell => {
      const value = String(cell ?? '').trim();
      if (!value) return;
      nonEmpty += 1;

      if (/[A-Za-z]/.test(value)) {
        textCount += 1;
        return;
      }

      if (this.looksLikeDateValue(value) || this.looksLikeAmount([value])) {
        numericCount += 1;
      }
    });

    return { nonEmpty, textCount, numericCount };
  }

  private looksLikeDateValue(value: string): boolean {
    if (!value) return false;
    if (/^\d{4}[\/\-]\d{1,2}([\/\-]\d{1,2})?$/.test(value)) return true;
    if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(value)) return true;

    const num = parseFloat(value);
    return !isNaN(num) && num > 30000 && num < 100000;
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

  private normalizeSheetData(sheetName: string, data: string[][]): SheetData | null {
    if (!data || data.length === 0) return null;
    const maxColumns = Math.max(0, ...data.map(row => row.length));
    const headerRow = data[0] || [];
    const hasHeader = this.isLikelyHeaderRow(headerRow, data.slice(1));
    const headers = hasHeader
      ? Array.from({ length: maxColumns }, (_, index) => String(headerRow[index] ?? ''))
      : Array.from({ length: maxColumns }, () => '');
    const rawRows = hasHeader ? data.slice(1) : data;
    const rows = rawRows.map(row =>
      Array.from({ length: maxColumns }, (_, index) => String((row || [])[index] ?? ''))
    );

    return {
      name: sheetName,
      headers,
      rows,
      rowCount: rows.length,
    };
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
      let type: 'income' | 'expense' = 'expense';
      const cleanedAmount = (amountVal || '0').replace(/[$,£€\s]/g, '').trim();
      let signedAmount = 0;

      // Handle accounting format (negative in parentheses)
      if (cleanedAmount.startsWith('(') && cleanedAmount.endsWith(')')) {
        signedAmount = -Math.abs(parseFloat(cleanedAmount.slice(1, -1)) || 0);
        type = 'expense';
      } else {
        signedAmount = parseFloat(cleanedAmount) || 0;
        type = signedAmount < 0 ? 'expense' : 'income';
      }

      // Parse date
      const parsedDate = this.parseDate(dateVal);

      return {
        id: `tx_${index}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        date: parsedDate,
        description: descVal || 'No description',
        category: categoryVal || 'Uncategorized',
        amount: Math.abs(signedAmount),
        signedAmount,
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

    const headerRow = sampleData[0] || [];
    const hasHeader = this.isLikelyHeaderRow(headerRow, sampleData.slice(1));
    const maxColumns = Math.max(
      headerRow.length,
      0,
      ...sampleData.map(row => row.length)
    );

    const headers = hasHeader
      ? headerRow
      : Array.from({ length: maxColumns }, () => '');
    const dataRows = hasHeader ? sampleData.slice(1) : sampleData;

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
    const sheets: SheetData[] = [];

    for (const sheetName of sheetNames) {
      try {
        const data = await this.fetchSheetData(spreadsheetId, sheetName);
        const sheetData = this.normalizeSheetData(sheetName, data);
        if (sheetData) {
          sheets.push(sheetData);
        }
      } catch (error) {
        console.warn(`Failed to import sheet ${sheetName}:`, error);
      }
    }

    if (sheets.length === 0) return [];

    const parsedFile: ParsedFile = {
      sheets,
      inferredMapping: {
        dateColumn: null,
        descriptionColumn: null,
        amountColumn: null,
        categoryColumn: null,
        headers: [],
      },
      summaryMapping: null,
      mixedAnalysis: null,
      detectedFormat: 'transaction',
    };

    return xlsxParser.parseAllSheets(parsedFile, sheetNames);
  }
}

export const googleSheetsService = new GoogleSheetsService();
