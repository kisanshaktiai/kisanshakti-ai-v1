import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
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
  Store
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
      
      // Fetch all data in parallel
      await Promise.all([
        fetchCropGroups(),
        fetchTopMarkets(6),
        fetchCrops(),
      ]);
      
      // Fetch farmer location for nearby markets
      const location = await fetchFarmerLocation();
      
      // Fetch initial prices
      console.log('[MarketPriceIntelligence] Fetching initial prices...');
      await fetchPrices({ limit: 100 });
      
      // Fetch nearby markets if coordinates available
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
    setSelectedCrop(''); // Reset crop when group changes
    
    // Fetch crops for selected group
    await fetchCrops(group === 'all' ? undefined : group);
    
    // Fetch prices for the group
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
    
    // Update historical data for selected crop
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
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30 pb-20">
      {/* Hero Header */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-primary/10 via-primary/5 to-accent/10 p-4 md:p-6 mb-4 border border-primary/20"
      >
        <div className="absolute inset-0 bg-grid-pattern opacity-5" />
        <div className="relative z-10">
          <h1 className="text-xl md:text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent mb-1">
            बाजारभाव माहिती
          </h1>
          <p className="text-sm text-muted-foreground">
            Market Price Intelligence • AI-powered selling advice
          </p>
          
          <div className="flex flex-wrap items-center gap-2 md:gap-4 mt-3 text-xs md:text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5 bg-primary/10 px-2 py-1 rounded-full">
              <Store className="w-3.5 h-3.5 text-primary" />
              <span className="font-medium">महाराष्ट्र (MSAMB)</span>
            </div>
            {farmerLocation?.district && (
              <div className="flex items-center gap-1.5 bg-accent/10 px-2 py-1 rounded-full">
                <MapPin className="w-3.5 h-3.5 text-accent" />
                <span>{farmerLocation.district}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 bg-muted px-2 py-1 rounded-full">
              <TrendingUp className="w-3.5 h-3.5" />
              <span className="font-medium">{prices.length} किंमती</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Crop Group Buttons - Mobile First */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mb-4"
      >
        <CropGroupButtons
          groups={cropGroups}
          selectedGroup={selectedGroup}
          onSelectGroup={handleGroupChange}
          isLoading={isLoading}
        />
      </motion.div>

      {/* Market Location Buttons */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="mb-4"
      >
        <MarketLocationButtons
          markets={topMarkets}
          selectedMarket={selectedMarket}
          onSelectMarket={handleMarketChange}
          isLoading={isLoading}
        />
      </motion.div>

      {/* Crop Chips - Show crops from selected group */}
      {(selectedGroup || crops.length > 0) && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-4 p-4 bg-card/50 rounded-2xl border border-border/50"
        >
          <CropChips
            crops={crops}
            selectedCrop={selectedCrop}
            onSelectCrop={handleCropChange}
            isLoading={isLoading}
            maxDisplay={12}
          />
        </motion.div>
      )}

      {/* Date & Search Row */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="grid grid-cols-2 gap-2 mb-4"
      >
        {/* Date Picker */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "h-11 rounded-xl bg-card/50 backdrop-blur border-border/50 justify-start text-left font-normal text-sm",
                !selectedDate && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {selectedDate ? format(selectedDate, 'dd/MM') : 'तारीख'}
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

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="शोधा..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-11 pl-9 rounded-xl bg-card/50 backdrop-blur border-border/50 text-sm"
          />
        </div>
      </motion.div>

      {/* Action Buttons */}
      <div className="flex gap-2 mb-4">
        <Button 
          onClick={handleRefresh} 
          variant="outline" 
          size="sm"
          className="rounded-xl flex-1"
          disabled={isLoading}
        >
          {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          रिफ्रेश
        </Button>
        
        <Button 
          onClick={handleGetAIAdvice}
          size="sm"
          className="rounded-xl bg-gradient-to-r from-primary to-accent hover:opacity-90 flex-1"
          disabled={isLoading || !selectedCrop}
        >
          <Brain className="w-4 h-4 mr-2" />
          AI सल्ला
        </Button>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4 h-12 rounded-2xl bg-card/50 backdrop-blur p-1 mb-4">
          <TabsTrigger 
            value="prices" 
            className="rounded-xl text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            <TrendingUp className="w-4 h-4 mr-1" />
            भाव
          </TabsTrigger>
          <TabsTrigger 
            value="nearby"
            className="rounded-xl text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            <MapPin className="w-4 h-4 mr-1" />
            जवळ
          </TabsTrigger>
          <TabsTrigger 
            value="comparison"
            className="rounded-xl text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            <BarChart3 className="w-4 h-4 mr-1" />
            तुलना
          </TabsTrigger>
          <TabsTrigger 
            value="ai"
            className="rounded-xl text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            <Brain className="w-4 h-4 mr-1" />
            AI
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
              <p className="text-muted-foreground text-sm">
                निवडलेल्या फिल्टरसाठी किंमत डेटा उपलब्ध नाही
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                No price data for selected filters
              </p>
            </motion.div>
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
