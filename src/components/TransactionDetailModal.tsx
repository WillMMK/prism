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
        month: 'short',
        day: 'numeric',
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
    const amountColor = signedAmount < 0 ? colors.negative : colors.positive;

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
                    <View style={[styles.header, { borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : colors.border }]}>
                        <View style={styles.headerSpacer} />
                        <Text style={[styles.headerTitle, { color: colors.ink }]}>Transaction</Text>
                        <TouchableOpacity onPress={onClose} style={styles.doneButton}>
                            <Text style={[styles.doneButtonText, { color: colors.accent }]}>Done</Text>
                        </TouchableOpacity>
                    </View>

                    <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                        {/* Main Amount & Icon */}
                        <View style={styles.heroSection}>
                            <View style={[
                                styles.iconBubble,
                                { backgroundColor: isExpense ? (isDark ? 'rgba(214, 69, 80, 0.15)' : 'rgba(214, 69, 80, 0.1)') : (isDark ? 'rgba(47, 158, 68, 0.15)' : 'rgba(47, 158, 68, 0.1)') }
                            ]}>
                                <Ionicons
                                    name={isExpense ? 'cart-outline' : 'cash-outline'}
                                    size={32}
                                    color={amountColor}
                                />
                            </View>
                            <Text style={[styles.heroAmount, { color: colors.ink }]}>
                                {signedAmount < 0 ? '-' : '+'}{formatCurrency(Math.abs(signedAmount))}
                            </Text>
                            <Text style={[styles.heroDate, { color: colors.muted }]}>{formatDate(transaction.date)}</Text>
                        </View>

                        {/* Details Card */}
                        <View style={[styles.sectionCard, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : colors.wash }]}>
                            {/* Category Row */}
                            <View style={[styles.cardRow, { borderBottomColor: isDark ? 'rgba(255,255,255,0.1)' : colors.border }]}>
                                <Text style={[styles.rowLabel, { color: colors.muted }]}>Category</Text>
                                <Text style={[styles.rowValue, { color: colors.ink }]}>{transaction.category}</Text>
                            </View>

                            {/* Description Row */}
                            <View style={styles.cardRowNoBorder}>
                                <Text style={[styles.rowLabel, { color: colors.muted }]}>Description</Text>
                                <Text style={[styles.rowValue, { color: colors.ink, maxWidth: '60%', textAlign: 'right' }]} numberOfLines={2}>
                                    {transaction.description || 'No description'}
                                </Text>
                            </View>
                        </View>

                        {/* Breakdown Section */}
                        {hasBreakdown && (
                            <View style={styles.breakdownSection}>
                                <Text style={[styles.sectionTitle, { color: colors.muted }]}>
                                    ITEM BREAKDOWN
                                </Text>
                                <View style={[styles.sectionCard, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : colors.wash, padding: 0, overflow: 'hidden' }]}>
                                    {breakdownItems.map((amount, index) => {
                                        const proportion = totalAbsolute > 0 ? (Math.abs(amount) / totalAbsolute) * 100 : 0;
                                        const isLast = index === breakdownItems.length - 1;
                                        return (
                                            <View key={index} style={[styles.breakdownRow, !isLast && { borderBottomWidth: 1, borderBottomColor: isDark ? 'rgba(255,255,255,0.1)' : colors.border }]}>
                                                <View style={styles.breakdownInfo}>
                                                    <Text style={[styles.breakdownLabel, { color: colors.ink }]}>Item {index + 1}</Text>
                                                    <View style={[styles.progressBar, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#E5E5EA' }]}>
                                                        <View style={[styles.progressFill, { width: `${proportion}%`, backgroundColor: amountColor }]} />
                                                    </View>
                                                </View>
                                                <Text style={[styles.breakdownAmount, { color: colors.ink }]}>
                                                    {formatCurrency(Math.abs(amount))}
                                                </Text>
                                            </View>
                                        );
                                    })}
                                </View>
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
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    sheet: {
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        maxHeight: SCREEN_HEIGHT * 0.9,
        paddingBottom: 20,
    },
    handleBar: {
        width: 36,
        height: 5,
        borderRadius: 3,
        alignSelf: 'center',
        marginTop: 8,
        opacity: 0.5,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderBottomWidth: 1,
    },
    headerSpacer: {
        width: 60,
    },
    doneButton: {
        width: 60,
        alignItems: 'flex-end',
    },
    doneButtonText: {
        fontSize: 17,
        fontWeight: '600',
    },
    headerTitle: {
        fontSize: 17,
        fontWeight: '600',
    },
    content: {
        paddingHorizontal: 20,
    },
    heroSection: {
        alignItems: 'center',
        marginVertical: 24,
    },
    iconBubble: {
        width: 64,
        height: 64,
        borderRadius: 32,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    heroAmount: {
        fontSize: 40,
        fontWeight: '700',
        letterSpacing: -1,
        marginBottom: 4,
    },
    heroDate: {
        fontSize: 15,
        fontWeight: '500',
    },
    sectionCard: {
        borderRadius: 12,
        paddingHorizontal: 16,
        marginBottom: 24,
    },
    cardRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 16,
        borderBottomWidth: 1,
    },
    cardRowNoBorder: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 16,
    },
    rowLabel: {
        fontSize: 16,
    },
    rowValue: {
        fontSize: 16,
        fontWeight: '500',
    },
    sectionTitle: {
        fontSize: 13,
        fontWeight: '600',
        marginBottom: 8,
        marginLeft: 16,
        letterSpacing: 0.5,
    },
    breakdownSection: {
        marginBottom: 24,
    },
    breakdownRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
    },
    breakdownInfo: {
        flex: 1,
        marginRight: 16,
    },
    breakdownLabel: {
        fontSize: 16,
        fontWeight: '500',
        marginBottom: 6,
    },
    breakdownAmount: {
        fontSize: 16,
        fontWeight: '600',
    },
    progressBar: {
        height: 6,
        borderRadius: 3,
        width: '100%',
    },
    progressFill: {
        height: '100%',
        borderRadius: 3,
    },
});

export default TransactionDetailModal;
