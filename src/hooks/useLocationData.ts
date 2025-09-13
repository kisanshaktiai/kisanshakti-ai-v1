import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

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
  const [states, setStates] = useState<State[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [talukas, setTalukas] = useState<Taluka[]>([]);
  const [villages, setVillages] = useState<Village[]>([]);
  
  const [loading, setLoading] = useState<LoadingStates>({
    states: true,
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

  const [retryCount, setRetryCount] = useState(0);

  // Load states on mount with retry logic
  useEffect(() => {
    const loadStates = async () => {
      setLoading(prev => ({ ...prev, states: true }));
      setErrors(prev => ({ ...prev, states: null }));
      
      try {
        const { data, error } = await supabase
          .from('states')
          .select('id, name, code')
          .eq('is_active', true)
          .order('name');
        
        if (error) throw error;
        
        if (data) {
          setStates(data);
          console.log(`Loaded ${data.length} states`);
        }
      } catch (error) {
        const errorMessage = 'Failed to load states. Please refresh the page.';
        console.error('Error loading states:', error);
        setErrors(prev => ({ ...prev, states: errorMessage }));
        
        // Retry logic
        if (retryCount < 3) {
          setTimeout(() => {
            setRetryCount(prev => prev + 1);
          }, 2000 * (retryCount + 1));
        } else {
          toast({
            title: "Error",
            description: errorMessage,
            variant: "destructive"
          });
        }
      } finally {
        setLoading(prev => ({ ...prev, states: false }));
      }
    };
    
    loadStates();
  }, [retryCount]);

  const loadDistricts = useCallback(async (stateId: string) => {
    if (!stateId) {
      setDistricts([]);
      setTalukas([]);
      setVillages([]);
      return;
    }

    setLoading(prev => ({ ...prev, districts: true }));
    setErrors(prev => ({ ...prev, districts: null }));
    
    // Clear dependent data
    setTalukas([]);
    setVillages([]);
    
    try {
      const { data, error } = await supabase
        .from('districts')
        .select('id, name, state_id')
        .eq('state_id', stateId)
        .eq('is_active', true)
        .order('name');
      
      if (error) throw error;
      
      if (data) {
        setDistricts(data);
        console.log(`Loaded ${data.length} districts for state ${stateId}`);
      } else {
        setDistricts([]);
      }
    } catch (error) {
      const errorMessage = 'Failed to load districts. Please try again.';
      console.error('Error loading districts:', error);
      setErrors(prev => ({ ...prev, districts: errorMessage }));
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setLoading(prev => ({ ...prev, districts: false }));
    }
  }, []);

  const loadTalukas = useCallback(async (districtId: string) => {
    if (!districtId) {
      setTalukas([]);
      setVillages([]);
      return;
    }

    setLoading(prev => ({ ...prev, talukas: true }));
    setErrors(prev => ({ ...prev, talukas: null }));
    
    // Clear dependent data
    setVillages([]);
    
    try {
      const { data, error } = await supabase
        .from('talukas')
        .select('id, name, district_id')
        .eq('district_id', districtId)
        .eq('is_active', true)
        .order('name');
      
      if (error) throw error;
      
      if (data) {
        setTalukas(data);
        console.log(`Loaded ${data.length} talukas for district ${districtId}`);
      } else {
        setTalukas([]);
      }
    } catch (error) {
      const errorMessage = 'Failed to load talukas. Please try again.';
      console.error('Error loading talukas:', error);
      setErrors(prev => ({ ...prev, talukas: errorMessage }));
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setLoading(prev => ({ ...prev, talukas: false }));
    }
  }, []);

  const loadVillages = useCallback(async (talukaId: string) => {
    if (!talukaId) {
      setVillages([]);
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
      
      if (error) throw error;
      
      if (data) {
        setVillages(data);
        console.log(`Loaded ${data.length} villages for taluka ${talukaId}`);
      } else {
        setVillages([]);
      }
    } catch (error) {
      const errorMessage = 'Failed to load villages. Please try again.';
      console.error('Error loading villages:', error);
      setErrors(prev => ({ ...prev, villages: errorMessage }));
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setLoading(prev => ({ ...prev, villages: false }));
    }
  }, []);

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