import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import type * as SecureStoreType from 'expo-secure-store';
import { Transaction } from '../types/budget';
import { xlsxParser, SheetData, ParsedFile, ParseResult } from './xlsxParser';
import {
  findHeaderRowIndex,
  getRowMetrics,
  inferSchema as inferSheetSchema,
  looksLikeDateValue,
  resolveCategoryValue,
  resolveTypeFromCategory,
} from './googleSheetsSchema';

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_WEB_CLIENT_ID = '907648461438-2q8au98sdpogg0hiu3sc9g5o3uruhqmf.apps.googleusercontent.com';
const GOOGLE_IOS_CLIENT_ID = '907648461438-lttve08jch0tc7639k16hill7smkbqur.apps.googleusercontent.com';
const GOOGLE_ANDROID_CLIENT_ID = '';
const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
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

export type WriteMode = 'auto' | 'grid' | 'transaction';

export interface WriteResult {
  mode: 'grid' | 'transaction';
  cellRef?: string;
  rowIndex?: number;
  range?: string;
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
    const clientId = this.getClientIdForPlatform();

    // URLSearchParams doesn't serialize correctly on React Native, use manual form encoding
    const formBody = [
      `client_id=${encodeURIComponent(clientId)}`,
      `grant_type=refresh_token`,
      `refresh_token=${encodeURIComponent(refreshToken)}`,
    ].join('&');

