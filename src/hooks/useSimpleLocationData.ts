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

export function useSimpleLocationData() {
  const [states, setStates] = useState<State[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [talukas, setTalukas] = useState<Taluka[]>([]);
  const [villages, setVillages] = useState<Village[]>([]);
  const [loading, setLoading] = useState(false);

  // Load states on mount
  useEffect(() => {
    const loadStates = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('states')
          .select('id, name, code')
          .eq('is_active', true)
          .order('name');
        
        if (error) throw error;
        setStates(data || []);
      } catch (error) {
        console.error('Error loading states:', error);
        toast({
          title: "Error",
          description: "Failed to load states",
          variant: "destructive"
        });
      } finally {
        setLoading(false);
      }
    };
    
    loadStates();
  }, []);

  const loadDistricts = useCallback(async (stateId: string) => {
    if (!stateId) {
      setDistricts([]);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('districts')
        .select('id, name, state_id')
        .eq('state_id', stateId)
        .eq('is_active', true)
        .order('name');
      
      if (error) throw error;
      setDistricts(data || []);
    } catch (error) {
      console.error('Error loading districts:', error);
      setDistricts([]);
      toast({
        title: "Error",
        description: "Failed to load districts",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTalukas = useCallback(async (districtId: string) => {
    if (!districtId) {
      setTalukas([]);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('talukas')
        .select('id, name, district_id')
        .eq('district_id', districtId)
        .eq('is_active', true)
        .order('name');
      
      if (error) throw error;
      setTalukas(data || []);
    } catch (error) {
      console.error('Error loading talukas:', error);
      setTalukas([]);
      toast({
        title: "Error",
        description: "Failed to load talukas",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const loadVillages = useCallback(async (talukaId: string) => {
    if (!talukaId) {
      setVillages([]);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('villages')
        .select('id, name, taluka_id')
        .eq('taluka_id', talukaId)
        .eq('is_active', true)
        .order('name');
      
      if (error) throw error;
      setVillages(data || []);
    } catch (error) {
      console.error('Error loading villages:', error);
      setVillages([]);
      toast({
        title: "Error",
        description: "Failed to load villages",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
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
    loading
  };
}