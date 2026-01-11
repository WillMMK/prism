/**
 * Report Generator Service
 * Pure functions for generating monthly and yearly financial reports
 * Rule-based narrative templates (no LLM) - all data stays on-device
 */

import { MonthlyReport, Transaction } from '../types/budget';
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
// Category Analysis
// ─────────────────────────────────────────────────────────────────────────────

interface CategoryTotal {
    category: string;
    amount: number;
}

function getCategoryTotals(transactions: Transaction[], monthStr: string): CategoryTotal[] {
    const [year, month] = monthStr.split('-');
    const totals = new Map<string, number>();

    transactions.forEach((tx) => {
        const txDate = new Date(tx.date);
        const txYear = txDate.getFullYear();
        const txMonth = txDate.getMonth() + 1;

        if (txYear === parseInt(year) && txMonth === parseInt(month)) {
            if (tx.type === 'expense' || tx.type === 'rebate') {
                const current = totals.get(tx.category) || 0;
                const amount = Math.abs(tx.signedAmount ?? (tx.type === 'expense' ? -tx.amount : tx.amount));
                totals.set(tx.category, current + amount);
            }
        }
    });

    return Array.from(totals.entries())
        .map(([category, amount]) => ({ category, amount }))
        .sort((a, b) => b.amount - a.amount);
}

