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
  ChevronDown,
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

type Section = 'today' | 'nearby' | 'trend' | 'ai';

export function MarketPriceIntelligence() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [selectedMarket, setSelectedMarket] = useState<string>('all');
  const [selectedCrop, setSelectedCrop] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [openSections, setOpenSections] = useState<Record<Section, boolean>>({
    today: true,
    nearby: true,
    trend: false,
    ai: false,
  });

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

  useEffect(() => {
    const init = async () => {
      await Promise.all([fetchCropGroups(), fetchTopMarkets(20), fetchCrops()]);
      const location = await fetchFarmerLocation();
      await fetchPrices({ limit: 100 });
      if (location?.lat && location?.lon) {
        await fetchNearbyMarkets({ lat: location.lat, lon: location.lon, radiusKm: 50 });
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
      limit: 100,
    });
  };

  const handleMarketChange = async (market: string) => {
    setSelectedMarket(market);
    await fetchPrices({
      market: market === 'all' ? undefined : market,
      crop: selectedCrop || undefined,
    });
  };

  const handleCropChange = async (crop: string) => {
    setSelectedCrop(crop);
    await fetchPrices({
      market: selectedMarket === 'all' ? undefined : selectedMarket,
      crop: crop || undefined,
    });
    if (crop) {
      await getHistoricalComparison({ crop });
      setOpenSections((s) => ({ ...s, trend: true, ai: true }));
    }
  };

  const handleRefresh = async () => {
    await fetchPrices({
      market: selectedMarket === 'all' ? undefined : selectedMarket,
      crop: selectedCrop || undefined,
    });
  };

  const handleGetAIAdvice = async () => {
    if (!selectedCrop) return;
    const avgPrice = prices.length > 0
      ? prices.reduce((s, p) => s + (p.modal_price || p.price_per_unit || 0), 0) / prices.length
      : undefined;
    await getAIAnalysis({
      crop: selectedCrop,
      market: selectedMarket === 'all' ? undefined : selectedMarket,
      currentPrice: avgPrice,
      historicalData,
    });
  };

  const filteredGroupedPrices = searchQuery
    ? Object.fromEntries(
        Object.entries(groupedPrices).map(([d, list]) => [
          d,
          list.filter(
            (p) =>
              p.crop_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
              p.market_location?.toLowerCase().includes(searchQuery.toLowerCase()) ||
              p.district?.toLowerCase().includes(searchQuery.toLowerCase()),
          ),
        ]),
      )
    : groupedPrices;

  const dateKeys = Object.keys(filteredGroupedPrices)
    .filter((d) => (filteredGroupedPrices[d] || []).length > 0)
    .sort()
    .reverse();

  const toggle = (s: Section) =>
    setOpenSections((prev) => ({ ...prev, [s]: !prev[s] }));

  return (
    <div className="space-y-4 pb-6">
      {/* Quick stats strip */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid grid-cols-3 gap-2"
      >
        <StatPill
          icon={<TrendingUp className="w-4 h-4 text-success" />}
          value={prices.length}
          label="भाव"
        />
        <StatPill
          icon={<MapPin className="w-4 h-4 text-primary" />}
          value={nearbyMarkets.length}
          label="जवळचे"
        />
        <StatPill
          icon={<Wheat className="w-4 h-4 text-accent" />}
          value={crops.length}
          label="पिके"
        />
      </motion.div>

      {/* Filter rails */}
      <CropGroupButtons
        groups={cropGroups}
        selectedGroup={selectedGroup}
        onSelectGroup={handleGroupChange}
        isLoading={isLoading}
      />

      <MarketLocationButtons
        markets={topMarkets}
        selectedMarket={selectedMarket}
        onSelectMarket={handleMarketChange}
        isLoading={isLoading}
      />

      {crops.length > 0 && (
        <CropChips
          crops={crops}
          selectedCrop={selectedCrop}
          onSelectCrop={handleCropChange}
          isLoading={isLoading}
          maxDisplay={20}
        />
      )}

      {/* Search + refresh row */}
      <div className="flex gap-2 items-center">
        {searchOpen ? (
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              autoFocus
              placeholder={t('market.intelligence.search')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onBlur={() => !searchQuery && setSearchOpen(false)}
              className="h-11 pl-9 rounded-2xl bg-card border-border/60 text-sm"
            />
          </div>
        ) : (
          <Button
            variant="outline"
            onClick={() => setSearchOpen(true)}
            className="flex-1 h-11 rounded-2xl bg-card border-border/60 justify-start text-muted-foreground font-normal"
          >
            <Search className="w-4 h-4 mr-2" />
            {t('market.intelligence.search')}
          </Button>
        )}

        <Button
          onClick={handleRefresh}
          variant="outline"
          size="icon"
          className="h-11 w-11 rounded-2xl bg-card border-border/60 flex-shrink-0"
          disabled={isLoading}
          aria-label="Refresh"
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
        </Button>
      </div>

      {/* Section: Today's prices */}
      <Section
        title="आजचे भाव"
        subtitle="Today's mandi prices"
        icon={<TrendingUp className="w-4 h-4 text-primary" />}
        open={openSections.today}
        onToggle={() => toggle('today')}
        count={prices.length}
      >
        {isLoading && prices.length === 0 ? (
          <Loading />
        ) : dateKeys.length === 0 ? (
          <Empty icon={Wheat} text={t('market.intelligence.noPrices')} />
        ) : (
          <div className="space-y-4">
            {dateKeys.map((date) => (
              <div key={date}>
                <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2 px-1 flex items-center gap-1.5">
                  <CalendarIcon className="w-3 h-3" />
                  {date}
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {(filteredGroupedPrices[date] || []).slice(0, 20).map((p, i) => (
                    <MarketPriceCard key={p.id || i} price={p} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Section: Nearby */}
      <Section
        title="जवळचे बाजार"
        subtitle="Markets within 50km"
        icon={<MapPin className="w-4 h-4 text-primary" />}
        open={openSections.nearby}
        onToggle={() => toggle('nearby')}
        count={nearbyMarkets.length}
      >
        <NearbyMarketsSection
          markets={nearbyMarkets}
          isLoading={isLoading}
          farmerLocation={farmerLocation}
          embedded
          onRefresh={() => {
            if (farmerLocation?.lat && farmerLocation?.lon) {
              fetchNearbyMarkets({
                lat: farmerLocation.lat,
                lon: farmerLocation.lon,
                radiusKm: 50,
                crop: selectedCrop || undefined,
              });
            }
          }}
        />
      </Section>

      {/* Section: Trend */}
      <Section
        title="किंमत प्रवृत्ती"
        subtitle="Price trend"
        icon={<BarChart3 className="w-4 h-4 text-primary" />}
        open={openSections.trend}
        onToggle={() => toggle('trend')}
      >
        <PriceComparisonChart
          historicalData={historicalData}
          selectedCrop={selectedCrop}
          isLoading={isLoading}
          embedded
          onFetchComparison={() =>
            getHistoricalComparison({
              crop: selectedCrop || undefined,
              market: selectedMarket === 'all' ? undefined : selectedMarket,
            })
          }
        />
      </Section>

      {/* Section: AI advice */}
      <Section
        title="AI विक्री सल्ला"
        subtitle="AI selling advice"
        icon={<Brain className="w-4 h-4 text-accent" />}
        open={openSections.ai}
        onToggle={() => toggle('ai')}
      >
        <AISellingAdvisor
          analysis={aiAnalysis}
          selectedCrop={selectedCrop}
          isLoading={isLoading}
          onGetAdvice={handleGetAIAdvice}
          embedded
        />
      </Section>
    </div>
  );
}

function StatPill({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: number | string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-card border border-border/60">
      <div className="flex-shrink-0">{icon}</div>
      <div className="min-w-0">
        <div className="text-sm font-bold text-foreground leading-tight tabular-nums">
          {value}
        </div>
        <div className="text-[10px] text-muted-foreground leading-tight truncate">
          {label}
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  subtitle,
  icon,
  open,
  onToggle,
  count,
  children,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-card border border-border/60 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 active:bg-muted/40 transition-colors"
      >
        <div className="p-2 rounded-xl bg-muted flex-shrink-0">{icon}</div>
        <div className="flex-1 text-left min-w-0">
          <div className="text-sm font-bold text-foreground leading-tight truncate">
            {title}
          </div>
          <div className="text-[11px] text-muted-foreground leading-tight truncate">
            {subtitle}
          </div>
        </div>
        {count !== undefined && count > 0 && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-primary/10 text-primary">
            {count}
          </span>
        )}
        <ChevronDown
          className={cn(
            'w-4 h-4 text-muted-foreground transition-transform flex-shrink-0',
            open && 'rotate-180',
          )}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="p-4 pt-1">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function Loading() {
  return (
    <div className="flex items-center justify-center py-8">
      <Loader2 className="w-6 h-6 animate-spin text-primary" />
    </div>
  );
}

function Empty({ icon: Icon, text }: { icon: React.ElementType; text: string }) {
  return (
    <div className="text-center py-8">
      <Icon className="w-10 h-10 mx-auto text-muted-foreground/40 mb-2" />
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
