import React from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../theme';

interface AuroraBackgroundProps {
    children?: React.ReactNode;
    /** Optional: use grouped style (slightly different shade) */
    variant?: 'default' | 'grouped';
}

/**
 * Premium background component following Apple iOS design principles.
 * Uses clean, minimal backgrounds with optional subtle gradients.
 * No decorative shapes - lets content be the focus.
 */
export const AuroraBackground: React.FC<AuroraBackgroundProps> = ({
    children,
    variant = 'default'
}) => {
    const { isDark, colors } = useTheme();

    // iOS-style gradient: extremely subtle, barely perceptible
    // Light mode: warm white to cool white (like Apple's systemBackground)
    // Dark mode: pure dark with hint of depth
    const gradientColors = isDark
        ? ['#000000', '#0A0A0A', '#000000'] as const
        : ['#FFFFFF', '#FAFAFA', '#F5F5F7'] as const;

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            {/* Subtle vertical gradient for depth - Apple style */}
            <LinearGradient
                colors={gradientColors}
                locations={[0, 0.5, 1]}
                style={StyleSheet.absoluteFill}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
            />

            {/* Content Layer */}
            <View style={styles.content}>
                {children}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    content: {
        flex: 1,
    },
});

export default AuroraBackground;
