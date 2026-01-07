import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, ViewStyle } from 'react-native';
import Svg, { Polygon, Line, Defs, LinearGradient, Stop, Path } from 'react-native-svg';

const AnimatedLine = Animated.createAnimatedComponent(Line);
const AnimatedPath = Animated.createAnimatedComponent(Path);

interface PrismLoaderProps {
  size?: number;
  isLoading?: boolean;
  showPrism?: boolean;
  showGlow?: boolean;
  style?: ViewStyle;
}

const RAINBOW_COLORS = [
  '#FF6B6B', // Red
  '#FF8E53', // Orange
  '#FFD93D', // Yellow
  '#6BCB77', // Green
  '#4D96FF', // Blue
  '#9B59B6', // Indigo/Violet
];

export const PrismLoader = ({
  size = 80,
  isLoading = true,
  showPrism = true,
  showGlow = true,
  style,
}: PrismLoaderProps) => {
  const beamProgress = useRef(new Animated.Value(0)).current;
  const glowOpacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    if (!isLoading) {
      beamProgress.setValue(0);
      glowOpacity.setValue(0.3);
      return;
    }

    const beamAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(beamProgress, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: false,
        }),
        Animated.timing(beamProgress, {
          toValue: 0,
          duration: 0,
          useNativeDriver: false,
        }),
      ])
    );

    const glowAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(glowOpacity, {
          toValue: 0.8,
          duration: 600,
          useNativeDriver: false,
        }),
        Animated.timing(glowOpacity, {
          toValue: 0.3,
          duration: 600,
          useNativeDriver: false,
        }),
      ])
    );

    beamAnimation.start();
    glowAnimation.start();

    return () => {
      beamAnimation.stop();
      glowAnimation.stop();
    };
  }, [isLoading, beamProgress, glowOpacity]);

  const scale = size / 80;
  const viewBox = '0 0 100 60';

  // Prism vertices (centered triangle)
  const prismPoints = '35,50 50,12 65,50';

  // Calculate divergent beam end points
  const beamStartX = 50; // Center of prism (exit point)
  const beamStartY = 35;

  // Divergent angles for rainbow beams (spreading out to the right)
  const beamAngles = [-35, -21, -7, 7, 21, 35]; // Degrees from horizontal
  const beamLength = 45;

  const getBeamEndPoint = (angleDeg: number) => {
    const angleRad = (angleDeg * Math.PI) / 180;
    return {
      x: beamStartX + beamLength * Math.cos(angleRad),
      y: beamStartY + beamLength * Math.sin(angleRad),
    };
  };

  return (
    <View style={[styles.container, { width: size, height: size * 0.75 }, style]}>
      <Svg
        width={size}
        height={size * 0.75}
        viewBox={viewBox}
      >
        <Defs>
          <LinearGradient id="prismGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#E0F7FA" stopOpacity={0.9} />
            <Stop offset="50%" stopColor="#B2EBF2" stopOpacity={0.8} />
            <Stop offset="100%" stopColor="#80DEEA" stopOpacity={0.9} />
          </LinearGradient>
          <LinearGradient id="incomingBeam" x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.2} />
            <Stop offset="100%" stopColor="#FFFFFF" stopOpacity={0.9} />
          </LinearGradient>
        </Defs>

        {/* Incoming white light beam */}
        <Line
          x1={5}
          y1={35}
          x2={42}
          y2={35}
          stroke="url(#incomingBeam)"
          strokeWidth={3}
          strokeLinecap="round"
        />

        {/* Divergent rainbow beams */}
        {RAINBOW_COLORS.map((color, index) => {
          const endPoint = getBeamEndPoint(beamAngles[index]);

          return (
            <AnimatedBeam
              key={color}
              startX={beamStartX}
              startY={beamStartY}
              endX={endPoint.x}
              endY={endPoint.y}
              color={color}
              progress={beamProgress}
              delay={index * 0.08}
            />
          );
        })}

        {showPrism && (
          <>
            <Polygon
              points={prismPoints}
              fill="url(#prismGradient)"
              stroke="#80CBC4"
              strokeWidth={1.5}
            />
            <Path
              d="M 38,47 L 50,16 L 52,16 L 40,47 Z"
              fill="#FFFFFF"
              opacity={0.4}
            />
          </>
        )}
      </Svg>

      {/* Animated glow effect */}
      {showGlow && (
        <Animated.View
          style={[
            styles.glow,
            {
              opacity: glowOpacity,
              transform: [{ scale }],
            },
          ]}
        />
      )}
    </View>
  );
};

interface AnimatedBeamProps {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  color: string;
  progress: Animated.Value;
  delay: number;
}

const AnimatedBeam = ({
  startX,
  startY,
  endX,
  endY,
  color,
  progress,
  delay,
}: AnimatedBeamProps) => {
  // Interpolate the beam drawing based on progress
  const animatedX2 = progress.interpolate({
    inputRange: [0, delay, Math.min(delay + 0.6, 1), 1],
    outputRange: [startX, startX, endX, endX],
    extrapolate: 'clamp',
  });

  const animatedY2 = progress.interpolate({
    inputRange: [0, delay, Math.min(delay + 0.6, 1), 1],
    outputRange: [startY, startY, endY, endY],
    extrapolate: 'clamp',
  });

  const animatedOpacity = progress.interpolate({
    inputRange: [0, delay, Math.min(delay + 0.3, 1), 0.85, 1],
    outputRange: [0, 0, 0.9, 0.9, 0],
    extrapolate: 'clamp',
  });

  return (
    <AnimatedLine
      x1={startX}
      y1={startY}
      x2={animatedX2}
      y2={animatedY2}
      stroke={color}
      strokeWidth={2.5}
      strokeLinecap="round"
      opacity={animatedOpacity}
    />
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  glow: {
    position: 'absolute',
    width: 40,
    height: 30,
    backgroundColor: '#80DEEA',
    borderRadius: 20,
    opacity: 0.3,
  },
});

export default PrismLoader;
