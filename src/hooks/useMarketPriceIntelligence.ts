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

export function useMarketPriceIntelligence(farmerId?: string) {
  const [prices, setPrices] = useState<MarketPrice[]>([]);
  const [groupedPrices, setGroupedPrices] = useState<Record<string, MarketPrice[]>>({});
  const [nearbyMarkets, setNearbyMarkets] = useState<MarketPrice[]>([]);
  const [historicalData, setHistoricalData] = useState<HistoricalComparison>({});
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null);
  const [farmerLocation, setFarmerLocation] = useState<FarmerLocation | null>(null);
  const [states, setStates] = useState<string[]>([]);
  const [crops, setCrops] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
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

  const fetchFarmerLocation = useCallback(async () => {
    if (!farmerId) return null;
    
    try {
      const data = await callEdgeFunction('getFarmerLocation', { farmerId });
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

  const fetchCrops = useCallback(async (state?: string) => {
    try {
      const data = await callEdgeFunction('getCrops', { state });
      setCrops(data.crops || []);
      setCategories(data.categories || []);
      return data.crops;
    } catch (err) {
      console.error('Error fetching crops:', err);
      return [];
    }
  }, [callEdgeFunction]);

  const fetchPrices = useCallback(async (params: {
    state?: string;
    crop?: string;
    date?: string;
    district?: string;
    limit?: number;
  }) => {
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
    state?: string;
    district?: string;
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
    state?: string;
    district?: string;
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
    crops,
    categories,
    
    // State
    isLoading,
    error,
    
    // Actions
    fetchFarmerLocation,
    fetchStates,
    fetchCrops,
    fetchPrices,
    fetchNearbyMarkets,
    getHistoricalComparison,
    getAIAnalysis,
  };
}