function getCategorySixMonthAvg(transactions: Transaction[], targetMonth: string): Map<string, number> {
    const targetDate = new Date(targetMonth + '-01');
    const avgMap = new Map<string, number>();
    const countMap = new Map<string, number>();

    // Get previous 6 months (not including target month)
    for (let i = 1; i <= 6; i++) {
        const d = new Date(targetDate);
        d.setMonth(d.getMonth() - i);
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

        const monthTotals = getCategoryTotals(transactions, monthKey);
        monthTotals.forEach(({ category, amount }) => {
            avgMap.set(category, (avgMap.get(category) || 0) + amount);
            countMap.set(category, (countMap.get(category) || 0) + 1);
        });
    }

    // Calculate averages
    const result = new Map<string, number>();
    avgMap.forEach((total, category) => {
        const count = countMap.get(category) || 1;
        result.set(category, total / count);
    });

    return result;
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

/**
 * Generate the "goal anchor" explanation for a status.
 * This answers "Why did the app decide this?" without user-defined goals.
 */
export function generateStatusExplanation(status: ReportStatus, isYearly: boolean = false): string {
    if (isYearly) {
        switch (status) {
            case 'progress':
                return 'Your savings rate improved compared to the previous year.';
            case 'maintenance':
                return 'Your savings rate remained steady year-over-year.';
            case 'regression':
                return 'Your savings rate decreased compared to the previous year.';
        }
    }

    // Monthly explanations
    switch (status) {
        case 'progress':
            return 'You increased your net savings compared to your recent average.';
        case 'maintenance':
            return 'You maintained your financial position without increasing savings.';
        case 'regression':
            return 'You spent more than your income trend supports.';
    }
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
    totalSavings: number,
    avgMonthlyExpenses: number,
    consecutiveRegressions?: number
): string {
    // Calculate emergency fund coverage (in months)
    const emergencyFundMonths = avgMonthlyExpenses > 0
        ? totalSavings / avgMonthlyExpenses
        : 0;

    // Safety messages are formalized by status:
    // Progress → reassurance with context
    // Maintenance → neutrality with position
    // Regression → containment with actionable insight

    if (status === 'progress') {
        if (savingsRate >= 20 && emergencyFundMonths >= 3) {
            return `Your savings cushion covers ${emergencyFundMonths.toFixed(1)} months of expenses. You're well-positioned for unexpected costs.`;
        } else if (emergencyFundMonths >= 2 && emergencyFundMonths < 3) {
            return `Your emergency fund now covers ${emergencyFundMonths.toFixed(1)} months of expenses — ${(3 - emergencyFundMonths).toFixed(1)} months to reach the 3-month target.`;
        } else if (savingsRate >= 20) {
            return 'Your savings cushion is healthy. You could handle an unexpected expense without changing course.';
        }
        return 'You are building momentum. This is exactly the kind of month that compounds over time.';
    }

    if (status === 'maintenance') {
        if (savingsRate >= 15) {
            if (emergencyFundMonths >= 3) {
                return `Holding steady with ${emergencyFundMonths.toFixed(1)} months of emergency coverage — a strong foundation.`;
            }
            return 'Holding steady at a strong savings rate. Not every month needs to be a push.';
        }
        return 'You held your ground. Sometimes staying level is the right outcome.';
    }

    // Regression - containment messaging
    if (savingsRate >= 10) {
        return 'This month dipped, but your overall position remains stable. One month does not define a trend.';
    }

    if (savingsRate >= 0) {
        if ((consecutiveRegressions ?? 0) >= 2) {
            return 'A few challenging months in a row. Consider one small adjustment to regain balance.';
        }
        return 'A tighter month. Naming it is the first step — no action required yet.';
    }

    // Negative savings
    if (emergencyFundMonths > 0) {
        return `You spent more than you earned this month. Your emergency fund can cover ${emergencyFundMonths.toFixed(1)} months — use it if needed, but identify one area to adjust.`;
    }
    return 'You spent more than you earned this month. Identify one area to adjust, then move on.';
}

function generateOneDecision(
    status: ReportStatus,
    savingsRate: number,
    categoryInsights?: { topIncrease?: string; amount?: number }
): string | undefined {
    if (status === 'progress') {
        return 'Choose whether next month is for continued progress or recovery — either is valid.';
    }

    if (status === 'regression') {
        if (categoryInsights?.topIncrease && categoryInsights.amount) {
            const reduction = Math.round(categoryInsights.amount * 0.2);
            return `Consider reducing ${categoryInsights.topIncrease} by 20% (~${formatCurrency(reduction)}) next month — it's your highest discretionary increase.`;
        }
        if (savingsRate < 5) {
            return 'Identify one category to consciously reduce next month.';
        }
        return 'Decide if this was a one-off or if something needs to change.';
    }

    if (status === 'maintenance') {
        return 'Choose whether next month is a push or a hold — both have value.';
    }

    return undefined;
}

function generateCategoryInsights(
    transactions: Transaction[],
    month: string,
    prevMonth?: string
): string[] {
    const insights: string[] = [];
    const currentCategories = getCategoryTotals(transactions, month);

    if (currentCategories.length === 0) {
        return insights;
    }

    const prevCategories = prevMonth
        ? getCategoryTotals(transactions, prevMonth)
        : [];

    const prevMap = new Map(prevCategories.map(c => [c.category, c.amount]));
    const sixMonthAvg = getCategorySixMonthAvg(transactions, month);

    // Find biggest increases and decreases
    const changes: Array<{ category: string; change: number; percent: number; current: number }> = [];

    currentCategories.forEach(({ category, amount }) => {
        const prevAmount = prevMap.get(category) || 0;
        const change = amount - prevAmount;
        const percent = prevAmount > 0 ? (change / prevAmount) * 100 : 0;

        if (Math.abs(change) > 50 && Math.abs(percent) > 10) {
            changes.push({ category, change, percent, current: amount });
        }
    });

    changes.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

    // Report top 2 category changes
    if (changes.length > 0) {
        const top = changes[0];
        const direction = top.change > 0 ? 'increased' : 'decreased';
        insights.push(
            `${top.category} ${direction} by ${formatCurrency(Math.abs(top.change))} (${formatPercent(Math.abs(top.percent))}) — the biggest category change`
        );
    }

    if (changes.length > 1) {
        const second = changes[1];
        const direction = second.change > 0 ? 'rose' : 'dropped';
        insights.push(
            `${second.category} also ${direction} significantly (${formatCurrency(Math.abs(second.change))})`
        );
    }

    // Detect anomalies (3x above 6-month average)
    currentCategories.forEach(({ category, amount }) => {
        const avg = sixMonthAvg.get(category);
        if (avg && avg > 0 && amount > avg * 3) {
            insights.push(
                `⚠️ ${category} spiked to ${formatCurrency(amount)} — 3x your usual ${formatCurrency(avg)}. Check for billing errors or one-time expenses.`
            );
        }
    });

    // Detect new categories
    if (prevCategories.length > 0) {
        const prevCategorySet = new Set(prevCategories.map(c => c.category));
        const newCategories = currentCategories
            .filter(c => !prevCategorySet.has(c.category) && c.amount > 100)
            .slice(0, 1);

        newCategories.forEach(({ category, amount }) => {
            insights.push(
                `New category: ${category} (${formatCurrency(amount)}) — first appearance`
            );
        });
    }

    return insights.slice(0, 3);
}

function generatePatterns(
    transactions: Transaction[],
    month: string
): string[] {
    const patterns: string[] = [];
    const currentCategories = getCategoryTotals(transactions, month);
    const sixMonthAvg = getCategorySixMonthAvg(transactions, month);

    // Check for consistently stable categories
    const stableCategories = currentCategories.filter(({ category, amount }) => {
        const avg = sixMonthAvg.get(category);
        if (!avg || avg < 50) return false;

        const variance = Math.abs(amount - avg);
        const variancePercent = (variance / avg) * 100;

        return variancePercent < 10;
    });

    if (stableCategories.length > 0 && stableCategories[0].amount > 200) {
        const stable = stableCategories[0];
        patterns.push(
            `${stable.category} is remarkably stable (±10% for 6 months) — highly predictable at ${formatCurrency(stable.amount)}/mo`
        );
    }

    // Check for trending categories (looking at last 3 months)
    const targetDate = new Date(month + '-01');
    const last3Months: Map<string, number[]> = new Map();

    for (let i = 0; i < 3; i++) {
        const d = new Date(targetDate);
        d.setMonth(d.getMonth() - i);
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

        const monthTotals = getCategoryTotals(transactions, monthKey);
        monthTotals.forEach(({ category, amount }) => {
            if (!last3Months.has(category)) {
                last3Months.set(category, []);
            }
            last3Months.get(category)!.unshift(amount);
        });
    }

    // Find trending up categories
    last3Months.forEach((amounts, category) => {
        if (amounts.length === 3 && amounts[2] > 100) {
            const isIncreasing = amounts[1] > amounts[0] && amounts[2] > amounts[1];
            if (isIncreasing) {
                const totalIncrease = amounts[2] - amounts[0];
                if (totalIncrease > 100) {
                    patterns.push(
                        `${category} trending up (+${formatCurrency(totalIncrease)} over 3 months) — watch this pattern`
                    );
                }
            }
        }
    });

    return patterns.slice(0, 2);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Generators
// ─────────────────────────────────────────────────────────────────────────────

export function generateMonthlyReport(
    month: string,
    current: MonthlyReport,
    transactions: Transaction[],
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

    // Generate category insights and patterns
    const prevMonthStr = prev ? getPreviousMonth(month) : undefined;
    const categoryInsights = generateCategoryInsights(transactions, month, prevMonthStr);
    const patterns = generatePatterns(transactions, month);

    // Extract top category increase for specific recommendations
    const currentCategories = getCategoryTotals(transactions, month);
    const prevCategories = prevMonthStr ? getCategoryTotals(transactions, prevMonthStr) : [];
    const prevMap = new Map(prevCategories.map(c => [c.category, c.amount]));

    let topIncrease: { topIncrease?: string; amount?: number } = {};
    let maxIncrease = 0;

    currentCategories.forEach(({ category, amount }) => {
        const prevAmount = prevMap.get(category) || 0;
        const increase = amount - prevAmount;
        if (increase > maxIncrease && increase > 50) {
            maxIncrease = increase;
            topIncrease = { topIncrease: category, amount: increase };
        }
    });

    // Calculate average monthly expenses for emergency fund context
    const avgMonthlyExpenses = sixMonthAvg?.expenses || current.expenses;

    return {
        id: `report-${month}`,
        month,
        generatedAt: new Date().toISOString(),
        status,
        statusExplanation: generateStatusExplanation(status, false),

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
        categoryInsights: categoryInsights.length > 0 ? categoryInsights : undefined,
        patterns: patterns.length > 0 ? patterns : undefined,
        safetyMessage: generateSafetyMessage(status, currentRate, current.savings, avgMonthlyExpenses),
        oneDecision: generateOneDecision(status, currentRate, topIncrease),
    };
}

function generateYearlyCategoryInsights(
    transactions: Transaction[],
    year: number,
    prevYear?: number
): string[] {
    const insights: string[] = [];

    // Get all categories for the year
    const yearCategories: Map<string, number> = new Map();
    const prevYearCategories: Map<string, number> = new Map();

    transactions.forEach((tx) => {
        const txDate = new Date(tx.date);
        const txYear = txDate.getFullYear();

        if (tx.type === 'expense' || tx.type === 'rebate') {
            const amount = Math.abs(tx.signedAmount ?? (tx.type === 'expense' ? -tx.amount : tx.amount));

            if (txYear === year) {
                yearCategories.set(tx.category, (yearCategories.get(tx.category) || 0) + amount);
            } else if (prevYear && txYear === prevYear) {
                prevYearCategories.set(tx.category, (prevYearCategories.get(tx.category) || 0) + amount);
            }
        }
    });

    const yearCategoryArray = Array.from(yearCategories.entries())
        .map(([category, amount]) => ({ category, amount }))
        .sort((a, b) => b.amount - a.amount);

    if (yearCategoryArray.length === 0) return insights;

    // Top spending category
    const topCategory = yearCategoryArray[0];
    const totalYearSpending = yearCategoryArray.reduce((sum, c) => sum + c.amount, 0);
    const topPercent = (topCategory.amount / totalYearSpending) * 100;

    insights.push(
        `${topCategory.category} was your largest expense at ${formatCurrency(topCategory.amount)} (${topPercent.toFixed(0)}% of total spending)`
    );

    // Year-over-year category changes
    if (prevYear && prevYearCategories.size > 0) {
        const changes: Array<{ category: string; change: number; percent: number }> = [];

        yearCategories.forEach((amount, category) => {
            const prevAmount = prevYearCategories.get(category) || 0;
            if (prevAmount > 0) {
                const change = amount - prevAmount;
                const percent = (change / prevAmount) * 100;

                if (Math.abs(change) > 500 && Math.abs(percent) > 15) {
                    changes.push({ category, change, percent });
                }
            }
        });

        changes.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

        if (changes.length > 0) {
            const topChange = changes[0];
            const direction = topChange.change > 0 ? 'increased' : 'decreased';
            insights.push(
                `${topChange.category} ${direction} by ${formatCurrency(Math.abs(topChange.change))} vs ${prevYear} (${formatPercent(Math.abs(topChange.percent))} change)`
            );
        }
    }

    // Top 3 categories
    if (yearCategoryArray.length >= 3) {
        const top3 = yearCategoryArray.slice(0, 3);
        const top3Total = top3.reduce((sum, c) => sum + c.amount, 0);
        const top3Percent = (top3Total / totalYearSpending) * 100;

        insights.push(
            `Your top 3 categories (${top3.map(c => c.category).join(', ')}) accounted for ${top3Percent.toFixed(0)}% of all spending`
        );
    }

    return insights.slice(0, 3);
}

export function generateYearlyReport(
    year: number,
    monthlyReports: MonthlyFinancialReport[],
    transactions: Transaction[],
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

    // Generate category insights
    const prevYear = prevYearTotals ? year - 1 : undefined;
    const categoryInsights = generateYearlyCategoryInsights(transactions, year, prevYear);

    return {
        id: `yearly-${year}`,
        year,
        generatedAt: new Date().toISOString(),
        status,
        statusExplanation: generateStatusExplanation(status, true),

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
        categoryInsights: categoryInsights.length > 0 ? categoryInsights : undefined,
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
