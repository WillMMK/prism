
import { Platform } from 'react-native';

export const typography = {
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif', default: 'System' }),
    weights: {
        regular: '400',
        medium: '500',
        semibold: '600',
        bold: '700',
    } as const,
    sizes: {
        xs: 12,
        sm: 14,
        md: 16,
        lg: 20,
        xl: 24,
        xxl: 32,
    },
};
