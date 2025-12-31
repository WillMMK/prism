import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useBudgetStore } from '../../src/store/budgetStore';

type TabType = 'overview' | 'yearly' | 'trends';

export default function Reports() {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const {
    transactions,
    getMonthlyReports,
    getCategorySpending,
    getYearlyReports,
    getYearOverYearComparison,
    getTrends,
    getAvailableYears,
  } = useBudgetStore();

  const monthlyReports = getMonthlyReports(12);
  const categorySpending = getCategorySpending();
  const yearlyReports = getYearlyReports();
  const yoyComparison = getYearOverYearComparison();
  const trends = getTrends();
  const availableYears = getAvailableYears();

  const formatCurrency = (amount: number) => {
    return '$' + amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  };

  const formatMonth = (monthStr: string) => {
    const [year, month] = monthStr.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };

  if (transactions.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.empty}>
          <Ionicons name="bar-chart-outline" size={64} color="#8892b0" />
          <Text style={styles.title}>No Reports</Text>
          <Text style={styles.subtitle}>Import data to see spending reports</Text>
        </View>
      </View>
    );
  }

  const totalExpenses = categorySpending.reduce((sum, cat) => sum + cat.amount, 0);

  const renderTabs = () => (
    <View style={styles.tabContainer}>
      {(['overview', 'yearly', 'trends'] as TabType[]).map((tab) => (
        <TouchableOpacity
          key={tab}
          style={[styles.tab, activeTab === tab && styles.activeTab]}
          onPress={() => setActiveTab(tab)}
        >
          <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderOverview = () => (
    <>
      {/* Category Breakdown */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Expense Categories</Text>
        <View style={styles.card}>
          {categorySpending.slice(0, 8).map((cat, index) => (
            <View key={index} style={styles.categoryItem}>
              <View style={styles.categoryHeader}>
                <View style={styles.categoryLeft}>
                  <View style={[styles.colorDot, { backgroundColor: cat.color }]} />
                  <Text style={styles.categoryName}>{cat.category}</Text>
                </View>
                <Text style={styles.categoryAmount}>{formatCurrency(cat.amount)}</Text>
              </View>
              <View style={styles.barContainer}>
                <View
                  style={[
                    styles.barFill,
                    { width: `${cat.percentage}%`, backgroundColor: cat.color }
                  ]}
                />
              </View>
              <Text style={styles.percentage}>{cat.percentage.toFixed(1)}% of total</Text>
            </View>
          ))}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total Expenses</Text>
            <Text style={styles.totalAmount}>{formatCurrency(totalExpenses)}</Text>
          </View>
        </View>
      </View>

      {/* Monthly Summary (Recent) */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recent Months</Text>
        {monthlyReports.slice(0, 6).map((report, index) => (
          <View key={index} style={styles.monthCard}>
            <Text style={styles.monthTitle}>{formatMonth(report.month)}</Text>
            <View style={styles.monthStats}>
              <View style={styles.monthStat}>
                <Ionicons name="arrow-up-circle" size={20} color="#4CAF50" />
                <Text style={styles.monthStatLabel}>Income</Text>
                <Text style={styles.monthStatIncome}>{formatCurrency(report.income)}</Text>
              </View>
              <View style={styles.monthStat}>
                <Ionicons name="arrow-down-circle" size={20} color="#e94560" />
                <Text style={styles.monthStatLabel}>Expenses</Text>
                <Text style={styles.monthStatExpense}>{formatCurrency(report.expenses)}</Text>
              </View>
              <View style={styles.monthStat}>
                <Ionicons
                  name={report.savings >= 0 ? "trending-up" : "trending-down"}
                  size={20}
                  color={report.savings >= 0 ? "#4CAF50" : "#e94560"}
                />
                <Text style={styles.monthStatLabel}>Savings</Text>
                <Text style={[styles.monthStatSavings, report.savings < 0 && styles.negativeSavings]}>
                  {formatCurrency(report.savings)}
                </Text>
              </View>
            </View>
          </View>
        ))}
      </View>
    </>
  );

  const renderYearly = () => (
    <>
      {/* Year-by-Year Comparison */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Yearly Summary</Text>
        {yearlyReports.map((report, index) => (
          <View key={index} style={styles.yearCard}>
            <View style={styles.yearHeader}>
              <Text style={styles.yearTitle}>{report.year}</Text>
              <View style={[
                styles.savingsRateBadge,
                { backgroundColor: report.savingsRate >= 20 ? '#4CAF50' : report.savingsRate >= 0 ? '#FF9800' : '#e94560' }
              ]}>
                <Text style={styles.savingsRateText}>
                  {report.savingsRate.toFixed(0)}% saved
                </Text>
              </View>
            </View>
            <View style={styles.yearStats}>
              <View style={styles.yearStatRow}>
                <View style={styles.yearStat}>
                  <Text style={styles.yearStatLabel}>Total Income</Text>
                  <Text style={styles.yearStatIncome}>{formatCurrency(report.totalIncome)}</Text>
                </View>
                <View style={styles.yearStat}>
                  <Text style={styles.yearStatLabel}>Total Expenses</Text>
                  <Text style={styles.yearStatExpense}>{formatCurrency(report.totalExpenses)}</Text>
                </View>
              </View>
              <View style={styles.yearStatRow}>
                <View style={styles.yearStat}>
                  <Text style={styles.yearStatLabel}>Net Savings</Text>
                  <Text style={[styles.yearStatSavings, report.savings < 0 && styles.negativeSavings]}>
                    {formatCurrency(report.savings)}
                  </Text>
                </View>
                <View style={styles.yearStat}>
                  <Text style={styles.yearStatLabel}>Monthly Avg</Text>
                  <Text style={styles.yearStatAvg}>
                    {formatCurrency(report.monthlyAvgIncome - report.monthlyAvgExpense)}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        ))}
      </View>

      {/* Year-over-Year by Month */}
      {availableYears.length > 1 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Year-over-Year Comparison</Text>
          <Text style={styles.sectionSubtitle}>Same month across years</Text>
          <View style={styles.card}>
            {yoyComparison.map((comparison, index) => (
              <View key={index} style={styles.yoyRow}>
                <Text style={styles.yoyMonth}>{comparison.monthName}</Text>
                <View style={styles.yoyYears}>
                  {comparison.years.map((yearData, yIdx) => {
                    const prevYear = comparison.years.find(y => y.year === yearData.year - 1);
                    const expenseChange = prevYear && prevYear.expenses > 0
                      ? ((yearData.expenses - prevYear.expenses) / prevYear.expenses) * 100
                      : null;
                    return (
                      <View key={yIdx} style={styles.yoyYearData}>
                        <Text style={styles.yoyYearLabel}>{yearData.year}</Text>
                        <Text style={styles.yoyExpense}>{formatCurrency(yearData.expenses)}</Text>
                        {expenseChange !== null && (
                          <Text style={[
                            styles.yoyChange,
                            { color: expenseChange <= 0 ? '#4CAF50' : '#e94560' }
                          ]}>
                            {expenseChange > 0 ? '+' : ''}{expenseChange.toFixed(0)}%
                          </Text>
                        )}
                      </View>
                    );
                  })}
                </View>
              </View>
            ))}
          </View>
        </View>
      )}
    </>
  );

  const renderTrends = () => (
    <>
      {/* Trend Indicators */}
      {trends.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Spending Trends</Text>
          <Text style={styles.sectionSubtitle}>Recent 3 months vs previous 3 months</Text>
          <View style={styles.card}>
            {trends.map((trend, index) => {
              const icon = trend.direction === 'up' ? 'trending-up' :
                trend.direction === 'down' ? 'trending-down' : 'remove';
              // For expenses, "up" is bad, "down" is good
              // For income/savings, "up" is good, "down" is bad
              const isGood = trend.type === 'expense'
                ? trend.direction === 'down'
                : trend.direction === 'up';
              const color = trend.direction === 'stable' ? '#8892b0' : isGood ? '#4CAF50' : '#e94560';

              return (
                <View key={index} style={styles.trendRow}>
                  <View style={styles.trendLeft}>
                    <Ionicons name={icon as any} size={24} color={color} />
                    <View style={styles.trendInfo}>
                      <Text style={styles.trendLabel}>
                        {trend.type.charAt(0).toUpperCase() + trend.type.slice(1)}
                      </Text>
                      <Text style={styles.trendAvg}>
                        Avg: {formatCurrency(trend.recentAvg)}/mo
                      </Text>
                    </View>
                  </View>
                  <View style={styles.trendRight}>
                    <Text style={[styles.trendChange, { color }]}>
                      {trend.percentChange > 0 ? '+' : ''}{trend.percentChange.toFixed(1)}%
                    </Text>
                    <Text style={styles.trendDirection}>
                      {trend.direction === 'stable' ? 'Stable' :
                       trend.direction === 'up' ? 'Increasing' : 'Decreasing'}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* Monthly Trend Chart (Simple Bar) */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Monthly Expenses</Text>
        <View style={styles.card}>
          {monthlyReports.slice(0, 12).reverse().map((report, index) => {
            const maxExpense = Math.max(...monthlyReports.map(r => r.expenses));
            const width = maxExpense > 0 ? (report.expenses / maxExpense) * 100 : 0;
            return (
              <View key={index} style={styles.chartRow}>
                <Text style={styles.chartLabel}>{formatMonth(report.month).slice(0, 3)}</Text>
                <View style={styles.chartBarContainer}>
                  <View style={[styles.chartBar, { width: `${width}%` }]} />
                </View>
                <Text style={styles.chartValue}>{formatCurrency(report.expenses)}</Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* Income vs Expense Over Time */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Income vs Expenses</Text>
        <View style={styles.card}>
          {monthlyReports.slice(0, 6).map((report, index) => {
            const maxVal = Math.max(report.income, report.expenses);
            const incomeWidth = maxVal > 0 ? (report.income / maxVal) * 100 : 0;
            const expenseWidth = maxVal > 0 ? (report.expenses / maxVal) * 100 : 0;
            return (
              <View key={index} style={styles.compareRow}>
                <Text style={styles.compareMonth}>{formatMonth(report.month)}</Text>
                <View style={styles.compareBars}>
                  <View style={styles.compareBarRow}>
                    <View style={[styles.compareBarIncome, { width: `${incomeWidth}%` }]} />
                    <Text style={styles.compareValue}>{formatCurrency(report.income)}</Text>
                  </View>
                  <View style={styles.compareBarRow}>
                    <View style={[styles.compareBarExpense, { width: `${expenseWidth}%` }]} />
                    <Text style={styles.compareValue}>{formatCurrency(report.expenses)}</Text>
                  </View>
                </View>
              </View>
            );
          })}
          <View style={styles.legendRow}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#4CAF50' }]} />
              <Text style={styles.legendText}>Income</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#e94560' }]} />
              <Text style={styles.legendText}>Expenses</Text>
            </View>
          </View>
        </View>
      </View>
    </>
  );

  return (
    <ScrollView style={styles.container}>
      {renderTabs()}
      {activeTab === 'overview' && renderOverview()}
      {activeTab === 'yearly' && renderYearly()}
      {activeTab === 'trends' && renderTrends()}
      <View style={styles.bottomPadding} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    padding: 16,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    color: '#fff',
    fontSize: 20,
    marginTop: 16,
  },
  subtitle: {
    color: '#8892b0',
    fontSize: 14,
    marginTop: 8,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#16213e',
    borderRadius: 8,
    padding: 4,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 6,
  },
  activeTab: {
    backgroundColor: '#e94560',
  },
  tabText: {
    color: '#8892b0',
    fontSize: 14,
    fontWeight: '500',
  },
  activeTabText: {
    color: '#fff',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  sectionSubtitle: {
    color: '#8892b0',
    fontSize: 12,
    marginBottom: 12,
  },
  card: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 16,
  },
  categoryItem: {
    marginBottom: 16,
  },
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  categoryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  colorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 10,
  },
  categoryName: {
    color: '#fff',
    fontSize: 14,
  },
  categoryAmount: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  barContainer: {
    height: 8,
    backgroundColor: '#0f3460',
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
  },
  percentage: {
    color: '#8892b0',
    fontSize: 12,
    marginTop: 4,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#0f3460',
    marginTop: 8,
  },
  totalLabel: {
    color: '#8892b0',
    fontSize: 14,
  },
  totalAmount: {
    color: '#e94560',
    fontSize: 16,
    fontWeight: 'bold',
  },
  monthCard: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  monthTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  monthStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  monthStat: {
    alignItems: 'center',
    flex: 1,
  },
  monthStatLabel: {
    color: '#8892b0',
    fontSize: 11,
    marginTop: 4,
  },
  monthStatIncome: {
    color: '#4CAF50',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 2,
  },
  monthStatExpense: {
    color: '#e94560',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 2,
  },
  monthStatSavings: {
    color: '#4CAF50',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 2,
  },
  negativeSavings: {
    color: '#e94560',
  },
  // Yearly styles
  yearCard: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  yearHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  yearTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  savingsRateBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  savingsRateText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  yearStats: {
    gap: 12,
  },
  yearStatRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  yearStat: {
    flex: 1,
  },
  yearStatLabel: {
    color: '#8892b0',
    fontSize: 12,
    marginBottom: 4,
  },
  yearStatIncome: {
    color: '#4CAF50',
    fontSize: 18,
    fontWeight: '600',
  },
  yearStatExpense: {
    color: '#e94560',
    fontSize: 18,
    fontWeight: '600',
  },
  yearStatSavings: {
    color: '#4CAF50',
    fontSize: 18,
    fontWeight: '600',
  },
  yearStatAvg: {
    color: '#64B5F6',
    fontSize: 18,
    fontWeight: '600',
  },
  // YoY styles
  yoyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#0f3460',
  },
  yoyMonth: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
    width: 40,
  },
  yoyYears: {
    flexDirection: 'row',
    flex: 1,
    justifyContent: 'flex-end',
    gap: 16,
  },
  yoyYearData: {
    alignItems: 'flex-end',
    minWidth: 70,
  },
  yoyYearLabel: {
    color: '#8892b0',
    fontSize: 11,
  },
  yoyExpense: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
  },
  yoyChange: {
    fontSize: 11,
    fontWeight: '500',
  },
  // Trend styles
  trendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#0f3460',
  },
  trendLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  trendInfo: {
    marginLeft: 12,
  },
  trendLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  trendAvg: {
    color: '#8892b0',
    fontSize: 12,
    marginTop: 2,
  },
  trendRight: {
    alignItems: 'flex-end',
  },
  trendChange: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  trendDirection: {
    color: '#8892b0',
    fontSize: 11,
  },
  // Chart styles
  chartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  chartLabel: {
    color: '#8892b0',
    fontSize: 11,
    width: 30,
  },
  chartBarContainer: {
    flex: 1,
    height: 16,
    backgroundColor: '#0f3460',
    borderRadius: 4,
    marginHorizontal: 8,
    overflow: 'hidden',
  },
  chartBar: {
    height: '100%',
    backgroundColor: '#e94560',
    borderRadius: 4,
  },
  chartValue: {
    color: '#fff',
    fontSize: 11,
    width: 70,
    textAlign: 'right',
  },
  // Compare styles
  compareRow: {
    marginBottom: 16,
  },
  compareMonth: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  compareBars: {
    gap: 4,
  },
  compareBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  compareBarIncome: {
    height: 12,
    backgroundColor: '#4CAF50',
    borderRadius: 4,
  },
  compareBarExpense: {
    height: 12,
    backgroundColor: '#e94560',
    borderRadius: 4,
  },
  compareValue: {
    color: '#8892b0',
    fontSize: 11,
    marginLeft: 8,
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#0f3460',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 6,
  },
  legendText: {
    color: '#8892b0',
    fontSize: 12,
  },
  bottomPadding: {
    height: 40,
  },
});
