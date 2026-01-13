import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  TextInput,
  Platform,
  Appearance,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useSettingsStore, ThemeOption, CurrencyOption, DateFormatOption } from '../../src/store/settingsStore';
import { Ionicons } from '@expo/vector-icons';
import * as AuthSession from 'expo-auth-session';
import * as DocumentPicker from 'expo-document-picker';
import { xlsxParser, SheetData, ColumnMapping, ParsedFile, SummaryMapping, MixedSheetAnalysis, DataFormat } from '../../src/services/xlsxParser';
import { useBudgetStore } from '../../src/store/budgetStore';
import { SheetWriteMode } from '../../src/types/budget';
import { googleSheetsService, GOOGLE_AUTH_CONFIG, SpreadsheetFile, SheetInfo, extractSpreadsheetId } from '../../src/services/googleSheets';
import { useLoadingOverlay } from '../../src/store/loadingOverlayStore';
import { usePremiumStore } from '../../src/store/premiumStore';
import { SyncStatusIndicator } from '../../src/components/SyncStatusIndicator';
import { useAutoSync } from '../../src/hooks/useAutoSync';
import { useToastStore } from '../../src/store/toastStore';
import { useTheme, lightPalette as palette } from '../../src/theme';
import { GoogleDrivePicker, PickedFile } from '../../src/components/GoogleDrivePicker';
import DemoModeBanner from '../../src/components/DemoModeBanner';



const renderSegmented = <T extends string>(
  options: T[],
  current: T,
  onChange: (val: T) => void,
  colors: any,
  labels?: Record<T, string>
) => (
  <View style={[styles.segmentedControl, { backgroundColor: colors.wash, marginTop: 0, minWidth: 180 }]}>
    {options.map((opt) => (
      <TouchableOpacity
        key={opt}
        style={[
          styles.segmentedButton,
          current === opt && {
            backgroundColor: colors.card,
            shadowColor: '#000',
            shadowOpacity: 0.1,
            elevation: 2
          }
        ]}
        onPress={() => onChange(opt)}
      >
        <Text style={[
          styles.segmentedText,
          { color: colors.muted, fontSize: 12 },
          current === opt && { color: colors.ink, fontWeight: '600' }
        ]}>
          {labels ? labels[opt] : opt.toUpperCase()}
        </Text>
      </TouchableOpacity>
    ))}
  </View>
);

