import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useLocationCache } from './useLocationCache';

interface State {
  id: string;
  name: string;
  code?: string;
}

interface District {
  id: string;
  name: string;
  state_id: string;
}

interface Taluka {
  id: string;
  name: string;
  district_id: string;
}

interface Village {
  id: string;
  name: string;
  taluka_id: string;
}

interface LoadingStates {
  states: boolean;
  districts: boolean;
  talukas: boolean;
  villages: boolean;
}

interface ErrorStates {
  states: string | null;
  districts: string | null;
  talukas: string | null;
  villages: string | null;
}

export function useLocationData() {
  const cache = useLocationCache();
  const [states, setStates] = useState<State[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [talukas, setTalukas] = useState<Taluka[]>([]);
  const [villages, setVillages] = useState<Village[]>([]);
  
  const [loading, setLoading] = useState<LoadingStates>({
    states: false,
    districts: false,
    talukas: false,
    villages: false
  });
  
  const [errors, setErrors] = useState<ErrorStates>({
    states: null,
    districts: null,
    talukas: null,
    villages: null
  });

  // Request IDs for race condition prevention
  const requestIds = useRef({
    districts: 0,
    talukas: 0,
    villages: 0
  });

  // Load states on mount
  useEffect(() => {
    const loadStates = async () => {
      // Check cache first
      if (cache.isCacheValid('states') && cache.states.length > 0) {
        setStates(cache.states);
        console.log('Loaded states from cache');
        return;
      }

      setLoading(prev => ({ ...prev, states: true }));
      setErrors(prev => ({ ...prev, states: null }));
      
      try {
        const { data, error } = await supabase
          .from('states')
          .select('id, name, code')
          .eq('is_active', true)
          .order('name');
        
        if (error) throw error;
        
        if (data && data.length > 0) {
          setStates(data);
          cache.setStates(data);
          console.log(`Loaded ${data.length} states from database`);
        } else {
          // If no data, try to use stale cache
          if (cache.states.length > 0) {
            setStates(cache.states);
            console.log('Using stale cache for states');
          }
        }
      } catch (error) {
        console.error('Error loading states:', error);
        
        // Try to use stale cache on error
        if (cache.states.length > 0) {
          setStates(cache.states);
          console.log('Using stale cache after error');
        } else {
          setErrors(prev => ({ ...prev, states: 'Failed to load states' }));
          toast({
            title: "Connection Error",
            description: "Unable to load location data. Please check your connection.",
            variant: "destructive"
          });
        }
      } finally {
        setLoading(prev => ({ ...prev, states: false }));
      }
    };
    
    loadStates();
  }, []);

  const loadDistricts = useCallback(async (stateId: string) => {
    if (!stateId) {
      setDistricts([]);
      // Don't clear dependent data immediately, wait for data to load
      return;
    }

    // Increment request ID for this call
    const currentRequestId = ++requestIds.current.districts;

    // Check cache first
    const cachedDistricts = cache.getDistricts(stateId);
    if (cache.isCacheValid('districts', stateId) && cachedDistricts && cachedDistricts.length > 0) {
      setDistricts(cachedDistricts);
      console.log('Loaded districts from cache');
      return;
    }

    setLoading(prev => ({ ...prev, districts: true }));
    setErrors(prev => ({ ...prev, districts: null }));
    
    try {
      const { data, error } = await supabase
        .from('districts')
        .select('id, name, state_id')
        .eq('state_id', stateId)
        .eq('is_active', true)
        .order('name');
      
      // Check if this is still the latest request
      if (currentRequestId !== requestIds.current.districts) {
        console.log('Discarding stale districts response');
        return;
      }
      
      if (error) throw error;
      
      if (data && data.length > 0) {
        setDistricts(data);
        cache.setDistricts(stateId, data);
        console.log(`Loaded ${data.length} districts from database`);
        // Clear dependent data only after successful load
        setTalukas([]);
        setVillages([]);
      } else if (cachedDistricts && cachedDistricts.length > 0) {
        // Use stale cache if available
        setDistricts(cachedDistricts);
        console.log('Using stale cache for districts');
      } else {
        setDistricts([]);
        setTalukas([]);
        setVillages([]);
        console.log('No districts found for state');
      }
    } catch (error) {
      console.error('Error loading districts:', error);
      
      // Check if this is still the latest request
      if (currentRequestId !== requestIds.current.districts) {
        return;
      }
      
      // Try stale cache on error
      if (cachedDistricts && cachedDistricts.length > 0) {
        setDistricts(cachedDistricts);
        console.log('Using stale cache after error');
      } else {
        setErrors(prev => ({ ...prev, districts: 'Failed to load districts' }));
        setDistricts([]);
        toast({
          title: "Error loading districts",
          description: "Please check your connection and try again.",
          variant: "destructive"
        });
      }
    } finally {
      if (currentRequestId === requestIds.current.districts) {
        setLoading(prev => ({ ...prev, districts: false }));
      }
    }
  }, [cache]);

  const loadTalukas = useCallback(async (districtId: string) => {
    if (!districtId) {
      setTalukas([]);
      // Don't clear villages immediately
      return;
    }

    // Increment request ID for this call
    const currentRequestId = ++requestIds.current.talukas;

    // Check cache first
    const cachedTalukas = cache.getTalukas(districtId);
    if (cache.isCacheValid('talukas', districtId) && cachedTalukas && cachedTalukas.length > 0) {
      setTalukas(cachedTalukas);
      console.log('Loaded talukas from cache');
      return;
    }

    setLoading(prev => ({ ...prev, talukas: true }));
    setErrors(prev => ({ ...prev, talukas: null }));
    
    try {
      const { data, error } = await supabase
        .from('talukas')
        .select('id, name, district_id')
        .eq('district_id', districtId)
        .eq('is_active', true)
        .order('name');
      
      // Check if this is still the latest request
      if (currentRequestId !== requestIds.current.talukas) {
        console.log('Discarding stale talukas response');
        return;
      }
      
      if (error) throw error;
      
      if (data && data.length > 0) {
        setTalukas(data);
        cache.setTalukas(districtId, data);
        console.log(`Loaded ${data.length} talukas from database`);
        // Clear dependent data only after successful load
        setVillages([]);
      } else if (cachedTalukas && cachedTalukas.length > 0) {
        setTalukas(cachedTalukas);
        console.log('Using stale cache for talukas');
      } else {
        setTalukas([]);
        setVillages([]);
        console.log('No talukas found for district');
      }
    } catch (error) {
      console.error('Error loading talukas:', error);
      
      // Check if this is still the latest request
      if (currentRequestId !== requestIds.current.talukas) {
        return;
      }
      
      if (cachedTalukas && cachedTalukas.length > 0) {
        setTalukas(cachedTalukas);
        console.log('Using stale cache after error');
      } else {
        setErrors(prev => ({ ...prev, talukas: 'Failed to load talukas' }));
        setTalukas([]);
        toast({
          title: "Error loading talukas",
          description: "Please check your connection and try again.",
          variant: "destructive"
        });
      }
    } finally {
      if (currentRequestId === requestIds.current.talukas) {
        setLoading(prev => ({ ...prev, talukas: false }));
      }
    }
  }, [cache]);

  const loadVillages = useCallback(async (talukaId: string) => {
    if (!talukaId) {
      setVillages([]);
      return;
    }

    // Increment request ID for this call
    const currentRequestId = ++requestIds.current.villages;

    // Check cache first
    const cachedVillages = cache.getVillages(talukaId);
    if (cache.isCacheValid('villages', talukaId) && cachedVillages && cachedVillages.length > 0) {
      setVillages(cachedVillages);
      console.log('Loaded villages from cache');
      return;
    }

    setLoading(prev => ({ ...prev, villages: true }));
    setErrors(prev => ({ ...prev, villages: null }));
    
    try {
      const { data, error } = await supabase
        .from('villages')
        .select('id, name, taluka_id')
        .eq('taluka_id', talukaId)
        .eq('is_active', true)
        .order('name');
      
      // Check if this is still the latest request
      if (currentRequestId !== requestIds.current.villages) {
        console.log('Discarding stale villages response');
        return;
      }
      
      if (error) throw error;
      
      if (data && data.length > 0) {
        setVillages(data);
        cache.setVillages(talukaId, data);
        console.log(`Loaded ${data.length} villages from database`);
      } else if (cachedVillages && cachedVillages.length > 0) {
        setVillages(cachedVillages);
        console.log('Using stale cache for villages');
      } else {
        setVillages([]);
        console.log('No villages found for taluka');
      }
    } catch (error) {
      console.error('Error loading villages:', error);
      
      // Check if this is still the latest request
      if (currentRequestId !== requestIds.current.villages) {
        return;
      }
      
      if (cachedVillages && cachedVillages.length > 0) {
        setVillages(cachedVillages);
        console.log('Using stale cache after error');
      } else {
        setErrors(prev => ({ ...prev, villages: 'Failed to load villages' }));
        setVillages([]);
        toast({
          title: "Error loading villages",
          description: "Please check your connection and try again.",
          variant: "destructive"
        });
      }
    } finally {
      if (currentRequestId === requestIds.current.villages) {
        setLoading(prev => ({ ...prev, villages: false }));
      }
    }
  }, [cache]);

  return {
    states,
    districts,
    talukas,
    villages,
    loadDistricts,
    loadTalukas,
    loadVillages,
    loading,
    errors
  };
}