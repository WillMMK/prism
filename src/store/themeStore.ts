import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance } from 'react-native';
import { lightPalette, darkPalette, Palette } from '../theme/palette';

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeState {
  mode: ThemeMode;
  accentColor: string;

  // Actions
  setMode: (mode: ThemeMode) => void;
  setAccentColor: (color: string) => void;

  // Computed
  getPalette: () => Palette;
  isDark: () => boolean;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      mode: 'light',
      accentColor: '#0F766E',

      setMode: (mode) => set({ mode }),

      setAccentColor: (color) => set({ accentColor: color }),

      isDark: () => {
        const { mode } = get();
        if (mode === 'system') {
          return Appearance.getColorScheme() === 'dark';
        }
        return mode === 'dark';
      },

      getPalette: () => {
        const { isDark, accentColor } = get();
        const basePalette = isDark() ? darkPalette : lightPalette;

        // Override accent color if customized
        return {
          ...basePalette,
          accent: accentColor,
        };
      },
    }),
    {
      name: 'theme-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        mode: state.mode,
        accentColor: state.accentColor,
      }),
    }
  )
);
