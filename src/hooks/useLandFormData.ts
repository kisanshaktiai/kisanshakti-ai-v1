import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface SoilType {
  id: string;
  label: string;
  value: string;
  description?: string;
}

interface WaterSource {
  id: string;
  label: string;
  value: string;
  description?: string;
}

interface IrrigationType {
  id: string;
  label: string;
  value: string;
  description?: string;
}

export function useLandFormData() {
  const [soilTypes, setSoilTypes] = useState<SoilType[]>([]);
  const [waterSources, setWaterSources] = useState<WaterSource[]>([]);
  const [irrigationTypes, setIrrigationTypes] = useState<IrrigationType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Fetch all data in parallel
        const [soilTypesRes, waterSourcesRes, irrigationTypesRes] = await Promise.all([
          supabase.from('soil_types').select('*').eq('is_active', true).order('id'),
          supabase.from('water_sources').select('*').eq('is_active', true).order('id'),
          supabase.from('irrigation_types').select('*').eq('is_active', true).order('id')
        ]);

        if (soilTypesRes.error) throw soilTypesRes.error;
        if (waterSourcesRes.error) throw waterSourcesRes.error;
        if (irrigationTypesRes.error) throw irrigationTypesRes.error;

        setSoilTypes(soilTypesRes.data || []);
        setWaterSources(waterSourcesRes.data || []);
        setIrrigationTypes(irrigationTypesRes.data || []);
      } catch (err) {
        console.error('Error fetching land form data:', err);
        setError('Failed to load form data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  return { soilTypes, waterSources, irrigationTypes, loading, error };
}