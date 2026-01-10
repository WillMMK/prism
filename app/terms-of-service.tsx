import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../src/theme';

export default function TermsOfServiceScreen() {
    const { colors } = useTheme();
    const insets = useSafeAreaInsets();

    return (
        <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.border }]}>
                <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => router.back()}
                >
                    <Ionicons name="arrow-back" size={24} color={colors.ink} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: colors.ink }]}>Terms of Service</Text>
                <View style={styles.placeholder} />
            </View>

            <ScrollView
                style={styles.content}
                contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
            >
                <Text style={[styles.lastUpdated, { color: colors.muted }]}>
                    Last updated: January 7, 2026
                </Text>

                <Text style={[styles.sectionTitle, { color: colors.ink }]}>Agreement to Terms</Text>
                <Text style={[styles.body, { color: colors.ink }]}>
                    By downloading, installing, or using Prism ("the app"), you agree to be bound by these Terms of Service. If you do not agree, do not use the app.
                </Text>

                <Text style={[styles.sectionTitle, { color: colors.ink }]}>Description of Service</Text>
                <Text style={[styles.body, { color: colors.ink }]}>
                    Prism is a personal finance application that helps you:{'\n'}
                    • Track income and expenses{'\n'}
                    • Import data from Google Sheets{'\n'}
                    • View spending reports and analytics{'\n'}
                    • Sync transactions with your spreadsheets
                </Text>

                <Text style={[styles.sectionTitle, { color: colors.ink }]}>User Responsibilities</Text>
                <Text style={[styles.body, { color: colors.ink }]}>
                    By using the app, you agree to:{'\n\n'}
                    1. Provide accurate information when connecting your Google account{'\n'}
                    2. Maintain the security of your device and Google account{'\n'}
                    3. Use the app lawfully and not for any illegal purposes{'\n'}
                    4. Not attempt to reverse engineer, modify, or distribute the app
                </Text>

                <Text style={[styles.sectionTitle, { color: colors.ink }]}>Google Account Integration</Text>
                <Text style={[styles.body, { color: colors.ink }]}>
                    • You authorize us to access your Google Sheets for importing and syncing data{'\n'}
                    • You can revoke this access at any time via your Google Account settings{'\n'}
                    • We are not responsible for changes to Google's APIs or services
                </Text>

                <Text style={[styles.sectionTitle, { color: colors.ink }]}>Intellectual Property</Text>
                <Text style={[styles.body, { color: colors.ink }]}>
                    The app, including its design, features, and content, is owned by Prism and protected by copyright laws. You may not copy, modify, or distribute any part of the app without permission.
                </Text>

                <Text style={[styles.sectionTitle, { color: colors.ink }]}>Disclaimer of Warranties</Text>
                <Text style={[styles.body, { color: colors.ink }]}>
                    THE APP IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND. WE DO NOT GUARANTEE:{'\n'}
                    • The app will be error-free or uninterrupted{'\n'}
                    • The accuracy of financial calculations or reports{'\n'}
                    • Compatibility with all devices or operating systems
                </Text>

                <Text style={[styles.sectionTitle, { color: colors.ink }]}>Limitation of Liability</Text>
                <Text style={[styles.body, { color: colors.ink }]}>
                    TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE SHALL NOT BE LIABLE FOR:{'\n'}
                    • Any indirect, incidental, or consequential damages{'\n'}
                    • Loss of data, profits, or business opportunities{'\n'}
                    • Any damages arising from your use of the app{'\n\n'}
                    You are responsible for verifying the accuracy of your financial data.
                </Text>

                <Text style={[styles.sectionTitle, { color: colors.ink }]}>Subscriptions and Premium Features</Text>
                <Text style={[styles.body, { color: colors.ink }]}>
                    Prism Plus is offered as a monthly or yearly subscription.{'\n\n'}
                    • Payment is processed through the Apple App Store (or Google Play where applicable){'\n'}
                    • Subscriptions automatically renew unless canceled at least 24 hours before the end of the current period{'\n'}
                    • You can manage or cancel your subscription in your App Store account settings{'\n'}
                    • Pricing may change; you will be notified in advance in accordance with store policies{'\n'}
                    • Purchases are non-refundable except as required by applicable law{'\n'}
                    • Premium features are licensed, not sold, to you
                </Text>

                <Text style={[styles.sectionTitle, { color: colors.ink }]}>Termination</Text>
                <Text style={[styles.body, { color: colors.ink }]}>
                    We reserve the right to:{'\n'}
                    • Suspend or terminate your access to the app{'\n'}
                    • Modify or discontinue the app at any time{'\n\n'}
                    You may stop using the app at any time by uninstalling it.
                </Text>

                <Text style={[styles.sectionTitle, { color: colors.ink }]}>Changes to Terms</Text>
                <Text style={[styles.body, { color: colors.ink }]}>
                    We may update these Terms periodically. Continued use of the app after changes constitutes acceptance of the new Terms.
                </Text>

                <Text style={[styles.sectionTitle, { color: colors.ink }]}>Governing Law</Text>
                <Text style={[styles.body, { color: colors.ink }]}>
                    These Terms are governed by the laws of Australia. Any disputes shall be resolved in the courts of Australia.
                </Text>

                <Text style={[styles.sectionTitle, { color: colors.ink }]}>Contact</Text>
                <Text style={[styles.body, { color: colors.ink }]}>
                    For questions about these Terms, contact us at:{'\n\n'}
                    Email: willchancot@gmail.com
                </Text>

                <Text style={[styles.footer, { color: colors.muted }]}>
                    © 2026 Prism. All rights reserved.
                </Text>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
    },
    backButton: {
        padding: 8,
    },
    headerTitle: {
        fontSize: 17,
        fontWeight: '600',
    },
    placeholder: {
        width: 40,
    },
    content: {
        flex: 1,
        paddingHorizontal: 20,
        paddingTop: 16,
    },
    lastUpdated: {
        fontSize: 12,
        marginBottom: 20,
        fontStyle: 'italic',
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '700',
        marginTop: 20,
        marginBottom: 8,
    },
    body: {
        fontSize: 14,
        lineHeight: 20,
        marginBottom: 12,
    },
    footer: {
        fontSize: 12,
        textAlign: 'center',
        marginTop: 32,
        marginBottom: 20,
    },
});
