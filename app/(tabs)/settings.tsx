import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { googleSheetsService, SheetInfo, ColumnMapping } from '../../src/services/googleSheets';
import { useBudgetStore } from '../../src/store/budgetStore';

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_CLIENT_ID = '907648461438-lttve08jch0tc7639k16hill7smkbqur.apps.googleusercontent.com';

const discovery = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};

export default function Settings() {
  const [spreadsheetId, setSpreadsheetId] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [sheets, setSheets] = useState<SheetInfo[]>([]);
  const [selectedSheets, setSelectedSheets] = useState<string[]>([]);
  const [schema, setSchema] = useState<ColumnMapping | null>(null);

  const { setSheetsConfig, setTransactions, sheetsConfig } = useBudgetStore();

  // Set up Google OAuth
  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: GOOGLE_CLIENT_ID,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
      responseType: AuthSession.ResponseType.Token,
    },
    discovery
  );

  // Check for stored token on mount
  useEffect(() => {
    checkStoredToken();
  }, []);

  // Handle OAuth response
  useEffect(() => {
    if (response?.type === 'success') {
      const { access_token } = response.params;
      handleAuthSuccess(access_token);
    } else if (response?.type === 'error') {
      Alert.alert('Authentication Error', response.error?.message || 'Failed to sign in');
    }
  }, [response]);

  const checkStoredToken = async () => {
    const token = await googleSheetsService.getStoredToken();
    if (token) {
      setIsConnected(true);
      if (sheetsConfig.spreadsheetId) {
        setSpreadsheetId(sheetsConfig.spreadsheetId);
      }
    }
  };

  const handleAuthSuccess = async (accessToken: string) => {
    await googleSheetsService.storeToken(accessToken);
    setIsConnected(true);
    setSheetsConfig({ isConnected: true });
    Alert.alert('Success', 'Connected to Google!');
  };

  const handleConnect = async () => {
    if (isConnected) {
      // Disconnect
      await googleSheetsService.clearToken();
      setIsConnected(false);
      setSheets([]);
      setSchema(null);
      setSheetsConfig({ isConnected: false, spreadsheetId: '' });
      Alert.alert('Disconnected', 'Signed out from Google');
    } else {
      // Connect
      promptAsync();
    }
  };

  const handleAnalyze = async () => {
    if (!spreadsheetId.trim()) {
      Alert.alert('Error', 'Please enter a Spreadsheet ID');
      return;
    }

    if (!isConnected) {
      Alert.alert('Error', 'Please sign in with Google first');
      return;
    }

    setIsLoading(true);
    try {
      const result = await googleSheetsService.analyzeSpreadsheet(spreadsheetId.trim());
      setSheets(result.sheets);
      setSchema(result.columns);
      setSelectedSheets(result.sheets.map(s => s.title));
      setSheetsConfig({ spreadsheetId: spreadsheetId.trim() });

      const inferredFields = [];
      if (result.columns.dateColumn !== null) inferredFields.push('Date');
      if (result.columns.descriptionColumn !== null) inferredFields.push('Description');
      if (result.columns.amountColumn !== null) inferredFields.push('Amount');
      if (result.columns.categoryColumn !== null) inferredFields.push('Category');

      Alert.alert(
        'Spreadsheet Analyzed',
        `Found ${result.sheets.length} sheet(s)\n\nInferred columns: ${inferredFields.join(', ') || 'None detected'}\n\nHeaders: ${result.columns.headers.slice(0, 5).join(', ')}${result.columns.headers.length > 5 ? '...' : ''}`
      );
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to analyze spreadsheet');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSync = async () => {
    if (!spreadsheetId.trim()) {
      Alert.alert('Error', 'Please enter a Spreadsheet ID');
      return;
    }

    if (!isConnected) {
      Alert.alert('Error', 'Please sign in with Google first');
      return;
    }

    if (selectedSheets.length === 0) {
      Alert.alert('Error', 'Please analyze the spreadsheet first');
      return;
    }

    setIsLoading(true);
    try {
      const transactions = await googleSheetsService.importAllSheets(
        spreadsheetId.trim(),
        selectedSheets
      );

      setTransactions(transactions);
      Alert.alert(
        'Sync Complete',
        `Imported ${transactions.length} transactions from ${selectedSheets.length} sheet(s)`
      );
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to sync data');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleSheet = (sheetName: string) => {
    setSelectedSheets(prev =>
      prev.includes(sheetName)
        ? prev.filter(s => s !== sheetName)
        : [...prev, sheetName]
    );
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Google Account</Text>
        <View style={styles.card}>
          <View style={styles.statusRow}>
            <Ionicons
              name={isConnected ? 'checkmark-circle' : 'close-circle'}
              size={24}
              color={isConnected ? '#4CAF50' : '#e94560'}
            />
            <Text style={styles.statusText}>
              {isConnected ? 'Connected' : 'Not Connected'}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.button, isConnected && styles.disconnectButton]}
            onPress={handleConnect}
            disabled={!request && !isConnected}
          >
            <Ionicons name={isConnected ? 'log-out' : 'logo-google'} size={20} color="#fff" />
            <Text style={styles.buttonText}>
              {isConnected ? 'Disconnect' : 'Sign in with Google'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Spreadsheet Settings</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Spreadsheet ID</Text>
          <TextInput
            style={styles.input}
            value={spreadsheetId}
            onChangeText={setSpreadsheetId}
            placeholder="Paste from Google Sheet URL"
            placeholderTextColor="#8892b0"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={styles.hint}>
            Find in URL: docs.google.com/spreadsheets/d/[THIS_IS_THE_ID]/edit
          </Text>

          <TouchableOpacity
            style={[styles.analyzeButton, isLoading && styles.disabledButton]}
            onPress={handleAnalyze}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="search" size={20} color="#fff" />
                <Text style={styles.buttonText}>Analyze Spreadsheet</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {sheets.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Sheets to Import</Text>
          <View style={styles.card}>
            {sheets.map((sheet) => (
              <TouchableOpacity
                key={sheet.sheetId}
                style={styles.sheetRow}
                onPress={() => toggleSheet(sheet.title)}
              >
                <Ionicons
                  name={selectedSheets.includes(sheet.title) ? 'checkbox' : 'square-outline'}
                  size={24}
                  color={selectedSheets.includes(sheet.title) ? '#4CAF50' : '#8892b0'}
                />
                <View style={styles.sheetInfo}>
                  <Text style={styles.sheetName}>{sheet.title}</Text>
                  <Text style={styles.sheetMeta}>{sheet.rowCount} rows</Text>
                </View>
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={[styles.syncButton, isLoading && styles.disabledButton]}
              onPress={handleSync}
              disabled={isLoading || selectedSheets.length === 0}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="sync" size={20} color="#fff" />
                  <Text style={styles.buttonText}>
                    Import {selectedSheets.length} Sheet{selectedSheets.length !== 1 ? 's' : ''}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {schema && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Detected Schema</Text>
          <View style={styles.card}>
            <View style={styles.schemaRow}>
              <Text style={styles.schemaLabel}>Date Column:</Text>
              <Text style={styles.schemaValue}>
                {schema.dateColumn !== null ? schema.headers[schema.dateColumn] : 'Not detected'}
              </Text>
            </View>
            <View style={styles.schemaRow}>
              <Text style={styles.schemaLabel}>Description:</Text>
              <Text style={styles.schemaValue}>
                {schema.descriptionColumn !== null ? schema.headers[schema.descriptionColumn] : 'Not detected'}
              </Text>
            </View>
            <View style={styles.schemaRow}>
              <Text style={styles.schemaLabel}>Amount:</Text>
              <Text style={styles.schemaValue}>
                {schema.amountColumn !== null ? schema.headers[schema.amountColumn] : 'Not detected'}
              </Text>
            </View>
            <View style={styles.schemaRow}>
              <Text style={styles.schemaLabel}>Category:</Text>
              <Text style={styles.schemaValue}>
                {schema.categoryColumn !== null ? schema.headers[schema.categoryColumn] : 'Not detected'}
              </Text>
            </View>
          </View>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>
        <View style={styles.card}>
          <Text style={styles.aboutText}>Budget Tracker v1.0.0</Text>
          <Text style={styles.hint}>Auto-detects columns from your spreadsheet</Text>
        </View>
      </View>

      <View style={styles.bottomPadding} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    marginBottom: 12,
  },
  card: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 16,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  statusText: {
    color: '#fff',
    fontSize: 16,
    marginLeft: 12,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e94560',
    padding: 14,
    borderRadius: 8,
  },
  disconnectButton: {
    backgroundColor: '#666',
  },
  analyzeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f3460',
    padding: 14,
    borderRadius: 8,
    marginTop: 12,
  },
  syncButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    padding: 14,
    borderRadius: 8,
    marginTop: 16,
  },
  disabledButton: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    marginLeft: 8,
  },
  label: {
    color: '#fff',
    fontSize: 14,
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#0f3460',
    borderRadius: 8,
    padding: 12,
    color: '#fff',
    fontSize: 16,
  },
  hint: {
    color: '#8892b0',
    fontSize: 12,
    marginTop: 8,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#0f3460',
  },
  sheetInfo: {
    marginLeft: 12,
    flex: 1,
  },
  sheetName: {
    color: '#fff',
    fontSize: 16,
  },
  sheetMeta: {
    color: '#8892b0',
    fontSize: 12,
    marginTop: 2,
  },
  schemaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#0f3460',
  },
  schemaLabel: {
    color: '#8892b0',
    fontSize: 14,
  },
  schemaValue: {
    color: '#fff',
    fontSize: 14,
  },
  aboutText: {
    color: '#fff',
    fontSize: 16,
  },
  bottomPadding: {
    height: 40,
  },
});
