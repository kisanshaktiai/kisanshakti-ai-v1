import { localDB } from './localDB';
import { supabase, supabaseWithAuth, updateSupabaseHeaders } from '@/integrations/supabase/client';
import { farmerAuthService, FarmerAuthError } from './farmerAuthService';

interface OfflineAuthData {
  farmerId: string;
  tenantId: string;
  mobile: string;
  /** PBKDF2 verifier for local offline PIN verification only. Never synced. */
  pinVerifier?: string;
  pinSalt?: string;
  /** Legacy cache field retained only for one-time migration of existing devices. */
  pinHash?: string;
  failedAttempts?: number;
  lockedUntil?: string | null;
  farmerData: any;
  profileData: any;
  lastSyncAt: string;
}

class OfflineAuthService {
  private readonly STORAGE_KEY = 'offline_auth_data';
  private readonly LEGACY_SALT = 'kisan_shakti_2024';
  private readonly PBKDF2_ITERATIONS = 100_000;
  private readonly MAX_FAILED_ATTEMPTS = 5;
  private readonly LOCKOUT_MS = 15 * 60 * 1000;

  // Store authenticated farmer data for offline access
  async cacheAuthData(
    farmerId: string,
    tenantId: string,
    mobile: string,
    pin: string,
    farmerData: any,
    profileData: any
  ): Promise<void> {
    const pinSalt = this.createSalt();
    const pinVerifier = await this.derivePinVerifier(pin, pinSalt);
    const authData: OfflineAuthData = {
      farmerId,
      tenantId,
      mobile,
      pinVerifier,
      pinSalt,
      failedAttempts: 0,
      lockedUntil: null,
      farmerData: this.sanitizeCachedData(farmerData),
      profileData: this.sanitizeCachedData(profileData),
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

    } catch (error) {
      console.error('Error caching offline credential:', error);
      // Do not fall back to localStorage: offline credentials must not be copied
      // into a JavaScript-readable plaintext backup.
      throw error;
    }
  }

  private createSalt(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  private async derivePinVerifier(pin: string, salt: string): Promise<string> {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', encoder.encode(pin), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: encoder.encode(salt), iterations: this.PBKDF2_ITERATIONS, hash: 'SHA-256' },
      key,
      256
    );
    return Array.from(new Uint8Array(bits), byte => byte.toString(16).padStart(2, '0')).join('');
  }

  private sanitizeCachedData<T>(value: T): T {
    if (!value || typeof value !== 'object') return value;
    const clone = { ...(value as Record<string, unknown>) } as Record<string, unknown>;
    for (const key of ['pin', 'pin_hash', 'pinHash', 'session_token', 'sessionToken', 'reset_code', 'reset_code_hash']) {
      delete clone[key];
    }
    return clone as T;
  }

  // Validate PIN offline. Credentials live only in IndexedDB metadata and are never synced.
  async validateOfflinePin(mobile: string, pin: string): Promise<{
    isValid: boolean;
    farmerData?: any;
    profileData?: any;
  }> {
    try {
      await localDB.initialize();
      const tx = (localDB as any).db.transaction('syncMetadata', 'readwrite');
      const authData = await tx.objectStore('syncMetadata').get(this.STORAGE_KEY) as OfflineAuthData | undefined;
      if (!authData || authData.mobile !== mobile) return { isValid: false };

      if (authData.lockedUntil && new Date(authData.lockedUntil).getTime() > Date.now()) {
        return { isValid: false };
      }

      // Legacy records are intentionally not accepted indefinitely. They are replaced on the next
      // successful online login, preventing the old static-SHA256 credential format from surviving.
      if (!authData.pinVerifier || !authData.pinSalt) return { isValid: false };

      const verifier = await this.derivePinVerifier(pin, authData.pinSalt);
      if (verifier === authData.pinVerifier) {
        authData.failedAttempts = 0;
        authData.lockedUntil = null;
        await tx.objectStore('syncMetadata').put(authData);
        await tx.done;
        return { isValid: true, farmerData: authData.farmerData, profileData: authData.profileData };
      }

      const failedAttempts = (authData.failedAttempts || 0) + 1;
      authData.failedAttempts = failedAttempts;
      authData.lockedUntil = failedAttempts >= this.MAX_FAILED_ATTEMPTS
        ? new Date(Date.now() + this.LOCKOUT_MS).toISOString()
        : null;
      await tx.objectStore('syncMetadata').put(authData);
      await tx.done;
      return { isValid: false };
    } catch (error) {
      console.error('Error validating offline PIN:', error);
      return { isValid: false };
    }
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
        if (result.success) {
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
  }> {
    // Credentials are verified server-side only. The client never reads
    // `pin_hash` and never derives its own identity.
    try {
      const result = await farmerAuthService.verifyPin(mobile, tenantId || null, pin);

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
      return false;
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
    
    return null;
  }
}

export const offlineAuthService = new OfflineAuthService();