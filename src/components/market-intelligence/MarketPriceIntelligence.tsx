import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '@/stores/authStore';
import { useMarketPriceIntelligence } from '@/hooks/useMarketPriceIntelligence';
import { MarketPriceCard } from './MarketPriceCard';
import { PriceComparisonChart } from './PriceComparisonChart';
import { AISellingAdvisor } from './AISellingAdvisor';
import { CropGroupButtons } from './CropGroupButtons';
import { landsApi } from '@/services/landsApi';
import { CropChips } from './CropChips';
import { MarketCropDetailSheet } from './MarketCropDetailSheet';
import type { MarketPrice, MarketScope } from '@/hooks/useMarketPriceIntelligence';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Search,
  MapPin,
  TrendingUp,
  Brain,
  RefreshCw,
  Loader2,
  Wheat,
  BarChart3,
  ChevronDown,
  Fence,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

type Section = 'today' | 'trend' | 'ai';
type Corridor = 'all' | 'near' | 'regional' | 'major';
type Tier = 'near' | 'regional' | 'major' | 'other';

const CORRIDORS: { id: Corridor }[] = [{ id: 'all' }, { id: 'near' }, { id: 'regional' }, { id: 'major' }];
const TIER_ORDER: Tier[] = ['near', 'regional', 'major', 'other'];

