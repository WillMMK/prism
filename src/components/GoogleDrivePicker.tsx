import React, { useCallback, useState, useEffect } from 'react';
import {
  Modal,
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  ActivityIndicator,
  Platform,
} from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';

// Hosted picker page URL
const PICKER_PAGE_URL = 'https://www.getprismbudget.com/picker.html';

export interface PickedFile {
  id: string;
  name: string;
  mimeType: string;
}

interface GoogleDrivePickerProps {
  visible: boolean;
  accessToken: string;
  onSelect: (file: PickedFile) => void;
  onCancel: () => void;
}

/**
 * Google Drive file picker that opens in Safari View Controller
 * Uses user's existing Google session - no need to sign in again
 */
export function GoogleDrivePicker({
  visible,
  accessToken,
  onSelect,
  onCancel,
}: GoogleDrivePickerProps) {
  const { colors } = useTheme();
  const [isLoading, setIsLoading] = useState(false);

  // Handle deep link callback from picker page
  const handleUrl = useCallback((event: { url: string }) => {
    const { url } = event;
    console.log('[Picker] Deep link received:', url);

    if (url.includes('picker')) {
      try {
        const parsed = Linking.parse(url);
        const params = parsed.queryParams || {};

        if (params.fileId) {
          onSelect({
            id: String(params.fileId),
            name: String(params.fileName || 'Spreadsheet'),
            mimeType: 'application/vnd.google-apps.spreadsheet',
          });
        } else if (params.cancelled || params.cancel) {
          onCancel();
        }
      } catch (e) {
        console.log('[Picker] Error parsing deep link:', e);
      }
    }
  }, [onSelect, onCancel]);

  // Set up deep link listener
  useEffect(() => {
    const subscription = Linking.addEventListener('url', handleUrl);
    return () => subscription.remove();
  }, [handleUrl]);

  const openPickerInBrowser = async () => {
    setIsLoading(true);

    try {
      // Build picker URL with token
      const pickerUrl = `${PICKER_PAGE_URL}?token=${encodeURIComponent(accessToken)}&scheme=budget-tracker`;
      console.log('[Picker] Opening browser...');

      // Open in Safari View Controller (shares cookies with Safari)
      const result = await WebBrowser.openAuthSessionAsync(pickerUrl, 'budget-tracker://picker');

      console.log('[Picker] Browser result:', result.type);

      if (result.type === 'success' && result.url) {
        handleUrl({ url: result.url });
      }
      // If cancelled/dismissed, user can tap button again
    } catch (error) {
      console.log('[Picker] Browser error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onCancel}
    >
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <TouchableOpacity style={styles.closeButton} onPress={onCancel}>
            <Ionicons name="close" size={24} color={colors.ink} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.ink }]}>Select Spreadsheet</Text>
          <View style={styles.placeholder} />
        </View>

        <View style={styles.content}>
          <View style={styles.centerContainer}>
            <Ionicons name="folder-open-outline" size={56} color={colors.accent} />
            <Text style={[styles.infoTitle, { color: colors.ink }]}>
              Select from Google Drive
            </Text>
            <Text style={[styles.infoText, { color: colors.muted }]}>
              Choose your budget spreadsheet from{'\n'}Google Drive
            </Text>
            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: colors.accent }, isLoading && styles.buttonDisabled]}
              onPress={openPickerInBrowser}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="open-outline" size={20} color="#fff" />
                  <Text style={styles.primaryButtonText}>Open Google Drive</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 12 : 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  closeButton: { padding: 4 },
  title: { fontSize: 17, fontWeight: '600' },
  placeholder: { width: 32 },
  content: { flex: 1 },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  infoTitle: {
    fontSize: 22,
    fontWeight: '600',
    marginTop: 20,
    marginBottom: 10,
  },
  infoText: {
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 22,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 14,
    minWidth: 220,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});

export default GoogleDrivePicker;
