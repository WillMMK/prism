import React, { useState } from 'react';
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
import * as DocumentPicker from 'expo-document-picker';
import { xlsxParser, SheetData, ColumnMapping, ParsedFile } from '../../src/services/xlsxParser';
import { useBudgetStore } from '../../src/store/budgetStore';

export default function Settings() {
  const [isLoading, setIsLoading] = useState(false);
  const [parsedFile, setParsedFile] = useState<ParsedFile | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [selectedSheets, setSelectedSheets] = useState<string[]>([]);
  const [schema, setSchema] = useState<ColumnMapping | null>(null);
  const [showSheetPicker, setShowSheetPicker] = useState(false);

  const { setTransactions, transactions } = useBudgetStore();

  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
          'application/vnd.ms-excel', // .xls
          'text/csv', // .csv
        ],
        copyToCacheDirectory: true,
      });

      if (result.canceled) {
        return;
      }

      const file = result.assets[0];
      setFileName(file.name);
      setIsLoading(true);

      try {
        const parsed = await xlsxParser.parseFile(file.uri);
        setParsedFile(parsed);
        setSchema(parsed.inferredMapping);
        setSelectedSheets(parsed.sheets.map(s => s.name));

        const inferredFields = [];
        if (parsed.inferredMapping.dateColumn !== null) inferredFields.push('Date');
        if (parsed.inferredMapping.descriptionColumn !== null) inferredFields.push('Description');
        if (parsed.inferredMapping.amountColumn !== null) inferredFields.push('Amount');
        if (parsed.inferredMapping.categoryColumn !== null) inferredFields.push('Category');

        Alert.alert(
          'File Analyzed',
          `Found ${parsed.sheets.length} sheet(s)\n\nDetected columns: ${inferredFields.join(', ') || 'None auto-detected'}\n\nHeaders: ${parsed.inferredMapping.headers.slice(0, 4).join(', ')}${parsed.inferredMapping.headers.length > 4 ? '...' : ''}`
        );
      } catch (error: any) {
        Alert.alert('Error', error.message || 'Failed to parse file');
        setParsedFile(null);
        setFileName(null);
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to pick file');
    } finally {
      setIsLoading(false);
    }
  };

  const handleImport = async () => {
    if (!parsedFile) {
      Alert.alert('Error', 'Please select a file first');
      return;
    }

    if (selectedSheets.length === 0) {
      Alert.alert('Error', 'Please select at least one sheet');
      return;
    }

    setIsLoading(true);
    try {
      const importedTransactions = xlsxParser.parseAllSheets(parsedFile, selectedSheets);
      setTransactions(importedTransactions);

      Alert.alert(
        'Import Complete',
        `Imported ${importedTransactions.length} transactions from ${selectedSheets.length} sheet(s)`
      );
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to import data');
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

  const handleClearData = () => {
    Alert.alert(
      'Clear All Data',
      'Are you sure you want to clear all imported transactions?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            setTransactions([]);
            setParsedFile(null);
            setFileName(null);
            setSelectedSheets([]);
            setSchema(null);
            Alert.alert('Cleared', 'All data has been cleared');
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Import Data</Text>
        <View style={styles.card}>
          <Text style={styles.cardDescription}>
            Upload an Excel (.xlsx) or CSV file with your budget data
          </Text>

          <TouchableOpacity
            style={styles.uploadButton}
            onPress={handlePickFile}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="document-attach" size={24} color="#fff" />
                <Text style={styles.uploadButtonText}>
                  {fileName || 'Select File'}
                </Text>
              </>
            )}
          </TouchableOpacity>

          {fileName && (
            <View style={styles.fileInfo}>
              <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
              <Text style={styles.fileName} numberOfLines={1}>{fileName}</Text>
            </View>
          )}
        </View>
      </View>

      {parsedFile && parsedFile.sheets.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Sheets to Import</Text>
          <View style={styles.card}>
            {parsedFile.sheets.map((sheet) => (
              <TouchableOpacity
                key={sheet.name}
                style={styles.sheetRow}
                onPress={() => toggleSheet(sheet.name)}
              >
                <Ionicons
                  name={selectedSheets.includes(sheet.name) ? 'checkbox' : 'square-outline'}
                  size={24}
                  color={selectedSheets.includes(sheet.name) ? '#4CAF50' : '#8892b0'}
                />
                <View style={styles.sheetInfo}>
                  <Text style={styles.sheetName}>{sheet.name}</Text>
                  <Text style={styles.sheetMeta}>
                    {sheet.rowCount} rows, {sheet.headers.length} columns
                  </Text>
                </View>
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={[styles.importButton, isLoading && styles.disabledButton]}
              onPress={handleImport}
              disabled={isLoading || selectedSheets.length === 0}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="download" size={20} color="#fff" />
                  <Text style={styles.buttonText}>
                    Import {selectedSheets.length} Sheet{selectedSheets.length !== 1 ? 's' : ''}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {schema && schema.headers.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Detected Schema</Text>
          <View style={styles.card}>
            <View style={styles.schemaRow}>
              <Text style={styles.schemaLabel}>Date:</Text>
              <Text style={styles.schemaValue}>
                {schema.dateColumn !== null ? schema.headers[schema.dateColumn] : '—'}
              </Text>
            </View>
            <View style={styles.schemaRow}>
              <Text style={styles.schemaLabel}>Description:</Text>
              <Text style={styles.schemaValue}>
                {schema.descriptionColumn !== null ? schema.headers[schema.descriptionColumn] : '—'}
              </Text>
            </View>
            <View style={styles.schemaRow}>
              <Text style={styles.schemaLabel}>Amount:</Text>
              <Text style={styles.schemaValue}>
                {schema.amountColumn !== null ? schema.headers[schema.amountColumn] : '—'}
              </Text>
            </View>
            <View style={styles.schemaRow}>
              <Text style={styles.schemaLabel}>Category:</Text>
              <Text style={styles.schemaValue}>
                {schema.categoryColumn !== null ? schema.headers[schema.categoryColumn] : '—'}
              </Text>
            </View>
            <Text style={styles.hint}>
              All columns: {schema.headers.join(', ')}
            </Text>
          </View>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Data Status</Text>
        <View style={styles.card}>
          <View style={styles.statusRow}>
            <Ionicons
              name={transactions.length > 0 ? 'checkmark-circle' : 'alert-circle'}
              size={24}
              color={transactions.length > 0 ? '#4CAF50' : '#8892b0'}
            />
            <Text style={styles.statusText}>
              {transactions.length > 0
                ? `${transactions.length} transactions loaded`
                : 'No data loaded'}
            </Text>
          </View>

          {transactions.length > 0 && (
            <TouchableOpacity
              style={styles.clearButton}
              onPress={handleClearData}
            >
              <Ionicons name="trash" size={18} color="#e94560" />
              <Text style={styles.clearButtonText}>Clear All Data</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>
        <View style={styles.card}>
          <Text style={styles.aboutText}>Budget Tracker v1.0.0</Text>
          <Text style={styles.hint}>
            Supports .xlsx, .xls, and .csv files{'\n'}
            Auto-detects date, amount, description, and category columns
          </Text>
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
    fontWeight: '600',
    marginBottom: 12,
  },
  card: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 16,
  },
  cardDescription: {
    color: '#8892b0',
    fontSize: 14,
    marginBottom: 16,
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e94560',
    padding: 16,
    borderRadius: 8,
    gap: 10,
  },
  uploadButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  fileInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    padding: 10,
    backgroundColor: '#0f3460',
    borderRadius: 6,
  },
  fileName: {
    color: '#fff',
    fontSize: 14,
    marginLeft: 8,
    flex: 1,
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
  importButton: {
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
    fontWeight: '600',
    marginLeft: 8,
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
    fontWeight: '500',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusText: {
    color: '#fff',
    fontSize: 16,
    marginLeft: 12,
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e94560',
    borderRadius: 8,
  },
  clearButtonText: {
    color: '#e94560',
    fontSize: 14,
    marginLeft: 8,
  },
  aboutText: {
    color: '#fff',
    fontSize: 16,
  },
  hint: {
    color: '#8892b0',
    fontSize: 12,
    marginTop: 8,
    lineHeight: 18,
  },
  bottomPadding: {
    height: 40,
  },
});