export function MarketPriceIntelligence() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const [scope, setScope] = useState<MarketScope>('produce');
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [corridor, setCorridor] = useState<Corridor>('all');
  const [land, setLand] = useState<{ lat?: number; lon?: number; district?: string } | null>(null);
  const [latestDate, setLatestDate] = useState<string | null>(null);
  const selectedMarket = 'all';
  const [selectedCrop, setSelectedCrop] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [detail, setDetail] = useState<MarketPrice | null>(null);
  const [openSections, setOpenSections] = useState<Record<Section, boolean>>({
    today: true,
    trend: false,
    ai: false,
  });

  const {
    prices,
    totalRecords,
    hasMore,
    error,
    historicalData,
    historicalCrop,
    aiAnalysis,
    crops,
    cropGroups,
    isLoading,
    fetchCropGroups,
    fetchCrops,
    fetchRankedPrices,
    getHistoricalComparison,
    getAIAnalysis,
  } = useMarketPriceIntelligence(user?.id, scope);

  const loadFeed = async (opts: { crop?: string; group?: string | null; corridor?: Corridor; loc?: typeof land; offset?: number } = {}) => {
    const loc = opts.loc !== undefined ? opts.loc : land;
    const res = await fetchRankedPrices({
      lat: loc?.lat, lon: loc?.lon, district: loc?.district,
      crop: (opts.crop ?? selectedCrop) || undefined,
      group: (opts.group !== undefined ? opts.group : selectedGroup) || undefined,
      corridor: opts.corridor ?? corridor,
      limit: 150,
      offset: opts.offset || 0,
    });
    setLatestDate(res.latestDate ?? null);
  };

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      // Location comes from the farmer's own verified lands, never from a client-chosen id.
      let loc: typeof land = null;
      try {
        const lands = await landsApi.fetchLands();
        const l = lands.find((x) => x.center_lat != null && x.center_lon != null) || lands[0];
        if (l) loc = { lat: l.center_lat ?? undefined, lon: l.center_lon ?? undefined, district: l.district };
      } catch {
        loc = null;
      }
      if (cancelled) return;
      setLand(loc);
      await Promise.all([fetchCropGroups(), fetchCrops(), loadFeed({ loc, crop: '', group: null })]);
    };
    init();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, scope]);

  const handleScopeChange = (value: string) => {
    if (value !== 'produce' && value !== 'livestock') return;
    setSelectedGroup(null); setSelectedCrop(''); setSearchQuery(''); setDetail(null);
    setLatestDate(null);
    setOpenSections({ today: true, trend: false, ai: false });
    setScope(value);
  };

  const handleGroupChange = async (group: string) => {
    const g = group === 'all' ? null : group;
    setSelectedGroup(g);
    setSelectedCrop('');
    await Promise.all([fetchCrops(g || undefined), loadFeed({ group: g, crop: '' })]);
  };

  const handleCorridorChange = async (c: Corridor) => {
    setCorridor(c);
    await loadFeed({ corridor: c });
  };

  const handleCropChange = async (crop: string) => {
    setSelectedCrop(crop);
    await loadFeed({ crop });
    if (crop) {
      await getHistoricalComparison({ crop });
      setOpenSections((s) => ({ ...s, trend: true, ai: true }));
    }
  };

  const handleRefresh = () => loadFeed();

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

  const q = searchQuery.toLowerCase();
  const visible = q
    ? prices.filter((p) =>
        p.crop_name?.toLowerCase().includes(q) ||
        p.market_location?.toLowerCase().includes(q) ||
        p.district?.toLowerCase().includes(q))
    : prices;
  const byTier = TIER_ORDER.map((tier) => ({
    tier,
    items: visible.filter((p) => (p.tier || 'other') === tier),
  })).filter((g) => g.items.length > 0);
  const nearCount = prices.filter((p) => p.tier === 'near').length;

  const toggle = (s: Section) =>
    setOpenSections((prev) => ({ ...prev, [s]: !prev[s] }));

  return (
    <div className="min-w-0 space-y-3 pb-6">
      <Tabs value={scope} onValueChange={handleScopeChange}>
        <TabsList className="grid h-11 w-full grid-cols-2 rounded-lg">
          <TabsTrigger value="produce" className="h-9 gap-2 rounded-md text-sm"><Wheat className="h-4 w-4" />{t('market.intelligence.produce')}</TabsTrigger>
          <TabsTrigger value="livestock" className="h-9 gap-2 rounded-md text-sm"><Fence className="h-4 w-4" />{t('market.intelligence.livestock')}</TabsTrigger>
        </TabsList>
      </Tabs>
      {/* Quick stats strip */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid grid-cols-3 gap-2"
      >
        <StatPill
          icon={<TrendingUp className="w-4 h-4 text-success" />}
          value={totalRecords}
          label={t('market.intelligence.prices')}
        />
        <StatPill
          icon={<MapPin className="w-4 h-4 text-primary" />}
          value={nearCount}
          label={t('market.intelligence.nearby')}
        />
        <StatPill
          icon={<Wheat className="w-4 h-4 text-accent" />}
          value={crops.length}
          label={t('market.intelligence.items')}
        />
      </motion.div>

      <div className="grid grid-cols-2 gap-2">
        <CropGroupButtons groups={cropGroups} selectedGroup={selectedGroup} onSelectGroup={handleGroupChange} isLoading={isLoading} />
        <CropChips crops={crops} selectedCrop={selectedCrop} onSelectCrop={handleCropChange} isLoading={isLoading} />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label={t('market.intelligence.marketDistance')}>
        {CORRIDORS.map(c => (
          <Button key={c.id} variant={corridor === c.id ? 'default' : 'outline'} aria-pressed={corridor === c.id} onClick={() => handleCorridorChange(c.id)} disabled={isLoading}
            className="h-auto min-h-10 min-w-0 whitespace-normal rounded-lg px-2 py-2 text-xs">
            {t(`market.intelligence.corridors.${c.id}`)}
          </Button>
        ))}
      </div>
      {land?.lat == null && !isLoading && <p className="text-xs text-muted-foreground">{t('market.intelligence.missingLocation')}</p>}

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
              className="h-11 pl-9 rounded-lg bg-card border-border/60 text-sm"
            />
          </div>
        ) : (
          <Button
            variant="outline"
            onClick={() => setSearchOpen(true)}
            className="flex-1 h-11 rounded-lg bg-card border-border/60 justify-start text-muted-foreground font-normal"
          >
            <Search className="w-4 h-4 mr-2" />
            {t('market.intelligence.search')}
          </Button>
        )}

        <Button
          onClick={handleRefresh}
          variant="outline"
          size="icon"
          className="h-11 w-11 rounded-lg bg-card border-border/60 flex-shrink-0"
          disabled={isLoading}
          aria-label={t('market.intelligence.refresh')}
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
        </Button>
      </div>

      {/* Section: Today's prices, nearest markets first */}
      <Section
        title={t('market.intelligence.latestPrices')}
        subtitle={latestDate ? t('market.intelligence.latestRecord', { date: latestDate }) : t('market.intelligence.nearestFirst')}
        icon={<TrendingUp className="w-4 h-4 text-primary" />}
        open={openSections.today}
        onToggle={() => toggle('today')}
        count={totalRecords}
      >
        {error ? <div role="alert" className="py-4 text-sm text-destructive">{t('market.intelligence.loadError')}</div> : isLoading && prices.length === 0 ? (
          <Loading />
        ) : byTier.length === 0 ? (
          <Empty icon={Wheat} text={t('market.intelligence.noPrices')} />
        ) : (
          <div className="space-y-5">
            {byTier.map(({ tier, items }) => (
              <div key={tier}>
                <div className="mb-2 px-1 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-primary" />
                  <h4 className="text-xs font-bold text-foreground">{t(`market.intelligence.tiers.${tier}`)}</h4>

                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {items.map((p, i) => (
                    <MarketPriceCard key={p.id || i} price={p} onClick={() => setDetail(p)} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-3 flex flex-col items-center gap-2">
          <p className="text-xs text-muted-foreground">{t('market.intelligence.showing', { count: prices.length, total: totalRecords })}</p>
          {hasMore && <Button variant="outline" onClick={() => loadFeed({ offset: prices.length })} disabled={isLoading} className="w-full rounded-lg">
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t('market.intelligence.loadMore')}
          </Button>}
        </div>
      </Section>

      {scope === 'produce' && <>
      {/* Section: Trend */}
      <Section
        title="किंमत प्रवृत्ती"
        subtitle="Price trend"
        icon={<BarChart3 className="w-4 h-4 text-primary" />}
        open={openSections.trend}
        onToggle={() => toggle('trend')}
      >
        <PriceComparisonChart
          historicalData={historicalCrop === (selectedCrop || null) ? historicalData : {}}
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
      </>}
      <MarketCropDetailSheet
        open={!!detail}
        onOpenChange={(o) => !o && setDetail(null)}
        price={detail}
        allPrices={prices}
        historicalData={historicalData}
        historicalCrop={historicalCrop}
        aiAnalysis={aiAnalysis && detail?.crop_name === selectedCrop ? aiAnalysis : null}
        isLoading={isLoading}
        onLoadHistory={(crop) => getHistoricalComparison({ crop })}
        onGetAdvice={async (crop) => {
          setSelectedCrop(crop);
          await getAIAnalysis({ crop, currentPrice: detail ? (detail.modal_price || detail.price_per_unit) : undefined, historicalData });
        }}
      />
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
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-card border border-border/60">
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
    <section className="min-w-0 border-t border-border pt-2">
      <Button
        variant="ghost"
        onClick={onToggle}
        className="h-auto w-full justify-start gap-2 whitespace-normal px-0 py-2"
      >
        <div className="p-2 rounded-xl bg-muted flex-shrink-0">{icon}</div>
        <div className="flex-1 text-left min-w-0">
          <div className="text-sm font-bold text-foreground leading-tight truncate">
            {title}
          </div>
          <div className="mt-1 text-[11px] font-normal text-muted-foreground leading-snug whitespace-normal">
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
      </Button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="pt-2">{children}</div>
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
