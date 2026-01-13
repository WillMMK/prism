import React from 'react';
import { View, ViewStyle, StyleSheet } from 'react-native';
import { useTheme } from '../theme';
import { shadows, borderRadius } from '../theme/spacing';

interface CardProps {
    children: React.ReactNode;
    style?: ViewStyle;
    variant?: 'default' | 'elevated' | 'flat';
    padding?: 'none' | 'sm' | 'md' | 'lg';
}

/**
 * Consistent card component with shadow styling.
 * Use this for all card-based UI across the app.
 */
export function Card({
    children,
    style,
    variant = 'default',
    padding = 'md',
}: CardProps) {
    const { colors, isDark } = useTheme();

    const paddingValue = {
        none: 0,
        sm: 12,
        md: 20,
        lg: 24,
    }[padding];

    const shadowStyle = {
        default: shadows.md,
        elevated: shadows.lg,
        flat: {},
    }[variant];

    return (
        <View
            style={[
                styles.card,
                shadowStyle,
                {
                    backgroundColor: colors.card,
                    padding: paddingValue,
                },
                style,
            ]}
        >
            {children}
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        borderRadius: borderRadius.lg,
        overflow: 'hidden',
    },
});
