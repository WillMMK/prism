import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function Settings() {
  const [spreadsheetId, setSpreadsheetId] = useState('');
  const [isConnected, setIsConnected] = useState(false);

  const handleConnect = () => {
    Alert.alert('Coming Soon', 'Google Sign-in will be available in the next update');
  };

  const handleSync = () => {
    if (!spreadsheetId) {
      Alert.alert('Error', 'Please enter a Spreadsheet ID');
      return;
    }
    Alert.alert('Info', 'Sync feature coming soon');
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Google Sheets Connection</Text>
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
          <TouchableOpacity style={styles.button} onPress={handleConnect}>
            <Ionicons name="logo-google" size={20} color="#fff" />
            <Text style={styles.buttonText}>Sign in with Google</Text>
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
            placeholder="Enter spreadsheet ID"
            placeholderTextColor="#8892b0"
          />
          <Text style={styles.hint}>Find this in your Google Sheet URL</Text>
          <TouchableOpacity style={styles.syncButton} onPress={handleSync}>
            <Ionicons name="sync" size={20} color="#fff" />
            <Text style={styles.buttonText}>Sync Data</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>
        <View style={styles.card}>
          <Text style={styles.aboutText}>Budget Tracker v1.0.0</Text>
          <Text style={styles.hint}>Connect your Google Sheet to track expenses</Text>
        </View>
      </View>
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
  syncButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    padding: 14,
    borderRadius: 8,
    marginTop: 12,
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
  aboutText: {
    color: '#fff',
    fontSize: 16,
  },
});
