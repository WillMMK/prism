/**
 * Report Types for Monthly Financial Reports
 * Premium feature for opinionated financial closure
 */

export type ReportStatus = 'progress' | 'maintenance' | 'regression';

export interface MonthlyFinancialReport {
    id: string;
    month: string; // "YYYY-MM"
    generatedAt: string;
    status: ReportStatus;

    // Core metrics
    income: number;
    expenses: number;
    savings: number;
    savingsRate: number;

    // Comparisons (optional - may not exist for first month)
    prevMonth?: {
        income: number;
        expenses: number;
        savings: number;
        savingsRate: number;
    };
    sameMonthLastYear?: {
        income: number;
        expenses: number;
        savings: number;
    };
    sixMonthAvg?: {
        income: number;
        expenses: number;
        savings: number;
    };

    // Generated content
    executiveSummary: string;
    whatChanged: string[]; // Max 3 bullets
    safetyMessage: string;
    oneDecision?: string;
}

export interface YearlyFinancialReport {
    id: string;
    year: number;
    generatedAt: string;
    status: ReportStatus;

    // Core metrics
    totalIncome: number;
    totalExpenses: number;
    totalSavings: number;
    savingsRate: number;

    // Monthly breakdown summary
    progressMonths: number;
    maintenanceMonths: number;
    regressionMonths: number;
    monthlyReportIds: string[]; // References to MonthlyFinancialReport.id

    // Generated content
    executiveSummary: string;
    yearHighlights: string[]; // Key events/changes
    lookAhead?: string; // Optional forward-looking statement
}

// For the report list view
export interface ReportListItem {
    month: string; // "YYYY-MM" or year number as string
    status: ReportStatus;
    type: 'monthly' | 'yearly';
}
