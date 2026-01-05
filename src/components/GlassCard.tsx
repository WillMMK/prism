import React, { ReactNode } from 'react';
import { View, StyleSheet, ViewStyle, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { useTheme } from '../theme';

interface GlassCardProps {
  children: ReactNode;
  style?: ViewStyle;
  intensity?: number;
  borderRadius?: number;
  noPadding?: boolean;
}

export default function GlassCard({
  children,
  style,
  intensity = 60,
  borderRadius = 20,
  noPadding = false,
}: GlassCardProps) {
  const { colors, isDark } = useTheme();

  // Glassmorphism works best on iOS with BlurView
  // On Android/web, we fall back to semi-transparent background
  const supportsBlur = Platform.OS === 'ios';

  const containerStyle: ViewStyle = {
    borderRadius,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: isDark
      ? 'rgba(255, 255, 255, 0.1)'
      : 'rgba(255, 255, 255, 0.6)',
    ...style,
  };

  const contentStyle: ViewStyle = {
    padding: noPadding ? 0 : 20,
  };

  if (supportsBlur) {
    return (
      <View style={[styles.shadowContainer, { borderRadius }]}>
        <BlurView
          intensity={intensity}
          tint={isDark ? 'dark' : 'light'}
          style={containerStyle}
        >
          <View
            style={[
              contentStyle,
              {
                backgroundColor: isDark
                  ? 'rgba(40, 40, 45, 0.6)'
                  : 'rgba(255, 255, 255, 0.7)',
              },
            ]}
          >
            {children}
          </View>
        </BlurView>
      </View>
    );
  }

  // Fallback for Android/Web - clean card with subtle transparency
  return (
    <View
      style={[
        styles.shadowContainer,
        containerStyle,
        {
          backgroundColor: isDark
            ? 'rgba(42, 42, 46, 0.9)'
            : 'rgba(255, 255, 255, 0.85)',
        },
      ]}
    >
      <View style={contentStyle}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  shadowContainer: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
});
