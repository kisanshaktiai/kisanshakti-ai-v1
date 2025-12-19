import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { useAuthStore } from '@/stores/authStore';
import { useMarketPriceIntelligence } from '@/hooks/useMarketPriceIntelligence';
import { MarketStateSelector } from './MarketStateSelector';
import { MarketPriceCard } from './MarketPriceCard';
import { NearbyMarketsSection } from './NearbyMarketsSection';
import { PriceComparisonChart } from './PriceComparisonChart';
import { AISellingAdvisor } from './AISellingAdvisor';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Search, 
  MapPin, 
  TrendingUp, 
  Brain, 
  CalendarIcon,
  RefreshCw,
  Loader2,
  Wheat,
  BarChart3
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

export function MarketPriceIntelligence() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState('prices');
  const [selectedState, setSelectedState] = useState<string>('');
  const [selectedCrop, setSelectedCrop] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  
  const {
    prices,
    groupedPrices,
    nearbyMarkets,
    historicalData,
    aiAnalysis,
    farmerLocation,
    states,
    crops,
    isLoading,
    fetchFarmerLocation,
    fetchStates,
    fetchCrops,
    fetchPrices,
    fetchNearbyMarkets,
    getHistoricalComparison,
    getAIAnalysis,
  } = useMarketPriceIntelligence(user?.id);

  // Initialize data on mount
  useEffect(() => {
    const init = async () => {
      await fetchStates();
      const location = await fetchFarmerLocation();
      
      // Auto-select farmer's state
      if (location?.state) {
        setSelectedState(location.state);
        await fetchCrops(location.state);
        await fetchPrices({ state: location.state, limit: 100 });
        
        // Fetch nearby markets if coordinates available
        if (location.lat && location.lon) {
          await fetchNearbyMarkets({ 
            lat: location.lat, 
            lon: location.lon, 
            radiusKm: 50 
          });
        }
      } else {
        // Default to Maharashtra
        setSelectedState('Maharashtra');
        await fetchCrops('Maharashtra');
        await fetchPrices({ state: 'Maharashtra', limit: 100 });
      }
    };
    
    init();
  }, [user?.id]);

  const handleStateChange = async (state: string) => {
    setSelectedState(state);
    setSelectedCrop('');
    await fetchCrops(state);
    await fetchPrices({ 
      state, 
      crop: selectedCrop || undefined,
      date: selectedDate ? format(selectedDate, 'yyyy-MM-dd') : undefined 
    });
  };

  const handleCropChange = async (crop: string) => {
    setSelectedCrop(crop);
    await fetchPrices({ 
      state: selectedState, 
      crop: crop || undefined,
      date: selectedDate ? format(selectedDate, 'yyyy-MM-dd') : undefined 
    });
    
    // Update historical data and AI analysis for selected crop
    if (crop) {
      await getHistoricalComparison({ crop, state: selectedState });
    }
  };

  const handleDateChange = async (date: Date | undefined) => {
    setSelectedDate(date);
    await fetchPrices({ 
      state: selectedState, 
      crop: selectedCrop || undefined,
      date: date ? format(date, 'yyyy-MM-dd') : undefined 
    });
  };

  const handleRefresh = async () => {
    await fetchPrices({ 
      state: selectedState, 
      crop: selectedCrop || undefined,
      date: selectedDate ? format(selectedDate, 'yyyy-MM-dd') : undefined 
    });
  };

  const handleGetAIAdvice = async () => {
    if (!selectedCrop) return;
    
    const avgPrice = prices.length > 0 
      ? prices.reduce((sum, p) => sum + (p.modal_price || p.price_per_unit || 0), 0) / prices.length 
      : undefined;
      
    await getAIAnalysis({
      crop: selectedCrop,
      state: selectedState,
      currentPrice: avgPrice,
      historicalData
    });
  };

  const filteredPrices = searchQuery 
    ? prices.filter(p => 
        p.crop_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.market_location?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.district?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : prices;

  const dateKeys = Object.keys(groupedPrices).sort().reverse();

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30">
      {/* Hero Header */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-primary/10 via-primary/5 to-accent/10 p-6 mb-6 border border-primary/20"
      >
        <div className="absolute inset-0 bg-grid-pattern opacity-5" />
        <div className="relative z-10">
          <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent mb-2">
            {t('market.intelligence.title', 'Market Price Intelligence')}
          </h1>
          <p className="text-muted-foreground text-sm md:text-base">
            {t('market.intelligence.subtitle', 'AI-powered insights to help you sell at the best price')}
          </p>
          
          {farmerLocation && (
            <div className="flex items-center gap-2 mt-3 text-sm text-muted-foreground">
              <MapPin className="w-4 h-4 text-primary" />
              <span>{farmerLocation.district}, {farmerLocation.state}</span>
            </div>
          )}
        </div>
      </motion.div>

      {/* Filters Section */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6"
      >
        <MarketStateSelector
          states={states}
          selectedState={selectedState}
          farmerState={farmerLocation?.state}
          onStateChange={handleStateChange}
        />

        <Select value={selectedCrop} onValueChange={handleCropChange}>
          <SelectTrigger className="h-12 rounded-2xl bg-card/50 backdrop-blur border-border/50">
            <Wheat className="w-4 h-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder={t('market.intelligence.selectCrop', 'Select Crop')} />
          </SelectTrigger>
          <SelectContent className="max-h-60">
            <SelectItem value="all">{t('market.intelligence.allCrops', 'All Crops')}</SelectItem>
            {crops.map((crop) => (
              <SelectItem key={crop} value={crop}>{crop}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "h-12 rounded-2xl bg-card/50 backdrop-blur border-border/50 justify-start text-left font-normal",
                !selectedDate && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {selectedDate ? format(selectedDate, 'PPP') : t('market.intelligence.selectDate', 'Select Date')}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={handleDateChange}
              initialFocus
            />
          </PopoverContent>
        </Popover>

        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t('market.intelligence.search', 'Search crop or market...')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-12 pl-10 rounded-2xl bg-card/50 backdrop-blur border-border/50"
          />
        </div>
      </motion.div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3 mb-6">
        <Button 
          onClick={handleRefresh} 
          variant="outline" 
          className="rounded-xl"
          disabled={isLoading}
        >
          {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          {t('market.intelligence.refresh', 'Refresh')}
        </Button>
        
        <Button 
          onClick={handleGetAIAdvice}
          className="rounded-xl bg-gradient-to-r from-primary to-accent hover:opacity-90"
          disabled={isLoading || !selectedCrop}
        >
          <Brain className="w-4 h-4 mr-2" />
          {t('market.intelligence.getAIAdvice', 'Get AI Advice')}
        </Button>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4 h-14 rounded-2xl bg-card/50 backdrop-blur p-1.5 mb-6">
          <TabsTrigger 
            value="prices" 
            className="rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            <TrendingUp className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">{t('market.intelligence.tabs.prices', 'Prices')}</span>
          </TabsTrigger>
          <TabsTrigger 
            value="nearby"
            className="rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            <MapPin className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">{t('market.intelligence.tabs.nearby', 'Nearby')}</span>
          </TabsTrigger>
          <TabsTrigger 
            value="comparison"
            className="rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            <BarChart3 className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">{t('market.intelligence.tabs.compare', 'Compare')}</span>
          </TabsTrigger>
          <TabsTrigger 
            value="ai"
            className="rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            <Brain className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">{t('market.intelligence.tabs.ai', 'AI Advisor')}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="prices" className="mt-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : filteredPrices.length === 0 ? (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-12 bg-card/30 rounded-3xl border border-border/50"
            >
              <Wheat className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">
                {t('market.intelligence.noPrices', 'No price data available for selected filters')}
              </p>
            </motion.div>
          ) : (
            <div className="space-y-6">
              {dateKeys.map((date) => (
                <motion.div 
                  key={date}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                    <CalendarIcon className="w-5 h-5 text-primary" />
                    {date}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {(groupedPrices[date] || [])
                      .filter(p => !searchQuery || 
                        p.crop_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        p.market_location?.toLowerCase().includes(searchQuery.toLowerCase())
                      )
                      .slice(0, 12)
                      .map((price, index) => (
                        <MarketPriceCard key={price.id || index} price={price} />
                      ))}
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="nearby" className="mt-0">
          <NearbyMarketsSection
            markets={nearbyMarkets}
            isLoading={isLoading}
            farmerLocation={farmerLocation}
            onRefresh={() => {
              if (farmerLocation?.lat && farmerLocation?.lon) {
                fetchNearbyMarkets({ 
                  lat: farmerLocation.lat, 
                  lon: farmerLocation.lon, 
                  radiusKm: 50,
                  crop: selectedCrop || undefined
                });
              }
            }}
          />
        </TabsContent>

        <TabsContent value="comparison" className="mt-0">
          <PriceComparisonChart
            historicalData={historicalData}
            selectedCrop={selectedCrop}
            selectedState={selectedState}
            isLoading={isLoading}
            onFetchComparison={() => getHistoricalComparison({ 
              crop: selectedCrop, 
              state: selectedState 
            })}
          />
        </TabsContent>

        <TabsContent value="ai" className="mt-0">
          <AISellingAdvisor
            analysis={aiAnalysis}
            selectedCrop={selectedCrop}
            isLoading={isLoading}
            onGetAdvice={handleGetAIAdvice}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
