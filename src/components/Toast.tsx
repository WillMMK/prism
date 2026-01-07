import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, Text, View, Platform, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useToastStore } from '../store/toastStore';
import { useTheme } from '../theme';

const { width } = Dimensions.get('window');

export const Toast = () => {
  const { message, tone, visible, durationMs, hideToast } = useToastStore();
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();

  // Animation values
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-20)).current;
  const scale = useRef(new Animated.Value(0.9)).current;

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const config = useMemo(() => {
    switch (tone) {
      case 'success':
        return { icon: 'checkmark-circle' as const, color: '#10B981', bg: isDark ? 'rgba(6, 78, 59, 0.8)' : 'rgba(209, 250, 229, 0.9)' };
      case 'error':
        return { icon: 'alert-circle' as const, color: '#EF4444', bg: isDark ? 'rgba(127, 29, 29, 0.8)' : 'rgba(254, 226, 226, 0.9)' };
      default:
        return { icon: 'information-circle' as const, color: isDark ? '#FFF' : '#1E1B16', bg: isDark ? 'rgba(39, 39, 42, 0.8)' : 'rgba(255, 255, 255, 0.9)' };
    }
  }, [tone, isDark]);

  useEffect(() => {
    if (!visible) {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: -20,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 0.9,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    // Show animation
    Animated.parallel([
      Animated.spring(opacity, {
        toValue: 1,
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      hideToast();
    }, durationMs);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [visible, durationMs, hideToast]);

  if (!message) return null;

  const topPadding = Math.max(insets.top, 44) + 12; // Dynamic Island / Notch avoidance

  return (
    <View pointerEvents="none" style={[styles.container, { top: topPadding }]}>
      <Animated.View
        style={[
          styles.toast,
          {
            opacity,
            transform: [{ translateY }, { scale }],
            backgroundColor: config.bg,
            borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
          },
        ]}
      >
        {Platform.OS === 'ios' && (
          <BlurView
            style={StyleSheet.absoluteFill}
            intensity={40}
            tint={isDark ? 'dark' : 'light'}
          />
        )}

        <View style={styles.content}>
          <Ionicons name={config.icon} size={20} color={config.color} style={styles.icon} />
          <Text style={[styles.text, { color: isDark ? '#FFF' : '#1E1B16' }]}>
            {message}
          </Text>
        </View>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 9999,
    paddingHorizontal: 16,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 99, // Capsule shape
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    maxWidth: Math.min(width - 32, 400),
    overflow: 'hidden', // Required for BlurView
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    marginRight: 10,
  },
  text: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
});

export default Toast;
