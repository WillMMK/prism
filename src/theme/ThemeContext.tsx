
import React, { createContext, useContext, ReactNode } from 'react';
import { Appearance } from 'react-native';
import { useSettingsStore } from '../store/settingsStore';
import { lightPalette, darkPalette, Palette } from './palette';
import { typography } from './typography';
import { spacing, borderRadius, layout } from './spacing';

interface ThemeContextType {
    colors: Palette;
    isDark: boolean;
    typography: typeof typography;
    spacing: typeof spacing;
    borderRadius: typeof borderRadius;
    layout: typeof layout;
    toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
    const { theme, setTheme } = useSettingsStore();

    // Determine effective theme
    const systemColorScheme = Appearance.getColorScheme();
    const isDark = theme === 'dark' || (theme === 'system' && systemColorScheme === 'dark');
    const colors = isDark ? darkPalette : lightPalette;

    const toggleTheme = () => {
        // Simple toggle logic can be enhanced if needed, but primary control is via settingsStore
        if (theme === 'light') setTheme('dark');
        else if (theme === 'dark') setTheme('light');
        else setTheme(systemColorScheme === 'dark' ? 'light' : 'dark');
    };

    const value = {
        colors,
        isDark,
        typography,
        spacing,
        borderRadius,
        layout,
        toggleTheme,
    };

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
};
