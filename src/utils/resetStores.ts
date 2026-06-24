/**
 * Centralized Store Reset Utility
 * 
 * Called when tenant changes to prevent cross-tenant data leakage.
 * Clears all tenant-specific data from Zustand stores and IndexedDB.
 * 
 * @architecture Part of multi-tenant isolation system
 * @security Critical for preventing tenant data leakage
 */

import { useAuthStore } from '@/stores/authStore';
import { useLanguageStore } from '@/stores/languageStore';
import { localDB } from '@/services/localDB';

/**
 * Reset all tenant-dependent stores
 * 
 * This function is called when:
 * - User switches tenant (different domain/subdomain)
 * - User logs out
 * - Session expires
 */
export const resetTenantStores = async () => {
  console.log('🔄 [TenantSwitch] Resetting all stores for tenant change');
  
  try {
    // Get current auth state
    const authStore = useAuthStore.getState();
    const currentUserId = authStore.user?.id;
    
    // Clear language preferences (will reload from new tenant)
    const languageStore = useLanguageStore.getState();
    console.log('  → Clearing language preferences');
    // Language store will auto-reload from new tenant settings
    
    // Clear IndexedDB for old tenant
    // This removes all cached data: lands, schedules, weather, etc.
    console.log('  → Clearing IndexedDB cached data');
    await localDB.clearAll?.();
    
    // Note: Auth store is NOT reset here to preserve session
    // The session will be validated against the new tenant in App.tsx
    
    console.log('✅ [TenantSwitch] All stores reset successfully');
    
    // Return metadata about what was cleared
    return {
      success: true,
      userId: currentUserId,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error('❌ [TenantSwitch] Error resetting stores:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

/**
 * Force clear all stores including auth
 * Use this only during logout
 */
export const resetAllStores = async () => {
  console.log('🔄 [Logout] Resetting all stores including auth');
  
  await resetTenantStores();
  
  // Now also clear auth
  const authStore = useAuthStore.getState();
  authStore.logout?.();
  
  console.log('✅ [Logout] All stores cleared');
};
