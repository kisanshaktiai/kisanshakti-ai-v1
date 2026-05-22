import { useEffect, useMemo, useState } from 'react';
import { TrendingUp, TrendingDown, Sparkles, ChevronRight, Leaf, Loader2 } from 'lucide-react';
import { useMarketPriceIntelligence } from '@/hooks/useMarketPriceIntelligence';

interface Props {
  crop?: string;
  district?: string;
  land?: any;
  onViewAll: () => void;
}

/**
 * Hero card — farmer's primary crop today.
 * Shows live mandi price, change %, and AI Sell/Wait/Hold recommendation.
 */
export function MyCropPriceHero({ crop, district, onViewAll }: Props) {
  const intel = useMarketPriceIntelligence();
  const [loading, setLoading] = useState(false);
  const [advice, setAdvice] = useState<'SELL_NOW' | 'WAIT' | 'HOLD' | null>(null);
  const [reason, setReason] = useState<string>('');

  useEffect(() => {
    if (!crop) return;
    let cancelled = false;
    setLoading(true);
    intel
      .fetchPrices({ crop, district, limit: 8 })
      .then(async () => {
        if (cancelled) return;
        try {
          const a = await intel.getAIAnalysis({ crop, district });
          if (!cancelled && a) {
            setAdvice(a.recommendation);
            setReason(a.reasoning);
          }
        } catch {
          /* silent */
        }
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crop, district]);

  const top = useMemo(
    () => (intel.prices || []).slice().sort((a, b) => (b.modal_price || b.price_per_unit) - (a.modal_price || a.price_per_unit))[0],
    [intel.prices]
  );
  const price = top?.modal_price || top?.price_per_unit;
  const change = useMemo(() => {
    if (!intel.prices || intel.prices.length < 2) return 0;
    const recent = intel.prices[0]?.modal_price || intel.prices[0]?.price_per_unit;
    const old = intel.prices[intel.prices.length - 1]?.modal_price || intel.prices[intel.prices.length - 1]?.price_per_unit;
    if (!recent || !old) return 0;
    return ((recent - old) / old) * 100;
  }, [intel.prices]);

  const isUp = change >= 0;
  const adviceLabel = adviceText(advice);

  if (!crop) {
    return (
      <button
        onClick={onViewAll}
        className="w-full text-left rounded-3xl p-5 min-h-[180px] flex flex-col justify-center items-center gap-2"
        style={{
          background: 'linear-gradient(135deg, hsl(var(--market-primary-soft)), hsl(var(--market-primary) / 0.85))',
          color: 'hsl(var(--market-primary-foreground))',
          boxShadow: '0 18px 36px -18px hsl(var(--market-primary) / 0.55)',
        }}
      >
        <Leaf className="w-7 h-7 opacity-90" />
        <p className="text-base font-bold">अपनी फसल जोड़ें</p>
        <p className="text-xs opacity-90">Add your crop to see daily mandi price</p>
      </button>
    );
  }

  return (
    <div
      className="rounded-3xl p-5 relative overflow-hidden"
      style={{
        background:
          'linear-gradient(135deg, hsl(var(--market-primary)) 0%, hsl(13 55% 42%) 100%)',
        color: 'hsl(var(--market-primary-foreground))',
        boxShadow: '0 22px 40px -20px hsl(var(--market-primary) / 0.65)',
      }}
    >
      {/* decorative warm orb */}
      <div
        aria-hidden
        className="absolute -top-10 -right-10 w-40 h-40 rounded-full opacity-25"
        style={{ background: 'hsl(var(--market-primary-soft))' }}
      />

      <div className="relative">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] font-semibold tracking-wide uppercase opacity-90">
            आज का भाव · Today
          </span>
          <span className="text-[10px] opacity-80">
            {district || 'Nearest mandi'}
          </span>
        </div>

        <h2 className="text-2xl font-extrabold leading-tight capitalize">
          {crop}
        </h2>
        {top?.market_location && (
          <p className="text-[12px] opacity-90 mt-0.5">{top.market_location}</p>
        )}

        <div className="mt-4 flex items-end gap-3">
          {loading ? (
            <Loader2 className="w-7 h-7 animate-spin opacity-80" />
          ) : price ? (
            <>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-black tracking-tight">₹{Math.round(price).toLocaleString('en-IN')}</span>
                <span className="text-sm font-medium opacity-90">/{top?.unit || 'qtl'}</span>
              </div>
              <div
                className="flex items-center gap-1 px-2 py-1 rounded-xl text-xs font-bold"
                style={{
                  backgroundColor: isUp
                    ? 'hsl(var(--market-accent) / 0.95)'
                    : 'hsl(var(--market-down) / 0.95)',
                  color: 'hsl(var(--market-primary-foreground))',
                }}
              >
                {isUp ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                {Math.abs(change).toFixed(1)}%
              </div>
            </>
          ) : (
            <p className="text-sm opacity-90">कोई दर उपलब्ध नहीं · No price yet</p>
          )}
        </div>

        {/* AI advice */}
        <div
          className="mt-4 rounded-2xl p-3 flex items-start gap-3"
          style={{
            backgroundColor: 'hsl(var(--market-primary-foreground) / 0.14)',
            border: '1px solid hsl(var(--market-primary-foreground) / 0.22)',
          }}
        >
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: 'hsl(var(--market-primary-foreground) / 0.25)' }}
          >
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide opacity-90">
              AI सलाह · Advice
            </p>
            <p className="text-base font-bold">
              {adviceLabel.hi} · {adviceLabel.en}
            </p>
            {reason && (
              <p className="text-[11px] opacity-90 line-clamp-2 mt-0.5">{reason}</p>
            )}
          </div>
        </div>

        <button
          onClick={onViewAll}
          className="mt-4 w-full min-h-12 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-transform active:scale-[0.98]"
          style={{
            backgroundColor: 'hsl(var(--market-primary-foreground))',
            color: 'hsl(var(--market-primary))',
          }}
        >
          सभी बाजार देखें · View all markets
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function adviceText(a: 'SELL_NOW' | 'WAIT' | 'HOLD' | null) {
  switch (a) {
    case 'SELL_NOW':
      return { hi: 'अभी बेचें', en: 'Sell now' };
    case 'WAIT':
      return { hi: 'थोड़ा रुकें', en: 'Wait' };
    case 'HOLD':
      return { hi: 'रोक कर रखें', en: 'Hold' };
    default:
      return { hi: 'विश्लेषण हो रहा', en: 'Analyzing' };
  }
}
