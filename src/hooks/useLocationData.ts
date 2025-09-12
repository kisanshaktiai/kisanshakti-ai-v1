import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

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

export function useLocationData() {
  const [states, setStates] = useState<State[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [talukas, setTalukas] = useState<Taluka[]>([]);
  const [villages, setVillages] = useState<Village[]>([]);
  const [loading, setLoading] = useState(false);

  // Load states on mount
  useEffect(() => {
    const loadStates = async () => {
      const { data, error } = await supabase
        .from('states')
        .select('id, name, code')
        .eq('is_active', true)
        .order('name');
      
      if (data && !error) {
        setStates(data);
      }
    };
    loadStates();
  }, []);

  const loadDistricts = async (stateId: string) => {
    setLoading(true);
    const { data, error } = await supabase
      .from('districts')
      .select('id, name, state_id')
      .eq('state_id', stateId)
      .eq('is_active', true)
      .order('name');
    
    if (data && !error) {
      setDistricts(data);
    }
    setLoading(false);
  };

  const loadTalukas = async (districtId: string) => {
    setLoading(true);
    const { data, error } = await supabase
      .from('talukas')
      .select('id, name, district_id')
      .eq('district_id', districtId)
      .eq('is_active', true)
      .order('name');
    
    if (data && !error) {
      setTalukas(data);
    }
    setLoading(false);
  };

  const loadVillages = async (talukaId: string) => {
    setLoading(true);
    const { data, error } = await supabase
      .from('villages')
      .select('id, name, taluka_id')
      .eq('taluka_id', talukaId)
      .eq('is_active', true)
      .order('name');
    
    if (data && !error) {
      setVillages(data);
    }
    setLoading(false);
  };

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