import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance } from 'react-native';

export type ThemeOption = 'light' | 'dark' | 'system';
export type CurrencyOption = 'USD' | 'EUR' | 'GBP' | 'JPY' | 'AUD' | 'CAD' | 'CNY';
export type DateFormatOption = 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD';

export interface CategoryStyle {
    color: string;
    icon: string; // Ionicons name
}

interface SettingsState {
    // Visual Preferences
    theme: ThemeOption;
    dashboardLayout: string[]; // Order of widget IDs: 'balance', 'charts', 'recent'

    // Regional Preferences
    currency: CurrencyOption;
    dateFormat: DateFormatOption;

    // Category Styling Overrides (Map category name -> style)
    categoryStyles: Record<string, CategoryStyle>;

    // Actions
    setTheme: (theme: ThemeOption) => void;
    setCurrency: (currency: CurrencyOption) => void;
    setDateFormat: (format: DateFormatOption) => void;
    setDashboardLayout: (layout: string[]) => void;
    setCategoryStyle: (categoryName: string, style: CategoryStyle) => void;
    resetCategoryStyle: (categoryName: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
    persist(
        (set) => ({
            theme: 'system',
            dashboardLayout: ['balance', 'charts', 'recent'],
            currency: 'USD',
            dateFormat: 'MM/DD/YYYY',
            categoryStyles: {},

            setTheme: (theme) => set({ theme }),
            setCurrency: (currency) => set({ currency }),
            setDateFormat: (dateFormat) => set({ dateFormat }),
            setDashboardLayout: (dashboardLayout) => set({ dashboardLayout }),

            setCategoryStyle: (categoryName, style) =>
                set((state) => ({
                    categoryStyles: {
                        ...state.categoryStyles,
                        [categoryName]: style
                    }
                })),

            resetCategoryStyle: (categoryName) =>
                set((state) => {
                    const newStyles = { ...state.categoryStyles };
                    delete newStyles[categoryName];
                    return { categoryStyles: newStyles };
                }),
        }),
        {
            name: 'settings-storage',
            storage: createJSONStorage(() => AsyncStorage),
        }
    )
);
