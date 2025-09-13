import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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

interface LocationCache {
  states: State[];
  districts: Map<string, District[]>;
  talukas: Map<string, Taluka[]>;
  villages: Map<string, Village[]>;
  lastFetch: {
    states: number;
    districts: Map<string, number>;
    talukas: Map<string, number>;
    villages: Map<string, number>;
  };
  setStates: (states: State[]) => void;
  setDistricts: (stateId: string, districts: District[]) => void;
  setTalukas: (districtId: string, talukas: Taluka[]) => void;
  setVillages: (talukaId: string, villages: Village[]) => void;
  getDistricts: (stateId: string) => District[] | undefined;
  getTalukas: (districtId: string) => Taluka[] | undefined;
  getVillages: (talukaId: string) => Village[] | undefined;
  isCacheValid: (type: 'states' | 'districts' | 'talukas' | 'villages', id?: string) => boolean;
  clearCache: () => void;
}

const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes for better performance

export const useLocationCache = create<LocationCache>()(
  persist(
    (set, get) => ({
      states: [],
      districts: new Map(),
      talukas: new Map(),
      villages: new Map(),
      lastFetch: {
        states: 0,
        districts: new Map(),
        talukas: new Map(),
        villages: new Map(),
      },
      
      setStates: (states) => set({
        states,
        lastFetch: {
          ...get().lastFetch,
          states: Date.now(),
        },
      }),
      
      setDistricts: (stateId, districts) => set((state) => {
        const newDistricts = new Map(state.districts);
        newDistricts.set(stateId, districts);
        const newLastFetch = new Map(state.lastFetch.districts);
        newLastFetch.set(stateId, Date.now());
        return {
          districts: newDistricts,
          lastFetch: {
            ...state.lastFetch,
            districts: newLastFetch,
          },
        };
      }),
      
      setTalukas: (districtId, talukas) => set((state) => {
        const newTalukas = new Map(state.talukas);
        newTalukas.set(districtId, talukas);
        const newLastFetch = new Map(state.lastFetch.talukas);
        newLastFetch.set(districtId, Date.now());
        return {
          talukas: newTalukas,
          lastFetch: {
            ...state.lastFetch,
            talukas: newLastFetch,
          },
        };
      }),
      
      setVillages: (talukaId, villages) => set((state) => {
        const newVillages = new Map(state.villages);
        newVillages.set(talukaId, villages);
        const newLastFetch = new Map(state.lastFetch.villages);
        newLastFetch.set(talukaId, Date.now());
        return {
          villages: newVillages,
          lastFetch: {
            ...state.lastFetch,
            villages: newLastFetch,
          },
        };
      }),
      
      getDistricts: (stateId) => get().districts.get(stateId),
      getTalukas: (districtId) => get().talukas.get(districtId),
      getVillages: (talukaId) => get().villages.get(talukaId),
      
      isCacheValid: (type, id) => {
        const now = Date.now();
        const { lastFetch } = get();
        
        if (type === 'states') {
          return now - lastFetch.states < CACHE_DURATION;
        }
        
        if (!id) return false;
        
        const fetchTime = lastFetch[type].get(id);
        return fetchTime ? now - fetchTime < CACHE_DURATION : false;
      },
      
      clearCache: () => set({
        states: [],
        districts: new Map(),
        talukas: new Map(),
        villages: new Map(),
        lastFetch: {
          states: 0,
          districts: new Map(),
          talukas: new Map(),
          villages: new Map(),
        },
      }),
    }),
    {
      name: 'location-cache',
      storage: {
        getItem: (name) => {
          try {
            const str = localStorage.getItem(name);
            if (!str) return null;
            const parsed = JSON.parse(str);
            
            // Convert arrays back to Maps
            return {
              state: {
                ...parsed.state,
                districts: new Map(parsed.state.districts || []),
                talukas: new Map(parsed.state.talukas || []),
                villages: new Map(parsed.state.villages || []),
                lastFetch: {
                  states: parsed.state.lastFetch?.states || 0,
                  districts: new Map(parsed.state.lastFetch?.districts || []),
                  talukas: new Map(parsed.state.lastFetch?.talukas || []),
                  villages: new Map(parsed.state.lastFetch?.villages || []),
                },
              },
            };
          } catch (error) {
            console.error('Error loading location cache:', error);
            return null;
          }
        },
        setItem: (name, value) => {
          try {
            const { state } = value as { state: LocationCache };
            const serialized = {
              state: {
                ...state,
                districts: Array.from(state.districts.entries()),
                talukas: Array.from(state.talukas.entries()),
                villages: Array.from(state.villages.entries()),
                lastFetch: {
                  states: state.lastFetch.states,
                  districts: Array.from(state.lastFetch.districts.entries()),
                  talukas: Array.from(state.lastFetch.talukas.entries()),
                  villages: Array.from(state.lastFetch.villages.entries()),
                },
              },
            };
            localStorage.setItem(name, JSON.stringify(serialized));
          } catch (error) {
            console.error('Error saving location cache:', error);
          }
        },
        removeItem: (name) => localStorage.removeItem(name),
      },
    }
  )
);