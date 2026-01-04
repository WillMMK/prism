import { create } from 'zustand';

interface LoadingOverlayState {
  isVisible: boolean;
  message: string;
  show: (message?: string) => void;
  hide: () => void;
}

export const useLoadingOverlay = create<LoadingOverlayState>((set) => ({
  isVisible: false,
  message: 'Loading...',
  show: (message = 'Loading...') =>
    set({
      isVisible: true,
      message,
    }),
  hide: () =>
    set({
      isVisible: false,
    }),
}));
