import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '../theme';

export default function DemoModeBanner() {
  const router = useRouter();
  const { colors, isDark } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : colors.wash, borderColor: colors.border }]}
    >
      <View style={styles.left}>
        <View style={[styles.badge, { backgroundColor: isDark ? 'rgba(20, 184, 166, 0.2)' : 'rgba(20, 184, 166, 0.12)' }]}
        >
          <Ionicons name="flask-outline" size={14} color={colors.accent} />
          <Text style={[styles.badgeText, { color: colors.accent }]}>Demo mode</Text>
        </View>
        <Text style={[styles.text, { color: colors.ink }]}>Connect your Google Sheet for real data.</Text>
      </View>
      <TouchableOpacity style={[styles.button, { borderColor: colors.border }]} onPress={() => router.push('/settings')}>
        <Text style={[styles.buttonText, { color: colors.ink }]}>Go to Settings</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 16,
  },
  left: {
    flex: 1,
  },
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    marginBottom: 8,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  text: {
    fontSize: 13,
    fontWeight: '500',
  },
  button: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  buttonText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
