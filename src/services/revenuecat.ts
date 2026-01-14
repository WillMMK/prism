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
import { Platform, Alert } from 'react-native';
import { usePremiumStore } from '../store/premiumStore';

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

        // Debug logging to help diagnose issues
        console.log('[RevenueCat] Customer ID:', customerInfo.originalAppUserId);
        console.log('[RevenueCat] Active entitlements:', Object.keys(customerInfo.entitlements.active));
        console.log('[RevenueCat] All entitlements:', Object.keys(customerInfo.entitlements.all));

        const entitlement = customerInfo.entitlements.active[ENTITLEMENT_ID];

        if (entitlement) {
            console.log('[RevenueCat] Found active entitlement:', {
                productId: entitlement.productIdentifier,
                expiresDate: entitlement.expirationDate,
                isActive: entitlement.isActive,
            });
            return {
                isActive: true,
                expirationDate: entitlement.expirationDate || undefined,
                productId: entitlement.productIdentifier,
            };
        }

        console.log('[RevenueCat] No active entitlement found for:', ENTITLEMENT_ID);
        return { isActive: false };
    } catch (error) {
        console.error('[RevenueCat] Failed to check subscription:', error);
        return { isActive: false };
    }
}

/**
 * Sync subscription status from RevenueCat to local store
 * Call this on app startup and when app returns to foreground
 * This ensures expired subscriptions are properly reflected in the UI
 */
export async function syncSubscriptionStatus(): Promise<boolean> {
    try {
        console.log('[RevenueCat] Syncing subscription status...');
        const status = await checkSubscriptionStatus();
        const store = usePremiumStore.getState();

        if (status.isActive) {
            // Subscription is active - ensure local state matches
            if (!store.isPremium) {
                console.log('[RevenueCat] Restoring premium status from RevenueCat');
                store.setPremium(true, status.productId);
            }
            return true;
        } else {
            // Subscription not active - update local state if needed
            if (store.isPremium) {
                console.log('[RevenueCat] Subscription expired, updating local state');
                store.setPremium(false);
            }
            return false;
        }
    } catch (error) {
        console.error('[RevenueCat] Failed to sync subscription:', error);
        // On error, don't change existing state
        return usePremiumStore.getState().isPremium;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Purchasing
// ─────────────────────────────────────────────────────────────────────────────

// Offering identifier - must match RevenueCat dashboard
const OFFERING_ID = 'prism_plus';

/**
 * Get available packages for purchase
 * In production, throws errors for proper handling
 * In development, returns mock packages for testing
 */
export async function getPackages(): Promise<PurchasesPackage[]> {
    const mockPackages = [
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

    try {
        const offerings = await Purchases.getOfferings();

        // Log available offerings for debugging
        console.log('[RevenueCat] Available offerings:', Object.keys(offerings.all || {}));
        console.log('[RevenueCat] Current offering:', offerings.current?.identifier);

        // Try to get our specific offering first
        const prismOffering = offerings.all?.[OFFERING_ID];
        if (prismOffering?.availablePackages?.length) {
            console.log('[RevenueCat] Using prism_plus offering with', prismOffering.availablePackages.length, 'packages');
            return prismOffering.availablePackages;
        }

        // Fallback to default offering
        const defaultOffering = offerings.all?.['default'];
        if (defaultOffering?.availablePackages?.length) {
            console.log('[RevenueCat] Using default offering with', defaultOffering.availablePackages.length, 'packages');
            return defaultOffering.availablePackages;
        }

        // Fallback to current offering
        if (offerings.current?.availablePackages?.length) {
            console.log('[RevenueCat] Using current offering with', offerings.current.availablePackages.length, 'packages');
            return offerings.current.availablePackages;
        }

        // No offerings found
        console.warn('[RevenueCat] No offerings found. Available:', JSON.stringify(offerings.all));

        if (__DEV__) {
            console.log('[RevenueCat] Using mock packages for development');
            return mockPackages;
        }

        // In production, return empty array and let paywall show error
        // Don't throw here - the paywall will check for empty packages
        return [];
    } catch (error: any) {
        console.error('[RevenueCat] Failed to get packages:', error);

        if (__DEV__) {
            console.log('[RevenueCat] Using mock packages due to error in development');
            return mockPackages;
        }

        // In production, re-throw with user-friendly message
        throw new Error(error.message || 'Unable to connect to the App Store. Please try again.');
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
