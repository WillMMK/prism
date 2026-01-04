import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useToastStore } from '../store/toastStore';

const palette = {
  ink: '#1E1B16',
  card: '#FFFFFF',
  shadow: '#000000',
  success: '#0F766E',
  info: '#2F4F4F',
  error: '#B91C1C',
};

export const Toast = () => {
  const { message, tone, visible, durationMs, hideToast } = useToastStore();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(12)).current;
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toneColor = useMemo(() => {
    if (tone === 'success') return palette.success;
    if (tone === 'error') return palette.error;
    return palette.info;
  }, [tone]);

  useEffect(() => {
    if (!visible) {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 160,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 12,
          duration: 160,
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 180,
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
  }, [visible, durationMs, hideToast, opacity, translateY]);

  if (!message) return null;

  return (
    <View pointerEvents="none" style={styles.container}>
      <Animated.View
        style={[
          styles.toast,
          {
            borderLeftColor: toneColor,
            opacity,
            transform: [{ translateY }],
          },
        ]}
      >
        <Text style={styles.text}>{message}</Text>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '38%',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  toast: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: palette.card,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderLeftWidth: 4,
    shadowColor: palette.shadow,
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  text: {
    color: palette.ink,
    fontSize: 14,
    fontWeight: '600',
  },
});

export default Toast;
