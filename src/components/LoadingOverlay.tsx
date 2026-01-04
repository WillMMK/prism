import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View, Image, Easing, Dimensions } from 'react-native';
import { useLoadingOverlay } from '../store/loadingOverlayStore';

const palette = {
  ink: '#1E1B16',
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ICON_SIZE = 180;

// Rainbow colors for the dispersed beams
const RAINBOW_COLORS = [
  '#00BCD4', // Cyan
  '#4DD0E1', // Light cyan
  '#26A69A', // Teal
  '#66BB6A', // Green
  '#FFA726', // Orange
  '#EF5350', // Red
];

export const LoadingOverlay = () => {
  const { isVisible, message } = useLoadingOverlay();
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.9)).current;

  // Input beam (white light from left)
  const inputBeam = useRef(new Animated.Value(0)).current;

  // Output beams (rainbow dispersing to right)
  const outputBeams = useRef(RAINBOW_COLORS.map(() => new Animated.Value(0))).current;

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

      // Input beam animation (white light entering from left)
      const inputAnimation = Animated.loop(
        Animated.sequence([
          Animated.timing(inputBeam, {
            toValue: 1,
            duration: 800,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(inputBeam, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
          Animated.delay(400),
        ])
      );

      // Output beams animation (rainbow dispersing to right)
      const outputAnimations = outputBeams.map((beam, index) =>
        Animated.loop(
          Animated.sequence([
            Animated.delay(600 + index * 80), // Staggered start after input
            Animated.timing(beam, {
              toValue: 1,
              duration: 600,
              easing: Easing.out(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(beam, {
              toValue: 0,
              duration: 0,
              useNativeDriver: true,
            }),
            Animated.delay(600 - index * 80),
          ])
        )
      );

      inputAnimation.start();
      outputAnimations.forEach(anim => anim.start());

      return () => {
        inputAnimation.stop();
        outputAnimations.forEach(anim => anim.stop());
        inputBeam.setValue(0);
        outputBeams.forEach(beam => beam.setValue(0));
      };
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
  }, [isVisible, opacity, scale, inputBeam, outputBeams]);

  if (!isVisible) return null;

  // Calculate beam angles for divergence effect
  const getOutputBeamStyle = (index: number, beam: Animated.Value) => {
    const angle = -25 + (index * 10); // Spread from -25° to +25°
    const translateX = beam.interpolate({
      inputRange: [0, 1],
      outputRange: [0, SCREEN_WIDTH * 0.4],
    });
    const beamOpacity = beam.interpolate({
      inputRange: [0, 0.3, 0.7, 1],
      outputRange: [0, 1, 1, 0],
    });

    return {
      opacity: beamOpacity,
      transform: [
        { translateX },
        { rotate: `${angle}deg` },
      ],
    };
  };

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
        {/* Beams container */}
        <View style={styles.beamsContainer}>
          {/* Input beam (white light from left) */}
          <Animated.View
            style={[
              styles.inputBeam,
              {
                opacity: inputBeam.interpolate({
                  inputRange: [0, 0.5, 1],
                  outputRange: [0, 1, 0.3],
                }),
                transform: [
                  {
                    translateX: inputBeam.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-SCREEN_WIDTH * 0.3, 0],
                    }),
                  },
                ],
              },
            ]}
          />

          {/* Icon */}
          <View style={styles.iconContainer}>
            <Image
              source={require('../../assets/icon.png')}
              style={styles.icon}
              resizeMode="contain"
            />
          </View>

          {/* Output beams (rainbow dispersing to right) */}
          <View style={styles.outputBeamsContainer}>
            {RAINBOW_COLORS.map((color, index) => (
              <Animated.View
                key={color}
                style={[
                  styles.outputBeam,
                  { backgroundColor: color },
                  getOutputBeamStyle(index, outputBeams[index]),
                ]}
              />
            ))}
          </View>
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
  beamsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: SCREEN_WIDTH,
    height: ICON_SIZE + 40,
  },
  inputBeam: {
    position: 'absolute',
    left: 0,
    width: SCREEN_WIDTH * 0.5,
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 8,
  },
  iconContainer: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    zIndex: 10,
  },
  icon: {
    width: ICON_SIZE,
    height: ICON_SIZE,
  },
  outputBeamsContainer: {
    position: 'absolute',
    right: SCREEN_WIDTH * 0.5 - ICON_SIZE * 0.3,
    width: SCREEN_WIDTH * 0.5,
    height: ICON_SIZE,
    justifyContent: 'center',
  },
  outputBeam: {
    position: 'absolute',
    left: 0,
    width: SCREEN_WIDTH * 0.4,
    height: 3,
    borderRadius: 2,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
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
