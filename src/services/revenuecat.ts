/**
 * RevenueCat Service
 * Handles in-app purchases via RevenueCat SDK
 * 
 * Setup Instructions:
 * 1. Install: npm install react-native-purchases
 * 2. Create RevenueCat account at https://www.revenuecat.com
 * 3. Configure iOS app in RevenueCat dashboard
 * 4. Replace REVENUECAT_API_KEY with your actual key
 */

import Purchases, { PurchasesPackage, CustomerInfo } from 'react-native-purchases';

import { Platform } from 'react-native';

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const REVENUECAT_API_KEY_IOS = 'appl_LdzpUtzpmuhQhZlqAaXujGUwBko';
const REVENUECAT_API_KEY_ANDROID = '';

// Entitlement identifier (set in RevenueCat dashboard)
export const ENTITLEMENT_ID = 'Prism Plus';

// Product identifiers (set in App Store Connect)
export const PRODUCT_IDS = {
    monthly: 'com.willmmk.budgetreport.monthly',
    yearly: 'com.willmmk.budgetreport.yearly',
};

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface PurchaseResult {
    success: boolean;
    error?: string;
}

export interface SubscriptionStatus {
    isActive: boolean;
    expirationDate?: string;
    productId?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// SDK Initialization
// ─────────────────────────────────────────────────────────────────────────────

let isInitialized = false;

/**
 * Initialize RevenueCat SDK
 * Call this on app startup in _layout.tsx
 */
export async function initializeRevenueCat(): Promise<void> {
    if (isInitialized) return;

    try {
        const apiKey = Platform.OS === 'ios' ? REVENUECAT_API_KEY_IOS : REVENUECAT_API_KEY_ANDROID;
        if (!apiKey) {
            throw new Error('Missing RevenueCat API key for this platform');
        }
        await Purchases.configure({ apiKey });
        isInitialized = true;
    } catch (error) {
        console.error('[RevenueCat] Failed to initialize:', error);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Subscription Status
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if user has active subscription
 */
export async function checkSubscriptionStatus(): Promise<SubscriptionStatus> {
    try {
        const customerInfo = await Purchases.getCustomerInfo();
        const entitlement = customerInfo.entitlements.active[ENTITLEMENT_ID];

        if (entitlement) {
            return {
                isActive: true,
                expirationDate: entitlement.expirationDate || undefined,
                productId: entitlement.productIdentifier,
            };
        }

        return { isActive: false };
    } catch (error) {
        console.error('[RevenueCat] Failed to check subscription:', error);
        return { isActive: false };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Purchasing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get available packages for purchase
 */
export async function getPackages(): Promise<PurchasesPackage[]> {
    try {
        const offerings = await Purchases.getOfferings();
        if (offerings.current?.availablePackages?.length) {
            return offerings.current.availablePackages;
        }

        if (__DEV__) {
            return [
                {
                    identifier: 'monthly',
                    product: {
                        identifier: PRODUCT_IDS.monthly,
                        title: 'Prism Plus Monthly',
                        description: 'Unlock all premium features',
                        priceString: '$4.99',
                        price: 4.99,
                    },
                } as PurchasesPackage,
                {
                    identifier: 'yearly',
                    product: {
                        identifier: PRODUCT_IDS.yearly,
                        title: 'Prism Plus Yearly',
                        description: 'Unlock all premium features',
                        priceString: '$39.99',
                        price: 39.99,
                    },
                } as PurchasesPackage,
            ];
        }

        return [];
    } catch (error) {
        console.error('[RevenueCat] Failed to get packages:', error);
        if (__DEV__) {
            return [
                {
                    identifier: 'monthly',
                    product: {
                        identifier: PRODUCT_IDS.monthly,
                        title: 'Prism Plus Monthly',
                        description: 'Unlock all premium features',
                        priceString: '$4.99',
                        price: 4.99,
                    },
                } as PurchasesPackage,
                {
                    identifier: 'yearly',
                    product: {
                        identifier: PRODUCT_IDS.yearly,
                        title: 'Prism Plus Yearly',
                        description: 'Unlock all premium features',
                        priceString: '$39.99',
                        price: 39.99,
                    },
                } as PurchasesPackage,
            ];
        }
        return [];
    }
}

/**
 * Purchase a package
 */
export async function purchasePackage(packageToPurchase: any): Promise<PurchaseResult> {
    try {
        const { customerInfo } = await Purchases.purchasePackage(packageToPurchase);
        const isActive = customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;

        return {
            success: isActive,
            error: isActive ? undefined : 'Purchase completed but entitlement not found',
        };
    } catch (error: any) {
        if (error.userCancelled) {
            return { success: false, error: 'Purchase cancelled' };
        }
        console.error('[RevenueCat] Purchase failed:', error);
        return { success: false, error: error.message || 'Purchase failed' };
    }
}

/**
 * Restore previous purchases (for users who reinstall)
 */
export async function restorePurchases(): Promise<PurchaseResult> {
    try {
        const customerInfo = await Purchases.restorePurchases();
        const isActive = customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;

        return {
            success: isActive,
            error: isActive ? undefined : 'No active subscription found',
        };
    } catch (error: any) {
        console.error('[RevenueCat] Restore failed:', error);
        return { success: false, error: error.message || 'Restore failed' };
    }
}
