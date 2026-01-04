import { create } from 'zustand';

export type ToastTone = 'success' | 'info' | 'error';

interface ToastState {
  message: string | null;
  tone: ToastTone;
  durationMs: number;
  visible: boolean;
  showToast: (payload: { message: string; tone?: ToastTone; durationMs?: number }) => void;
  hideToast: () => void;
}

export const useToastStore = create<ToastState>((set) => ({
  message: null,
  tone: 'info',
  durationMs: 2200,
  visible: false,
  showToast: ({ message, tone = 'info', durationMs = 2200 }) =>
    set({
      message,
      tone,
      durationMs,
      visible: true,
    }),
  hideToast: () =>
    set({
      visible: false,
    }),
}));
