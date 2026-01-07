import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Image,
    Modal,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../src/theme';
import AuroraBackground from '../src/components/AuroraBackground';

// ─────────────────────────────────────────────────────────────────────────────
// Onboarding - Promise Screen
// "See what your Google Sheets budget means"
// ─────────────────────────────────────────────────────────────────────────────

export default function OnboardingScreen() {
    const { colors, isDark } = useTheme();
    const insets = useSafeAreaInsets();
    const [isWhyVisible, setWhyVisible] = useState(false);

    const handleContinue = () => {
        // Navigate to settings to connect Google Sheet
        router.replace('/settings');
    };

    return (
        <AuroraBackground>
            <View style={[styles.container, { paddingTop: insets.top }]}>
                {/* Content */}
                <View style={styles.content}>
                    {/* Icon */}
                    <View style={styles.iconContainer}>
                        <Image
                            source={require('../assets/prism-nobackground.png')}
                            style={styles.icon}
                            resizeMode="contain"
                        />
                    </View>

                    {/* Title */}
                    <Text style={[styles.title, { color: colors.ink }]}>
                        Turn your Google Sheets budget into clear reports
                    </Text>

                    {/* Body */}
                    <Text style={[styles.body, { color: colors.muted }]}>
                        You choose exactly which spreadsheet Prism can access.
                    </Text>
                    <View style={styles.bullets}>
                        <Text style={[styles.bulletText, { color: colors.muted }]}>- No bank access</Text>
                        <Text style={[styles.bulletText, { color: colors.muted }]}>- No other Drive files</Text>
                        <Text style={[styles.bulletText, { color: colors.muted }]}>- You can revoke access anytime</Text>
                    </View>
                    {/* Trust badges */}
                    <View style={styles.badges}>
                        <View style={[styles.privacyNote, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : colors.wash }]}>
                            <Ionicons name="shield-checkmark" size={20} color={colors.accent} />
                            <Text style={[styles.privacyText, { color: colors.muted }]}>
                                You stay in full control of access
                            </Text>
                        </View>
                        <View style={[styles.privacyNote, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : colors.wash }]}>
                            <Ionicons name="cloud-offline-outline" size={20} color={colors.accent} />
                            <Text style={[styles.privacyText, { color: colors.muted }]}>
                                Your data is never uploaded or stored on our servers
                            </Text>
                        </View>
                    </View>
                </View>

                {/* CTA */}
                <View style={[styles.footer, { paddingBottom: insets.bottom + 24 }]}>
                    <TouchableOpacity
                        style={[styles.ctaButton, { backgroundColor: colors.accent }]}
                        onPress={handleContinue}
                    >
                        <Ionicons name="logo-google" size={20} color="#FFF" style={{ marginRight: 10 }} />
                        <Text style={styles.ctaText}>Select a Google Sheet</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.whyLink}
                        onPress={() => setWhyVisible(true)}
                        accessibilityRole="button"
                    >
                        <Text style={[styles.whyText, { color: colors.muted }]}>
                            Why does Prism need edit access?
                        </Text>
                    </TouchableOpacity>
                </View>

                <Modal
                    animationType="fade"
                    transparent
                    visible={isWhyVisible}
                    onRequestClose={() => setWhyVisible(false)}
                >
                    <View style={styles.modalBackdrop}>
                        <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
                            <Text style={[styles.modalTitle, { color: colors.ink }]}>
                                About Google Sheets access
                            </Text>
                            <Text style={[styles.modalBody, { color: colors.muted }]}>
                                Prism needs edit access so it can:
                            </Text>
                            <View style={styles.bullets}>
                                <Text style={[styles.bulletText, { color: colors.muted }]}>- Read existing transactions</Text>
                                <Text style={[styles.bulletText, { color: colors.muted }]}>- Add new transactions you enter in the app</Text>
                            </View>
                            <Text style={[styles.modalBody, { color: colors.muted }]}>
                                Prism cannot access files you don&apos;t select.{"\n"}
                                You can revoke access anytime in your Google Account.
                            </Text>
                            <TouchableOpacity
                                style={[styles.modalButton, { backgroundColor: colors.accent }]}
                                onPress={() => setWhyVisible(false)}
                            >
                                <Text style={styles.modalButtonText}>Got it</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </Modal>
            </View>
        </AuroraBackground>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    content: {
        flex: 1,
        paddingHorizontal: 32,
        justifyContent: 'center',
        alignItems: 'center',
    },
    iconContainer: {
        width: 120,
        height: 120,
        borderRadius: 60,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 32,
    },
    icon: {
        width: 120,
        height: 120,
    },
    title: {
        fontSize: 28,
        fontWeight: '700',
        textAlign: 'center',
        letterSpacing: -0.5,
        lineHeight: 36,
        marginBottom: 20,
    },
    body: {
        fontSize: 17,
        textAlign: 'center',
        lineHeight: 26,
        marginBottom: 14,
    },
    bullets: {
        alignSelf: 'stretch',
        marginBottom: 14,
        paddingHorizontal: 8,
    },
    bulletText: {
        fontSize: 16,
        lineHeight: 24,
        textAlign: 'left',
    },
    privacyNote: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 14,
        borderRadius: 16,
        gap: 10,
        width: '100%',
    },
    privacyText: {
        fontSize: 15,
        fontWeight: '500',
    },
    badges: {
        gap: 12,
        alignSelf: 'stretch',
        alignItems: 'flex-start',
    },
    footer: {
        paddingHorizontal: 24,
    },
    ctaButton: {
        flexDirection: 'row',
        height: 56,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    ctaText: {
        color: '#FFF',
        fontSize: 17,
        fontWeight: '600',
    },
    whyLink: {
        marginTop: 12,
        alignItems: 'center',
    },
    whyText: {
        fontSize: 13,
        fontWeight: '500',
    },
    modalBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.35)',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 24,
    },
    modalCard: {
        width: '100%',
        borderRadius: 20,
        padding: 20,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: '700',
        marginBottom: 12,
    },
    modalBody: {
        fontSize: 15,
        lineHeight: 22,
        marginBottom: 10,
    },
    modalButton: {
        marginTop: 12,
        height: 44,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    modalButtonText: {
        color: '#FFF',
        fontSize: 15,
        fontWeight: '600',
    },
});
