import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LineChart, PieChart, BarChart } from 'react-native-chart-kit';
import { useBudgetStore } from '../../src/store/budgetStore';
import { formatCurrency, formatPercent, getMonthName } from '../../src/utils/formatters';

const screenWidth = Dimensions.get('window').width;

type ChartType = 'trend' | 'category' | 'comparison';
type TimeRange = '3m' | '6m' | '12m';

export default function Reports() {
  const [selectedChart, setSelectedChart] = useState<ChartType>('trend');
  const [timeRange, setTimeRange] = useState<TimeRange>('6m');

  const { getBudgetSummary, getCategorySpending, getMonthlyReports } = useBudgetStore();

  const summary = getBudgetSummary();
  const categorySpending = getCategorySpending();
  const months = timeRange === '3m' ? 3 : timeRange === '6m' ? 6 : 12;
  const monthlyReports = getMonthlyReports(months).reverse();

  const chartConfig = {
    backgroundColor: '#16213e',
    backgroundGradientFrom: '#16213e',
    backgroundGradientTo: '#1a1a2e',
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
    labelColor: (opacity = 1) => `rgba(136, 146, 176, ${opacity})`,
    style: {
      borderRadius: 16,
    },
    propsForDots: {
      r: '4',
      strokeWidth: '2',
    },
  };

  const trendData = {
    labels: monthlyReports.map((r) => getMonthName(r.month)),
    datasets: [
      {
        data: monthlyReports.length > 0 ? monthlyReports.map((r) => r.expenses) : [0],
        color: (opacity = 1) => `rgba(233, 69, 96, ${opacity})`,
        strokeWidth: 3,
      },
      {
        data: monthlyReports.length > 0 ? monthlyReports.map((r) => r.income) : [0],
        color: (opacity = 1) => `rgba(76, 175, 80, ${opacity})`,
        strokeWidth: 3,
      },
    ],
    legend: ['Expenses', 'Income'],
  };

  const pieData = categorySpending.slice(0, 6).map((cat) => ({
    name: cat.category.length > 10 ? cat.category.substring(0, 10) + '...' : cat.category,
    amount: cat.amount,
    color: cat.color,
    legendFontColor: '#8892b0',
    legendFontSize: 12,
  }));

  const barData = {
    labels: monthlyReports.slice(-6).map((r) => getMonthName(r.month)),
    datasets: [
      {
        data: monthlyReports.slice(-6).length > 0 ? monthlyReports.slice(-6).map((r) => r.savings) : [0],
      },
    ],
  };

  const renderChartSelector = () => (
    <View style={styles.chartSelector}>
      <TouchableOpacity
        style={[styles.chartTab, selectedChart === 'trend' && styles.chartTabActive]}
        onPress={() => setSelectedChart('trend')}
      >
        <Ionicons
          name="trending-up"
          size={20}
          color={selectedChart === 'trend' ? '#fff' : '#8892b0'}
        />
        <Text style={[styles.chartTabText, selectedChart === 'trend' && styles.chartTabTextActive]}>
          Trend
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.chartTab, selectedChart === 'category' && styles.chartTabActive]}
        onPress={() => setSelectedChart('category')}
      >
        <Ionicons
          name="pie-chart"
          size={20}
          color={selectedChart === 'category' ? '#fff' : '#8892b0'}
        />
        <Text style={[styles.chartTabText, selectedChart === 'category' && styles.chartTabTextActive]}>
          Categories
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.chartTab, selectedChart === 'comparison' && styles.chartTabActive]}
        onPress={() => setSelectedChart('comparison')}
      >
        <Ionicons
          name="bar-chart"
          size={20}
          color={selectedChart === 'comparison' ? '#fff' : '#8892b0'}
        />
        <Text style={[styles.chartTabText, selectedChart === 'comparison' && styles.chartTabTextActive]}>
          Savings
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderTimeRangeSelector = () => (
    <View style={styles.timeRangeSelector}>
      {(['3m', '6m', '12m'] as TimeRange[]).map((range) => (
        <TouchableOpacity
          key={range}
          style={[styles.timeRangeButton, timeRange === range && styles.timeRangeActive]}
          onPress={() => setTimeRange(range)}
        >
          <Text style={[styles.timeRangeText, timeRange === range && styles.timeRangeTextActive]}>
            {range === '3m' ? '3 Months' : range === '6m' ? '6 Months' : '1 Year'}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderTrendChart = () => (
    <View style={styles.chartContainer}>
      <Text style={styles.chartTitle}>Income vs Expenses</Text>
      {monthlyReports.length > 0 ? (
        <LineChart
          data={trendData}
          width={screenWidth - 40}
          height={250}
          chartConfig={chartConfig}
          bezier
          style={styles.chart}
          withInnerLines={false}
          withOuterLines={false}
        />
      ) : (
        <View style={styles.emptyChart}>
          <Ionicons name="analytics-outline" size={48} color="#8892b0" />
          <Text style={styles.emptyText}>No data available</Text>
        </View>
      )}
    </View>
  );

  const renderCategoryChart = () => (
    <View style={styles.chartContainer}>
      <Text style={styles.chartTitle}>Spending by Category</Text>
      {pieData.length > 0 ? (
        <>
          <PieChart
            data={pieData}
            width={screenWidth - 40}
            height={220}
            chartConfig={chartConfig}
            accessor="amount"
            backgroundColor="transparent"
            paddingLeft="15"
            absolute
          />
          <View style={styles.categoryBreakdown}>
            {categorySpending.slice(0, 6).map((cat) => (
              <View key={cat.category} style={styles.categoryRow}>
                <View style={styles.categoryInfo}>
                  <View style={[styles.categoryDot, { backgroundColor: cat.color }]} />
                  <Text style={styles.categoryName}>{cat.category}</Text>
                </View>
                <View style={styles.categoryValues}>
                  <Text style={styles.categoryAmount}>{formatCurrency(cat.amount)}</Text>
                  <Text style={styles.categoryPercent}>{formatPercent(cat.percentage)}</Text>
                </View>
              </View>
            ))}
          </View>
        </>
      ) : (
        <View style={styles.emptyChart}>
          <Ionicons name="pie-chart-outline" size={48} color="#8892b0" />
          <Text style={styles.emptyText}>No spending data</Text>
        </View>
      )}
    </View>
  );

  const renderSavingsChart = () => (
    <View style={styles.chartContainer}>
      <Text style={styles.chartTitle}>Monthly Savings</Text>
      {monthlyReports.length > 0 ? (
        <BarChart
          data={barData}
          width={screenWidth - 40}
          height={250}
          yAxisLabel="$"
          yAxisSuffix=""
          chartConfig={{
            ...chartConfig,
            color: (opacity = 1) => `rgba(100, 255, 218, ${opacity})`,
            fillShadowGradient: '#64ffda',
            fillShadowGradientOpacity: 0.8,
          }}
          style={styles.chart}
          showValuesOnTopOfBars
          fromZero
        />
      ) : (
        <View style={styles.emptyChart}>
          <Ionicons name="bar-chart-outline" size={48} color="#8892b0" />
          <Text style={styles.emptyText}>No savings data</Text>
        </View>
      )}
    </View>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Summary Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Total Income</Text>
          <Text style={[styles.statValue, styles.income]}>{formatCurrency(summary.totalIncome)}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Total Expenses</Text>
          <Text style={[styles.statValue, styles.expense]}>{formatCurrency(summary.totalExpenses)}</Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={[styles.statCard, styles.fullWidth]}>
          <View style={styles.statRow}>
            <View>
              <Text style={styles.statLabel}>Net Savings</Text>
              <Text style={[styles.statValue, summary.balance >= 0 ? styles.positive : styles.negative]}>
                {formatCurrency(summary.balance)}
              </Text>
            </View>
            <View style={styles.savingsRateContainer}>
              <Text style={styles.savingsRateLabel}>Savings Rate</Text>
              <Text style={styles.savingsRateValue}>{formatPercent(summary.savingsRate)}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Time Range Selector */}
      {renderTimeRangeSelector()}

      {/* Chart Type Selector */}
      {renderChartSelector()}

      {/* Charts */}
      {selectedChart === 'trend' && renderTrendChart()}
      {selectedChart === 'category' && renderCategoryChart()}
      {selectedChart === 'comparison' && renderSavingsChart()}

      {/* Insights */}
      <View style={styles.insightsSection}>
        <Text style={styles.sectionTitle}>Insights</Text>
        <View style={styles.insightCard}>
          <Ionicons name="bulb" size={24} color="#FFCE56" />
          <View style={styles.insightContent}>
            <Text style={styles.insightTitle}>Top Spending Category</Text>
            <Text style={styles.insightText}>
              {categorySpending.length > 0
                ? `${categorySpending[0].category} accounts for ${formatPercent(categorySpending[0].percentage)} of your spending`
                : 'Connect to Google Sheets to see insights'}
            </Text>
          </View>
        </View>
        <View style={styles.insightCard}>
          <Ionicons name="trending-up" size={24} color="#4CAF50" />
          <View style={styles.insightContent}>
            <Text style={styles.insightTitle}>Savings Goal</Text>
            <Text style={styles.insightText}>
              {summary.savingsRate >= 20
                ? 'Great job! You\'re saving more than 20% of your income'
                : summary.savingsRate > 0
                ? `Try to increase your savings rate to 20% for better financial health`
                : 'Start tracking your budget to set savings goals'}
            </Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#16213e',
    borderRadius: 16,
    padding: 16,
  },
  fullWidth: {
    flex: 1,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statLabel: {
    color: '#8892b0',
    fontSize: 13,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
  },
  income: {
    color: '#4CAF50',
  },
  expense: {
    color: '#e94560',
  },
  positive: {
    color: '#4CAF50',
  },
  negative: {
    color: '#e94560',
  },
  savingsRateContainer: {
    alignItems: 'flex-end',
  },
  savingsRateLabel: {
    color: '#8892b0',
    fontSize: 12,
  },
  savingsRateValue: {
    color: '#64ffda',
    fontSize: 24,
    fontWeight: '700',
  },
  timeRangeSelector: {
    flexDirection: 'row',
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  timeRangeButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  timeRangeActive: {
    backgroundColor: '#e94560',
  },
  timeRangeText: {
    color: '#8892b0',
    fontSize: 14,
    fontWeight: '500',
  },
  timeRangeTextActive: {
    color: '#fff',
  },
  chartSelector: {
    flexDirection: 'row',
    marginBottom: 20,
    gap: 8,
  },
  chartTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#16213e',
    paddingVertical: 12,
    borderRadius: 12,
  },
  chartTabActive: {
    backgroundColor: '#e94560',
  },
  chartTabText: {
    color: '#8892b0',
    fontSize: 13,
    fontWeight: '500',
  },
  chartTabTextActive: {
    color: '#fff',
  },
  chartContainer: {
    backgroundColor: '#16213e',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  chartTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
  },
  chart: {
    borderRadius: 12,
    marginLeft: -10,
  },
  emptyChart: {
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: '#8892b0',
    fontSize: 14,
    marginTop: 12,
  },
  categoryBreakdown: {
    marginTop: 16,
  },
  categoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#0f3460',
  },
  categoryInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  categoryDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  categoryName: {
    color: '#fff',
    fontSize: 14,
  },
  categoryValues: {
    alignItems: 'flex-end',
  },
  categoryAmount: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  categoryPercent: {
    color: '#8892b0',
    fontSize: 12,
  },
  insightsSection: {
    marginTop: 4,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  insightCard: {
    flexDirection: 'row',
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    gap: 14,
  },
  insightContent: {
    flex: 1,
  },
  insightTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  insightText: {
    color: '#8892b0',
    fontSize: 13,
    lineHeight: 18,
  },
});
