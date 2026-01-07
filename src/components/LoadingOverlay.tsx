import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View, Image } from 'react-native';
import { useLoadingOverlay } from '../store/loadingOverlayStore';
import PrismLoader from './PrismLoader';

const palette = {
  ink: '#1E1B16',
};

const LOADER_SIZE = 140;

export const LoadingOverlay = () => {
  const { isVisible, message } = useLoadingOverlay();
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    if (isVisible) {
      // Entry animation
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          friction: 8,
          tension: 80,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 0.9,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isVisible, opacity, scale]);

  if (!isVisible) return null;

  return (
    <View style={styles.container} pointerEvents="auto">
      {/* Subtle backdrop */}
      <Animated.View style={[styles.backdrop, { opacity }]} />

      {/* Centered content */}
      <Animated.View
        style={[
          styles.content,
          {
            opacity,
            transform: [{ scale }],
          },
        ]}
      >
        <View style={styles.loaderContainer}>
          <Image
            source={require('../../assets/prism-nobackground.png')}
            style={styles.loaderImage}
            resizeMode="contain"
          />
          <PrismLoader
            size={LOADER_SIZE}
            isLoading={isVisible}
            showPrism={false}
            showGlow={false}
            style={styles.loaderOverlay}
          />
        </View>

        <Text style={styles.message}>{message}</Text>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  loaderContainer: {
    width: LOADER_SIZE,
    height: LOADER_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loaderImage: {
    width: LOADER_SIZE,
    height: LOADER_SIZE,
  },
  loaderOverlay: {
    position: 'absolute',
  },
  message: {
    marginTop: 24,
    fontSize: 17,
    fontWeight: '600',
    color: palette.ink,
    textAlign: 'center',
  },
});

export default LoadingOverlay;
