import { localDB } from './localDB';
import { supabase } from '@/integrations/supabase/client';
import CryptoJS from 'crypto-js';

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
  }> {
    // Check if we're online
    if (!navigator.onLine) {
      console.log('Device is offline, using cached authentication');
      const offlineResult = await this.validateOfflinePin(mobile, pin);
      
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

    // Try online authentication
    try {
      // Set a timeout for the online request
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Request timeout')), 10000)
      );

      const authPromise = this.performOnlineAuth(farmerId, tenantId, pin);
      
      const result = await Promise.race([authPromise, timeoutPromise]);
      
      // If online auth succeeds, cache the data
      if ((result as any).success) {
        await this.cacheAuthData(
          farmerId,
          tenantId,
          mobile,
          pin,
          (result as any).farmerData,
          (result as any).profileData
        );
      }
      
      return result as any;
    } catch (error) {
      console.log('Online authentication failed, falling back to offline');
      
      // Fallback to offline
      const offlineResult = await this.validateOfflinePin(mobile, pin);
      
      if (offlineResult.isValid) {
        return {
          success: true,
          isOffline: true,
          farmerData: offlineResult.farmerData,
          profileData: offlineResult.profileData
        };
      }
      
      return {
        success: false,
        isOffline: true,
        error: 'Unable to authenticate. Please check your internet connection.'
      };
    }
  }

  private async performOnlineAuth(
    farmerId: string,
    tenantId: string,
    pin: string
  ): Promise<{
    success: boolean;
    isOffline: boolean;
    farmerData?: any;
    profileData?: any;
    error?: string;
  }> {
    // Fetch farmer data
    const { data: farmer, error: fetchError } = await supabase
      .from('farmers')
      .select('*')
      .eq('id', farmerId)
      .eq('tenant_id', tenantId)
      .single();

    if (fetchError) {
      throw fetchError;
    }

    // Validate PIN - compare hashed versions
    const pinHash = this.hashPin(pin);
    
    // Try using the RPC function first if it exists
    const { data: isValid, error: validationError } = await supabase
      .rpc('validate_farmer_pin', {
        p_farmer_id: farmerId,
        p_pin: pin,
        p_tenant_id: tenantId
      });

    if (validationError || !isValid) {
      // Fallback to direct comparison of hashed PINs
      if (farmer.pin_hash !== pinHash) {
        // Also check plain PIN for backward compatibility during migration
        if (farmer.pin !== pin) {
          return {
            success: false,
            isOffline: false,
            error: 'Incorrect PIN'
          };
        }
      }
    }

    // Fetch profile data
    const { data: profileData } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('farmer_id', farmerId)
      .maybeSingle();

    return {
      success: true,
      isOffline: false,
      farmerData: farmer,
      profileData
    };
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