export default function Settings() {
  const { sheetUrl, autoLoad } = useLocalSearchParams<{ sheetUrl?: string; autoLoad?: string }>();
  const {
    theme, setTheme,
    currency, setCurrency,
    dateFormat, setDateFormat
  } = useSettingsStore();

  const { colors, isDark } = useTheme();

  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [parsedFile, setParsedFile] = useState<ParsedFile | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [selectedSheets, setSelectedSheets] = useState<string[]>([]);
  const [googleSheets, setGoogleSheets] = useState<SheetInfo[]>([]);
  const [selectedSpreadsheet, setSelectedSpreadsheet] = useState<SpreadsheetFile | null>(null);
  const [selectedGoogleSheets, setSelectedGoogleSheets] = useState<string[]>([]);
  const [sheetUrlInput, setSheetUrlInput] = useState('');
  const [showDrivePicker, setShowDrivePicker] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleRowCounts, setGoogleRowCounts] = useState<Record<string, number>>({});
  const [writeTargetsExpanded, setWriteTargetsExpanded] = useState(true);
  const [detectedWriteModes, setDetectedWriteModes] = useState<Record<string, 'grid' | 'transaction'>>({});
  const pendingSheetUrlRef = useRef<string | null>(null);
  const autoLoadedSheetUrlRef = useRef<string | null>(null);

  const {
    setTransactions,
    transactions,
    importMetadata,
    clearData,
    _hasHydrated,
    setSheetsConfig,
    sheetsConfig,
    demoConfig,
    setDemoConfig,
    upsertCategories,
    loadDemoData,
  } = useBudgetStore();
  const { show: showLoadingOverlay, hide: hideLoadingOverlay } = useLoadingOverlay();
  const { showToast } = useToastStore();
  const { isPremium } = usePremiumStore();
  const { syncNow, syncStatus, lastSyncTime, pendingCount, isConnected } = useAutoSync({
    onExternalUpdate: () => {
      showToast({ message: 'Sheet updated externally', tone: 'info' });
    },
    onSyncResult: ({ totalCount, newCount, isFirstSync }) => {
      if (isFirstSync) {
        showToast({ message: `Synced ${totalCount} transactions`, tone: 'success' });
      } else if (newCount > 0) {
        showToast({ message: `Synced ${newCount} new transaction${newCount > 1 ? 's' : ''}`, tone: 'success' });
      } else {
        showToast({ message: 'Up to date', tone: 'success' });
      }
    },
  });
  const iosRedirectUri =
    'com.googleusercontent.apps.907648461438-lttve08jch0tc7639k16hill7smkbqur:/oauthredirect';
  const redirectUri = Platform.select({
    ios: iosRedirectUri,
    android: AuthSession.makeRedirectUri({
      scheme: 'budget-tracker',
      path: 'oauthredirect',
    }),
    default: AuthSession.makeRedirectUri({}),
  }) as string;
  const clientId = Platform.select({
    ios: GOOGLE_AUTH_CONFIG.iosClientId,
    android: GOOGLE_AUTH_CONFIG.androidClientId || GOOGLE_AUTH_CONFIG.webClientId,
    default: GOOGLE_AUTH_CONFIG.webClientId,
  }) as string;
  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId,
      scopes: GOOGLE_AUTH_CONFIG.scopes,
      redirectUri,
      responseType: AuthSession.ResponseType.Code,
      usePKCE: true,
      extraParams: {
        access_type: 'offline',
        prompt: 'consent',
        include_granted_scopes: 'true',
      },
    },
    GOOGLE_AUTH_CONFIG.discovery
  );

  useEffect(() => {
    if (response?.type === 'success') {
      const code =
        (response as AuthSession.AuthSessionResult & { params?: { code?: string } }).params?.code;
      if (!code || !request?.codeVerifier) {
        Alert.alert('Google Sign-in Failed', 'No auth code returned.');
        return;
      }

      AuthSession.exchangeCodeAsync(
        {
          clientId,
          code,
          redirectUri,
          extraParams: {
            code_verifier: request.codeVerifier,
          },
        },
        GOOGLE_AUTH_CONFIG.discovery
      )
        .then(async (tokenResult) => {
          if (!tokenResult.accessToken) {
            throw new Error('No access token returned.');
          }
          if (!tokenResult.refreshToken) {
            const existing = await googleSheetsService.getStoredToken();
            if (!existing?.refreshToken) {
              Alert.alert(
                'Google Sign-in',
                'Refresh token not returned. You may need to revoke access in your Google account and sign in again.'
              );
            }
          }
          return googleSheetsService.storeToken(
            tokenResult.accessToken,
            tokenResult.refreshToken || undefined,
            tokenResult.expiresIn || undefined
          );
        })
        .then(async () => {
          setGoogleConnected(true);
          if (sheetsConfig.spreadsheetId && sheetsConfig.selectedTabs?.length) {
            setSheetsConfig({ isConnected: true });
            loadSavedSpreadsheet(sheetsConfig.spreadsheetId);
          }
        })
        .catch((error) => {
          Alert.alert('Google Sign-in Failed', error.message || 'Unable to complete sign-in.');
        });
    }
  }, [response]);

  useEffect(() => {
    googleSheetsService.getStoredToken().then((token) => {
      if (token) {
        setGoogleConnected(true);
        if (sheetsConfig.spreadsheetId) {
          loadSavedSpreadsheet(sheetsConfig.spreadsheetId);
          if (sheetsConfig.selectedTabs?.length) {
            setSheetsConfig({ isConnected: true });
          }
        }
      }
    });
  }, []);

  useEffect(() => {
    if (sheetsConfig.spreadsheetId && sheetsConfig.selectedTabs?.length) {
      setSelectedGoogleSheets(sheetsConfig.selectedTabs);
    }
  }, [sheetsConfig.spreadsheetId, sheetsConfig.selectedTabs]);

  useEffect(() => {
    if (!sheetsConfig.expenseSheetName || !sheetsConfig.incomeSheetName) {
      const tabs = sheetsConfig.selectedTabs || [];
      if (tabs.length === 0) return;
      const incomeTab = tabs.find((name) => name.toLowerCase().includes('income')) || '';
      const expenseTab = tabs.find((name) => !name.toLowerCase().includes('income')) || '';
      if (incomeTab || expenseTab) {
        setSheetsConfig({
          expenseSheetName: sheetsConfig.expenseSheetName || expenseTab,
          incomeSheetName: sheetsConfig.incomeSheetName || incomeTab,
        });
      }
    }
  }, [sheetsConfig.selectedTabs, sheetsConfig.expenseSheetName, sheetsConfig.incomeSheetName, setSheetsConfig]);

  useEffect(() => {
    const sheetNames = [sheetsConfig.expenseSheetName, sheetsConfig.incomeSheetName]
      .filter((name): name is string => Boolean(name && name.trim().length > 0));
    if (!sheetsConfig.isConnected || !sheetsConfig.spreadsheetId || sheetNames.length === 0) {
      setDetectedWriteModes({});
      return;
    }
    let cancelled = false;
    const loadFormats = async () => {
      const entries = await Promise.all(
        sheetNames.map(async (name) => {
          try {
            const mode = await googleSheetsService.detectWriteMode(
              sheetsConfig.spreadsheetId,
              name
            );
            return [name, mode] as const;
          } catch {
            return [name, undefined] as const;
          }
        })
      );
      if (cancelled) return;
      const next: Record<string, 'grid' | 'transaction'> = {};
      entries.forEach(([name, mode]) => {
        if (mode) next[name] = mode;
      });
      setDetectedWriteModes(next);
    };
    void loadFormats();
    return () => {
      cancelled = true;
    };
  }, [sheetsConfig.spreadsheetId, sheetsConfig.expenseSheetName, sheetsConfig.incomeSheetName, sheetsConfig.isConnected]);

  const loadSavedSpreadsheet = async (spreadsheetId: string) => {
    setIsGoogleLoading(true);
    try {
      const metadata = await googleSheetsService.getSpreadsheetMetadata(spreadsheetId);
      setGoogleSheets(metadata.sheets);
      setSelectedSpreadsheet({
        id: spreadsheetId,
        name: metadata.title || 'Google Sheets',
        modifiedTime: new Date().toISOString(),
      });
      setSelectedGoogleSheets(sheetsConfig.selectedTabs || metadata.sheets.map((sheet) => sheet.title));
      setGoogleRowCounts({});
      try {
        const categoryNames = await googleSheetsService.getCategoryNames(spreadsheetId);
        if (categoryNames.length > 0) {
          upsertCategories(categoryNames);
        }
      } catch {
        // Ignore missing category sheet
      }
    } catch (error: any) {
      Alert.alert('Google Sheets', error.message || 'Failed to load spreadsheet.');
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleLoadFromUrl = async (overrideUrl?: string) => {
    const candidateRaw = typeof overrideUrl === 'string' ? overrideUrl : (sheetUrlInput ?? '');
    const candidateUrl = String(candidateRaw).trim();
    const spreadsheetId = extractSpreadsheetId(candidateUrl);
    if (!spreadsheetId) {
      Alert.alert('Invalid URL', 'Please paste a valid Google Sheets URL or spreadsheet ID.');
      return;
    }

    setIsGoogleLoading(true);
    try {
      const metadata = await googleSheetsService.getSpreadsheetMetadata(spreadsheetId);
      setGoogleSheets(metadata.sheets);
      setSelectedSpreadsheet({
        id: spreadsheetId,
        name: metadata.title || 'Google Sheets',
        modifiedTime: new Date().toISOString(),
      });
      setSelectedGoogleSheets(metadata.sheets.map((sheet) => sheet.title));
      setGoogleRowCounts({});
      try {
        const categoryNames = await googleSheetsService.getCategoryNames(spreadsheetId);
        if (categoryNames.length > 0) {
          upsertCategories(categoryNames);
        }
      } catch {
        // Ignore missing category sheet
      }
      setSheetUrlInput('');
    } catch (error: any) {
      Alert.alert('Google Sheets', error.message || 'Failed to load spreadsheet. Make sure the URL is correct and you have access.');
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handlePickerSelect = async (file: PickedFile) => {
    setShowDrivePicker(false);
    setIsGoogleLoading(true);
    try {
      const metadata = await googleSheetsService.getSpreadsheetMetadata(file.id);
      setGoogleSheets(metadata.sheets);
      setSelectedSpreadsheet({
        id: file.id,
        name: file.name || metadata.title || 'Google Sheets',
        modifiedTime: new Date().toISOString(),
      });
      setSelectedGoogleSheets(metadata.sheets.map((sheet) => sheet.title));
      setGoogleRowCounts({});
      try {
        const categoryNames = await googleSheetsService.getCategoryNames(file.id);
        if (categoryNames.length > 0) {
          upsertCategories(categoryNames);
        }
      } catch {
        // Ignore missing category sheet
      }
    } catch (error: any) {
      Alert.alert('Google Sheets', error.message || 'Failed to load spreadsheet.');
    } finally {
      setIsGoogleLoading(false);
    }
  };

  useEffect(() => {
    const normalizedUrl = Array.isArray(sheetUrl) ? sheetUrl[0]?.trim() : sheetUrl?.trim();
    if (!normalizedUrl) return;
    if (pendingSheetUrlRef.current !== normalizedUrl) {
      pendingSheetUrlRef.current = normalizedUrl;
      setSheetUrlInput(normalizedUrl ?? '');
    }
    if (autoLoad === '1' && googleConnected) {
      if (autoLoadedSheetUrlRef.current === normalizedUrl) return;
      autoLoadedSheetUrlRef.current = normalizedUrl;
      void handleLoadFromUrl(normalizedUrl);
    }
  }, [autoLoad, googleConnected, sheetUrl]);

  const toggleGoogleSheet = (sheetName: string) => {
    setSelectedGoogleSheets((prev) =>
      prev.includes(sheetName)
        ? prev.filter((name) => name !== sheetName)
        : [...prev, sheetName]
    );
  };

  const handleGoogleImport = async () => {
    if (!selectedSpreadsheet) {
      Alert.alert('Google Sheets', 'Select a spreadsheet first.');
      return;
    }
    if (selectedGoogleSheets.length === 0) {
      Alert.alert('Google Sheets', 'Select at least one sheet tab.');
      return;
    }

    setIsGoogleLoading(true);
    showLoadingOverlay('Importing from Google Sheets...');
    try {
      const importedTransactions = await googleSheetsService.importAllSheets(
        selectedSpreadsheet.id,
        selectedGoogleSheets
      );
      const incomeTab =
        selectedGoogleSheets.find((name) => name.toLowerCase().includes('income')) || '';
      const expenseTab =
        selectedGoogleSheets.find((name) => !name.toLowerCase().includes('income')) || '';
      setTransactions(importedTransactions, {
        sourceFile: selectedSpreadsheet.name,
        sheetNames: selectedGoogleSheets,
      });
      setDemoConfig({ isDemoMode: false });
      setSheetsConfig({
        spreadsheetId: selectedSpreadsheet.id,
        sheetName: selectedGoogleSheets[0],
        expenseSheetName: expenseTab || selectedGoogleSheets[0],
        incomeSheetName: incomeTab || selectedGoogleSheets[0],
        isConnected: true,
        selectedTabs: selectedGoogleSheets,
        lastKnownTabs: googleSheets.map((sheet) => sheet.title),
        lastSync: new Date().toISOString(),
      });

      const incomeCount = importedTransactions.filter(t => t.type === 'income').length;
      const expenseCount = importedTransactions.filter(t => t.type === 'expense').length;
      setTabsExpanded(false);

      Alert.alert(
        'Google Sheets Import',
        `Imported ${importedTransactions.length} transactions:\n` +
        `• ${incomeCount} income entries\n` +
        `• ${expenseCount} expense entries`
      );
    } catch (error: any) {
      Alert.alert('Google Sheets', error.message || 'Failed to import data.');
    } finally {
      setIsGoogleLoading(false);
      hideLoadingOverlay();
    }
  };

  const [tabsExpanded, setTabsExpanded] = useState(true);

  const handleGoogleDisconnect = async () => {
    await googleSheetsService.clearToken();
    setGoogleConnected(false);
    setGoogleSheets([]);
    setSelectedSpreadsheet(null);
    setSelectedGoogleSheets([]);
    setSheetUrlInput('');
    setGoogleRowCounts({});
    setSheetsConfig({
      ...sheetsConfig,
      isConnected: false,
    });
  };

  const handleGoogleSync = async () => {
    if (!sheetsConfig.spreadsheetId || !sheetsConfig.selectedTabs?.length) {
      Alert.alert('Google Sheets', 'No saved sheet selection to sync.');
      return;
    }

    setIsGoogleLoading(true);
    showLoadingOverlay('Syncing...');
    try {
      const availableSheets = await googleSheetsService.getSpreadsheetInfo(sheetsConfig.spreadsheetId);
      const availableTitles = availableSheets.map((sheet) => sheet.title);
      const knownTabs = sheetsConfig.lastKnownTabs || sheetsConfig.selectedTabs || [];
      const newTabs = availableTitles.filter((title) => !knownTabs.includes(title));

      const doSync = async () => {
        const importedTransactions = await googleSheetsService.importAllSheets(
          sheetsConfig.spreadsheetId,
          sheetsConfig.selectedTabs || []
        );
        setTransactions(importedTransactions, {
          sourceFile: selectedSpreadsheet?.name || 'Google Sheets',
          sheetNames: sheetsConfig.selectedTabs || [],
        });
        setDemoConfig({ isDemoMode: false });
        setSheetsConfig({
          ...sheetsConfig,
          lastKnownTabs: availableTitles,
          lastSync: new Date().toISOString(),
        });

        const incomeCount = importedTransactions.filter(t => t.type === 'income').length;
        const expenseCount = importedTransactions.filter(t => t.type === 'expense').length;

        Alert.alert(
          'Google Sheets Sync',
          `Synced ${importedTransactions.length} transactions:\n` +
          `• ${incomeCount} income entries\n` +
          `• ${expenseCount} expense entries`
        );
      };

      if (newTabs.length > 0) {
        hideLoadingOverlay();
        Alert.alert(
          'New tabs detected',
          `New tabs found: ${newTabs.slice(0, 5).join(', ')}${newTabs.length > 5 ? '...' : ''}`,
          [
            {
              text: 'Sync existing', onPress: async () => {
                showLoadingOverlay('Syncing...');
                await doSync();
                hideLoadingOverlay();
              }
            },
            {
              text: 'Review tabs', onPress: () => {
                setSelectedSpreadsheet({
                  id: sheetsConfig.spreadsheetId,
                  name: selectedSpreadsheet?.name || 'Google Sheets',
                  modifiedTime: new Date().toISOString(),
                });
                setGoogleSheets(availableSheets);
                setSelectedGoogleSheets(sheetsConfig.selectedTabs || []);
                setSheetsConfig({
                  ...sheetsConfig,
                  lastKnownTabs: availableTitles,
                });
              }
            },
            { text: 'Cancel', style: 'cancel' },
          ]
        );
      } else {
        await doSync();
        hideLoadingOverlay();
      }
    } catch (error: any) {
      Alert.alert('Google Sheets', error.message || 'Failed to sync data.');
      hideLoadingOverlay();
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const clearSelectedSpreadsheet = () => {
    setSelectedSpreadsheet(null);
    setGoogleSheets([]);
    setSelectedGoogleSheets([]);
    setGoogleRowCounts({});
  };

  const setWriteTarget = (type: 'expense' | 'income', sheetName: string) => {
    setSheetsConfig({
      ...(type === 'expense' ? { expenseSheetName: sheetName } : { incomeSheetName: sheetName }),
    });
  };

  const setWriteMode = (sheetName: string, mode: SheetWriteMode) => {
    const current = sheetsConfig.writeModeBySheet || {};
    setSheetsConfig({
      writeModeBySheet: {
        ...current,
        [sheetName]: mode,
      },
    });
  };

  const formatDetectedMode = (mode?: 'grid' | 'transaction') => {
    if (mode === 'grid') return 'Daily Grid';
    if (mode === 'transaction') return 'Transaction Log';
    return 'Unknown';
  };

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
        if (parsed.detectedFormat === 'mixed' && parsed.mixedAnalysis) {
          const ma = parsed.mixedAnalysis;
          Alert.alert(
            'Mixed Format Detected',
            `Found ${parsed.sheets.length} sheet(s)\n\n` +
            `Format: ${ma.sheetType === 'expense' ? 'Expense Sheet' : ma.sheetType === 'income' ? 'Income Sheet' : 'Mixed'}\n\n` +
            `Summary rows: ${ma.summaryRowIndices.length} (will skip)\n` +
            `Detail rows: ${ma.detailRowIndices.length} (will import)\n` +
            `Total rows: ${ma.totalRowIndices.length} (will skip)\n\n` +
            `Categories: ${ma.categoryColumns.map(c => c.name).slice(0, 5).join(', ')}${ma.categoryColumns.length > 5 ? '...' : ''}`
          );
        } else if (parsed.detectedFormat === 'summary' && parsed.summaryMapping) {
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
    showLoadingOverlay('Importing...');
    try {
      const importedTransactions = xlsxParser.parseAllSheets(parsedFile, selectedSheets);
      setTransactions(importedTransactions, {
        sourceFile: fileName || 'Unknown',
        sheetNames: selectedSheets,
      });
      setDemoConfig({ isDemoMode: false });

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
      hideLoadingOverlay();
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
      'Are you sure you want to clear all imported transactions? This will also remove saved data.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            clearData();
            setParsedFile(null);
            setFileName(null);
            setSelectedSheets([]);
            Alert.alert('Cleared', 'All data has been cleared');
          },
        },
      ]
    );
  };

  const handleLoadDemoData = () => {
    loadDemoData();
    Alert.alert('Demo data loaded', 'Sample transactions are ready to explore.');
  };

  // Render mixed format schema
  const renderMixedSchema = (analysis: MixedSheetAnalysis) => {
    const hasDetailRows = analysis.detailRowIndices.length > 0;
    const willImportSummaries = !hasDetailRows && analysis.summaryRowIndices.length > 0;

    return (
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.formatBadge, { backgroundColor: colors.wash }]}>
          <Ionicons name="git-branch" size={16} color={colors.highlight} />
          <Text style={[styles.formatText, { color: colors.ink }]}>
            {willImportSummaries ? 'Monthly Summary Sheet' :
              analysis.sheetType === 'expense' ? 'Expense Sheet' :
                analysis.sheetType === 'income' ? 'Income Sheet' : 'Mixed Sheet'}
          </Text>
        </View>

        <View style={styles.categorySection}>
          <Text style={styles.categoryTitle}>
            Row Analysis
          </Text>
          <View style={styles.rowStats}>
            <View style={styles.statBox}>
              <Text style={[styles.statNumber, hasDetailRows ? {} : { color: palette.muted }]}>
                {analysis.detailRowIndices.length}
              </Text>
              <Text style={styles.statDesc}>
                Detail rows {hasDetailRows ? '(importing)' : ''}
              </Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statNumber, willImportSummaries ? { color: palette.positive } : { color: palette.muted }]}>
                {analysis.summaryRowIndices.length}
              </Text>
              <Text style={styles.statDesc}>
                Summary rows {willImportSummaries ? '(importing)' : '(skipping)'}
              </Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statNumber, { color: palette.muted }]}>{analysis.totalRowIndices.length}</Text>
              <Text style={styles.statDesc}>Total rows (skipping)</Text>
            </View>
          </View>
        </View>

        <View style={styles.categorySection}>
          <Text style={styles.categoryTitle}>
            Categories ({analysis.categoryColumns.length})
          </Text>
          <View style={styles.categoryTags}>
            {analysis.categoryColumns.map((cat, idx) => (
              <View key={idx} style={[styles.tag, styles.expenseTag]}>
                <Text style={styles.tagText}>{cat.name}</Text>
              </View>
            ))}
          </View>
        </View>

        <Text style={styles.hint}>
          Negative values = Expense, Positive values = Income{'\n'}
          {willImportSummaries
            ? 'Monthly summaries will be imported (no daily data found)'
            : 'Only daily detail rows will be imported (no double counting)'}
          {'\n'}Aggregate columns (income, expense, net profit) auto-skipped
        </Text>
      </View>
    );
  };

  // Render summary format schema
  const renderSummarySchema = (mapping: SummaryMapping) => (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.formatBadge, { backgroundColor: colors.wash }]}>
        <Ionicons name="calendar" size={16} color={colors.positive} />
        <Text style={[styles.formatText, { color: colors.ink }]}>Monthly Summary Format</Text>
      </View>

      <View style={styles.categorySection}>
        <Text style={styles.categoryTitle}>
          <Ionicons name="remove-circle" size={14} color={palette.negative} /> Expense Categories ({mapping.expenseCategories.length})
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
          <Ionicons name="add-circle" size={14} color={palette.positive} /> Income Categories ({mapping.incomeCategories.length})
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
            <Ionicons name="calculator" size={14} color={palette.muted} /> Sum Columns (auto-detected, skipped)
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

      <Text style={styles.hint}>
        Aggregate columns (income, expense, net profit) are auto-detected and skipped
      </Text>
    </View>
  );

  // Render transaction format schema
  const renderTransactionSchema = (mapping: ColumnMapping) => (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.formatBadge, { backgroundColor: colors.wash }]}>
        <Ionicons name="list" size={16} color={colors.accent} />
        <Text style={[styles.formatText, { color: colors.ink }]}>Transaction Log Format</Text>
      </View>

      <View style={[styles.schemaRow, { borderBottomColor: colors.border }]}>
        <Text style={[styles.schemaLabel, { color: colors.muted }]}>Date:</Text>
        <Text style={[styles.schemaValue, { color: colors.ink }]}>
          {mapping.dateColumn !== null ? mapping.headers[mapping.dateColumn] : '—'}
        </Text>
      </View>
      <View style={[styles.schemaRow, { borderBottomColor: colors.border }]}>
        <Text style={[styles.schemaLabel, { color: colors.muted }]}>Description:</Text>
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
    <>
      <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
        {demoConfig.isDemoMode && <DemoModeBanner />}

        {/* Prism Plus Section - Always Visible */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.ink }]}>Prism Plus</Text>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {isPremium ? (
              <View style={[styles.premiumActiveCard, { backgroundColor: isDark ? 'rgba(20, 184, 166, 0.1)' : '#F0FDFA', borderColor: colors.accent }]}>
                <View style={styles.premiumActiveIcon}>
                  <Ionicons name="checkmark-circle" size={32} color={colors.accent} />
                </View>
                <View style={styles.premiumActiveContent}>
                  <Text style={[styles.premiumActiveTitle, { color: colors.ink }]}>You're a Prism Plus Member</Text>
                  <Text style={[styles.premiumActiveSubtitle, { color: colors.muted }]}>
                    Enjoy monthly & yearly financial reports
                  </Text>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.premiumCard, { backgroundColor: isDark ? colors.wash : '#FFFBEB', borderColor: isDark ? colors.border : '#FDE68A' }]}
                onPress={() => router.push('/paywall')}
                activeOpacity={0.7}
              >
                <View style={styles.premiumCardIcon}>
                  <Ionicons name="star" size={28} color={isDark ? colors.accent : '#D97706'} />
                </View>
                <View style={styles.premiumCardContent}>
                  <Text style={[styles.premiumCardTitle, { color: isDark ? colors.ink : '#92400E' }]}>
                    Upgrade to Prism Plus
                  </Text>
                  <Text style={[styles.premiumCardSubtitle, { color: isDark ? colors.muted : '#B45309' }]}>
                    Get monthly & yearly financial reports
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={isDark ? colors.muted : '#D97706'} />
              </TouchableOpacity>
            )}

            {/* Restore Purchases Button */}
            <TouchableOpacity
              style={[styles.restorePurchasesButton, { borderColor: colors.border }]}
              onPress={async () => {
                const { restorePurchases } = await import('../../src/services/revenuecat');
                showLoadingOverlay('Restoring purchases...');
                const result = await restorePurchases();
                hideLoadingOverlay();
                if (result.success) {
                  const { setPremium } = usePremiumStore.getState();
                  setPremium(true, 'restored');
                  Alert.alert('Success', 'Your subscription has been restored.');
                } else {
                  Alert.alert('Restore Failed', result.error || 'No active subscription found.');
                }
              }}
            >
              <Ionicons name="refresh" size={16} color={colors.accent} />
              <Text style={[styles.restorePurchasesText, { color: colors.accent }]}>Restore Purchases</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.ink }]}>Google Sheets</Text>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.cardDescription, { color: colors.muted }]}>
              Connect to Google, then paste your spreadsheet URL.
            </Text>

            {!googleConnected ? (
              <View style={[styles.permissionCard, { backgroundColor: colors.wash, borderColor: colors.border }]}>
                <Text style={[styles.permissionTitle, { color: colors.ink }]}>Prism works with your data</Text>
                <Text style={[styles.permissionText, { color: colors.ink }]}>
                  To sync your budget, we need permission to read and write to Google Sheets.
                </Text>
                <Text style={[styles.permissionNote, { color: colors.muted }]}>
                  🔒 Prism can only access the spreadsheet you paste. Your data stays on your device.
                </Text>
                <TouchableOpacity
                  style={[styles.uploadButton, !request && styles.disabledButton]}
                  onPress={() => promptAsync()}
                  disabled={!request || isGoogleLoading}
                >
                  {isGoogleLoading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Ionicons name="logo-google" size={20} color="#fff" />
                      <Text style={styles.uploadButtonText}>Continue to Google</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.googleActions}>
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={handleGoogleDisconnect}
                >
                  <Ionicons name="log-out-outline" size={16} color={palette.accent} />
                  <Text style={styles.secondaryButtonText}>Disconnect</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Sync Status Indicator - shown when connected and premium */}
            {googleConnected && sheetsConfig.isConnected && (
              <View style={{ marginTop: 16 }}>
                <SyncStatusIndicator
                  status={syncStatus}
                  lastSyncTime={lastSyncTime}
                  pendingCount={pendingCount}
                  onPress={() => syncNow(true, true)}
                />
              </View>
            )}

            {googleConnected && (
              <View style={styles.googleSection}>
                {selectedSpreadsheet ? (
                  <View style={styles.googleSelectedCard}>
                    <View style={styles.googleRowInfo}>
                      <Text style={styles.googleRowTitle}>{selectedSpreadsheet.name}</Text>
                      <Text style={styles.googleRowMeta}>
                        Updated {new Date(selectedSpreadsheet.modifiedTime).toLocaleDateString()}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.changeButton}
                      onPress={clearSelectedSpreadsheet}
                    >
                      <Text style={styles.changeButtonText}>Change</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <>
                    <TouchableOpacity
                      style={[styles.primaryButton, isGoogleLoading && styles.primaryButtonDisabled]}
                      onPress={async () => {
                        const stored = await googleSheetsService.getStoredToken();
                        if (stored?.accessToken) {
                          setAccessToken(stored.accessToken);
                          setShowDrivePicker(true);
                        } else {
                          Alert.alert('Authentication Required', 'Please sign in to Google first.');
                        }
                      }}
                      disabled={isGoogleLoading}
                    >
                      {isGoogleLoading ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <>
                          <Ionicons name="document-text-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
                          <Text style={styles.primaryButtonText}>Select Google Sheet</Text>
                        </>
                      )}
                    </TouchableOpacity>
                    <Text style={styles.urlHint}>
                      Choose your budget spreadsheet from Google Drive. Only sheets you select will be accessible to Prism.
                    </Text>
                  </>
                )}
              </View>
            )}

            {selectedSpreadsheet && googleSheets.length > 0 && (
              <View style={styles.googleSection}>
                <TouchableOpacity
                  style={styles.sheetHeaderRow}
                  onPress={() => setTabsExpanded((prev) => !prev)}
                >
                  <Text style={styles.sheetHeader}>
                    Tabs in {selectedSpreadsheet.name}
                  </Text>
                  <Ionicons
                    name={tabsExpanded ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={palette.muted}
                  />
                </TouchableOpacity>
                {tabsExpanded && googleSheets.length > 0 && (
                  <Text style={styles.tabGuidance}>
                    Prism works best with simple transaction lists (date, amount, category).{'\n'}
                    Complex layouts or formulas may not import correctly.
                  </Text>
                )}
                {tabsExpanded && googleSheets.map((sheet) => (
                  <TouchableOpacity
                    key={sheet.sheetId}
                    style={styles.sheetRow}
                    onPress={() => toggleGoogleSheet(sheet.title)}
                  >
                    <Ionicons
                      name={selectedGoogleSheets.includes(sheet.title) ? 'checkbox' : 'square-outline'}
                      size={24}
                      color={selectedGoogleSheets.includes(sheet.title) ? palette.positive : palette.muted}
                    />
                    <View style={styles.sheetInfo}>
                      <Text style={styles.sheetName}>{sheet.title}</Text>
                      <Text style={styles.sheetMeta}>
                        {(googleRowCounts[sheet.title] ?? sheet.rowCount)} rows, {sheet.columnCount} columns
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}

                {selectedGoogleSheets.length > 0 && transactions.length > 0 && (
                  <View style={styles.writeTargetCard}>
                    <TouchableOpacity
                      style={styles.writeTargetHeader}
                      onPress={() => setWriteTargetsExpanded((prev) => !prev)}
                    >
                      <Text style={styles.writeTargetTitle}>Where to save new entries</Text>
                      <Ionicons
                        name={writeTargetsExpanded ? 'chevron-up' : 'chevron-down'}
                        size={16}
                        color={palette.muted}
                      />
                    </TouchableOpacity>
                    {writeTargetsExpanded && (
                      <>
                        <View style={styles.writeTargetRow}>
                          <Text style={styles.writeTargetLabel}>Expense →</Text>
                          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                            <View style={styles.writeTargetChips}>
                              {selectedGoogleSheets.map((name) => (
                                <TouchableOpacity
                                  key={`expense-${name}`}
                                  style={[
                                    styles.writeTargetChip,
                                    sheetsConfig.expenseSheetName === name && styles.writeTargetChipActive,
                                  ]}
                                  onPress={() => setWriteTarget('expense', name)}
                                >
                                  <Text
                                    style={[
                                      styles.writeTargetChipText,
                                      sheetsConfig.expenseSheetName === name && styles.writeTargetChipTextActive,
                                    ]}
                                  >
                                    {name}
                                  </Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                          </ScrollView>
                        </View>
                        <View style={styles.writeTargetRow}>
                          <Text style={styles.writeTargetLabel}>Income →</Text>
                          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                            <View style={styles.writeTargetChips}>
                              {selectedGoogleSheets.map((name) => (
                                <TouchableOpacity
                                  key={`income-${name}`}
                                  style={[
                                    styles.writeTargetChip,
                                    sheetsConfig.incomeSheetName === name && styles.writeTargetChipActive,
                                  ]}
                                  onPress={() => setWriteTarget('income', name)}
                                >
                                  <Text
                                    style={[
                                      styles.writeTargetChipText,
                                      sheetsConfig.incomeSheetName === name && styles.writeTargetChipTextActive,
                                    ]}
                                  >
                                    {name}
                                  </Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                          </ScrollView>
                        </View>
                        <Text style={styles.writeTargetNote}>
                          Writes append only to the selected sheet for each type.
                        </Text>
                      </>
                    )}
                  </View>
                )}

                {(sheetsConfig.expenseSheetName || sheetsConfig.incomeSheetName) && transactions.length > 0 && (
                  <View style={styles.writeTargetCard}>
                    <View style={styles.writeTargetHeader}>
                      <Text style={styles.writeTargetTitle}>Sheet settings</Text>
                    </View>
                    {[
                      { label: 'Expense', sheetName: sheetsConfig.expenseSheetName },
                      { label: 'Income', sheetName: sheetsConfig.incomeSheetName },
                    ]
                      .filter((item) => item.sheetName)
                      .map((item) => {
                        const sheetName = item.sheetName as string;
                        const selectedMode = sheetsConfig.writeModeBySheet?.[sheetName] ?? 'auto';
                        return (
                          <View key={`${item.label}-${sheetName}`} style={styles.sheetSettingRow}>
                            <View style={styles.sheetSettingInfo}>
                              <Text style={styles.sheetSettingLabel}>{item.label} sheet</Text>
                              <Text style={styles.sheetSettingMeta}>{sheetName}</Text>
                              <Text style={styles.sheetSettingDetected}>
                                Detected: {formatDetectedMode(detectedWriteModes[sheetName])}
                              </Text>
                            </View>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                              <View style={styles.writeModeChips}>
                                {(['auto', 'grid', 'transaction'] as SheetWriteMode[]).map((mode) => (
                                  <TouchableOpacity
                                    key={`${sheetName}-${mode}`}
                                    style={[
                                      styles.writeModeChip,
                                      selectedMode === mode && styles.writeModeChipActive,
                                    ]}
                                    onPress={() => setWriteMode(sheetName, mode)}
                                  >
                                    <Text
                                      style={[
                                        styles.writeModeChipText,
                                        selectedMode === mode && styles.writeModeChipTextActive,
                                      ]}
                                    >
                                      {mode === 'auto' ? 'Auto' : mode === 'grid' ? 'Grid' : 'List'}
                                    </Text>
                                  </TouchableOpacity>
                                ))}
                              </View>
                            </ScrollView>
                          </View>
                        );
                      })}
                    <Text style={styles.writeTargetNote}>
                      Auto uses detection. Use Grid or Log to override write behavior.
                    </Text>
                  </View>
                )}

                <TouchableOpacity
                  style={[styles.importButton, { backgroundColor: colors.positive }, isGoogleLoading && styles.disabledButton]}
                  onPress={handleGoogleImport}
                  disabled={isGoogleLoading || selectedGoogleSheets.length === 0}
                >
                  <Ionicons name="download" size={20} color="#fff" />
                  <Text style={styles.buttonText}>
                    Import {selectedGoogleSheets.length} Sheet
                    {selectedGoogleSheets.length !== 1 ? 's' : ''}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.ink }]}>Manual File Import</Text>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.cardDescription, { color: colors.muted }]}>
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
              <View style={[styles.fileInfo, { backgroundColor: colors.wash }]}>
                <Ionicons name="checkmark-circle" size={20} color={colors.positive} />
                <Text style={[styles.fileName, { color: colors.ink }]} numberOfLines={1}>{fileName}</Text>
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
                    color={selectedSheets.includes(sheet.name) ? palette.positive : palette.muted}
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
                style={[styles.importButton, { backgroundColor: colors.positive }, isLoading && styles.disabledButton]}
                onPress={handleImport}
                disabled={isLoading || selectedSheets.length === 0}
              >
                <Ionicons name="download" size={20} color="#fff" />
                <Text style={styles.buttonText}>
                  Import {selectedSheets.length} Sheet{selectedSheets.length !== 1 ? 's' : ''}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {parsedFile && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Detected Schema</Text>
            {parsedFile.detectedFormat === 'mixed' && parsedFile.mixedAnalysis
              ? renderMixedSchema(parsedFile.mixedAnalysis)
              : parsedFile.detectedFormat === 'summary' && parsedFile.summaryMapping
                ? renderSummarySchema(parsedFile.summaryMapping)
                : renderTransactionSchema(parsedFile.inferredMapping)}
          </View>
        )}

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.ink }]}>Data Status</Text>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {/* Persistence indicator */}
            <View style={[styles.persistenceRow, { borderBottomColor: colors.border }]}>
              <Ionicons
                name={_hasHydrated ? 'cloud-done' : 'cloud-outline'}
                size={16}
                color={_hasHydrated ? colors.positive : colors.muted}
              />
              <Text style={[styles.persistenceText, { color: colors.muted }]}>
                {_hasHydrated ? 'Data persisted locally' : 'Loading saved data...'}
              </Text>
            </View>

            <View style={styles.statusRow}>
              <Ionicons
                name={transactions.length > 0 ? 'checkmark-circle' : 'alert-circle'}
                size={24}
                color={transactions.length > 0 ? colors.positive : colors.muted}
              />
              <Text style={[styles.statusText, { color: colors.ink }]}>
                {transactions.length > 0
                  ? `${transactions.length} transactions loaded`
                  : 'No data loaded'}
              </Text>
            </View>

            {transactions.length === 0 && (
              <TouchableOpacity
                style={[styles.importButton, { backgroundColor: colors.accent }]}
                onPress={handleLoadDemoData}
              >
                <Ionicons name="sparkles-outline" size={18} color="#fff" />
                <Text style={styles.buttonText}>Load demo data</Text>
              </TouchableOpacity>
            )}

            {importMetadata && (
              <View style={styles.metadataRow}>
                <Text style={styles.metadataText}>
                  Last import: {new Date(importMetadata.lastImportDate).toLocaleDateString()}
                </Text>
                <Text style={styles.metadataText}>
                  Source: {importMetadata.sourceFile}
                </Text>
                {importMetadata.sheetNames.length > 0 && (
                  <Text style={styles.metadataText}>
                    Sheets: {importMetadata.sheetNames.join(', ')}
                  </Text>
                )}
              </View>
            )}

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

                <View style={styles.demoRow}>
                  <View style={styles.demoInfo}>
                    <Text style={styles.demoTitle}>Demo mode</Text>
                    <Text style={styles.demoSubtitle}>
                      Hide currency amounts while keeping percentages
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.demoButton, demoConfig.hideAmounts && styles.demoButtonActive]}
                    onPress={() => setDemoConfig({ hideAmounts: !demoConfig.hideAmounts })}
                  >
                    <Text style={[styles.demoButtonText, demoConfig.hideAmounts && styles.demoButtonTextActive]}>
                      {demoConfig.hideAmounts ? 'Hidden' : 'Show'}
                    </Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={styles.clearButton}
                  onPress={handleClearData}
                >
                  <Ionicons name="trash" size={18} color={palette.negative} />
                  <Text style={styles.clearButtonText}>Clear All Data</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <View style={styles.card}>
            <Text style={styles.aboutText}>Prism v1.0.0</Text>
            <Text style={styles.hint}>
              Supports .xlsx, .xls, and .csv files{'\n'}
              Auto-detects: Transaction logs & Monthly summaries{'\n'}
              Intelligently categorizes expense vs income columns
            </Text>

            <View style={styles.legalLinks}>
              <TouchableOpacity onPress={() => router.push('/terms-of-service')}>
                <Text style={styles.legalLink}>Terms of Service</Text>
              </TouchableOpacity>
              <Text style={styles.legalSeparator}>•</Text>
              <TouchableOpacity onPress={() => router.push('/privacy-policy')}>
                <Text style={styles.legalLink}>Privacy Policy</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={styles.bottomPadding} />
      </ScrollView>

      {/* Google Drive Picker Modal */}
      {
        showDrivePicker && accessToken && (
          <GoogleDrivePicker
            visible={showDrivePicker}
            accessToken={accessToken}
            onSelect={handlePickerSelect}
            onCancel={() => setShowDrivePicker(false)}
          />
        )
      }
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background,
  },
  content: {
    padding: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    color: palette.ink,
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  card: {
    backgroundColor: palette.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: palette.border,
  },
  permissionCard: {
    backgroundColor: palette.wash,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: palette.border,
  },
  permissionTitle: {
    color: palette.ink,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  permissionText: {
    color: palette.ink,
    fontSize: 13,
    marginBottom: 10,
  },
  permissionNote: {
    color: palette.muted,
    fontSize: 12,
    marginBottom: 14,
  },
  cardDescription: {
    color: palette.muted,
    fontSize: 14,
    marginBottom: 16,
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.accent,
    padding: 16,
    borderRadius: 12,
    gap: 10,
  },
  uploadButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  googleActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.wash,
  },
  secondaryButtonDisabled: {
    opacity: 0.6,
  },
  secondaryButtonText: {
    color: palette.accent,
    fontSize: 12,
    fontWeight: '600',
  },
  googleSection: {
    marginTop: 16,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: palette.ink,
    backgroundColor: '#fff',
  },
  searchButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: palette.muted,
    fontSize: 12,
    marginTop: 4,
  },
  urlHint: {
    color: palette.muted,
    fontSize: 12,
    marginTop: 8,
    lineHeight: 18,
  },
  googleList: {
    gap: 8,
  },
  googleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.wash,
  },
  googleRowInfo: {
    flex: 1,
    marginRight: 10,
  },
  googleRowTitle: {
    color: palette.ink,
    fontSize: 14,
    fontWeight: '600',
  },
  googleRowMeta: {
    color: palette.muted,
    fontSize: 12,
    marginTop: 2,
  },
  sheetHeader: {
    color: palette.ink,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  sheetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  googleSelectedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.card,
  },
  changeButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.wash,
  },
  changeButtonText: {
    color: palette.accent,
    fontSize: 12,
    fontWeight: '600',
  },
  fileInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    padding: 10,
    backgroundColor: palette.wash,
    borderRadius: 10,
  },
  fileName: {
    color: palette.ink,
    fontSize: 14,
    marginLeft: 8,
    flex: 1,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  sheetInfo: {
    marginLeft: 12,
    flex: 1,
  },
  sheetName: {
    color: palette.ink,
    fontSize: 16,
    fontWeight: '600',
  },
  sheetMeta: {
    color: palette.muted,
    fontSize: 12,
    marginTop: 2,
  },
  tabGuidance: {
    color: palette.muted,
    fontSize: 13,
    marginTop: 12,
    fontStyle: 'italic',
  },
  writeTargetCard: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: palette.border,
  },
  writeTargetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  writeTargetTitle: {
    color: palette.ink,
    fontSize: 14,
    fontWeight: '600',
  },
  writeTargetRow: {
    marginBottom: 10,
  },
  writeTargetLabel: {
    color: palette.muted,
    fontSize: 12,
    marginBottom: 8,
  },
  writeTargetChips: {
    flexDirection: 'row',
    gap: 8,
  },
  writeTargetChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.wash,
  },
  writeTargetChipActive: {
    backgroundColor: palette.accent,
    borderColor: palette.accent,
  },
  writeTargetChipText: {
    color: palette.ink,
    fontSize: 12,
    fontWeight: '600',
  },
  writeTargetChipTextActive: {
    color: '#fff',
  },
  writeTargetNote: {
    color: palette.muted,
    fontSize: 11,
  },
  sheetSettingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  sheetSettingInfo: {
    flex: 1,
  },
  sheetSettingLabel: {
    color: palette.muted,
    fontSize: 12,
    marginBottom: 2,
  },
  sheetSettingMeta: {
    color: palette.ink,
    fontSize: 13,
    fontWeight: '600',
  },
  sheetSettingDetected: {
    color: palette.muted,
    fontSize: 11,
    marginTop: 2,
  },
  writeModeChips: {
    flexDirection: 'row',
    gap: 6,
  },
  writeModeChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.wash,
  },
  writeModeChipActive: {
    backgroundColor: palette.ink,
    borderColor: palette.ink,
  },
  writeModeChipText: {
    color: palette.ink,
    fontSize: 11,
    fontWeight: '600',
  },
  writeModeChipTextActive: {
    color: '#fff',
  },
  importButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: 12,
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
    backgroundColor: palette.wash,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    alignSelf: 'flex-start',
    marginBottom: 16,
    gap: 6,
  },
  formatText: {
    color: palette.ink,
    fontSize: 13,
    fontWeight: '500',
  },
  categorySection: {
    marginBottom: 16,
  },
  categoryTitle: {
    color: palette.muted,
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
    backgroundColor: '#FCE8EA',
    borderWidth: 1,
    borderColor: palette.negative,
  },
  incomeTag: {
    backgroundColor: '#E6F4EA',
    borderWidth: 1,
    borderColor: palette.positive,
  },
  summaryTag: {
    backgroundColor: '#EFE8DD',
    borderWidth: 1,
    borderColor: palette.border,
  },
  tagText: {
    color: palette.ink,
    fontSize: 12,
  },
  noneText: {
    color: palette.muted,
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
    color: palette.accent,
    fontSize: 11,
    fontStyle: 'italic',
  },
  rowStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 8,
  },
  statBox: {
    alignItems: 'center',
    flex: 1,
  },
  statNumber: {
    color: palette.positive,
    fontSize: 24,
    fontWeight: '700',
  },
  statDesc: {
    color: palette.muted,
    fontSize: 10,
    textAlign: 'center',
    marginTop: 4,
  },
  schemaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  schemaLabel: {
    color: palette.muted,
    fontSize: 14,
  },
  schemaValue: {
    color: palette.ink,
    fontSize: 14,
    fontWeight: '500',
  },
  persistenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  persistenceText: {
    color: palette.muted,
    fontSize: 12,
    marginLeft: 6,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusText: {
    color: palette.ink,
    fontSize: 16,
    marginLeft: 12,
  },
  metadataRow: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: palette.border,
  },
  metadataText: {
    color: palette.muted,
    fontSize: 12,
    marginBottom: 4,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: palette.border,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    color: palette.ink,
    fontSize: 20,
    fontWeight: '600',
  },
  statLabel: {
    color: palette.muted,
    fontSize: 12,
    marginTop: 4,
  },
  demoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: palette.border,
    marginTop: 12,
  },
  demoInfo: {
    flex: 1,
    marginRight: 12,
  },
  demoTitle: {
    color: palette.ink,
    fontSize: 14,
    fontWeight: '600',
  },
  demoSubtitle: {
    color: palette.muted,
    fontSize: 12,
    marginTop: 2,
  },
  demoButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.wash,
  },
  demoButtonActive: {
    backgroundColor: palette.card,
    borderColor: palette.accentSoft,
  },
  demoButtonText: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  demoButtonTextActive: {
    color: palette.ink,
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: palette.negative,
    borderRadius: 12,
  },
  clearButtonText: {
    color: palette.negative,
    fontSize: 14,
    marginLeft: 8,
  },
  aboutText: {
    color: palette.ink,
    fontSize: 16,
  },
  hint: {
    color: palette.muted,
    fontSize: 12,
    marginTop: 8,
    lineHeight: 18,
  },
  legalLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    gap: 8,
  },
  legalLink: {
    color: palette.accent,
    fontSize: 13,
    textDecorationLine: 'underline',
  },
  legalSeparator: {
    color: palette.muted,
    fontSize: 13,
  },
  bottomPadding: {
    height: 40,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: palette.ink,
  },
  settingHint: {
    fontSize: 12,
    color: palette.muted,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: palette.wash,
    marginVertical: 4,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  menuIconBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: palette.wash,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  menuContent: {
    flex: 1,
  },
  menuTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: palette.ink,
  },
  menuSubtitle: {
    fontSize: 13,
    color: palette.muted,
    marginTop: 2,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.accent,
    padding: 16,
    borderRadius: 12,
    minHeight: 52,
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: palette.wash,
    borderRadius: 8,
    padding: 2,
    marginTop: 8,
  },
  segmentedButton: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: 6,
  },
  segmentedButtonActive: {
    backgroundColor: palette.card,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  segmentedText: {
    fontSize: 13,
    color: palette.muted,
    fontWeight: '500',
  },
  segmentedTextActive: {
    color: palette.ink,
    fontWeight: '600',
  },
  premiumActiveCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  premiumActiveIcon: {
    marginRight: 12,
  },
  premiumActiveContent: {
    flex: 1,
  },
  premiumActiveTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  premiumActiveSubtitle: {
    fontSize: 13,
  },
  premiumCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  premiumCardIcon: {
    marginRight: 12,
  },
  premiumCardContent: {
    flex: 1,
  },
  premiumCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  premiumCardSubtitle: {
    fontSize: 13,
  },
  restorePurchasesButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 6,
  },
  restorePurchasesText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
