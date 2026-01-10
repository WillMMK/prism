import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../src/theme';

export default function PrivacyPolicyScreen() {
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
                <Text style={[styles.headerTitle, { color: colors.ink }]}>Privacy Policy</Text>
                <View style={styles.placeholder} />
            </View>

            <ScrollView
                style={styles.content}
                contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
            >
                <Text style={[styles.lastUpdated, { color: colors.muted }]}>
                    Last updated: January 7, 2026
                </Text>

                <Text style={[styles.sectionTitle, { color: colors.ink }]}>Overview</Text>
                <Text style={[styles.body, { color: colors.ink }]}>
                    Prism ("we", "our", or "the app") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, and safeguard your information when you use our mobile application.
                </Text>

                <Text style={[styles.sectionTitle, { color: colors.ink }]}>Information We Collect</Text>

                <Text style={[styles.subsectionTitle, { color: colors.ink }]}>1. Google Account Information</Text>
                <Text style={[styles.body, { color: colors.ink }]}>
                    When you sign in with Google, we receive:{'\n'}
                    • Your email address (for authentication only){'\n'}
                    • Your name (for display purposes){'\n'}
                    • Access to Google Sheets you explicitly authorize{'\n\n'}
                    <Text style={{ fontWeight: '700' }}>We do NOT store your Google password.</Text> Authentication is handled securely through Google's OAuth 2.0.
                </Text>

                <Text style={[styles.subsectionTitle, { color: colors.ink }]}>2. Financial Data</Text>
                <Text style={[styles.body, { color: colors.ink }]}>
                    • Transaction data you import from Google Sheets{'\n'}
                    • Transactions you manually enter in the app{'\n'}
                    • Categories and budgets you create{'\n\n'}
                    <Text style={{ fontWeight: '700' }}>Important:</Text> Your financial data is stored locally on your device. We do not upload, transmit, or store your financial data on any external servers.
                </Text>

                <Text style={[styles.subsectionTitle, { color: colors.ink }]}>3. Google Sheets Access</Text>
                <Text style={[styles.body, { color: colors.ink }]}>
                    We request access to:{'\n'}
                    • <Text style={{ fontWeight: '700' }}>Read</Text> your Google Sheets (to import transactions){'\n'}
                    • <Text style={{ fontWeight: '700' }}>Write</Text> to your Google Sheets (to sync new transactions){'\n\n'}
                    We only access the spreadsheet you explicitly select. We do not access Google Drive or any other files.
                </Text>

                <Text style={[styles.subsectionTitle, { color: colors.ink }]}>4. Subscription Information</Text>
                <Text style={[styles.body, { color: colors.ink }]}>
                    If you purchase Prism Plus, payments are processed by Apple. We receive subscription status and expiration information from Apple and RevenueCat to unlock premium features. We do not collect or store your payment card details.
                </Text>

                <Text style={[styles.sectionTitle, { color: colors.ink }]}>How We Use Your Information</Text>
                <Text style={[styles.body, { color: colors.ink }]}>
                    • <Text style={{ fontWeight: '700' }}>Email address:</Text> Authenticate your identity{'\n'}
                    • <Text style={{ fontWeight: '700' }}>Google Sheets access:</Text> Import and sync your budget data{'\n'}
                    • <Text style={{ fontWeight: '700' }}>Transaction data:</Text> Display reports and analytics in the app
                </Text>

                <Text style={[styles.sectionTitle, { color: colors.ink }]}>Data Storage</Text>
                <Text style={[styles.body, { color: colors.ink }]}>
                    • <Text style={{ fontWeight: '700' }}>Local storage only:</Text> All your financial data is stored on your device{'\n'}
                    • <Text style={{ fontWeight: '700' }}>No cloud sync:</Text> We do not have servers that store your data{'\n'}
                    • <Text style={{ fontWeight: '700' }}>Token storage:</Text> Google authentication tokens are stored securely on your device{'\n'}
                    • <Text style={{ fontWeight: '700' }}>Subscription status:</Text> Stored locally to unlock premium features
                </Text>

                <Text style={[styles.sectionTitle, { color: colors.ink }]}>Data Sharing</Text>
                <Text style={[styles.body, { color: colors.ink }]}>
                    <Text style={{ fontWeight: '700' }}>We do NOT sell, rent, or share your personal information with third parties.</Text>{'\n\n'}
                    We connect to:{'\n'}
                    • <Text style={{ fontWeight: '700' }}>Google</Text> (authentication and Google Sheets) — governed by Google's Privacy Policy{'\n'}
                    • <Text style={{ fontWeight: '700' }}>Apple App Store</Text> (in-app purchases) — governed by Apple's Privacy Policy{'\n'}
                    • <Text style={{ fontWeight: '700' }}>RevenueCat</Text> (subscription status) — governed by RevenueCat's Privacy Policy
                </Text>

                <Text style={[styles.sectionTitle, { color: colors.ink }]}>Your Rights</Text>
                <Text style={[styles.body, { color: colors.ink }]}>
                    You can:{'\n'}
                    • <Text style={{ fontWeight: '700' }}>Revoke access</Text> to Google Sheets at any time via Google Account Permissions{'\n'}
                    • <Text style={{ fontWeight: '700' }}>Delete all data</Text> from the app using the "Clear Data" option in Settings{'\n'}
                    • <Text style={{ fontWeight: '700' }}>Disconnect</Text> your Google account from the app at any time
                </Text>

                <Text style={[styles.sectionTitle, { color: colors.ink }]}>Security</Text>
                <Text style={[styles.body, { color: colors.ink }]}>
                    We implement industry-standard security measures:{'\n'}
                    • OAuth 2.0 for secure Google authentication{'\n'}
                    • Secure token storage using device encryption{'\n'}
                    • No transmission of financial data to external servers
                </Text>

                <Text style={[styles.sectionTitle, { color: colors.ink }]}>Children's Privacy</Text>
                <Text style={[styles.body, { color: colors.ink }]}>
                    This app is not intended for children under 13. We do not knowingly collect information from children.
                </Text>

                <Text style={[styles.sectionTitle, { color: colors.ink }]}>Changes to This Policy</Text>
                <Text style={[styles.body, { color: colors.ink }]}>
                    We may update this Privacy Policy periodically. We will notify you of any changes by updating the "Last updated" date.
                </Text>

                <Text style={[styles.sectionTitle, { color: colors.ink }]}>Contact Us</Text>
                <Text style={[styles.body, { color: colors.ink }]}>
                    If you have questions about this Privacy Policy, please contact us at:{'\n\n'}
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
    subsectionTitle: {
        fontSize: 15,
        fontWeight: '600',
        marginTop: 12,
        marginBottom: 6,
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
