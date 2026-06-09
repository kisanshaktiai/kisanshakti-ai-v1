/**
 * ═══════════════════════════════════════════════════════════════════════════
 * UNIFIED LOCATION HOOK
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Single hook for all location needs. Consolidates:
 * - useLocation (GPS coordinates)
 * - useLocationData (hierarchical data: states/districts/talukas/villages)
 * - useSimpleLocationData (simple version)
 * - useLocationCache (caching)
 * 
 * Features:
 * - GPS location tracking
 * - Hierarchical location data (India: State > District > Taluka > Village)
 * - Intelligent caching with 30-minute TTL
 * - Race condition prevention
 * - Stale-while-revalidate pattern
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useLocationCache } from './useLocationCache';
import LocationService, { LocationData } from '@/services/LocationService';

// Types
export interface State {
  id: string;
  name: string;
  code?: string;
}

export interface District {
  id: string;
  name: string;
  state_id: string;
}

export interface Taluka {
  id: string;
  name: string;
  district_id: string;
}

export interface Village {
  id: string;
  name: string;
  taluka_id: string;
}

interface LoadingStates {
  gps: boolean;
  states: boolean;
  districts: boolean;
  talukas: boolean;
  villages: boolean;
}

interface UseUnifiedLocationOptions {
  /** Load GPS location on mount */
  loadGPS?: boolean;
  /** Show toast on errors */
  showToasts?: boolean;
  /** Auto-refresh GPS in background */
  autoRefreshGPS?: boolean;
}

interface UseUnifiedLocationReturn {
  // GPS Location
  gpsLocation: LocationData | null;
  fetchGPSLocation: (forceRefresh?: boolean) => Promise<void>;
  startGPSTracking: () => void;
  stopGPSTracking: () => void;
  getFormattedLocation: () => string;
  
  // Hierarchical Location Data
  states: State[];
  districts: District[];
  talukas: Taluka[];
  villages: Village[];
  loadDistricts: (stateId: string) => Promise<void>;
  loadTalukas: (districtId: string) => Promise<void>;
  loadVillages: (talukaId: string) => Promise<void>;
  
  // State
  loading: LoadingStates;
  error: string | null;
  
  // Cache control
  clearCache: () => void;
  isCacheValid: (type: 'states' | 'districts' | 'talukas' | 'villages', id?: string) => boolean;
}

