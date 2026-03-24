import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface MarketPrice {
  id: string;
  crop_name: string;
  variety?: string;
  price_per_unit: number;
  unit: string;
  market_location: string;
  district: string;
  state: string;
  price_date: string;
  min_price?: number;
  max_price?: number;
  modal_price?: number;
  arrival?: number;
  commodity_category?: string;
  distance?: number;
}

export interface FarmerLocation {
  state: string;
  district?: string;
  lat?: number;
  lon?: number;
}

export interface AIAnalysis {
  recommendation: 'SELL_NOW' | 'WAIT' | 'HOLD';
  confidence: number;
  reasoning: string;
  bestMarkets: string[];
  priceOutlook: 'up' | 'down' | 'stable';
  expectedPriceRange?: { min: number; max: number };
  bestTimeToSell?: string;
  tips: string[];
}

export interface HistoricalStats {
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
  trend: 'up' | 'down' | 'stable';
  changePercent: string;
  dataPoints: number;
}

export interface HistoricalComparison {
  week?: { data: MarketPrice[]; stats: HistoricalStats | null };
  month?: { data: MarketPrice[]; stats: HistoricalStats | null };
  year?: { data: MarketPrice[]; stats: HistoricalStats | null };
}

export interface CropGroup {
  name: string;
  count: number;
  icon: string;
  en: string;
  hi: string;
}

export interface TopMarket {
  name: string;
  count: number;
}

export function useMarketPriceIntelligence(farmerId?: string) {
  const [prices, setPrices] = useState<MarketPrice[]>([]);
  const [groupedPrices, setGroupedPrices] = useState<Record<string, MarketPrice[]>>({});
  const [nearbyMarkets, setNearbyMarkets] = useState<MarketPrice[]>([]);
  const [historicalData, setHistoricalData] = useState<HistoricalComparison>({});
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null);
  const [farmerLocation, setFarmerLocation] = useState<FarmerLocation | null>(null);
  const [states, setStates] = useState<string[]>([]);
  const [markets, setMarkets] = useState<string[]>([]);
  const [topMarkets, setTopMarkets] = useState<TopMarket[]>([]);
  const [crops, setCrops] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [cropGroups, setCropGroups] = useState<CropGroup[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const callEdgeFunction = useCallback(async (action: string, params: Record<string, any> = {}) => {
    const { data, error } = await supabase.functions.invoke('market-price-intelligence', {
      body: { action, params }
    });

    if (error) throw new Error(error.message);
    if (!data.success) throw new Error(data.error || 'Unknown error');
    
    return data;
  }, []);

  const fetchFarmerLocation = useCallback(async (id?: string) => {
    const farmId = id || farmerId;
    if (!farmId) return null;
    
    try {
      const data = await callEdgeFunction('getFarmerLocation', { farmerId: farmId });
      setFarmerLocation(data.location);
      return data.location;
    } catch (err) {
      console.error('Error fetching farmer location:', err);
      return null;
    }
  }, [farmerId, callEdgeFunction]);

  const fetchStates = useCallback(async () => {
    try {
      const data = await callEdgeFunction('getStates');
      setStates(data.states || []);
      return data.states;
    } catch (err) {
      console.error('Error fetching states:', err);
      return [];
    }
  }, [callEdgeFunction]);

  const fetchMarkets = useCallback(async () => {
    try {
      const data = await callEdgeFunction('getMarkets');
      setMarkets(data.markets || []);
      return data.markets;
    } catch (err) {
      console.error('Error fetching markets:', err);
      return [];
    }
  }, [callEdgeFunction]);

  const fetchTopMarkets = useCallback(async (limit: number = 6) => {
    try {
      const data = await callEdgeFunction('getTopMarkets', { limit });
      setTopMarkets(data.markets || []);
      return data.markets;
    } catch (err) {
      console.error('Error fetching top markets:', err);
      return [];
    }
  }, [callEdgeFunction]);

  const fetchCropGroups = useCallback(async () => {
    try {
      const data = await callEdgeFunction('getCropGroups');
      setCropGroups(data.groups || []);
      return data.groups;
    } catch (err) {
      console.error('Error fetching crop groups:', err);
      return [];
    }
  }, [callEdgeFunction]);

  const fetchCrops = useCallback(async (group?: string) => {
    try {
      const data = await callEdgeFunction('getCrops', { group });
      setCrops(data.crops || []);
      setCategories(data.categories || []);
      return data.crops;
    } catch (err) {
      console.error('Error fetching crops:', err);
      return [];
    }
  }, [callEdgeFunction]);

  const fetchPrices = useCallback(async (params: {
    crop?: string;
    date?: string;
    district?: string;
    market?: string;
    group?: string;
    limit?: number;
  } = {}) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const data = await callEdgeFunction('fetchPrices', params);
      setPrices(data.data || []);
      setGroupedPrices(data.groupedByDate || {});
      return data;
    } catch (err: any) {
      setError(err.message);
      return { data: [], groupedByDate: {} };
    } finally {
      setIsLoading(false);
    }
  }, [callEdgeFunction]);

  const fetchNearbyMarkets = useCallback(async (params: {
    lat: number;
    lon: number;
    radiusKm?: number;
    crop?: string;
    limit?: number;
  }) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const data = await callEdgeFunction('fetchNearbyMarkets', params);
      setNearbyMarkets(data.data || []);
      return data;
    } catch (err: any) {
      setError(err.message);
      return { data: [] };
    } finally {
      setIsLoading(false);
    }
  }, [callEdgeFunction]);

  const getHistoricalComparison = useCallback(async (params: {
    crop?: string;
    district?: string;
    market?: string;
    periods?: ('week' | 'month' | 'year')[];
  }) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const data = await callEdgeFunction('getHistoricalComparison', params);
      setHistoricalData(data.comparisons || {});
      return data.comparisons;
    } catch (err: any) {
      setError(err.message);
      return {};
    } finally {
      setIsLoading(false);
    }
  }, [callEdgeFunction]);

  const getAIAnalysis = useCallback(async (params: {
    crop?: string;
    district?: string;
    market?: string;
    currentPrice?: number;
    historicalData?: any;
  }) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const data = await callEdgeFunction('getAIAnalysis', params);
      setAiAnalysis(data.analysis || null);
      return data.analysis;
    } catch (err: any) {
      setError(err.message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [callEdgeFunction]);

  return {
    // Data
    prices,
    groupedPrices,
    nearbyMarkets,
    historicalData,
    aiAnalysis,
    farmerLocation,
    states,
    markets,
    topMarkets,
    crops,
    categories,
    cropGroups,
    
    // State
    isLoading,
    error,
    
    // Actions
    fetchFarmerLocation,
    fetchStates,
    fetchMarkets,
    fetchTopMarkets,
    fetchCropGroups,
    fetchCrops,
    fetchPrices,
    fetchNearbyMarkets,
    getHistoricalComparison,
    getAIAnalysis,
  };
}
