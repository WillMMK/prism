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
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { useBudgetStore } from '../../src/store/budgetStore';
import { googleSheetsService } from '../../src/services/googleSheets';

WebBrowser.maybeCompleteAuthSession();

const discovery = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};

export default function Settings() {
  const {
    sheetsConfig,
    setSheetsConfig,
    setTransactions,
    setLoading,
    setError,
    isLoading,
    error,
  } = useBudgetStore();

  const [spreadsheetId, setSpreadsheetId] = useState(sheetsConfig.spreadsheetId);
  const [sheetName, setSheetName] = useState(sheetsConfig.sheetName);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com',
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
      redirectUri: AuthSession.makeRedirectUri({
        scheme: 'budget-tracker',
      }),
    },
    discovery
  );

  useEffect(() => {
    if (response?.type === 'success') {
      const { authentication } = response;
      if (authentication?.accessToken) {
        handleAuthSuccess(authentication.accessToken);
      }
    }
  }, [response]);

  const handleAuthSuccess = async (token: string) => {
    try {
      await googleSheetsService.storeToken(token);
      setSheetsConfig({ isConnected: true });
      Alert.alert('Success', 'Connected to Google successfully!');
    } catch (err) {
      Alert.alert('Error', 'Failed to save authentication');
    }
  };

  const handleSignIn = async () => {
    setIsAuthenticating(true);
    try {
      await promptAsync();
    } catch (err) {
      Alert.alert('Error', 'Authentication failed');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleSignOut = async () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to disconnect from Google Sheets?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await googleSheetsService.clearToken();
            setSheetsConfig({ isConnected: false });
            setTransactions([]);
          },
        },
      ]
    );
  };

  const handleSaveConfig = () => {
    setSheetsConfig({
      spreadsheetId,
      sheetName,
    });
    Alert.alert('Saved', 'Sheet configuration saved successfully');
  };

  const handleSyncData = async () => {
    if (!spreadsheetId) {
      Alert.alert('Error', 'Please enter a Spreadsheet ID');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const range = `${sheetName}!A:D`;
      const data = await googleSheetsService.fetchSpreadsheetData(spreadsheetId, range);
      const transactions = googleSheetsService.parseTransactions(data, true);
      setTransactions(transactions);
      setSheetsConfig({
        lastSync: new Date().toISOString(),
      });
      Alert.alert('Success', `Imported ${transactions.length} transactions`);
    } catch (err: any) {
      setError(err.message);
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  const openGoogleSheets = () => {
    Linking.openURL('https://docs.google.com/spreadsheets');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Connection Status Card */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Google Sheets Connection</Text>
        <View style={styles.card}>
          <View style={styles.statusRow}>
            <View style={styles.statusInfo}>
              <Ionicons
                name={sheetsConfig.isConnected ? 'checkmark-circle' : 'close-circle'}
                size={24}
                color={sheetsConfig.isConnected ? '#4CAF50' : '#e94560'}
              />
              <View>
                <Text style={styles.statusText}>
                  {sheetsConfig.isConnected ? 'Connected' : 'Not Connected'}
                </Text>
                {sheetsConfig.lastSync && (
                  <Text style={styles.lastSync}>
                    Last sync: {new Date(sheetsConfig.lastSync).toLocaleString()}
                  </Text>
                )}
              </View>
            </View>
          </View>

          {!sheetsConfig.isConnected ? (
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={handleSignIn}
              disabled={isAuthenticating}
            >
              {isAuthenticating ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="logo-google" size={20} color="#fff" />
                  <Text style={styles.buttonText}>Sign in with Google</Text>
                </>
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.dangerButton} onPress={handleSignOut}>
              <Ionicons name="log-out" size={20} color="#fff" />
              <Text style={styles.buttonText}>Disconnect</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Sheet Configuration */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Sheet Configuration</Text>
        <View style={styles.card}>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Spreadsheet ID</Text>
            <TextInput
              style={styles.input}
              value={spreadsheetId}
              onChangeText={setSpreadsheetId}
              placeholder="Enter spreadsheet ID from URL"
              placeholderTextColor="#8892b0"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.inputHint}>
              Find this in your Google Sheet URL after /d/
            </Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Sheet Name</Text>
            <TextInput
              style={styles.input}
              value={sheetName}
              onChangeText={setSheetName}
              placeholder="e.g., Sheet1"
              placeholderTextColor="#8892b0"
            />
          </View>

          <TouchableOpacity style={styles.secondaryButton} onPress={handleSaveConfig}>
            <Ionicons name="save" size={20} color="#e94560" />
            <Text style={styles.secondaryButtonText}>Save Configuration</Text>
          </TouchableOpacity>

          {sheetsConfig.isConnected && (
            <TouchableOpacity
              style={[styles.primaryButton, styles.syncButton]}
              onPress={handleSyncData}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="sync" size={20} color="#fff" />
                  <Text style={styles.buttonText}>Sync Data</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Expected Format */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Expected Sheet Format</Text>
        <View style={styles.card}>
          <Text style={styles.formatDescription}>
            Your Google Sheet should have the following columns:
          </Text>
          <View style={styles.formatTable}>
            <View style={styles.formatRow}>
              <Text style={styles.formatHeader}>Column A</Text>
              <Text style={styles.formatValue}>Date (YYYY-MM-DD)</Text>
            </View>
            <View style={styles.formatRow}>
              <Text style={styles.formatHeader}>Column B</Text>
              <Text style={styles.formatValue}>Description</Text>
            </View>
            <View style={styles.formatRow}>
              <Text style={styles.formatHeader}>Column C</Text>
              <Text style={styles.formatValue}>Category</Text>
            </View>
            <View style={styles.formatRow}>
              <Text style={styles.formatHeader}>Column D</Text>
              <Text style={styles.formatValue}>Amount (negative for expenses)</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.linkButton} onPress={openGoogleSheets}>
            <Ionicons name="open-outline" size={18} color="#64ffda" />
            <Text style={styles.linkText}>Open Google Sheets</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* About */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>
        <View style={styles.card}>
          <View style={styles.aboutRow}>
            <Text style={styles.aboutLabel}>Version</Text>
            <Text style={styles.aboutValue}>1.0.0</Text>
          </View>
          <View style={styles.aboutRow}>
            <Text style={styles.aboutLabel}>App Name</Text>
            <Text style={styles.aboutValue}>Budget Tracker</Text>
          </View>
        </View>
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <Ionicons name="warning" size={20} color="#e94560" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  card: {
    backgroundColor: '#16213e',
    borderRadius: 16,
    padding: 20,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  statusInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statusText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  lastSync: {
    color: '#8892b0',
    fontSize: 12,
    marginTop: 2,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e94560',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 10,
  },
  syncButton: {
    marginTop: 12,
    backgroundColor: '#4CAF50',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#e94560',
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  dangerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e94560',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 10,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButtonText: {
    color: '#e94560',
    fontSize: 16,
    fontWeight: '600',
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#0f3460',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 16,
  },
  inputHint: {
    color: '#8892b0',
    fontSize: 12,
    marginTop: 6,
  },
  formatDescription: {
    color: '#8892b0',
    fontSize: 14,
    marginBottom: 16,
  },
  formatTable: {
    marginBottom: 16,
  },
  formatRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#0f3460',
  },
  formatHeader: {
    width: 80,
    color: '#e94560',
    fontSize: 14,
    fontWeight: '500',
  },
  formatValue: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  linkText: {
    color: '#64ffda',
    fontSize: 14,
    fontWeight: '500',
  },
  aboutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#0f3460',
  },
  aboutLabel: {
    color: '#8892b0',
    fontSize: 14,
  },
  aboutValue: {
    color: '#fff',
    fontSize: 14,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(233, 69, 96, 0.2)',
    padding: 14,
    borderRadius: 12,
    marginTop: 12,
  },
  errorText: {
    flex: 1,
    color: '#e94560',
    fontSize: 14,
  },
});
