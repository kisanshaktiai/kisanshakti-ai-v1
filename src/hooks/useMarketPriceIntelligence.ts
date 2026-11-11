import { useState, useCallback, useRef, useEffect } from 'react';
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
  distanceKind?: 'road' | 'approx';
  travelMinutes?: number;
  tier?: 'near' | 'regional' | 'major' | 'other';
  is_major_market?: boolean;
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

export type MarketScope = 'produce' | 'livestock';

export function useMarketPriceIntelligence(farmerId?: string, scope: MarketScope = 'produce') {
  const requestEpoch = useRef(0);
  const activeScope = useRef(scope);
  if (activeScope.current !== scope) { activeScope.current = scope; requestEpoch.current++; }
  const [totalRecords, setTotalRecords] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [prices, setPrices] = useState<MarketPrice[]>([]);
  const [groupedPrices, setGroupedPrices] = useState<Record<string, MarketPrice[]>>({});
  const [nearbyMarkets, setNearbyMarkets] = useState<MarketPrice[]>([]);
  const [historicalData, setHistoricalData] = useState<HistoricalComparison>({});
  // Crop the stored history belongs to; consumers must not render it for another crop.
  const [historicalCrop, setHistoricalCrop] = useState<string | null>(null);
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

  useEffect(() => {
    setPrices([]); setCrops([]); setCropGroups([]); setTotalRecords(0); setHasMore(false);
    setHistoricalData({}); setHistoricalCrop(null); setAiAnalysis(null); setError(null);
  }, [scope]);

  const callEdgeFunction = useCallback(async (action: string, params: Record<string, unknown> = {}) => {
    const { data, error } = await supabase.functions.invoke('market-price-intelligence', {
      body: { action, params: { ...params, scope } }
    });

    if (error) throw new Error(error.message);
    if (!data.success) throw new Error(data.error || 'Unknown error');
    
    return data;
  }, [scope]);

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
      const capturedScope = scope;
      const data = await callEdgeFunction('getCropGroups');
      if (capturedScope !== activeScope.current) return [];
      setCropGroups(data.groups || []);
      return data.groups;
    } catch (err) {
      console.error('Error fetching crop groups:', err);
      return [];
    }
  }, [callEdgeFunction, scope]);

  const fetchCrops = useCallback(async (group?: string) => {
    try {
      const capturedScope = scope;
      const data = await callEdgeFunction('getCrops', { group });
      if (capturedScope !== activeScope.current) return [];
      setCrops(data.crops || []);
      setCategories(data.categories || []);
      return data.crops;
    } catch (err) {
      console.error('Error fetching crops:', err);
      return [];
    }
  }, [callEdgeFunction, scope]);

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
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Request failed');
      return { data: [], groupedByDate: {} };
    } finally {
      setIsLoading(false);
    }
  }, [callEdgeFunction]);

  /** Latest price per market+crop, nearest markets first (server-ranked by the land location). */
  const fetchRankedPrices = useCallback(async (params: {
    lat?: number; lon?: number; district?: string; crop?: string; group?: string;
    corridor?: 'near' | 'regional' | 'major' | 'all'; limit?: number; offset?: number;
  } = {}) => {
    const epoch = ++requestEpoch.current;
    setIsLoading(true);
    setError(null);
    if (!params.offset) { setPrices([]); setHasMore(false); }
    try {
      const data = await callEdgeFunction('fetchRankedPrices', params);
      if (epoch !== requestEpoch.current) return { data: [], latestDate: null, tiers: {} };
      setPrices(previous => params.offset ? [...previous, ...(data.data || [])] : (data.data || []));
      setTotalRecords(data.totalRecords || 0);
      setHasMore(!!data.hasMore);
      return data as { data: MarketPrice[]; latestDate: string | null; tiers: Record<string, number> };
    } catch (err: unknown) {
      if (epoch === requestEpoch.current) setError(err instanceof Error ? err.message : 'Request failed');
      return { data: [], latestDate: null, tiers: {} };
    } finally {
      if (epoch === requestEpoch.current) setIsLoading(false);
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
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Request failed');
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
    // Drop stale history the moment a different crop's load starts, so no
    // chart can render one crop's trend under another crop's name.
    if ((params.crop || null) !== historicalCrop) setHistoricalData({});
    const capturedScope = scope;
    try {
      const data = await callEdgeFunction('getHistoricalComparison', params);
      if (capturedScope !== activeScope.current) return {};
      setHistoricalData(data.comparisons || {});
      setHistoricalCrop(params.crop || null);
      return data.comparisons;
    } catch (err: unknown) {
      if (capturedScope === activeScope.current) setError(err instanceof Error ? err.message : 'Request failed');
      return {};
    } finally {
      setIsLoading(false);
    }
  }, [callEdgeFunction, historicalCrop, scope]);

  const getAIAnalysis = useCallback(async (params: {
    crop?: string;
    district?: string;
    market?: string;
    currentPrice?: number;
    historicalData?: unknown;
  }) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const data = await callEdgeFunction('getAIAnalysis', params);
      setAiAnalysis(data.analysis || null);
      return data.analysis;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Request failed');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [callEdgeFunction]);

  return {
    // Data
    prices,
    totalRecords,
    hasMore,
    groupedPrices,
    nearbyMarkets,
    historicalData,
    historicalCrop,
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
    fetchRankedPrices,
    fetchNearbyMarkets,
    getHistoricalComparison,
    getAIAnalysis,
  };
}
