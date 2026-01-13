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

    // Premium gradient inspired by modern health/finance apps
    // Light mode: subtle blue to warm cream (noticeable but elegant)
    // Dark mode: deep cool gradient
    const gradientColors = isDark
        ? ['#0F172A', '#1E1B2E', '#121212'] as const
        : ['#E8F4FD', '#F0F4FB', '#F6F3EF'] as const;

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            {/* Premium gradient background */}
            <LinearGradient
                colors={gradientColors}
                locations={[0, 0.4, 1]}
                style={StyleSheet.absoluteFill}
                start={{ x: 0.2, y: 0 }}
                end={{ x: 0.8, y: 1 }}
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
