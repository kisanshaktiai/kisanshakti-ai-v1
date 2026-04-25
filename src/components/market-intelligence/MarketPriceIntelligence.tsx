import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '@/stores/authStore';
import { useMarketPriceIntelligence } from '@/hooks/useMarketPriceIntelligence';
import { MarketPriceCard } from './MarketPriceCard';
import { NearbyMarketsSection } from './NearbyMarketsSection';
import { PriceComparisonChart } from './PriceComparisonChart';
import { AISellingAdvisor } from './AISellingAdvisor';
import { CropGroupButtons } from './CropGroupButtons';
import { MarketLocationButtons } from './MarketLocationButtons';
import { CropChips } from './CropChips';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { 
  Search, 
  MapPin, 
  TrendingUp, 
  Brain, 
  CalendarIcon,
  RefreshCw,
  Loader2,
  Wheat,
  BarChart3,
  Store,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

export function MarketPriceIntelligence() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState('prices');
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [selectedMarket, setSelectedMarket] = useState<string>('all');
  const [selectedCrop, setSelectedCrop] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [showFilters, setShowFilters] = useState(true);
  
  const {
    prices,
    groupedPrices,
    nearbyMarkets,
    historicalData,
    aiAnalysis,
    farmerLocation,
    topMarkets,
    crops,
    cropGroups,
    isLoading,
    fetchFarmerLocation,
    fetchTopMarkets,
    fetchCropGroups,
    fetchCrops,
    fetchPrices,
    fetchNearbyMarkets,
    getHistoricalComparison,
    getAIAnalysis,
  } = useMarketPriceIntelligence(user?.id);

  // Initialize data on mount
  useEffect(() => {
    const init = async () => {
      console.log('[MarketPriceIntelligence] Initializing...');
      
      await Promise.all([
        fetchCropGroups(),
        fetchTopMarkets(20), // Fetch more markets to show all
        fetchCrops(),
      ]);
      
      const location = await fetchFarmerLocation();
      
      console.log('[MarketPriceIntelligence] Fetching initial prices...');
      await fetchPrices({ limit: 100 });
      
      if (location?.lat && location?.lon) {
        console.log('[MarketPriceIntelligence] Fetching nearby markets for location:', location);
        await fetchNearbyMarkets({ 
          lat: location.lat, 
          lon: location.lon, 
          radiusKm: 50 
        });
      }
    };
    
    init();
  }, [user?.id]);

  const handleGroupChange = async (group: string) => {
    setSelectedGroup(group === 'all' ? null : group);
    setSelectedCrop('');
    
    await fetchCrops(group === 'all' ? undefined : group);
    
    await fetchPrices({ 
      market: selectedMarket === 'all' ? undefined : selectedMarket,
      date: selectedDate ? format(selectedDate, 'yyyy-MM-dd') : undefined,
      limit: 100
    });
  };

  const handleMarketChange = async (market: string) => {
    setSelectedMarket(market);
    await fetchPrices({ 
      market: market === 'all' ? undefined : market,
      crop: selectedCrop || undefined,
      date: selectedDate ? format(selectedDate, 'yyyy-MM-dd') : undefined 
    });
  };

  const handleCropChange = async (crop: string) => {
    setSelectedCrop(crop);
    await fetchPrices({ 
      market: selectedMarket === 'all' ? undefined : selectedMarket,
      crop: crop || undefined,
      date: selectedDate ? format(selectedDate, 'yyyy-MM-dd') : undefined 
    });
    
    if (crop) {
      await getHistoricalComparison({ crop });
    }
  };

  const handleDateChange = async (date: Date | undefined) => {
    setSelectedDate(date);
    await fetchPrices({ 
      market: selectedMarket === 'all' ? undefined : selectedMarket,
      crop: selectedCrop || undefined,
      date: date ? format(date, 'yyyy-MM-dd') : undefined 
    });
  };

  const handleRefresh = async () => {
    await fetchPrices({ 
      market: selectedMarket === 'all' ? undefined : selectedMarket,
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
      market: selectedMarket === 'all' ? undefined : selectedMarket,
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
    <div className="min-h-full pb-20">
      {/* Hero Header - Compact & Informative */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          "relative overflow-hidden rounded-2xl p-4 mb-3",
          "bg-gradient-to-r from-primary/10 via-primary/5 to-accent/10",
          "border border-primary/20"
        )}
      >
        <div className="absolute inset-0 bg-grid-pattern opacity-5" />
        <div className="relative z-10 flex items-center justify-between">
          <div>
            <h1 className="text-lg md:text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              {t('market.intelligence.title')}
            </h1>
            <p className="text-xs text-muted-foreground">
              {t('market.intelligence.subtitle')}
            </p>
          </div>
          
          <div className="flex items-center gap-2 text-xs">
            <div className="flex items-center gap-1 bg-primary/10 px-2 py-1 rounded-full">
              <Store className="w-3 h-3 text-primary" />
              <span className="font-medium hidden sm:inline">MSAMB</span>
            </div>
            <div className="flex items-center gap-1 bg-success/10 px-2 py-1 rounded-full">
              <TrendingUp className="w-3 h-3 text-success" />
              <span className="font-medium">{prices.length}</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Collapsible Filters Section */}
      <div className="mb-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowFilters(!showFilters)}
          className="w-full justify-between h-10 rounded-xl bg-card/50 border border-border/50 mb-2"
        >
          <span className="flex items-center gap-2 text-sm">
            <Wheat className="w-4 h-4 text-primary" />
            {selectedGroup || selectedCrop || selectedMarket !== 'all' ? (
              <span className="text-foreground">
                {selectedGroup && <span className="text-primary">{selectedGroup}</span>}
                {selectedCrop && <span className="ml-1">• {selectedCrop}</span>}
                {selectedMarket !== 'all' && <span className="ml-1">• {selectedMarket}</span>}
              </span>
            ) : (
              <span className="text-muted-foreground">{t('market.intelligence.selectFilters')}</span>
            )}
          </span>
          {showFilters ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </Button>

        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden space-y-3"
            >
              {/* Crop Group Buttons */}
              <CropGroupButtons
                groups={cropGroups}
                selectedGroup={selectedGroup}
                onSelectGroup={handleGroupChange}
                isLoading={isLoading}
              />

              {/* Market Location Buttons */}
              <MarketLocationButtons
                markets={topMarkets}
                selectedMarket={selectedMarket}
                onSelectMarket={handleMarketChange}
                isLoading={isLoading}
              />

              {/* Crop Chips */}
              {(selectedGroup || crops.length > 0) && (
                <div className="p-3 bg-card/50 rounded-xl border border-border/50">
                  <CropChips
                    crops={crops}
                    selectedCrop={selectedCrop}
                    onSelectCrop={handleCropChange}
                    isLoading={isLoading}
                    maxDisplay={15}
                  />
                </div>
              )}

              {/* Date & Search Row */}
              <div className="grid grid-cols-2 gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "h-10 rounded-xl bg-card/50 border-border/50 justify-start text-left font-normal text-sm",
                        !selectedDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {selectedDate ? format(selectedDate, 'dd/MM') : t('market.intelligence.date')}
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
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder={t('market.intelligence.search')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-10 pl-9 rounded-xl bg-card/50 border-border/50 text-sm"
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2 mb-3">
        <Button 
          onClick={handleRefresh} 
          variant="outline" 
          size="sm"
          className="rounded-xl flex-1 h-10"
          disabled={isLoading}
        >
          {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          {t('market.intelligence.refresh')}
        </Button>
        
        <Button 
          onClick={handleGetAIAdvice}
          size="sm"
          className="rounded-xl bg-gradient-to-r from-primary to-accent hover:opacity-90 flex-1 h-10"
          disabled={isLoading || !selectedCrop}
        >
          <Brain className="w-4 h-4 mr-2" />
          {t('market.intelligence.aiAdvice')}
        </Button>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className={cn(
          "grid w-full grid-cols-4 h-11 rounded-xl p-1 mb-3",
          "bg-card/80 backdrop-blur-xl border border-border/50"
        )}>
          <TabsTrigger 
            value="prices" 
            className="rounded-lg text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            <TrendingUp className="w-3.5 h-3.5 mr-1" />
            {t('market.intelligence.prices')}
          </TabsTrigger>
          <TabsTrigger 
            value="nearby"
            className="rounded-lg text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            <MapPin className="w-3.5 h-3.5 mr-1" />
            {t('market.intelligence.nearby')}
          </TabsTrigger>
          <TabsTrigger 
            value="comparison"
            className="rounded-lg text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            <BarChart3 className="w-3.5 h-3.5 mr-1" />
            {t('market.intelligence.comparison')}
          </TabsTrigger>
          <TabsTrigger 
            value="ai"
            className="rounded-lg text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            <Brain className="w-3.5 h-3.5 mr-1" />
            {t('market.intelligence.ai')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="prices" className="mt-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : filteredPrices.length === 0 ? (
            <EmptyPricesState />
          ) : (
            <div className="space-y-4">
              {dateKeys.map((date) => (
                <motion.div 
                  key={date}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-2 text-muted-foreground">
                    <CalendarIcon className="w-4 h-4 text-primary" />
                    {date}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {(groupedPrices[date] || [])
                      .filter(p => !searchQuery || 
                        p.crop_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        p.market_location?.toLowerCase().includes(searchQuery.toLowerCase())
                      )
                      .slice(0, 15)
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
            isLoading={isLoading}
            onFetchComparison={() => getHistoricalComparison({ 
              crop: selectedCrop || undefined,
              market: selectedMarket === 'all' ? undefined : selectedMarket
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

function EmptyPricesState() {
  const { t } = useTranslation();
  
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={cn(
        "text-center py-12 rounded-2xl",
        "bg-gradient-to-br from-card/50 to-muted/30",
        "border border-border/50"
      )}
    >
      <Wheat className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
      <p className="text-muted-foreground text-sm font-medium">
        {t('market.intelligence.noPrices')}
      </p>
    </motion.div>
  );
}