    const response = await fetch(discovery.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'unknown', error_description: response.statusText }));
      throw new Error(`Token refresh failed: ${errorData.error_description || errorData.error || 'Unknown error'}`);
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

  private async requestWithAuth(url: string, init: RequestInit = {}): Promise<Response> {
    const token = await this.getToken();
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    const response = await fetch(url, { ...init, headers });
    if (response.status !== 401) return response;

    const stored = await this.getStoredToken();
    if (!stored?.refreshToken) {
      return response;
    }

    const refreshed = await this.refreshAccessToken(stored.refreshToken);
    await this.storeToken(refreshed.accessToken, stored.refreshToken, refreshed.expiresIn);
    const retryHeaders = new Headers(init.headers);
    retryHeaders.set('Authorization', `Bearer ${refreshed.accessToken}`);
    return fetch(url, { ...init, headers: retryHeaders });
  }

  // List all spreadsheets from Google Drive
  async listSpreadsheets(query?: string): Promise<SpreadsheetFile[]> {
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

    const response = await this.requestWithAuth(url);

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Authentication expired. Please sign in again.');
      }
      throw new Error(`Failed to list spreadsheets: ${response.statusText}`);
    }

    const data = await response.json();
    return data.files || [];
  }

  async getCategoryNames(
    spreadsheetId: string,
    sheetName = 'Category Names'
  ): Promise<string[]> {
    const values = await this.fetchSheetData(spreadsheetId, sheetName, 'A1:A300');
    if (!values.length) return [];
    const headerRowIndex = findHeaderRowIndex(values);
    const startIndex = headerRowIndex !== null ? headerRowIndex + 1 : 0;
    const names = values
      .slice(startIndex)
      .map((row) => String(row[0] ?? '').trim())
      .filter(Boolean);
    return Array.from(new Set(names));
  }

  // Get all sheets in a spreadsheet
  async getSpreadsheetInfo(spreadsheetId: string): Promise<SheetInfo[]> {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`;

    const response = await this.requestWithAuth(url);

    if (!response.ok) {
      if (response.status === 401) {
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
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=properties.title,sheets.properties`;

    const response = await this.requestWithAuth(url);

    if (!response.ok) {
      if (response.status === 401) {
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

  /**
   * Parse a formula string like "=-25-50+10" into component numbers [-25, -50, 10]
   */
  parseFormulaBreakdown(formula: string): number[] | null {
    if (!formula || typeof formula !== 'string') return null;

    // Only parse if it looks like a formula (starts with =)
    if (!formula.startsWith('=')) return null;

    // Remove the leading = and any spaces
    const expr = formula.substring(1).replace(/\s/g, '');

    // Match numbers with their signs (handles =-25-50+10)
    // This regex matches: optional sign at start, then number, then (sign + number) groups
    const matches = expr.match(/^(-?\d+\.?\d*)([-+]\d+\.?\d*)*$/);
    if (!matches) return null;

    // Split by keeping the sign with the number
    const parts = expr.match(/-?\d+\.?\d*/g);
    if (!parts || parts.length <= 1) return null;

    return parts.map(p => parseFloat(p));
  }

  /**
   * Fetch sheet data with both values and formulas
   * Returns an object with values array and formulas array
   */
  async fetchSheetDataWithFormulas(
    spreadsheetId: string,
    sheetName: string,
    range?: string
  ): Promise<{ values: string[][]; formulas: string[][] }> {
    // Fetch values
    const values = await this.fetchSheetData(spreadsheetId, sheetName, range);

    // Fetch formulas
    const formulas = await this.fetchSheetData(spreadsheetId, sheetName, range, {
      valueRenderOption: 'FORMULA',
    });

    return { values, formulas };
  }

  // Fetch data from a specific sheet
  async fetchSheetData(
    spreadsheetId: string,
    sheetName: string,
    range?: string,
    options?: { valueRenderOption?: 'FORMATTED_VALUE' | 'UNFORMATTED_VALUE' | 'FORMULA' }
  ): Promise<string[][]> {
    const fullRange = range ? `'${sheetName}'!${range}` : `'${sheetName}'`;
    const query = new URLSearchParams();
    if (options?.valueRenderOption) {
      query.set('valueRenderOption', options.valueRenderOption);
    }
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(fullRange)}${query.toString() ? `?${query.toString()}` : ''}`;

    const response = await this.requestWithAuth(url);

    if (!response.ok) {
      if (response.status === 401) {
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
    formulaColumns: Set<number>,
    options?: {
      dateSample?: string;
      amountStyle?: 'signed' | 'positive';
      categoryStyle?: 'type' | 'category';
    }
  ): (string | number)[] {
    const row = Array.from({ length: columnCount }, () => '');
    const signedAmount =
      typeof transaction.signedAmount === 'number'
        ? transaction.signedAmount
        : transaction.type === 'expense'
          ? -transaction.amount
          : transaction.amount; // income and rebate are positive
    const amountValue = options?.amountStyle === 'signed' ? signedAmount : transaction.amount;
    const dateValue = this.formatDateForSheet(transaction.date, options?.dateSample);

    const safeSet = (index: number | null, value: string | number) => {
      if (index === null || index < 0) return;
      if (formulaColumns.has(index)) return;
      if (index >= row.length) return;
      row[index] = value;
    };

    safeSet(mapping.dateColumn, dateValue || new Date().toISOString().split('T')[0]);
    safeSet(mapping.amountColumn, amountValue);

    // Handle category based on sheet style
    if (options?.categoryStyle === 'type') {
      // Sheet uses Income/Expense format: put type in category, category in description
      // Ignore user description - like grid format, category IS the description
      const typeValue = transaction.type === 'expense' ? 'Expense' : 'Income';
      safeSet(mapping.categoryColumn, typeValue);
      safeSet(mapping.descriptionColumn, transaction.category || '');
    } else {
      // Sheet uses actual categories: put category in category column
      safeSet(mapping.descriptionColumn, transaction.description || '');
      safeSet(mapping.categoryColumn, transaction.category || '');
    }

    return row;
  }

  private async getWriteSchema(spreadsheetId: string, sheetName: string): Promise<{
    mapping: ColumnMapping;
    columnCount: number;
    formulaColumns: Set<number>;
    headerRowIndex: number | null;
    dateSample?: string;
    amountStyle?: 'signed' | 'positive';
    categoryStyle?: 'type' | 'category'; // 'type' = Income/Expense, 'category' = actual categories
  }> {
    // Fetch with FORMULA to detect formula columns
    const sampleData = await this.fetchSheetData(spreadsheetId, sheetName, 'A1:Z20', {
      valueRenderOption: 'FORMULA',
    });
    // Also fetch with FORMATTED_VALUE to get actual date format
    const formattedData = await this.fetchSheetData(spreadsheetId, sheetName, 'A1:Z20', {
      valueRenderOption: 'FORMATTED_VALUE',
    });
    const headerRowIndex = findHeaderRowIndex(sampleData);
    const hasHeader = headerRowIndex !== null;
    const headerRow = hasHeader ? sampleData[headerRowIndex] || [] : sampleData[0] || [];
    const maxColumns = Math.max(
      headerRow.length,
      0,
      ...sampleData.map(row => row.length)
    );

    const headers = hasHeader
      ? headerRow
      : Array.from({ length: maxColumns }, () => '');
    const dataRows = sampleData.slice(hasHeader ? headerRowIndex + 1 : 0);
    const formattedDataRows = formattedData.slice(hasHeader ? headerRowIndex + 1 : 0);
    const mapping = inferSheetSchema(headers, dataRows);
    const formulaColumns = new Set<number>();
    const sampleRow = dataRows.find(row => row.some(cell => String(cell ?? '').trim().length > 0)) || [];
    const sampleRowIndex = dataRows.findIndex(row => row.some(cell => String(cell ?? '').trim().length > 0));
    const formattedSampleRow = formattedDataRows[sampleRowIndex] || [];
    // Use formatted value for date sample to get actual display format (not Excel serial)
    const dateSample =
      mapping.dateColumn !== null ? String(formattedSampleRow[mapping.dateColumn] ?? '').trim() : '';
    const amountSample =
      mapping.amountColumn !== null ? String(sampleRow[mapping.amountColumn] ?? '').trim() : '';
    const amountStyle: 'signed' | 'positive' =
      /-\d|\(\d/.test(amountSample) ? 'signed' : 'positive';

    // Detect category style by scanning existing category values
    let categoryStyle: 'type' | 'category' = 'category';
    if (mapping.categoryColumn !== null) {
      let typeMatchCount = 0;
      const samplesToCheck = dataRows.slice(0, 10);
      for (const row of samplesToCheck) {
        const val = String(row[mapping.categoryColumn] ?? '').toLowerCase().trim();
        if (val === 'income' || val === 'expense' || val === 'expenses') {
          typeMatchCount++;
        }
      }
      // If majority of rows have Income/Expense, it's 'type' style
      if (typeMatchCount >= samplesToCheck.length * 0.5) {
        categoryStyle = 'type';
      }
    }

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
      headerRowIndex,
      dateSample,
      amountStyle,
      categoryStyle,
    };
  }

  private formatDateForSheet(dateValue: string, sample?: string): string {
    if (!dateValue) return '';
    if (!sample) return dateValue;
    const trimmed = sample.trim();

    const parsed = new Date(dateValue);
    if (isNaN(parsed.getTime())) return dateValue;
    const month = parsed.getMonth() + 1;
    const day = parsed.getDate();
    const year = parsed.getFullYear();

    console.log('[formatDateForSheet] Input:', dateValue, 'Sample:', sample, 'Trimmed:', trimmed);

    // Handle slash format (D/M/YYYY or M/D/YYYY)
    if (trimmed.includes('/')) {
      const sampleParts = trimmed.split('/');
      const firstNum = parseInt(sampleParts[0], 10);
      const secondNum = parseInt(sampleParts[1], 10);

      // If first number > 12, it's definitely DD/MM
      // If second number > 12, it's definitely MM/DD
      // If ambiguous, check if first > second (DD/MM common pattern)
      const isDayFirst = firstNum > 12 || (firstNum <= 12 && secondNum <= 12 && firstNum > secondNum);

      if (isDayFirst) {
        return `${day}/${month}/${year}`; // DD/MM/YYYY
      } else {
        return `${month}/${day}/${year}`; // MM/DD/YYYY
      }
    }

    // Handle long weekday format like "Wednesday, September 10, 2025"
    if (/[A-Za-z]+,\s+[A-Za-z]+\s+\d+,\s+\d{4}/.test(trimmed)) {
      const months = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
      const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const weekday = weekdays[parsed.getDay()];
      const monthName = months[parsed.getMonth()];
      return `${weekday}, ${monthName} ${day}, ${year}`;
    }

    // Handle dash format (YYYY-MM-DD or DD-MM-YYYY)
    if (trimmed.includes('-')) {
      const sampleParts = trimmed.split('-');
      // If first part is 4 digits, it's YYYY-MM-DD (ISO)
      if (sampleParts[0].length === 4) {
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
      // Otherwise assume DD-MM-YYYY
      return `${day}-${month}-${year}`;
    }

    return dateValue;
  }

  private async findNextWriteRow(
    spreadsheetId: string,
    sheetName: string,
    columnIndex: number,
    headerRowIndex: number | null
  ): Promise<number> {
    const columnLetter = this.columnIndexToLetter(columnIndex);
    const values = await this.fetchSheetData(spreadsheetId, sheetName, `${columnLetter}1:${columnLetter}`);
    const startIndex = headerRowIndex !== null ? headerRowIndex + 1 : 0;
    let lastRowIndex = headerRowIndex ?? -1;
    for (let i = startIndex; i < values.length; i += 1) {
      const cell = String(values[i]?.[0] ?? '').trim();
      if (cell) {
        lastRowIndex = i;
      }
    }
    return lastRowIndex + 1;
  }

  private columnIndexToLetter(index: number): string {
    let result = '';
    let column = index + 1;
    while (column > 0) {
      const mod = (column - 1) % 26;
      result = String.fromCharCode(65 + mod) + result;
      column = Math.floor((column - 1) / 26);
    }
    return result;
  }

  private parseRowFromRange(range?: string): number | undefined {
    if (!range) return undefined;
    const match = range.match(/!([A-Z]+)(\d+)(?::[A-Z]+(\d+))?/i);
    if (!match) return undefined;
    const row = parseInt(match[2], 10);
    if (isNaN(row)) return undefined;
    return Math.max(0, row - 1);
  }

  private parseAmountValue(value: string): number {
    if (!value) return 0;
    const cleaned = String(value).replace(/[$,£€\s]/g, '').trim();
    if (!cleaned) return 0;
    if (cleaned.startsWith('(') && cleaned.endsWith(')')) {
      return -Math.abs(parseFloat(cleaned.slice(1, -1)) || 0);
    }
    return parseFloat(cleaned) || 0;
  }

  private formatDateKey(year: number, monthIndex: number, day: number): string {
    const yyyy = String(year).padStart(4, '0');
    const mm = String(monthIndex + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  private isMonthToken(value: string): number | null {
    const token = value.toLowerCase().trim();
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec'];
    const index = months.indexOf(token);
    if (index >= 0) return index;
    return null;
  }

  private parseYearMonthToken(value: string): number | null {
    const match = value.trim().match(/^(\d{4})[\/\-](\d{1,2})$/);
    if (!match) return null;
    const month = parseInt(match[2], 10);
    if (isNaN(month) || month < 1 || month > 12) return null;
    return month - 1;
  }

  private parseGridDate(
    value: string,
    currentMonth: number | null,
    year: number,
    preferDayFirst: boolean
  ): string | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const monthIndex = this.isMonthToken(trimmed);
    if (monthIndex !== null) return null;

    if (/^\d{4}[\/\-]\d{1,2}$/.test(trimmed)) {
      return null;
    }

    const serial = parseFloat(trimmed);
    if (!isNaN(serial) && serial > 30000 && serial < 100000) {
      const epoch = new Date(Date.UTC(1899, 11, 30));
      const date = new Date(epoch.getTime() + serial * 86400000);
      return this.formatDateKey(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate()
      );
    }

    const parts = trimmed.split(/[\/\-]/).map(p => p.trim());
    if (parts.length >= 2) {
      const first = parseInt(parts[0], 10);
      const second = parseInt(parts[1], 10);
      const third = parts.length >= 3 ? parseInt(parts[2], 10) : year;
      if (isNaN(first) || isNaN(second)) return null;

      let month = 0;
      let day = 0;
      if (first > 12) {
        day = first;
        month = second;
      } else if (second > 12) {
        month = first;
        day = second;
      } else if (preferDayFirst) {
        day = first;
        month = second;
      } else {
        month = first;
        day = second;
      }

      const fullYear = third < 100 ? 2000 + third : third;
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
        return this.formatDateKey(fullYear, month - 1, day);
      }
    }

    if (currentMonth !== null) {
      const day = parseInt(trimmed, 10);
      if (!isNaN(day) && day >= 1 && day <= 31) {
        return this.formatDateKey(year, currentMonth, day);
      }
    }

    return null;
  }

  private detectGridLayout(data: string[][]): {
    categoryColumns: Map<string, number>;
    monthRows: Map<number, number>;
  } | null {
    if (!data || data.length < 4) return null;
    const headerRowIndex = this.findGridHeaderRowIndex(data);
    const header = (data[headerRowIndex] || []).map(cell => String(cell ?? '').trim());

    // Check for transaction-log headers FIRST - if present, this is NOT a grid layout
    const lowerHeaders = header.map(h => h.toLowerCase());
    const hasDateHeader = lowerHeaders.some(h => /^(date|time|posted|transaction\s*date)$/.test(h));
    const hasDescHeader = lowerHeaders.some(h => /^(description|desc|memo|note|payee|merchant)$/.test(h));
    const hasAmountHeader = lowerHeaders.some(h => /^(amount|total|sum|price|cost|value|credit|debit|deposit)$/.test(h));
    // If 2+ transaction-log headers found, treat as transaction format
    if ([hasDateHeader, hasDescHeader, hasAmountHeader].filter(Boolean).length >= 2) {
      return null;
    }


    const scanRows = data.slice(headerRowIndex + 1, headerRowIndex + 40);
    const monthRowCount = scanRows.filter((row) => {
      const label = String(row[0] ?? '').trim();
      return this.isMonthToken(label) !== null || this.parseYearMonthToken(label) !== null;
    }).length;
    const dateRowCount = scanRows.filter((row) => {
      const label = String(row[0] ?? '').trim();
      return looksLikeDateValue(label);
    }).length;

    // Skip grid detection if not enough month/date rows found
    if (monthRowCount < 3 && dateRowCount < 5) return null;

    const aggregateNames = new Set(['expense', 'expenses', 'income', 'net', 'net profit', 'total', 'balance', 'sum']);
    const categoryColumns = new Map<string, number>();
    header.forEach((name, index) => {
      const trimmed = name.trim();
      if (index === 0 || !trimmed) return;
      const lower = trimmed.toLowerCase();
      if (aggregateNames.has(lower)) return;
      categoryColumns.set(lower, index);
    });
    if (categoryColumns.size === 0) return null;

    const monthRows = new Map<number, number>();

    data.forEach((row, rowIndex) => {
      if (rowIndex === headerRowIndex) return;
      const label = String(row[0] ?? '').trim();
      if (!label) return;
      const monthIndex = this.isMonthToken(label) ?? this.parseYearMonthToken(label);
      if (monthIndex !== null) {
        monthRows.set(monthIndex, rowIndex);
      }
    });

    return { categoryColumns, monthRows };
  }

  private findGridHeaderRowIndex(data: string[][]): number {
    let bestIndex = 0;
    let bestScore = -1;

    for (let i = 0; i < Math.min(5, data.length); i += 1) {
      const row = data[i] || [];
      const metrics = getRowMetrics(row);
      if (metrics.nonEmpty === 0) continue;
      const score = metrics.textCount - metrics.numericCount;
      if (metrics.textCount >= 2 && score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }

    return bestIndex;
  }

  private detectDayFirstInGrid(data: string[][]): boolean {
    const candidates = data.slice(1, 60).map(row => String(row[0] ?? '').trim());
    const dayFirstMatches = candidates.filter(value =>
      /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}$/.test(value)
    ).length;
    if (dayFirstMatches === 0) return false;
    const ambiguousMatches = candidates.filter(value =>
      /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}$/.test(value)
    ).length;
    return dayFirstMatches >= Math.max(1, Math.floor(ambiguousMatches * 0.6));
  }

  async detectWriteMode(
    spreadsheetId: string,
    sheetName: string
  ): Promise<'grid' | 'transaction'> {
    const gridData = await this.fetchSheetData(spreadsheetId, sheetName, 'A1:Z200', {
      valueRenderOption: 'FORMULA',
    });
    const layout = this.detectGridLayout(gridData);
    return layout ? 'grid' : 'transaction';
  }

  private async updateGridCell(
    spreadsheetId: string,
    sheetName: string,
    transaction: Transaction
  ): Promise<{ cellRef: string; rowIndex: number } | null> {
    const gridData = await this.fetchSheetData(spreadsheetId, sheetName, 'A1:Z500', {
      valueRenderOption: 'FORMULA',
    });
    const layout = this.detectGridLayout(gridData);
    if (!layout) return null;

    const preferDayFirst = this.detectDayFirstInGrid(gridData);
    const categoryKey = transaction.category.toLowerCase().trim();
    const colIndex = layout.categoryColumns.get(categoryKey);
    if (colIndex === undefined) {
      throw new Error(`Category "${transaction.category}" not found in ${sheetName}.`);
    }

    const txDate = new Date(transaction.date);
    if (isNaN(txDate.getTime())) {
      throw new Error('Invalid transaction date.');
    }
    const dateParts = transaction.date.split('-').map(part => parseInt(part, 10));
    const [txYear, txMonth, txDay] = dateParts.length >= 3 ? dateParts : [
      txDate.getFullYear(),
      txDate.getMonth() + 1,
      txDate.getDate(),
    ];
    const monthIndex = txMonth - 1;
    let rowIndex: number | undefined;

    if (transaction.type === 'income') {
      rowIndex = layout.monthRows.get(monthIndex);
      if (rowIndex === undefined) {
        throw new Error(`Month row not found in ${sheetName}.`);
      }
    } else {
      let currentMonth: number | null = null;
      const targetDate = this.formatDateKey(txYear, monthIndex, txDay);
      for (let i = 1; i < gridData.length; i += 1) {
        const label = String(gridData[i]?.[0] ?? '').trim();
        if (!label) continue;
        const monthToken = this.isMonthToken(label);
        if (monthToken !== null) {
          currentMonth = monthToken;
          continue;
        }
        const dateKey = this.parseGridDate(label, currentMonth, txDate.getFullYear(), preferDayFirst);
        if (dateKey === targetDate) {
          rowIndex = i;
          break;
        }
      }

      if (rowIndex === undefined) {
        throw new Error(`Date row not found in ${sheetName}.`);
      }
    }

    const currentRaw = String(gridData[rowIndex]?.[colIndex] ?? '').trim();
    const signedAmount =
      typeof transaction.signedAmount === 'number'
        ? transaction.signedAmount
        : transaction.type === 'expense'
          ? -transaction.amount
          : transaction.amount; // income and rebate are positive
    // Rebate uses + operator (credit), expense uses - operator
    const op = transaction.type === 'expense' ? '-' : '+';
    const breakdown = transaction.breakdownAmounts?.length
      ? transaction.breakdownAmounts
      : [Math.abs(signedAmount)];
    let nextValue: string | number;

    if (currentRaw.startsWith('=')) {
      nextValue = breakdown.reduce(
        (formula, value) => `${formula}${op}${Math.abs(value)}`,
        currentRaw
      );
    } else if (!currentRaw) {
      nextValue = breakdown.reduce(
        (formula, value) => `${formula}${op}${Math.abs(value)}`,
        '='
      );
    } else {
      const currentValue = this.parseAmountValue(currentRaw);
      nextValue = breakdown.reduce(
        (formula, value) => `${formula}${op}${Math.abs(value)}`,
        `=${currentValue}`
      );
    }
    const cellRef = `${this.columnIndexToLetter(colIndex)}${rowIndex + 1}`;
    const range = `'${sheetName}'!${cellRef}`;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?` +
      new URLSearchParams({
        valueInputOption: 'USER_ENTERED',
      }).toString();
    const response = await this.requestWithAuth(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values: [[nextValue]] }),
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Authentication expired. Please sign in again.');
      }
      const text = await response.text();
      throw new Error(`Failed to update cell: ${text || response.statusText}`);
    }

    return { cellRef, rowIndex };
  }

  async appendTransaction(
    spreadsheetId: string,
    sheetName: string,
    transaction: Transaction,
    options?: { writeMode?: WriteMode }
  ): Promise<WriteResult> {
    const writeMode = options?.writeMode ?? 'auto';
    if (writeMode !== 'transaction') {
      try {
        const updated = await this.updateGridCell(spreadsheetId, sheetName, transaction);
        if (updated) {
          return { mode: 'grid', cellRef: updated.cellRef, rowIndex: updated.rowIndex };
        }
        if (writeMode === 'grid') {
          throw new Error('Grid layout not detected for this sheet.');
        }
      } catch (error) {
        if (writeMode === 'grid') {
          throw error;
        }
        const message = error instanceof Error ? error.message : '';
        const shouldFallback = /category .*not found|grid layout not detected|date row not found|month row not found/i.test(message);
        if (!shouldFallback) {
          throw error;
        }
      }
    }

    const { mapping, columnCount, formulaColumns, headerRowIndex, dateSample, amountStyle, categoryStyle } =
      await this.getWriteSchema(spreadsheetId, sheetName);

    if (mapping.amountColumn === null && mapping.dateColumn === null && mapping.descriptionColumn === null) {
      throw new Error('Could not detect a column mapping for this sheet.');
    }

    const row = this.buildAppendRow(mapping, transaction, columnCount, formulaColumns, {
      dateSample,
      amountStyle,
      categoryStyle,
    });
    const fallbackColumn =
      mapping.dateColumn ?? mapping.descriptionColumn ?? mapping.amountColumn ?? mapping.categoryColumn ?? 0;
    const targetRowIndex = await this.findNextWriteRow(
      spreadsheetId,
      sheetName,
      fallbackColumn,
      headerRowIndex
    );
    const lastColumnLetter = this.columnIndexToLetter(columnCount - 1);
    const range = `'${sheetName}'!A${targetRowIndex + 1}:${lastColumnLetter}${targetRowIndex + 1}`;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?` +
      new URLSearchParams({
        valueInputOption: 'USER_ENTERED',
      }).toString();

    const response = await this.requestWithAuth(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values: [row] }),
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Authentication expired. Please sign in again.');
      }
      const text = await response.text();
      throw new Error(`Failed to append row: ${text || response.statusText}`);
    }
    const data = await response.json().catch(() => null);
    const updatedRange = data?.updatedRange || data?.updates?.updatedRange || range;
    const rowIndex = this.parseRowFromRange(updatedRange) ?? targetRowIndex;

    return { mode: 'transaction', range: updatedRange, rowIndex };
  }

  private normalizeSheetData(sheetName: string, data: string[][]): SheetData | null {
    if (!data || data.length === 0) return null;
    const maxColumns = Math.max(0, ...data.map(row => row.length));
    const headerRowIndex = findHeaderRowIndex(data);
    const hasHeader = headerRowIndex !== null;
    const headerRow = hasHeader ? data[headerRowIndex] || [] : data[0] || [];
    const headers = hasHeader
      ? Array.from({ length: maxColumns }, (_, index) => String(headerRow[index] ?? ''))
      : Array.from({ length: maxColumns }, () => '');
    const dataRows = data.slice(hasHeader ? headerRowIndex + 1 : 0);
    const rows = dataRows.map(row =>
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
      const categoryVal = mapping.categoryColumn !== null ? row[mapping.categoryColumn] : '';

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
        const categoryType = resolveTypeFromCategory(categoryVal);
        if (categoryType) {
          type = categoryType;
        } else {
          // For transaction-log format: positive amounts = expense (typical budget behavior)
          // Negative amounts = income/refund
          type = signedAmount >= 0 ? 'expense' : 'income';
        }
      }

      // Parse date
      const parsedDate = this.parseDate(dateVal);
      const resolvedCategory = resolveCategoryValue(categoryVal, descVal);
      const normalizedSignedAmount = type === 'expense' ? -Math.abs(signedAmount) : Math.abs(signedAmount);

      return {
        id: `tx_${index}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        date: parsedDate,
        description: descVal || 'No description',
        category: resolvedCategory || 'Uncategorized',
        amount: Math.abs(normalizedSignedAmount),
        signedAmount: normalizedSignedAmount,
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

    const headerRowIndex = findHeaderRowIndex(sampleData);
    const hasHeader = headerRowIndex !== null;
    const headerRow = hasHeader ? sampleData[headerRowIndex] || [] : sampleData[0] || [];
    const maxColumns = Math.max(
      headerRow.length,
      0,
      ...sampleData.map(row => row.length)
    );

    const headers = hasHeader
      ? headerRow
      : Array.from({ length: maxColumns }, () => '');
    const dataRows = sampleData.slice(hasHeader ? headerRowIndex + 1 : 0);

    const columns = inferSheetSchema(headers, dataRows);

    return {
      sheets,
      columns,
      sampleData: sampleData.slice(0, 6),
    };
  }

  // Get the last modified time of a spreadsheet from Google Drive
  async getSpreadsheetModifiedTime(spreadsheetId: string): Promise<string | null> {
    const url = `https://www.googleapis.com/drive/v3/files/${spreadsheetId}?fields=modifiedTime`;

    const response = await this.requestWithAuth(url);

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Authentication expired. Please sign in again.');
      }
      return null;
    }

    const data = await response.json();
    return data.modifiedTime || null;
  }

  // Check if spreadsheet has updates since last sync
  async checkForUpdates(spreadsheetId: string, lastSyncTime: string | null): Promise<boolean> {
    if (!lastSyncTime) return true; // Always sync if never synced

    const modifiedTime = await this.getSpreadsheetModifiedTime(spreadsheetId);
    if (!modifiedTime) return false; // Can't determine, skip sync

    const lastSync = new Date(lastSyncTime).getTime();
    const lastModified = new Date(modifiedTime).getTime();

    return lastModified > lastSync;
  }

  // Import all data from multiple sheets with formula breakdowns
  async importAllSheets(
    spreadsheetId: string,
    sheetNames: string[]
  ): Promise<Transaction[]> {
    const sheets: SheetData[] = [];
    const formulasBySheet: Map<string, string[][]> = new Map();

    for (const sheetName of sheetNames) {
      try {
        const { values, formulas } = await this.fetchSheetDataWithFormulas(spreadsheetId, sheetName);
        const sheetData = this.normalizeSheetData(sheetName, values);
        if (sheetData) {
          sheets.push(sheetData);
          formulasBySheet.set(sheetName, formulas);
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

    const transactions = xlsxParser.parseAllSheets(parsedFile, sheetNames);

    // Post-process: add formula breakdowns to transactions (only for grid format)
    for (const tx of transactions) {
      // Parse row and column index from transaction ID - match last two number groups before timestamp
      // Looking for patterns: xlsx_[anything]_{row}_{col}_{timestamp}
      const idParts = tx.id.split('_');
      let rowIdx: number | null = null;
      let colIdx: number | null = null;

      // Find two consecutive numeric parts (row and col) before the timestamp
      for (let i = 1; i < idParts.length - 2; i++) {
        const maybeRow = parseInt(idParts[i], 10);
        const maybeCol = parseInt(idParts[i + 1], 10);
        if (!isNaN(maybeRow) && !isNaN(maybeCol)) {
          rowIdx = maybeRow;
          colIdx = maybeCol;
          break;
        }
      }

      if (rowIdx === null || colIdx === null) continue;

      // Find the sheet this transaction belongs to (by category column header)
      for (const sheet of sheets) {
        const formulas = formulasBySheet.get(sheet.name);
        if (!formulas) continue;

        // Check if this sheet has the category column
        const headers = sheet.headers;
        if (headers[colIdx] !== tx.category) continue;

        // Get the formula at this cell
        const formulaRow = formulas[rowIdx + 1]; // +1 because row 0 is headers
        if (!formulaRow) continue;

        const cellFormula = formulaRow[colIdx];
        if (!cellFormula || typeof cellFormula !== 'string') continue;

        // Parse the formula into breakdown
        const breakdown = this.parseFormulaBreakdown(cellFormula);
        if (breakdown && breakdown.length > 1) {
          tx.breakdownAmounts = breakdown.map(n => Math.abs(n));
        }
        break; // Found the sheet, no need to continue
      }
    }

    return transactions;
  }

  // Import all data from multiple sheets WITH confidence scoring
  async importAllSheetsWithConfidence(
    spreadsheetId: string,
    sheetNames: string[]
  ): Promise<ParseResult> {
    const sheets: SheetData[] = [];
    const formulasBySheet: Map<string, string[][]> = new Map();

    for (const sheetName of sheetNames) {
      try {
        const { values, formulas } = await this.fetchSheetDataWithFormulas(spreadsheetId, sheetName);
        const sheetData = this.normalizeSheetData(sheetName, values);
        if (sheetData) {
          sheets.push(sheetData);
          formulasBySheet.set(sheetName, formulas);
        }
      } catch (error) {
        console.warn(`Failed to import sheet ${sheetName}:`, error);
      }
    }

    if (sheets.length === 0) {
      return {
        transactions: [],
        confidence: {
          level: 'low',
          score: 0,
          issues: [{ type: 'unsupported_layout', message: 'No valid sheets found', severity: 'error' }]
        }
      };
    }

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

    // Use the confidence-aware parser
    const result = xlsxParser.parseAllSheetsWithConfidence(parsedFile, sheetNames);

    // Post-process: add formula breakdowns to transactions (only for grid format)
    for (const tx of result.transactions) {
      const idParts = tx.id.split('_');
      let rowIdx: number | null = null;
      let colIdx: number | null = null;

      for (let i = 1; i < idParts.length - 2; i++) {
        const maybeRow = parseInt(idParts[i], 10);
        const maybeCol = parseInt(idParts[i + 1], 10);
        if (!isNaN(maybeRow) && !isNaN(maybeCol)) {
          rowIdx = maybeRow;
          colIdx = maybeCol;
          break;
        }
      }

      if (rowIdx === null || colIdx === null) continue;

      for (const sheet of sheets) {
        const formulas = formulasBySheet.get(sheet.name);
        if (!formulas) continue;
        const headers = sheet.headers;
        if (headers[colIdx] !== tx.category) continue;
        const formulaRow = formulas[rowIdx + 1];
        if (!formulaRow) continue;
        const cellFormula = formulaRow[colIdx];
        if (!cellFormula || typeof cellFormula !== 'string') continue;
        const breakdown = this.parseFormulaBreakdown(cellFormula);
        if (breakdown && breakdown.length > 1) {
          tx.breakdownAmounts = breakdown.map(n => Math.abs(n));
        }
        break;
      }
    }

    return result;
  }
}

export const googleSheetsService = new GoogleSheetsService();

/**
 * Extract spreadsheet ID from a Google Sheets URL
 * Supports formats:
 * - https://docs.google.com/spreadsheets/d/{ID}/edit
 * - https://docs.google.com/spreadsheets/d/{ID}/edit#gid=0
 * - https://docs.google.com/spreadsheets/d/{ID}
 * - Just the raw ID (44 char alphanumeric)
 */
export function extractSpreadsheetId(input: string): string | null {
  const trimmed = String(input ?? '').trim();
  if (!trimmed) return null;

  // Check if it's already just an ID (alphanumeric + dashes/underscores, ~44 chars)
  if (/^[a-zA-Z0-9_-]{20,60}$/.test(trimmed) && !trimmed.includes('/')) {
    return trimmed;
  }

  // Extract from URL pattern: /spreadsheets/d/{ID}/
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return match[1];
  }

  const looseMatch = trimmed.match(/\/d\/([a-zA-Z0-9_-]{20,})/);
  if (looseMatch && looseMatch[1]) {
    return looseMatch[1];
  }

  const parts = trimmed.split('/');
  const partMatch = parts.find((part) => /^[a-zA-Z0-9_-]{20,}$/.test(part));
  if (partMatch) {
    return partMatch;
  }

  return null;
}
