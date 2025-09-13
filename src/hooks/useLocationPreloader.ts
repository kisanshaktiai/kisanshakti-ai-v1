import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLocationCache } from './useLocationCache';

// Common state IDs that are frequently used
const COMMON_STATES = [
  '46de3a3f-2d76-4d53-bf57-34085d2d7dda', // Maharashtra
  '5b8fc3e9-788c-4733-a419-924fce0b290f', // Karnataka
  'f40d7b38-6ae3-4430-87c2-49aed7e54d88', // Gujarat
  '4e59b498-a0bb-4e7a-a97f-f7be40481ad0', // Tamil Nadu
];

export function useLocationPreloader() {
  const cache = useLocationCache();

  useEffect(() => {
    const preloadLocationData = async () => {
      // Skip if states are already cached and valid
      if (cache.isCacheValid('states') && cache.states.length > 0) {
        return;
      }

      try {
        // Load states first
        const { data: statesData } = await supabase
          .from('states')
          .select('id, name, code')
          .eq('is_active', true)
          .order('name');

        if (statesData && statesData.length > 0) {
          cache.setStates(statesData);
          
          // Preload districts for common states in the background
          setTimeout(async () => {
            for (const stateId of COMMON_STATES) {
              if (!cache.isCacheValid('districts', stateId)) {
                const { data: districtsData } = await supabase
                  .from('districts')
                  .select('id, name, state_id')
                  .eq('state_id', stateId)
                  .eq('is_active', true)
                  .order('name');

                if (districtsData) {
                  cache.setDistricts(stateId, districtsData);
                }
                
                // Add small delay between requests to avoid overwhelming the server
                await new Promise(resolve => setTimeout(resolve, 100));
              }
            }
          }, 1000);
        }
      } catch (error) {
        console.error('Error preloading location data:', error);
      }
    };

    preloadLocationData();
  }, []);
}

// Export a function to manually trigger preload
export async function preloadAllLocationData() {
  const cache = useLocationCache.getState();
  
  try {
    // Load all states
    const { data: statesData } = await supabase
      .from('states')
      .select('id, name, code')
      .eq('is_active', true)
      .order('name');

    if (statesData) {
      cache.setStates(statesData);
      
      // Load all districts for all states
      const districtPromises = statesData.map(state => 
        supabase
          .from('districts')
          .select('id, name, state_id')
          .eq('state_id', state.id)
          .eq('is_active', true)
          .order('name')
      );

      const districtResults = await Promise.allSettled(districtPromises);
      
      districtResults.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value.data) {
          cache.setDistricts(statesData[index].id, result.value.data);
        }
      });
    }
  } catch (error) {
    console.error('Error in manual preload:', error);
  }
}