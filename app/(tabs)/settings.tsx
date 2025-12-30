import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { googleSheetsService, SheetInfo, ColumnMapping, SpreadsheetFile } from '../../src/services/googleSheets';
import { useBudgetStore } from '../../src/store/budgetStore';

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_CLIENT_ID = '907648461438-2q8au98sdpogg0hiu3sc9g5o3uruhqmf.apps.googleusercontent.com';

const redirectUri = AuthSession.makeRedirectUri({
  scheme: 'budget-tracker',
});

const discovery = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};

export default function Settings() {
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [spreadsheets, setSpreadsheets] = useState<SpreadsheetFile[]>([]);
  const [selectedSpreadsheet, setSelectedSpreadsheet] = useState<SpreadsheetFile | null>(null);
  const [sheets, setSheets] = useState<SheetInfo[]>([]);
  const [selectedSheets, setSelectedSheets] = useState<string[]>([]);
  const [schema, setSchema] = useState<ColumnMapping | null>(null);
  const [showSpreadsheetPicker, setShowSpreadsheetPicker] = useState(false);

  const { setSheetsConfig, setTransactions, sheetsConfig } = useBudgetStore();

  // Log redirect URI for debugging
  console.log('Redirect URI:', redirectUri);

  // Set up Google OAuth with Drive scope
  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: GOOGLE_CLIENT_ID,
      redirectUri,
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets.readonly',
        'https://www.googleapis.com/auth/drive.readonly',
      ],
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
      // Auto-fetch spreadsheets if connected
      fetchSpreadsheets();
    }
  };

  const handleAuthSuccess = async (accessToken: string) => {
    await googleSheetsService.storeToken(accessToken);
    setIsConnected(true);
    setSheetsConfig({ isConnected: true });
    // Auto-fetch spreadsheets after sign-in
    fetchSpreadsheets();
  };

  const fetchSpreadsheets = async () => {
    setIsLoading(true);
    try {
      const files = await googleSheetsService.listSpreadsheets();
      setSpreadsheets(files);
      if (files.length === 0) {
        Alert.alert('No Spreadsheets', 'No Google Sheets found in your Drive');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to fetch spreadsheets');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConnect = async () => {
    if (isConnected) {
      // Disconnect
      await googleSheetsService.clearToken();
      setIsConnected(false);
      setSpreadsheets([]);
      setSelectedSpreadsheet(null);
      setSheets([]);
      setSchema(null);
      setSheetsConfig({ isConnected: false, spreadsheetId: '' });
      Alert.alert('Disconnected', 'Signed out from Google');
    } else {
      // Connect
      promptAsync();
    }
  };

  const handleSelectSpreadsheet = async (spreadsheet: SpreadsheetFile) => {
    setShowSpreadsheetPicker(false);
    setSelectedSpreadsheet(spreadsheet);
    setIsLoading(true);

    try {
      const result = await googleSheetsService.analyzeSpreadsheet(spreadsheet.id);
      setSheets(result.sheets);
      setSchema(result.columns);
      setSelectedSheets(result.sheets.map(s => s.title));
      setSheetsConfig({ spreadsheetId: spreadsheet.id });

      const inferredFields = [];
      if (result.columns.dateColumn !== null) inferredFields.push('Date');
      if (result.columns.descriptionColumn !== null) inferredFields.push('Description');
      if (result.columns.amountColumn !== null) inferredFields.push('Amount');
      if (result.columns.categoryColumn !== null) inferredFields.push('Category');

      Alert.alert(
        'Spreadsheet Analyzed',
        `Found ${result.sheets.length} sheet(s)\n\nDetected: ${inferredFields.join(', ') || 'No columns auto-detected'}`
      );
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to analyze spreadsheet');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSync = async () => {
    if (!selectedSpreadsheet) {
      Alert.alert('Error', 'Please select a spreadsheet first');
      return;
    }

    if (selectedSheets.length === 0) {
      Alert.alert('Error', 'Please select at least one sheet');
      return;
    }

    setIsLoading(true);
    try {
      const transactions = await googleSheetsService.importAllSheets(
        selectedSpreadsheet.id,
        selectedSheets
      );

      setTransactions(transactions);
      Alert.alert(
        'Import Complete',
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

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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

      {isConnected && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Select Spreadsheet</Text>
          <View style={styles.card}>
            <TouchableOpacity
              style={styles.pickerButton}
              onPress={() => setShowSpreadsheetPicker(true)}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="document-text" size={20} color="#e94560" />
                  <Text style={styles.pickerText} numberOfLines={1}>
                    {selectedSpreadsheet?.name || 'Choose a spreadsheet...'}
                  </Text>
                  <Ionicons name="chevron-down" size={20} color="#8892b0" />
                </>
              )}
            </TouchableOpacity>

            {spreadsheets.length === 0 && !isLoading && (
              <TouchableOpacity style={styles.refreshButton} onPress={fetchSpreadsheets}>
                <Ionicons name="refresh" size={18} color="#fff" />
                <Text style={styles.refreshText}>Refresh List</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

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
                  <Ionicons name="cloud-download" size={20} color="#fff" />
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

      {/* Spreadsheet Picker Modal */}
      <Modal
        visible={showSpreadsheetPicker}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowSpreadsheetPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Spreadsheet</Text>
              <TouchableOpacity onPress={() => setShowSpreadsheetPicker(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <FlatList
              data={spreadsheets}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.spreadsheetItem}
                  onPress={() => handleSelectSpreadsheet(item)}
                >
                  <Ionicons name="document-text" size={24} color="#4CAF50" />
                  <View style={styles.spreadsheetInfo}>
                    <Text style={styles.spreadsheetName} numberOfLines={2}>{item.name}</Text>
                    <Text style={styles.spreadsheetDate}>Modified: {formatDate(item.modifiedTime)}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#8892b0" />
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={styles.emptyList}>
                  <Text style={styles.emptyText}>No spreadsheets found</Text>
                  <TouchableOpacity style={styles.refreshButton} onPress={fetchSpreadsheets}>
                    <Ionicons name="refresh" size={18} color="#fff" />
                    <Text style={styles.refreshText}>Refresh</Text>
                  </TouchableOpacity>
                </View>
              }
            />
          </View>
        </View>
      </Modal>
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
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f3460',
    padding: 14,
    borderRadius: 8,
  },
  pickerText: {
    color: '#fff',
    fontSize: 16,
    flex: 1,
    marginLeft: 10,
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    padding: 10,
  },
  refreshText: {
    color: '#8892b0',
    marginLeft: 6,
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
  hint: {
    color: '#8892b0',
    fontSize: 12,
    marginTop: 8,
  },
  bottomPadding: {
    height: 40,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#16213e',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#0f3460',
  },
  modalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  spreadsheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#0f3460',
  },
  spreadsheetInfo: {
    flex: 1,
    marginLeft: 12,
  },
  spreadsheetName: {
    color: '#fff',
    fontSize: 16,
  },
  spreadsheetDate: {
    color: '#8892b0',
    fontSize: 12,
    marginTop: 4,
  },
  emptyList: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: '#8892b0',
    fontSize: 16,
    marginBottom: 16,
  },
});