export function useUnifiedLocation(options: UseUnifiedLocationOptions = {}): UseUnifiedLocationReturn {
  const { 
    loadGPS = false, 
    showToasts = true,
    autoRefreshGPS = false 
  } = options;
  
  const cache = useLocationCache();
  
  // GPS state
  const [gpsLocation, setGpsLocation] = useState<LocationData | null>(null);
  
  // Hierarchical data state
  const [states, setStates] = useState<State[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [talukas, setTalukas] = useState<Taluka[]>([]);
  const [villages, setVillages] = useState<Village[]>([]);
  
  const [loading, setLoading] = useState<LoadingStates>({
    gps: false,
    states: false,
    districts: false,
    talukas: false,
    villages: false
  });
  
  const [error, setError] = useState<string | null>(null);
  
  // Request IDs for race condition prevention
  const requestIds = useRef({
    districts: 0,
    talukas: 0,
    villages: 0
  });
  
  // ═══════════════════════════════════════════════════════════════════════════
  // GPS LOCATION
  // ═══════════════════════════════════════════════════════════════════════════
  
  useEffect(() => {
    // Load cached GPS location immediately
    const cached = LocationService.getCachedLocation();
    if (cached) {
      setGpsLocation(cached);
    }
    
    // Subscribe to location updates
    const unsubscribe = LocationService.subscribeToLocationUpdates((newLocation) => {
      setGpsLocation(newLocation);
      setError(null);
    });
    
    // Optionally fetch fresh GPS
    if (loadGPS || autoRefreshGPS) {
      fetchGPSLocation();
    }
    
    return () => {
      unsubscribe();
    };
  }, [loadGPS, autoRefreshGPS]);
  
  const fetchGPSLocation = useCallback(async (forceRefresh = false) => {
    setLoading(prev => ({ ...prev, gps: true }));
    setError(null);
    
    try {
      const locationData = await LocationService.getCurrentLocation(forceRefresh);
      if (locationData) {
        setGpsLocation(locationData);
      } else if (!gpsLocation) {
        setError('Unable to get location');
      }
    } catch (err) {
      console.error('Error fetching GPS location:', err);
      setError('Failed to get location');
    } finally {
      setLoading(prev => ({ ...prev, gps: false }));
    }
  }, [gpsLocation]);
  
  const startGPSTracking = useCallback(() => {
    LocationService.startLocationTracking();
  }, []);
  
  const stopGPSTracking = useCallback(() => {
    LocationService.stopLocationTracking();
  }, []);
  
  const getFormattedLocation = useCallback(() => {
    return LocationService.getFormattedLocation();
  }, []);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STATES (Load on mount)
  // ═══════════════════════════════════════════════════════════════════════════
  
  useEffect(() => {
    const loadStates = async () => {
      // Check cache first
      if (cache.isCacheValid('states') && cache.states.length > 0) {
        setStates(cache.states);
        console.log('[UnifiedLocation] Loaded states from cache');
        return;
      }
      
      setLoading(prev => ({ ...prev, states: true }));
      
      try {
        const { data, error: fetchError } = await supabase
          .from('states')
          .select('id, name, code')
          .eq('is_active', true)
          .order('name');
        
        if (fetchError) throw fetchError;
        
        if (data && data.length > 0) {
          setStates(data);
          cache.setStates(data);
          console.log(`[UnifiedLocation] Loaded ${data.length} states from DB`);
        } else if (cache.states.length > 0) {
          // Fallback to stale cache
          setStates(cache.states);
          console.log('[UnifiedLocation] Using stale cache for states');
        }
      } catch (err) {
        console.error('[UnifiedLocation] Error loading states:', err);
        if (cache.states.length > 0) {
          setStates(cache.states);
        } else if (showToasts) {
          toast({
            title: "Connection Error",
            description: "Unable to load location data",
            variant: "destructive"
          });
        }
      } finally {
        setLoading(prev => ({ ...prev, states: false }));
      }
    };
    
    loadStates();
  }, [cache, showToasts]);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // DISTRICTS
  // ═══════════════════════════════════════════════════════════════════════════
  
  const loadDistricts = useCallback(async (stateId: string) => {
    if (!stateId) {
      setDistricts([]);
      return;
    }
    
    const currentRequestId = ++requestIds.current.districts;
    
    // Check cache
    const cachedDistricts = cache.getDistricts(stateId);
    if (cache.isCacheValid('districts', stateId) && cachedDistricts?.length) {
      setDistricts(cachedDistricts);
      setTalukas([]);
      setVillages([]);
      console.log('[UnifiedLocation] Loaded districts from cache');
      return;
    }
    
    setLoading(prev => ({ ...prev, districts: true }));
    
    try {
      // Select * so we pick up future district name_<lang> columns automatically.
      const { data, error: fetchError } = await supabase
        .from('districts')
        .select('*')
        .eq('state_id', stateId)
        .eq('is_active', true)
        .order('name');
      
      // Check if still the latest request
      if (currentRequestId !== requestIds.current.districts) {
        console.log('[UnifiedLocation] Discarding stale districts response');
        return;
      }
      
      if (fetchError) throw fetchError;
      
      if (data?.length) {
        setDistricts(data);
        cache.setDistricts(stateId, data);
        setTalukas([]);
        setVillages([]);
        console.log(`[UnifiedLocation] Loaded ${data.length} districts from DB`);
      } else if (cachedDistricts?.length) {
        setDistricts(cachedDistricts);
      } else {
        setDistricts([]);
        setTalukas([]);
        setVillages([]);
      }
    } catch (err) {
      console.error('[UnifiedLocation] Error loading districts:', err);
      if (currentRequestId !== requestIds.current.districts) return;
      
      if (cachedDistricts?.length) {
        setDistricts(cachedDistricts);
      } else {
        setDistricts([]);
        if (showToasts) {
          toast({
            title: "Error",
            description: "Failed to load districts",
            variant: "destructive"
          });
        }
      }
    } finally {
      if (currentRequestId === requestIds.current.districts) {
        setLoading(prev => ({ ...prev, districts: false }));
      }
    }
  }, [cache, showToasts]);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // TALUKAS
  // ═══════════════════════════════════════════════════════════════════════════
  
  const loadTalukas = useCallback(async (districtId: string) => {
    if (!districtId) {
      setTalukas([]);
      return;
    }
    
    const currentRequestId = ++requestIds.current.talukas;
    
    // Check cache
    const cachedTalukas = cache.getTalukas(districtId);
    if (cache.isCacheValid('talukas', districtId) && cachedTalukas?.length) {
      setTalukas(cachedTalukas);
      setVillages([]);
      console.log('[UnifiedLocation] Loaded talukas from cache');
      return;
    }
    
    setLoading(prev => ({ ...prev, talukas: true }));
    
    try {
      const { data, error: fetchError } = await supabase
        .from('talukas')
        .select('id, name, district_id')
        .eq('district_id', districtId)
        .eq('is_active', true)
        .order('name');
      
      if (currentRequestId !== requestIds.current.talukas) return;
      
      if (fetchError) throw fetchError;
      
      if (data?.length) {
        setTalukas(data);
        cache.setTalukas(districtId, data);
        setVillages([]);
        console.log(`[UnifiedLocation] Loaded ${data.length} talukas from DB`);
      } else if (cachedTalukas?.length) {
        setTalukas(cachedTalukas);
      } else {
        setTalukas([]);
        setVillages([]);
      }
    } catch (err) {
      console.error('[UnifiedLocation] Error loading talukas:', err);
      if (currentRequestId !== requestIds.current.talukas) return;
      
      if (cachedTalukas?.length) {
        setTalukas(cachedTalukas);
      } else {
        setTalukas([]);
        if (showToasts) {
          toast({
            title: "Error",
            description: "Failed to load talukas",
            variant: "destructive"
          });
        }
      }
    } finally {
      if (currentRequestId === requestIds.current.talukas) {
        setLoading(prev => ({ ...prev, talukas: false }));
      }
    }
  }, [cache, showToasts]);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // VILLAGES
  // ═══════════════════════════════════════════════════════════════════════════
  
  const loadVillages = useCallback(async (talukaId: string) => {
    if (!talukaId) {
      setVillages([]);
      return;
    }
    
    const currentRequestId = ++requestIds.current.villages;
    
    // Check cache
    const cachedVillages = cache.getVillages(talukaId);
    if (cache.isCacheValid('villages', talukaId) && cachedVillages?.length) {
      setVillages(cachedVillages);
      console.log('[UnifiedLocation] Loaded villages from cache');
      return;
    }
    
    setLoading(prev => ({ ...prev, villages: true }));
    
    try {
      const { data, error: fetchError } = await supabase
        .from('villages')
        .select('id, name, taluka_id')
        .eq('taluka_id', talukaId)
        .eq('is_active', true)
        .order('name');
      
      if (currentRequestId !== requestIds.current.villages) return;
      
      if (fetchError) throw fetchError;
      
      if (data?.length) {
        setVillages(data);
        cache.setVillages(talukaId, data);
        console.log(`[UnifiedLocation] Loaded ${data.length} villages from DB`);
      } else if (cachedVillages?.length) {
        setVillages(cachedVillages);
      } else {
        setVillages([]);
      }
    } catch (err) {
      console.error('[UnifiedLocation] Error loading villages:', err);
      if (currentRequestId !== requestIds.current.villages) return;
      
      if (cachedVillages?.length) {
        setVillages(cachedVillages);
      } else {
        setVillages([]);
        if (showToasts) {
          toast({
            title: "Error",
            description: "Failed to load villages",
            variant: "destructive"
          });
        }
      }
    } finally {
      if (currentRequestId === requestIds.current.villages) {
        setLoading(prev => ({ ...prev, villages: false }));
      }
    }
  }, [cache, showToasts]);
  
  return {
    // GPS
    gpsLocation,
    fetchGPSLocation,
    startGPSTracking,
    stopGPSTracking,
    getFormattedLocation,
    
    // Hierarchical
    states,
    districts,
    talukas,
    villages,
    loadDistricts,
    loadTalukas,
    loadVillages,
    
    // State
    loading,
    error,
    
    // Cache
    clearCache: cache.clearCache,
    isCacheValid: cache.isCacheValid
  };
}

// Re-export types
export type { LocationData };
