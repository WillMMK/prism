import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { xlsxParser, SheetData, ColumnMapping, ParsedFile, SummaryMapping, DataFormat } from '../../src/services/xlsxParser';
import { useBudgetStore } from '../../src/store/budgetStore';

export default function Settings() {
  const [isLoading, setIsLoading] = useState(false);
  const [parsedFile, setParsedFile] = useState<ParsedFile | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [selectedSheets, setSelectedSheets] = useState<string[]>([]);

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
        setSelectedSheets(parsed.sheets.map(s => s.name));

        // Show detection results
        if (parsed.detectedFormat === 'summary' && parsed.summaryMapping) {
          const sm = parsed.summaryMapping;
          Alert.alert(
            'Summary Format Detected',
            `Found ${parsed.sheets.length} sheet(s)\n\n` +
            `Format: Monthly Summary (YEAR/MONTH columns)\n\n` +
            `Expense categories (${sm.expenseCategories.length}):\n${sm.expenseCategories.map(c => c.name).join(', ') || 'None'}\n\n` +
            `Income categories (${sm.incomeCategories.length}):\n${sm.incomeCategories.map(c => c.name).join(', ') || 'None'}`
          );
        } else {
          const mapping = parsed.inferredMapping;
          const inferredFields = [];
          if (mapping.dateColumn !== null) inferredFields.push('Date');
          if (mapping.descriptionColumn !== null) inferredFields.push('Description');
          if (mapping.amountColumn !== null) inferredFields.push('Amount');
          if (mapping.categoryColumn !== null) inferredFields.push('Category');

          Alert.alert(
            'Transaction Format Detected',
            `Found ${parsed.sheets.length} sheet(s)\n\n` +
            `Format: Transaction Log\n\n` +
            `Detected: ${inferredFields.join(', ') || 'None auto-detected'}\n\n` +
            `Headers: ${mapping.headers.slice(0, 5).join(', ')}${mapping.headers.length > 5 ? '...' : ''}`
          );
        }
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

      // Count income vs expense
      const incomeCount = importedTransactions.filter(t => t.type === 'income').length;
      const expenseCount = importedTransactions.filter(t => t.type === 'expense').length;

      Alert.alert(
        'Import Complete',
        `Imported ${importedTransactions.length} transactions:\n` +
        `• ${incomeCount} income entries\n` +
        `• ${expenseCount} expense entries`
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
            Alert.alert('Cleared', 'All data has been cleared');
          },
        },
      ]
    );
  };

  // Render summary format schema
  const renderSummarySchema = (mapping: SummaryMapping) => (
    <View style={styles.card}>
      <View style={styles.formatBadge}>
        <Ionicons name="calendar" size={16} color="#4CAF50" />
        <Text style={styles.formatText}>Monthly Summary Format</Text>
      </View>

      <View style={styles.categorySection}>
        <Text style={styles.categoryTitle}>
          <Ionicons name="arrow-down-circle" size={14} color="#e94560" /> Expense Categories ({mapping.expenseCategories.length})
        </Text>
        <View style={styles.categoryTags}>
          {mapping.expenseCategories.map((cat, idx) => (
            <View key={idx} style={[styles.tag, styles.expenseTag]}>
              <Text style={styles.tagText}>{cat.name}</Text>
            </View>
          ))}
          {mapping.expenseCategories.length === 0 && (
            <Text style={styles.noneText}>None detected</Text>
          )}
        </View>
      </View>

      <View style={styles.categorySection}>
        <Text style={styles.categoryTitle}>
          <Ionicons name="arrow-up-circle" size={14} color="#4CAF50" /> Income Categories ({mapping.incomeCategories.length})
        </Text>
        <View style={styles.categoryTags}>
          {mapping.incomeCategories.map((cat, idx) => (
            <View key={idx} style={[styles.tag, styles.incomeTag]}>
              <Text style={styles.tagText}>{cat.name}</Text>
            </View>
          ))}
          {mapping.incomeCategories.length === 0 && (
            <Text style={styles.noneText}>None detected</Text>
          )}
        </View>
      </View>

      {mapping.totalColumns.length > 0 && (
        <View style={styles.categorySection}>
          <Text style={styles.categoryTitle}>
            <Ionicons name="calculator" size={14} color="#8892b0" /> Sum Columns (auto-detected, skipped)
          </Text>
          {mapping.totalColumns.map((col, idx) => {
            // Find what columns this sums
            const sumOfNames = col.sumOf?.map(colIdx => {
              const found = [...mapping.expenseCategories, ...mapping.incomeCategories]
                .find(c => c.index === colIdx);
              return found?.name || `Col${colIdx}`;
            }) || [];

            return (
              <View key={idx} style={styles.sumColumnInfo}>
                <View style={[styles.tag, styles.summaryTag]}>
                  <Text style={styles.tagText}>{col.name}</Text>
                </View>
                {sumOfNames.length > 0 && (
                  <Text style={styles.sumOfText}>
                    = {sumOfNames.join(' + ')}
                  </Text>
                )}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );

  // Render transaction format schema
  const renderTransactionSchema = (mapping: ColumnMapping) => (
    <View style={styles.card}>
      <View style={styles.formatBadge}>
        <Ionicons name="list" size={16} color="#64B5F6" />
        <Text style={styles.formatText}>Transaction Log Format</Text>
      </View>

      <View style={styles.schemaRow}>
        <Text style={styles.schemaLabel}>Date:</Text>
        <Text style={styles.schemaValue}>
          {mapping.dateColumn !== null ? mapping.headers[mapping.dateColumn] : '—'}
        </Text>
      </View>
      <View style={styles.schemaRow}>
        <Text style={styles.schemaLabel}>Description:</Text>
        <Text style={styles.schemaValue}>
          {mapping.descriptionColumn !== null ? mapping.headers[mapping.descriptionColumn] : '—'}
        </Text>
      </View>
      <View style={styles.schemaRow}>
        <Text style={styles.schemaLabel}>Amount:</Text>
        <Text style={styles.schemaValue}>
          {mapping.amountColumn !== null ? mapping.headers[mapping.amountColumn] : '—'}
        </Text>
      </View>
      <View style={styles.schemaRow}>
        <Text style={styles.schemaLabel}>Category:</Text>
        <Text style={styles.schemaValue}>
          {mapping.categoryColumn !== null ? mapping.headers[mapping.categoryColumn] : '—'}
        </Text>
      </View>
      <Text style={styles.hint}>
        All columns: {mapping.headers.join(', ')}
      </Text>
    </View>
  );

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

      {parsedFile && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Detected Schema</Text>
          {parsedFile.detectedFormat === 'summary' && parsedFile.summaryMapping
            ? renderSummarySchema(parsedFile.summaryMapping)
            : renderTransactionSchema(parsedFile.inferredMapping)}
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
            <>
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>
                    {transactions.filter(t => t.type === 'income').length}
                  </Text>
                  <Text style={styles.statLabel}>Income</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>
                    {transactions.filter(t => t.type === 'expense').length}
                  </Text>
                  <Text style={styles.statLabel}>Expenses</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>
                    {new Set(transactions.map(t => t.category)).size}
                  </Text>
                  <Text style={styles.statLabel}>Categories</Text>
                </View>
              </View>

              <TouchableOpacity
                style={styles.clearButton}
                onPress={handleClearData}
              >
                <Ionicons name="trash" size={18} color="#e94560" />
                <Text style={styles.clearButtonText}>Clear All Data</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>
        <View style={styles.card}>
          <Text style={styles.aboutText}>Budget Tracker v1.0.0</Text>
          <Text style={styles.hint}>
            Supports .xlsx, .xls, and .csv files{'\n'}
            Auto-detects: Transaction logs & Monthly summaries{'\n'}
            Intelligently categorizes expense vs income columns
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
  formatBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f3460',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    alignSelf: 'flex-start',
    marginBottom: 16,
    gap: 6,
  },
  formatText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
  },
  categorySection: {
    marginBottom: 16,
  },
  categoryTitle: {
    color: '#ccd6f6',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  categoryTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  expenseTag: {
    backgroundColor: 'rgba(233, 69, 96, 0.2)',
    borderWidth: 1,
    borderColor: '#e94560',
  },
  incomeTag: {
    backgroundColor: 'rgba(76, 175, 80, 0.2)',
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  summaryTag: {
    backgroundColor: 'rgba(136, 146, 176, 0.2)',
    borderWidth: 1,
    borderColor: '#8892b0',
  },
  tagText: {
    color: '#fff',
    fontSize: 12,
  },
  noneText: {
    color: '#8892b0',
    fontSize: 12,
    fontStyle: 'italic',
  },
  sumColumnInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: 8,
    gap: 8,
  },
  sumOfText: {
    color: '#64B5F6',
    fontSize: 11,
    fontStyle: 'italic',
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
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#0f3460',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
  },
  statLabel: {
    color: '#8892b0',
    fontSize: 12,
    marginTop: 4,
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
