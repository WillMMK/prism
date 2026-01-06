import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MonthlyFinancialReport, YearlyFinancialReport, ReportListItem } from '../types/report';

export interface ReportState {
    monthlyReports: Record<string, MonthlyFinancialReport>; // keyed by "YYYY-MM"
    yearlyReports: Record<number, YearlyFinancialReport>; // keyed by year
    _hasHydrated: boolean;

    // Actions
    setMonthlyReport: (report: MonthlyFinancialReport) => void;
    setYearlyReport: (report: YearlyFinancialReport) => void;
    getMonthlyReport: (month: string) => MonthlyFinancialReport | undefined;
    getYearlyReport: (year: number) => YearlyFinancialReport | undefined;
    getReportList: () => ReportListItem[];
    clearReports: () => void;
    setHasHydrated: (state: boolean) => void;
}

export const useReportStore = create<ReportState>()(
    persist(
        (set, get) => ({
            monthlyReports: {},
            yearlyReports: {},
            _hasHydrated: false,

            setMonthlyReport: (report) =>
                set((state) => ({
                    monthlyReports: {
                        ...state.monthlyReports,
                        [report.month]: report,
                    },
                })),

            setYearlyReport: (report) =>
                set((state) => ({
                    yearlyReports: {
                        ...state.yearlyReports,
                        [report.year]: report,
                    },
                })),

            getMonthlyReport: (month) => get().monthlyReports[month],

            getYearlyReport: (year) => get().yearlyReports[year],

            getReportList: () => {
                const { monthlyReports, yearlyReports } = get();
                const items: ReportListItem[] = [];

                // Add monthly reports (sorted newest first)
                Object.values(monthlyReports)
                    .sort((a, b) => b.month.localeCompare(a.month))
                    .forEach((report) => {
                        items.push({
                            month: report.month,
                            status: report.status,
                            type: 'monthly',
                        });
                    });

                // Add yearly reports (sorted newest first)
                Object.values(yearlyReports)
                    .sort((a, b) => b.year - a.year)
                    .forEach((report) => {
                        items.push({
                            month: String(report.year),
                            status: report.status,
                            type: 'yearly',
                        });
                    });

                return items;
            },

            clearReports: () =>
                set({
                    monthlyReports: {},
                    yearlyReports: {},
                }),

            setHasHydrated: (state) => set({ _hasHydrated: state }),
        }),
        {
            name: 'report-storage',
            storage: createJSONStorage(() => AsyncStorage),
            partialize: (state) => ({
                monthlyReports: state.monthlyReports,
                yearlyReports: state.yearlyReports,
            }),
            onRehydrateStorage: () => (state) => {
                state?.setHasHydrated(true);
            },
        }
    )
);
