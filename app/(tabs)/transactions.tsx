import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function Transactions() {
  return (
    <View style={styles.container}>
      <View style={styles.empty}>
        <Ionicons name="receipt-outline" size={64} color="#8892b0" />
        <Text style={styles.title}>No Transactions</Text>
        <Text style={styles.subtitle}>Connect to Google Sheets to import data</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  empty: {
    alignItems: 'center',
    padding: 20,
  },
  title: {
    color: '#fff',
    fontSize: 20,
    marginTop: 16,
  },
  subtitle: {
    color: '#8892b0',
    fontSize: 14,
    marginTop: 8,
  },
});
