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

// Uncomment when SDK is installed:
// import Purchases, { PurchasesPackage, CustomerInfo } from 'react-native-purchases';

import { Platform } from 'react-native';

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

// TODO: Replace with your actual RevenueCat API key
const REVENUECAT_API_KEY_IOS = 'test_gUduggDcoFtXJHgPanGuYWBVPXg';
const REVENUECAT_API_KEY_ANDROID = 'test_gUduggDcoFtXJHgPanGuYWBVPXg';

// Entitlement identifier (set in RevenueCat dashboard)
export const ENTITLEMENT_ID = 'prism_plus';

// Product identifier (set in App Store Connect)
export const PRODUCT_ID = 'com.willmmk.budgetreport.prismplus';

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
        // Uncomment when SDK is installed:
        // const apiKey = Platform.OS === 'ios' ? REVENUECAT_API_KEY_IOS : REVENUECAT_API_KEY_ANDROID;
        // await Purchases.configure({ apiKey });
        // isInitialized = true;

        console.log('[RevenueCat] SDK not installed - using stub mode');
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
        // Uncomment when SDK is installed:
        // const customerInfo = await Purchases.getCustomerInfo();
        // const entitlement = customerInfo.entitlements.active[ENTITLEMENT_ID];
        // 
        // if (entitlement) {
        //   return {
        //     isActive: true,
        //     expirationDate: entitlement.expirationDate || undefined,
        //     productId: entitlement.productIdentifier,
        //   };
        // }

        // Stub mode - return inactive
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
export async function getPackages(): Promise<any[]> {
    try {
        // Uncomment when SDK is installed:
        // const offerings = await Purchases.getOfferings();
        // if (offerings.current?.availablePackages) {
        //   return offerings.current.availablePackages;
        // }

        // Stub mode - return mock package
        return [{
            identifier: 'prism_plus',
            product: {
                identifier: PRODUCT_ID,
                title: 'Prism Plus',
                description: 'Unlock all premium features',
                priceString: '$4.99',
                price: 4.99,
            },
        }];
    } catch (error) {
        console.error('[RevenueCat] Failed to get packages:', error);
        return [];
    }
}

/**
 * Purchase a package
 */
export async function purchasePackage(packageToPurchase: any): Promise<PurchaseResult> {
    try {
        // Uncomment when SDK is installed:
        // const { customerInfo } = await Purchases.purchasePackage(packageToPurchase);
        // const isActive = customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;
        // 
        // return {
        //   success: isActive,
        //   error: isActive ? undefined : 'Purchase completed but entitlement not found',
        // };

        // Stub mode - simulate successful purchase
        console.log('[RevenueCat] Stub mode - simulating purchase');
        return { success: true };
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
        // Uncomment when SDK is installed:
        // const customerInfo = await Purchases.restorePurchases();
        // const isActive = customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;
        // 
        // return {
        //   success: isActive,
        //   error: isActive ? undefined : 'No active subscription found',
        // };

        // Stub mode
        console.log('[RevenueCat] Stub mode - no purchases to restore');
        return { success: false, error: 'No previous purchases found' };
    } catch (error: any) {
        console.error('[RevenueCat] Restore failed:', error);
        return { success: false, error: error.message || 'Restore failed' };
    }
}
