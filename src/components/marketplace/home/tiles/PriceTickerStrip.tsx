import { Flame } from 'lucide-react';
import type { MarketPrice } from '@/hooks/useMarketPriceIntelligence';

interface Props {
  prices: MarketPrice[];
  loading?: boolean;
}

export function PriceTickerStrip({ prices, loading }: Props) {
  if (loading) {
    return (
      <div
        className="rounded-3xl p-4 min-h-[88px] flex items-center justify-center"
        style={{
          backgroundColor: 'hsl(var(--market-surface-warm))',
          border: '1px solid hsl(var(--market-line))',
        }}
      >
        <div className="flex gap-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-14 w-28 rounded-2xl animate-pulse"
              style={{ backgroundColor: 'hsl(var(--market-bg-soft))' }}
            />
          ))}
        </div>
      </div>
    );
  }

  const items = (prices || []).slice(0, 10);
  if (!items.length) return null;

  return (
    <section
      className="rounded-3xl p-4"
      style={{
        backgroundColor: 'hsl(var(--market-surface-warm))',
        border: '1px solid hsl(var(--market-line))',
      }}
      aria-label="Top mandi prices"
    >
      <div className="flex items-center gap-2 mb-3">
        <Flame className="w-4 h-4" style={{ color: 'hsl(var(--market-primary))' }} />
        <h3 className="text-sm font-bold" style={{ color: 'hsl(var(--market-ink))' }}>
          आज के टॉप भाव · Top Prices
        </h3>
      </div>
      <div className="flex gap-2.5 overflow-x-auto scrollbar-hide -mx-1 px-1 pb-1">
        {items.map((p) => {
          const price = p.modal_price || p.price_per_unit;
          return (
            <div
              key={p.id}
              className="flex-shrink-0 rounded-2xl px-3 py-2.5 min-w-[124px]"
              style={{
                backgroundColor: 'hsl(var(--market-surface))',
                border: '1px solid hsl(var(--market-line))',
              }}
            >
              <p
                className="text-[11px] font-semibold capitalize truncate"
                style={{ color: 'hsl(var(--market-ink-soft))' }}
              >
                {p.crop_name}
              </p>
              <p
                className="text-base font-extrabold mt-0.5 truncate"
                style={{ color: 'hsl(var(--market-ink))' }}
              >
                ₹{Math.round(price).toLocaleString('en-IN')}
              </p>
              <p className="text-[10px] truncate" style={{ color: 'hsl(var(--market-ink-soft))' }}>
                {p.market_location || p.district}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
