/**
 * Report Generator Service
 * Pure functions for generating monthly and yearly financial reports
 * Rule-based narrative templates (no LLM) - all data stays on-device
 */

import { MonthlyReport } from '../types/budget';
import {
    ReportStatus,
    MonthlyFinancialReport,
    YearlyFinancialReport,
} from '../types/report';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_THRESHOLD = 5; // ±5% savings rate change for status determination

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

// ─────────────────────────────────────────────────────────────────────────────
// Utility Functions
// ─────────────────────────────────────────────────────────────────────────────

function formatMonthName(monthStr: string): string {
    const [year, month] = monthStr.split('-');
    const monthIndex = parseInt(month, 10) - 1;
    return MONTH_NAMES[monthIndex] || monthStr;
}

function formatCurrency(amount: number): string {
    return '$' + Math.abs(amount).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatPercent(value: number): string {
    return Math.abs(value).toFixed(0) + '%';
}

function calculateSavingsRate(income: number, expenses: number): number {
    if (income <= 0) return 0;
    return ((income - expenses) / income) * 100;
}

// ─────────────────────────────────────────────────────────────────────────────
// Status Determination
// ─────────────────────────────────────────────────────────────────────────────

export function determineStatus(
    currentRate: number,
    prevRate?: number
): ReportStatus {
    const delta = currentRate - (prevRate ?? currentRate);

    if (delta > STATUS_THRESHOLD) return 'progress';
    if (delta < -STATUS_THRESHOLD) return 'regression';
    return 'maintenance';
}

// ─────────────────────────────────────────────────────────────────────────────
// Narrative Generation
// ─────────────────────────────────────────────────────────────────────────────

function generateExecutiveSummary(
    month: string,
    status: ReportStatus,
    current: { income: number; expenses: number; savings: number },
    prev?: { income: number; expenses: number; savings: number }
): string {
    const monthName = formatMonthName(month);

    const incomeChange = prev ? current.income - prev.income : 0;
    const expenseChange = prev ? current.expenses - prev.expenses : 0;
    const savingsChange = prev ? current.savings - prev.savings : 0;

    if (status === 'progress') {
        if (savingsChange > 0 && expenseChange < 0) {
            return `${monthName} was a progress month. Spending decreased while savings grew — a strong combination.`;
        } else if (savingsChange > 0 && incomeChange > 0) {
            return `${monthName} was a progress month. Higher income translated directly into increased savings.`;
        } else {
            return `${monthName} was a progress month. Your savings rate improved meaningfully.`;
        }
    }

    if (status === 'regression') {
        if (expenseChange > 0 && incomeChange <= 0) {
            return `${monthName} was a regression month. Spending increased without income growth, reducing your savings.`;
        } else if (savingsChange < 0) {
            return `${monthName} was a regression month. Savings decreased compared to last month.`;
        } else {
            return `${monthName} was a regression month. Your savings rate dropped below the previous period.`;
        }
    }

    // Maintenance
    if (expenseChange > 0 && incomeChange > 0) {
        return `${monthName} was a maintenance month. Spending rose slightly, absorbing income gains, so savings remained stable.`;
    } else if (Math.abs(savingsChange) < 100) {
        return `${monthName} was a maintenance month. Income and spending remained consistent with no major changes.`;
    } else {
        return `${monthName} was a maintenance month. Your financial picture held steady overall.`;
    }
}

function generateWhatChanged(
    current: { income: number; expenses: number; savings: number },
    prev?: { income: number; expenses: number; savings: number },
    sameMonthLastYear?: { income: number; expenses: number; savings: number },
    sixMonthAvg?: { income: number; expenses: number; savings: number }
): string[] {
    const bullets: string[] = [];

    if (!prev) {
        bullets.push('This is your first report — more insights will appear as data accumulates.');
        return bullets;
    }

    // Expense comparison
    const expenseChange = current.expenses - prev.expenses;
    const expensePercent = prev.expenses > 0
        ? (expenseChange / prev.expenses) * 100
        : 0;

    if (Math.abs(expensePercent) >= 5) {
        const direction = expenseChange > 0 ? 'increased' : 'decreased';
        bullets.push(
            `Spending ${direction} by ${formatPercent(expensePercent)} vs last month`
        );
    } else {
        bullets.push('Spending remained stable vs last month');
    }

    // Income comparison
    const incomeChange = current.income - prev.income;
    const incomePercent = prev.income > 0
        ? (incomeChange / prev.income) * 100
        : 0;

    if (Math.abs(incomePercent) >= 5) {
        const direction = incomeChange > 0 ? 'increased' : 'decreased';
        bullets.push(`Income ${direction} by ${formatPercent(incomePercent)}`);
    }

    // Savings rate context
    if (sixMonthAvg) {
        const currentRate = calculateSavingsRate(current.income, current.expenses);
        const avgRate = calculateSavingsRate(sixMonthAvg.income, sixMonthAvg.expenses);

        if (currentRate < avgRate - 5) {
            bullets.push('Savings rate below your 6-month average');
        } else if (currentRate > avgRate + 5) {
            bullets.push('Savings rate above your 6-month average');
        }
    }

    // Seasonal context
    if (sameMonthLastYear && bullets.length < 3) {
        const yearOverYearExpense = current.expenses - sameMonthLastYear.expenses;
        if (Math.abs(yearOverYearExpense) > sameMonthLastYear.expenses * 0.15) {
            const direction = yearOverYearExpense > 0 ? 'higher' : 'lower';
            bullets.push(`Spending ${direction} than the same month last year`);
        }
    }

    return bullets.slice(0, 3);
}

function generateSafetyMessage(
    status: ReportStatus,
    savingsRate: number,
    consecutiveRegressions?: number
): string {
    if (savingsRate >= 20) {
        return 'You can absorb a one-off expense without stress. Your savings cushion is healthy.';
    }

    if (savingsRate >= 10) {
        if (status === 'regression') {
            return 'You can absorb a one-off expense, but repeating this pattern will stall progress.';
        }
        return 'You have a reasonable buffer. Stay consistent to maintain momentum.';
    }

    if (savingsRate >= 0) {
        if (status === 'regression' && (consecutiveRegressions ?? 0) >= 2) {
            return 'Consider reviewing discretionary spending. Multiple regression months can impact long-term goals.';
        }
        return 'Your margins are tight. Prioritizing stability over growth is okay for now.';
    }

    // Negative savings (spending more than earning)
    return 'You are currently spending more than you earn. Focus on identifying areas to reduce.';
}

function generateOneDecision(
    status: ReportStatus,
    savingsRate: number
): string | undefined {
    if (status === 'progress') {
        return 'Decide whether to maintain this momentum or give yourself a rest month.';
    }

    if (status === 'regression' && savingsRate < 10) {
        return 'Decide on one category to consciously reduce next month.';
    }

    if (status === 'maintenance') {
        return 'Decide whether next month is a push month or a hold month.';
    }

    return undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Generators
// ─────────────────────────────────────────────────────────────────────────────

export function generateMonthlyReport(
    month: string,
    current: MonthlyReport,
    prev?: MonthlyReport,
    sameMonthLastYear?: MonthlyReport,
    sixMonthAvg?: { income: number; expenses: number; savings: number }
): MonthlyFinancialReport {
    const currentRate = calculateSavingsRate(current.income, current.expenses);
    const prevRate = prev
        ? calculateSavingsRate(prev.income, prev.expenses)
        : undefined;

    const status = determineStatus(currentRate, prevRate);

    const currentData = {
        income: current.income,
        expenses: current.expenses,
        savings: current.savings,
    };

    const prevData = prev
        ? { income: prev.income, expenses: prev.expenses, savings: prev.savings }
        : undefined;

    const yearAgoData = sameMonthLastYear
        ? {
            income: sameMonthLastYear.income,
            expenses: sameMonthLastYear.expenses,
            savings: sameMonthLastYear.savings,
        }
        : undefined;

    return {
        id: `report-${month}`,
        month,
        generatedAt: new Date().toISOString(),
        status,

        income: current.income,
        expenses: current.expenses,
        savings: current.savings,
        savingsRate: currentRate,

        prevMonth: prevData
            ? {
                ...prevData,
                savingsRate: prevRate!,
            }
            : undefined,
        sameMonthLastYear: yearAgoData,
        sixMonthAvg,

        executiveSummary: generateExecutiveSummary(month, status, currentData, prevData),
        whatChanged: generateWhatChanged(currentData, prevData, yearAgoData, sixMonthAvg),
        safetyMessage: generateSafetyMessage(status, currentRate),
        oneDecision: generateOneDecision(status, currentRate),
    };
}

export function generateYearlyReport(
    year: number,
    monthlyReports: MonthlyFinancialReport[],
    prevYearTotals?: { income: number; expenses: number; savings: number }
): YearlyFinancialReport {
    const totalIncome = monthlyReports.reduce((sum, r) => sum + r.income, 0);
    const totalExpenses = monthlyReports.reduce((sum, r) => sum + r.expenses, 0);
    const totalSavings = totalIncome - totalExpenses;
    const savingsRate = calculateSavingsRate(totalIncome, totalExpenses);

    const progressMonths = monthlyReports.filter(r => r.status === 'progress').length;
    const maintenanceMonths = monthlyReports.filter(r => r.status === 'maintenance').length;
    const regressionMonths = monthlyReports.filter(r => r.status === 'regression').length;

    // ─────────────────────────────────────────────────────────────────────────
    // Yearly Status Determination
    // Primary: Year-over-year savings rate comparison
    // Fallback: Absolute savings rate thresholds
    // Month distribution is used for narrative, not status
    // ─────────────────────────────────────────────────────────────────────────
    let status: ReportStatus = 'maintenance';

    if (prevYearTotals && prevYearTotals.income > 0) {
        // Primary: Compare savings rate to previous year
        const prevYearRate = calculateSavingsRate(prevYearTotals.income, prevYearTotals.expenses);
        const rateChange = savingsRate - prevYearRate;

        if (rateChange > STATUS_THRESHOLD) {
            status = 'progress';
        } else if (rateChange < -STATUS_THRESHOLD) {
            status = 'regression';
        } else {
            status = 'maintenance';
        }
    } else {
        // Fallback: Use absolute savings rate thresholds (no previous year data)
        if (savingsRate >= 20) {
            status = 'progress'; // Strong savings year
        } else if (savingsRate < 5) {
            status = 'regression'; // Struggling year
        } else {
            status = 'maintenance'; // Stable year
        }
    }

    // Generate highlights - ONLY include insights NOT shown elsewhere in the UI
    // Key Numbers already shows: Total Income, Total Expenses, Net Savings, Savings Rate
    // Monthly Breakdown already shows: progress/maintenance/regression counts
    // So highlights should add NEW value
    const highlights: string[] = [];

    // Year-over-year comparison (new insight)
    if (prevYearTotals) {
        const prevYearRate = calculateSavingsRate(prevYearTotals.income, prevYearTotals.expenses);
        const rateChange = savingsRate - prevYearRate;
        if (Math.abs(rateChange) >= 2) {
            const direction = rateChange > 0 ? 'improved' : 'decreased';
            highlights.push(`Savings rate ${direction} from ${prevYearRate.toFixed(0)}% to ${savingsRate.toFixed(0)}% vs ${year - 1}`);
        }

        // Absolute savings change
        const savingsChange = totalSavings - prevYearTotals.savings;
        if (Math.abs(savingsChange) > 500) {
            const direction = savingsChange > 0 ? 'more' : 'less';
            highlights.push(`Saved ${formatCurrency(Math.abs(savingsChange))} ${direction} than ${year - 1}`);
        }
    }

    // Best/worst month insight
    if (monthlyReports.length > 0) {
        const sortedByRate = [...monthlyReports].sort((a, b) => b.savingsRate - a.savingsRate);
        const bestMonth = sortedByRate[0];
        const worstMonth = sortedByRate[sortedByRate.length - 1];

        if (bestMonth && bestMonth.savingsRate > savingsRate + 10) {
            const monthName = MONTH_NAMES[parseInt(bestMonth.month.split('-')[1], 10) - 1];
            highlights.push(`Best month: ${monthName} (${bestMonth.savingsRate.toFixed(0)}% savings rate)`);
        }
    }

    // Average monthly expense (helpful context)
    const avgMonthlyExpense = totalExpenses / Math.max(monthlyReports.length, 1);
    highlights.push(`Average monthly spend: ${formatCurrency(avgMonthlyExpense)}`);

    // If no YoY data and few highlights, add savings context
    if (!prevYearTotals && highlights.length < 2) {
        if (savingsRate >= 20) {
            highlights.push('Strong savings rate — well above the recommended 15-20% target');
        } else if (savingsRate >= 10) {
            highlights.push('Healthy savings rate — on track toward financial stability');
        }
    }

    // Executive summary - now reflects the YoY-based status
    let summary: string;
    if (status === 'progress') {
        if (prevYearTotals) {
            summary = `${year} was a progress year. Your savings rate improved meaningfully compared to ${year - 1}, strengthening your financial foundation.`;
        } else {
            summary = `${year} was a progress year. With a ${savingsRate.toFixed(0)}% savings rate, you built a strong financial foundation.`;
        }
    } else if (status === 'regression') {
        if (prevYearTotals) {
            summary = `${year} was a challenging year. Your savings rate decreased compared to ${year - 1}, but this happens and can be recovered.`;
        } else {
            summary = `${year} was a challenging year. Consider focusing on building savings momentum going forward.`;
        }
    } else {
        if (prevYearTotals) {
            summary = `${year} was a maintenance year. Your savings rate held steady compared to ${year - 1} — consistency is valuable.`;
        } else {
            summary = `${year} was a maintenance year. You held steady, which is a valid outcome in itself.`;
        }
    }

    return {
        id: `yearly-${year}`,
        year,
        generatedAt: new Date().toISOString(),
        status,

        totalIncome,
        totalExpenses,
        totalSavings,
        savingsRate,

        progressMonths,
        maintenanceMonths,
        regressionMonths,
        monthlyReportIds: monthlyReports.map(r => r.id),

        executiveSummary: summary,
        yearHighlights: highlights,
        lookAhead: status === 'regression'
            ? 'Consider setting a modest savings target for next year to rebuild momentum.'
            : undefined,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Get Comparison Data
// ─────────────────────────────────────────────────────────────────────────────

export function getSameMonthLastYear(
    targetMonth: string,
    allReports: MonthlyReport[]
): MonthlyReport | undefined {
    const [year, month] = targetMonth.split('-');
    const lastYearMonth = `${parseInt(year, 10) - 1}-${month}`;
    return allReports.find(r => r.month === lastYearMonth);
}

export function getSixMonthAverage(
    targetMonth: string,
    allReports: MonthlyReport[]
): { income: number; expenses: number; savings: number } | undefined {
    const sorted = [...allReports]
        .filter(r => r.month < targetMonth)
        .sort((a, b) => b.month.localeCompare(a.month))
        .slice(0, 6);

    if (sorted.length < 3) return undefined; // Not enough data

    const avgIncome = sorted.reduce((sum, r) => sum + r.income, 0) / sorted.length;
    const avgExpenses = sorted.reduce((sum, r) => sum + r.expenses, 0) / sorted.length;
    const avgSavings = sorted.reduce((sum, r) => sum + r.savings, 0) / sorted.length;

    return { income: avgIncome, expenses: avgExpenses, savings: avgSavings };
}

export function getPreviousMonth(monthStr: string): string {
    const [year, month] = monthStr.split('-').map(Number);
    if (month === 1) {
        return `${year - 1}-12`;
    }
    return `${year}-${String(month - 1).padStart(2, '0')}`;
}

export function getNextMonth(monthStr: string): string {
    const [year, month] = monthStr.split('-').map(Number);
    if (month === 12) {
        return `${year + 1}-01`;
    }
    return `${year}-${String(month + 1).padStart(2, '0')}`;
}
