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
import type { MarketPrice } from '@/hooks/useMarketPriceIntelligence';
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
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

type Section = 'today' | 'trend' | 'ai';
type Corridor = 'all' | 'near' | 'regional' | 'major';
type Tier = 'near' | 'regional' | 'major' | 'other';

const CORRIDORS: { id: Corridor; label: string }[] = [
  { id: 'all', label: 'सर्व' },
  { id: 'near', label: 'जवळचे · १०० किमी' },
  { id: 'regional', label: 'परिसर · २०० किमी' },
  { id: 'major', label: 'मोठ्या बाजारपेठा' },
];
const TIER_META: Record<Tier, { title: string; subtitle: string }> = {
  near: { title: 'तुमच्या जवळचे बाजार', subtitle: 'तुमचा जिल्हा व १०० किमीच्या आत' },
  regional: { title: 'परिसरातील बाजार', subtitle: '१०० ते २०० किमी' },
  major: { title: 'मोठ्या बाजारपेठा', subtitle: 'सर्वाधिक आवक असलेले बाजार (उदा. मुंबई, पुणे)' },
  other: { title: 'इतर बाजार', subtitle: 'राज्यातील इतर बाजार' },
};
const TIER_ORDER: Tier[] = ['near', 'regional', 'major', 'other'];

export function MarketPriceIntelligence() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
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
    historicalData,
    aiAnalysis,
    crops,
    cropGroups,
    isLoading,
    fetchCropGroups,
    fetchCrops,
    fetchRankedPrices,
    getHistoricalComparison,
    getAIAnalysis,
  } = useMarketPriceIntelligence(user?.id);

  const loadFeed = async (opts: { crop?: string; group?: string | null; corridor?: Corridor; loc?: typeof land } = {}) => {
    const loc = opts.loc !== undefined ? opts.loc : land;
    const res = await fetchRankedPrices({
      lat: loc?.lat, lon: loc?.lon, district: loc?.district,
      crop: (opts.crop ?? selectedCrop) || undefined,
      group: (opts.group !== undefined ? opts.group : selectedGroup) || undefined,
      corridor: opts.corridor ?? corridor,
      limit: 150,
    });
    setLatestDate(res.latestDate ?? null);
  };

  useEffect(() => {
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
      setLand(loc);
      await Promise.all([fetchCropGroups(), fetchCrops(), loadFeed({ loc })]);
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

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
          value={nearCount}
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

      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1" role="tablist" aria-label="बाजार अंतर">
        {CORRIDORS.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={corridor === c.id}
            onClick={() => handleCorridorChange(c.id)}
            disabled={isLoading}
            className={cn(
              'flex-shrink-0 h-9 px-3.5 rounded-full text-xs font-semibold border transition-colors touch-manipulation',
              corridor === c.id
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card text-foreground border-border/60 active:bg-muted/40',
            )}
          >
            {c.label}
          </button>
        ))}
      </div>
      {!land?.lat && !isLoading && (
        <p className="text-[11px] text-muted-foreground px-1">
          तुमच्या शेताचे ठिकाण मिळाले नाही — अंतर दाखवता येत नाही. जमिनीची नोंद पूर्ण करा.
        </p>
      )}

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

      {/* Section: Today's prices, nearest markets first */}
      <Section
        title="आजचे भाव"
        subtitle={latestDate ? `जवळचे बाजार आधी · ताजी नोंद ${latestDate}` : 'जवळचे बाजार आधी'}
        icon={<TrendingUp className="w-4 h-4 text-primary" />}
        open={openSections.today}
        onToggle={() => toggle('today')}
        count={prices.length}
      >
        {isLoading && prices.length === 0 ? (
          <Loading />
        ) : byTier.length === 0 ? (
          <Empty icon={Wheat} text={t('market.intelligence.noPrices')} />
        ) : (
          <div className="space-y-5">
            {byTier.map(({ tier, items }) => (
              <div key={tier}>
                <div className="mb-2 px-1 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-primary" />
                  <h4 className="text-xs font-bold text-foreground">{TIER_META[tier].title}</h4>
                  <span className="text-[10px] text-muted-foreground truncate">· {TIER_META[tier].subtitle}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {items.slice(0, tier === 'other' ? 20 : 40).map((p, i) => (
                    <MarketPriceCard key={p.id || i} price={p} onClick={() => setDetail(p)} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
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
      <MarketCropDetailSheet
        open={!!detail}
        onOpenChange={(o) => !o && setDetail(null)}
        price={detail}
        allPrices={prices}
        historicalData={historicalData}
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
