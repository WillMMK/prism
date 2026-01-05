import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Modal,
    ScrollView,
    Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Transaction } from '../types/budget';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

import { useTheme, lightPalette as palette } from '../theme';

interface TransactionDetailModalProps {
    visible: boolean;
    transaction: Transaction | null;
    onClose: () => void;
}

const formatCurrency = (amount: number) =>
    '$' + Math.abs(amount).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
    });
};

export const TransactionDetailModal: React.FC<TransactionDetailModalProps> = ({
    visible,
    transaction,
    onClose,
}) => {
    const { colors, isDark } = useTheme();

    if (!transaction) return null;

    const isExpense = transaction.type === 'expense';
    const signedAmount = transaction.signedAmount ?? (isExpense ? -transaction.amount : transaction.amount);
    const hasBreakdown = transaction.breakdownAmounts && transaction.breakdownAmounts.length > 1;
    const breakdownItems = hasBreakdown
        ? transaction.breakdownAmounts!
        : [Math.abs(signedAmount)];

    const totalAbsolute = breakdownItems.reduce((sum, amt) => sum + Math.abs(amt), 0);

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <TouchableOpacity style={styles.backdrop} onPress={onClose} />
                <View style={[styles.sheet, { backgroundColor: colors.card }]}>
                    {/* Handle bar */}
                    <View style={[styles.handleBar, { backgroundColor: colors.border }]} />

                    {/* Header */}
                    <View style={[styles.header, { borderBottomColor: colors.border }]}>
                        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                            <Ionicons name="close" size={24} color={colors.muted} />
                        </TouchableOpacity>
                        <Text style={[styles.headerTitle, { color: colors.ink }]}>Transaction Details</Text>
                        <View style={{ width: 40 }} />
                    </View>

                    <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                        {/* Category Badge */}
                        <View style={styles.categoryBadge}>
                            <View style={[styles.categoryIcon, { backgroundColor: isExpense ? (isDark ? '#3E1A1A' : '#FFEEF0') : (isDark ? '#103020' : '#E8F5E9') }]}>
                                <Ionicons
                                    name={isExpense ? 'arrow-down' : 'arrow-up'}
                                    size={20}
                                    color={isExpense ? colors.negative : colors.positive}
                                />
                            </View>
                            <View>
                                <Text style={[styles.categoryName, { color: colors.ink }]}>{transaction.category}</Text>
                                <Text style={[styles.categoryDate, { color: colors.muted }]}>{formatDate(transaction.date)}</Text>
                            </View>
                        </View>

                        {/* Description if available */}
                        {transaction.description && transaction.description !== transaction.category && (
                            <View style={[styles.descriptionCard, { backgroundColor: colors.wash }]}>
                                <Ionicons name="document-text-outline" size={16} color={colors.muted} />
                                <Text style={[styles.descriptionText, { color: colors.ink }]}>{transaction.description}</Text>
                            </View>
                        )}

                        {/* Total Amount */}
                        <View style={[styles.totalCard, { backgroundColor: colors.wash }]}>
                            <Text style={[styles.totalLabel, { color: colors.muted }]}>Total Amount</Text>
                            <Text style={[
                                styles.totalAmount,
                                { color: isExpense ? colors.negative : colors.positive }
                            ]}>
                                {signedAmount < 0 ? '-' : '+'}{formatCurrency(Math.abs(signedAmount))}
                            </Text>
                        </View>

                        {/* Breakdown Section */}
                        {hasBreakdown && (
                            <View style={styles.breakdownSection}>
                                <Text style={[styles.breakdownTitle, { color: colors.muted }]}>
                                    <Ionicons name="layers-outline" size={16} color={colors.muted} /> Breakdown
                                </Text>
                                <View style={styles.breakdownList}>
                                    {breakdownItems.map((amount, index) => {
                                        const proportion = totalAbsolute > 0 ? (Math.abs(amount) / totalAbsolute) * 100 : 0;
                                        return (
                                            <View key={index} style={[styles.breakdownItem, { backgroundColor: colors.background, borderColor: colors.border }]}>
                                                <View style={styles.breakdownHeader}>
                                                    <Text style={[styles.breakdownIndex, { color: colors.muted }]}>Item {index + 1}</Text>
                                                    <Text style={[
                                                        styles.breakdownAmount,
                                                        { color: amount < 0 || isExpense ? colors.negative : colors.positive }
                                                    ]}>
                                                        {amount < 0 ? '-' : isExpense ? '-' : '+'}{formatCurrency(Math.abs(amount))}
                                                    </Text>
                                                </View>
                                                <View style={[styles.progressBar, { backgroundColor: colors.wash }]}>
                                                    <View
                                                        style={[
                                                            styles.progressFill,
                                                            {
                                                                width: `${proportion}%`,
                                                                backgroundColor: isExpense ? colors.negative : colors.positive,
                                                            }
                                                        ]}
                                                    />
                                                </View>
                                                <Text style={[styles.progressPercent, { color: colors.muted }]}>{proportion.toFixed(0)}%</Text>
                                            </View>
                                        );
                                    })}
                                </View>
                            </View>
                        )}

                        {!hasBreakdown && (
                            <View style={[styles.noBreakdownNote, { backgroundColor: colors.wash }]}>
                                <Ionicons name="information-circle-outline" size={18} color={colors.muted} />
                                <Text style={[styles.noBreakdownText, { color: colors.muted }]}>
                                    This is a single-value transaction with no itemized breakdown.
                                </Text>
                            </View>
                        )}

                        <View style={{ height: 40 }} />
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.4)',
    },
    sheet: {
        backgroundColor: palette.card,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        maxHeight: SCREEN_HEIGHT * 0.85,
        paddingBottom: 20,
    },
    handleBar: {
        width: 40,
        height: 4,
        backgroundColor: palette.border,
        borderRadius: 2,
        alignSelf: 'center',
        marginTop: 12,
        marginBottom: 8,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: palette.border,
    },
    closeButton: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: {
        fontSize: 17,
        fontWeight: '600',
        color: palette.ink,
    },
    content: {
        paddingHorizontal: 20,
        paddingTop: 20,
    },
    categoryBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        marginBottom: 20,
    },
    categoryIcon: {
        width: 48,
        height: 48,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
    },
    categoryName: {
        fontSize: 20,
        fontWeight: '700',
        color: palette.ink,
    },
    categoryDate: {
        fontSize: 14,
        color: palette.muted,
        marginTop: 2,
    },
    descriptionCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: palette.wash,
        padding: 14,
        borderRadius: 12,
        marginBottom: 20,
    },
    descriptionText: {
        flex: 1,
        fontSize: 14,
        color: palette.ink,
    },
    totalCard: {
        backgroundColor: palette.wash,
        padding: 20,
        borderRadius: 16,
        alignItems: 'center',
        marginBottom: 24,
    },
    totalLabel: {
        fontSize: 13,
        color: palette.muted,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 8,
    },
    totalAmount: {
        fontSize: 36,
        fontWeight: '700',
    },
    breakdownSection: {
        marginBottom: 20,
    },
    breakdownTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: palette.muted,
        marginBottom: 14,
    },
    breakdownList: {
        gap: 12,
    },
    breakdownItem: {
        backgroundColor: palette.background,
        padding: 16,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: palette.border,
    },
    breakdownHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
    },
    breakdownIndex: {
        fontSize: 13,
        color: palette.muted,
        fontWeight: '500',
    },
    breakdownAmount: {
        fontSize: 18,
        fontWeight: '700',
    },
    progressBar: {
        height: 8,
        backgroundColor: palette.border,
        borderRadius: 4,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        borderRadius: 4,
    },
    progressPercent: {
        fontSize: 11,
        color: palette.muted,
        marginTop: 6,
        textAlign: 'right',
    },
    noBreakdownNote: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: palette.wash,
        padding: 16,
        borderRadius: 12,
    },
    noBreakdownText: {
        flex: 1,
        fontSize: 14,
        color: palette.muted,
    },
});

export default TransactionDetailModal;
