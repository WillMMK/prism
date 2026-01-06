import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type PremiumFeature = 'enhanced_sync' | 'advanced_reports' | 'customization';

export interface PremiumState {
  isPremium: boolean;
  purchaseDate: string | null;
  transactionId: string | null;

  // Sync settings (premium only)
  autoSyncEnabled: boolean;
  syncIntervalMinutes: number; // 15, 30, 60

  // Actions
  setPremium: (isPremium: boolean, transactionId?: string) => void;
  setAutoSync: (enabled: boolean) => void;
  setSyncInterval: (minutes: number) => void;
  restorePurchase: (transactionId: string) => void;

  // Helpers
  canUseFeature: (feature: PremiumFeature) => boolean;
}

export const usePremiumStore = create<PremiumState>()(
  persist(
    (set, get) => ({
      isPremium: false, // Default to free tier - unlock via paywall
      purchaseDate: null,
      transactionId: null,
      autoSyncEnabled: false, // Enable when user upgrades to premium
      syncIntervalMinutes: 30,

      setPremium: (isPremium, transactionId) =>
        set({
          isPremium,
          transactionId: transactionId || null,
          purchaseDate: isPremium ? new Date().toISOString() : null,
        }),

      setAutoSync: (enabled) =>
        set({ autoSyncEnabled: enabled }),

      setSyncInterval: (minutes) =>
        set({ syncIntervalMinutes: minutes }),

      restorePurchase: (transactionId) =>
        set({
          isPremium: true,
          transactionId,
          purchaseDate: new Date().toISOString(),
        }),

      canUseFeature: (feature) => {
        const { isPremium } = get();
        // All premium features require premium status
        return isPremium;
      },
    }),
    {
      name: 'premium-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
