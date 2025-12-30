import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import * as SecureStore from 'expo-secure-store';
import { Transaction, GoogleSheetsConfig } from '../types/budget';

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID';
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly'];

const discovery = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};

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

  getAuthRequest() {
    return AuthSession.useAuthRequest(
      {
        clientId: GOOGLE_CLIENT_ID,
        scopes: SCOPES,
        redirectUri: AuthSession.makeRedirectUri({
          scheme: 'budget-tracker',
        }),
      },
      discovery
    );
  }

  async fetchSpreadsheetData(
    spreadsheetId: string,
    range: string
  ): Promise<string[][]> {
    const token = this.accessToken || (await this.getStoredToken());
    if (!token) {
      throw new Error('Not authenticated with Google');
    }

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
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

  parseTransactions(rows: string[][], hasHeader: boolean = true): Transaction[] {
    const dataRows = hasHeader ? rows.slice(1) : rows;

    return dataRows.map((row, index) => {
      const amount = parseFloat(row[3] || '0');
      return {
        id: `tx_${index}_${Date.now()}`,
        date: row[0] || '',
        description: row[1] || '',
        category: row[2] || 'Uncategorized',
        amount: Math.abs(amount),
        type: amount < 0 ? 'expense' : 'income',
      };
    }).filter(tx => tx.date && tx.amount !== 0);
  }
}

export const googleSheetsService = new GoogleSheetsService();
