import { localDB } from './localDB';
import { supabase, supabaseWithAuth, updateSupabaseHeaders } from '@/integrations/supabase/client';
import CryptoJS from 'crypto-js';
import { farmerAuthService, FarmerAuthError } from './farmerAuthService';
import { accountSessionService } from './accountSessionService';

interface OfflineAuthData {
  farmerId: string;
  tenantId: string;
  mobile: string;
  pinHash: string;
  farmerData: any;
  profileData: any;
  lastSyncAt: string;
}

class OfflineAuthService {
  private readonly STORAGE_KEY = 'offline_auth_data';
  private readonly SALT = 'kisan_shakti_2024';

  // Store authenticated farmer data for offline access
  async cacheAuthData(
    farmerId: string,
    tenantId: string,
    mobile: string,
    pin: string,
    farmerData: any,
    profileData: any
  ): Promise<void> {
    const pinHash = this.hashPin(pin);
    
    const authData: OfflineAuthData = {
      farmerId,
      tenantId,
      mobile,
      pinHash,
      farmerData,
      profileData,
      lastSyncAt: new Date().toISOString()
    };

    // Store in IndexedDB for secure offline access
    try {
      await localDB.initialize();
      const tx = (localDB as any).db.transaction('syncMetadata', 'readwrite');
      await tx.objectStore('syncMetadata').put({
        id: this.STORAGE_KEY,
        ...authData
      });
      await tx.done;

      // Also store in localStorage as backup
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(authData));
    } catch (error) {
      console.error('Error caching auth data:', error);
      // Fallback to localStorage only
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(authData));
    }
  }

  /**
   * Farmer activation: the farmer row changed on the server (new tenant, no
   * longer waiting for a code) without a PIN login. Replaces the farmer and
   * profile in the offline copy and keeps its PIN hash, so an offline sign-in
   * opens the farmer as they are now. Does nothing when there is no offline copy
   * or it belongs to somebody else.
   */
  async updateCachedFarmer(farmerData: any, profileData: any): Promise<void> {
    const cached = await this.getCachedAuthData();
    if (!cached || !farmerData?.id || cached.farmerId !== farmerData.id) return;

    const authData: OfflineAuthData = {
      farmerId: cached.farmerId,
      tenantId: farmerData.tenant_id ?? cached.tenantId,
      mobile: cached.mobile,
      pinHash: cached.pinHash,
      farmerData,
      profileData: profileData ?? cached.profileData,
      lastSyncAt: new Date().toISOString(),
    };

    try {
      await localDB.initialize();
      const tx = (localDB as any).db.transaction('syncMetadata', 'readwrite');
      await tx.objectStore('syncMetadata').put({ id: this.STORAGE_KEY, ...authData });
      await tx.done;
    } catch (error) {
      console.error('Error updating cached auth data:', error);
    }
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(authData));
  }

  // Hash PIN for secure storage
  hashPin(pin: string): string {
    return CryptoJS.SHA256(pin + this.SALT).toString();
  }

  // Validate PIN offline
  async validateOfflinePin(mobile: string, pin: string): Promise<{
    isValid: boolean;
    farmerData?: any;
    profileData?: any;
  }> {
    try {
      // Try to get from IndexedDB first
      await localDB.initialize();
      const tx = (localDB as any).db.transaction('syncMetadata', 'readonly');
      const authData = await tx.objectStore('syncMetadata').get(this.STORAGE_KEY);
      
      if (!authData) {
        // Fallback to localStorage
        const localData = localStorage.getItem(this.STORAGE_KEY);
        if (!localData) {
          return { isValid: false };
        }
        const parsed = JSON.parse(localData) as OfflineAuthData;
        return this.validateAuthData(parsed, mobile, pin);
      }

      return this.validateAuthData(authData, mobile, pin);
    } catch (error) {
      console.error('Error validating offline PIN:', error);
      
      // Last resort: check localStorage
      const localData = localStorage.getItem(this.STORAGE_KEY);
      if (!localData) {
        return { isValid: false };
      }
      
      const parsed = JSON.parse(localData) as OfflineAuthData;
      return this.validateAuthData(parsed, mobile, pin);
    }
  }

  private validateAuthData(
    authData: OfflineAuthData,
    mobile: string,
    pin: string
  ): { isValid: boolean; farmerData?: any; profileData?: any } {
    const pinHash = this.hashPin(pin);
    
    if (authData.mobile === mobile && authData.pinHash === pinHash) {
      return {
        isValid: true,
        farmerData: authData.farmerData,
        profileData: authData.profileData
      };
    }
    
    return { isValid: false };
  }

  // Attempt online authentication with fallback to offline
  async authenticateWithFallback(
    mobile: string,
    pin: string,
    farmerId: string,
    tenantId: string
  ): Promise<{
    success: boolean;
    isOffline: boolean;
    farmerData?: any;
    profileData?: any;
    error?: string;
    /** Multi-role identity: route of the non-farmer workspace the session opened in. */
    accountDestination?: string;
  }> {
    // OFFLINE-FIRST: Check cached auth IMMEDIATELY, regardless of network status
    const offlineResult = await this.validateOfflinePin(mobile, pin);
    
    // Check if we're online
    const isOnline = navigator.onLine;
    
    if (!isOnline) {
      console.log('📴 [OfflineAuth] Device is offline, using cached authentication');
      
      if (offlineResult.isValid) {
        return {
          success: true,
          isOffline: true,
          farmerData: offlineResult.farmerData,
          profileData: offlineResult.profileData
        };
      } else {
        return {
          success: false,
          isOffline: true,
          error: 'Invalid PIN. Please ensure you have logged in at least once while online.'
        };
      }
    }

    // ONLINE: Try online authentication with timeout, retry, and fallback
    console.log('🌐 [OfflineAuth] Device is online, attempting online authentication...');
    
    const maxRetries = 2;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Shorter timeout for retries
        const timeoutMs = attempt === 1 ? 8000 : 5000;
        const timeoutPromise = new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Request timeout')), timeoutMs)
        );

        const authPromise = this.performOnlineAuth(mobile, tenantId, pin);
        
        const result = await Promise.race([authPromise, timeoutPromise]);
        
        // If online auth succeeds, cache the data for future offline use
        // A session that opened in the Provider or Customer workspace has no
        // farmer data to cache and never gets an offline PIN copy.
        if (result.success && !result.accountDestination) {
          console.log('✅ [OfflineAuth] Online authentication successful, caching data');
          await this.cacheAuthData(
            result.farmerData?.id ?? farmerId,
            result.farmerData?.tenant_id ?? tenantId,
            mobile,
            pin,
            result.farmerData,
            result.profileData
          );
        }
        
        return result;
      } catch (error: any) {
        lastError = error;
        const isNetworkError = error?.code === 'transport_unavailable' ||
                               error.message === 'TypeError: Failed to fetch' || 
                               error.message?.includes('Failed to fetch') ||
                               error.message === 'Request timeout' ||
                               error.message === 'Load failed' ||
                               error.name === 'TypeError';
        
        console.warn(`⚠️ [OfflineAuth] Attempt ${attempt}/${maxRetries} failed:`, error.message, 
          isNetworkError ? '(network error)' : '(auth error)');
        
        // Don't retry non-network errors (wrong PIN, user not found, etc.)
        if (!isNetworkError) {
          break;
        }
        
        // Small delay before retry
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }

    // All online attempts failed — fallback to offline
    console.log('🔄 [OfflineAuth] Online auth failed, falling back to offline validation');
    
    if (offlineResult.isValid) {
      console.log('✅ [OfflineAuth] Offline validation successful');
      return {
        success: true,
        isOffline: true,
        farmerData: offlineResult.farmerData,
        profileData: offlineResult.profileData
      };
    }
    
    // Both online and offline failed
    const isNetworkError = (lastError as any)?.code === 'transport_unavailable' ||
                           lastError?.message?.includes('Failed to fetch') || 
                           lastError?.message === 'Request timeout' ||
                           lastError?.message === 'Load failed' ||
                           lastError?.name === 'TypeError';
    
    return {
      success: false,
      isOffline: !isOnline,
      error: isNetworkError
        ? 'Network connection is weak. Please move to an area with better signal and try again.'
        : lastError?.message || 'Unable to authenticate. Please try again.'
    };
  }

  private async performOnlineAuth(
    mobile: string,
    tenantId: string,
    pin: string
  ): Promise<{
    success: boolean;
    isOffline: boolean;
    farmerData?: any;
    profileData?: any;
    error?: string;
    accountDestination?: string;
  }> {
    // Credentials are verified server-side only. The client never reads
    // `pin_hash` and never derives its own identity.
    try {
      const result = await farmerAuthService.verifyPin(mobile, tenantId || null, pin);

      // Multi-role identity: null with the flag off or when the session opened
      // in the Farmer workspace — then the farmer path below runs as before.
      const accountDestination = accountSessionService.applyAuthResult(result);
      if (accountDestination) {
        return { success: true, isOffline: false, accountDestination };
      }

      updateSupabaseHeaders(result.farmer.id, result.farmer.tenant_id);

      return {
        success: true,
        isOffline: false,
        farmerData: result.farmer,
        profileData: result.profile
      };
    } catch (error: any) {
      if (error instanceof FarmerAuthError) {
        // Transport failures must bubble up so the retry + offline-PIN
        // fallback path runs. Only genuine credential failures are terminal.
        if (error.code === 'transport_unavailable') throw error;
        // Credential failures must not be retried or masked by offline fallback.
        return { success: false, isOffline: false, error: error.message };
      }
      throw error;
    }
  }

  // Check if we have cached auth data
  async hasCachedAuth(): Promise<boolean> {
    try {
      await localDB.initialize();
      const tx = (localDB as any).db.transaction('syncMetadata', 'readonly');
      const authData = await tx.objectStore('syncMetadata').get(this.STORAGE_KEY);
      return !!authData;
    } catch {
      const localData = localStorage.getItem(this.STORAGE_KEY);
      return !!localData;
    }
  }

  // Clear cached auth data
  async clearCachedAuth(): Promise<void> {
    try {
      await localDB.initialize();
      const tx = (localDB as any).db.transaction('syncMetadata', 'readwrite');
      await tx.objectStore('syncMetadata').delete(this.STORAGE_KEY);
      await tx.done;
    } catch (error) {
      console.error('Error clearing cached auth:', error);
    }
    
    localStorage.removeItem(this.STORAGE_KEY);
  }

  // Get cached auth data for auto-login
  async getCachedAuthData(): Promise<OfflineAuthData | null> {
    try {
      await localDB.initialize();
      const tx = (localDB as any).db.transaction('syncMetadata', 'readonly');
      const authData = await tx.objectStore('syncMetadata').get(this.STORAGE_KEY);
      
      if (authData) {
        return authData;
      }
    } catch (error) {
      console.error('Error getting cached auth:', error);
    }
    
    // Fallback to localStorage
    const localData = localStorage.getItem(this.STORAGE_KEY);
    if (localData) {
      return JSON.parse(localData);
    }
    
    return null;
  }
}

export const offlineAuthService = new OfflineAuthService();