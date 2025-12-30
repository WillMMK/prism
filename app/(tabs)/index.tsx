import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function Dashboard() {
  return (
    <ScrollView style={styles.container}>
      <View style={styles.card}>
        <Ionicons name="wallet-outline" size={48} color="#e94560" />
        <Text style={styles.title}>Budget Tracker</Text>
        <Text style={styles.subtitle}>Connect to Google Sheets to get started</Text>
      </View>

      <View style={styles.row}>
        <View style={styles.statCard}>
          <Text style={styles.label}>Income</Text>
          <Text style={styles.amount}>$0</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.label}>Expenses</Text>
          <Text style={styles.amountRed}>$0</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Getting Started</Text>
        <Text style={styles.text}>1. Go to Settings tab</Text>
        <Text style={styles.text}>2. Sign in with Google</Text>
        <Text style={styles.text}>3. Enter your Spreadsheet ID</Text>
        <Text style={styles.text}>4. Tap Sync Data</Text>
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
  card: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    color: '#fff',
    fontSize: 24,
    marginTop: 12,
  },
  subtitle: {
    color: '#8892b0',
    fontSize: 14,
    marginTop: 4,
  },
  row: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  label: {
    color: '#8892b0',
    fontSize: 14,
  },
  amount: {
    color: '#4CAF50',
    fontSize: 24,
    marginTop: 4,
  },
  amountRed: {
    color: '#e94560',
    fontSize: 24,
    marginTop: 4,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    marginBottom: 12,
    alignSelf: 'flex-start',
  },
  text: {
    color: '#8892b0',
    fontSize: 14,
    marginBottom: 8,
    alignSelf: 'flex-start',
  },
});
