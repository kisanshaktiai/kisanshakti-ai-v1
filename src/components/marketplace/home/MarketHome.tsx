import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuthStore } from '@/stores/authStore';
import { useLands } from '@/hooks/useLands';
import { useEntitlements } from '@/hooks/useEntitlements';
import { useMarketPriceIntelligence } from '@/hooks/useMarketPriceIntelligence';
import { MyCropPriceHero } from './tiles/MyCropPriceHero';
import { NearbyMandisTile } from './tiles/NearbyMandisTile';
import { PriceTrendTile } from './tiles/PriceTrendTile';
import { ShopInputsTile } from './tiles/ShopInputsTile';
import { MyOrdersTile } from './tiles/MyOrdersTile';
import { SellProduceTile } from './tiles/SellProduceTile';
import { PriceTickerStrip } from './tiles/PriceTickerStrip';
import { MarketTopBar } from './MarketTopBar';

interface MarketHomeProps {
  cartItemCount: number;
  onCartClick: () => void;
}

/**
 * 2030 bento Market home — farmer-first, mobile-only.
 * Leads with the farmer's primary crop + AI Sell/Wait advice.
 * All UI uses scoped --market-* tokens (centralized Warm Earthy theme).
 */
export function MarketHome({ cartItemCount, onCartClick }: MarketHomeProps) {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { lands = [] } = useLands();
  const { canUse } = useEntitlements();

  const primaryLand = useMemo(
    () => (lands as any[]).find((l) => !!l?.current_crop) || (lands as any[])[0] || null,
    [lands]
  );
  const primaryCrop: string | undefined = primaryLand?.current_crop || undefined;
  const district: string | undefined = primaryLand?.district || undefined;

  const intel = useMarketPriceIntelligence(user?.id);
  const [tickerLoaded, setTickerLoaded] = useState(false);

  useEffect(() => {
    intel.fetchPrices({ limit: 12 }).then(() => setTickerLoaded(true));
    if (primaryLand?.latitude && primaryLand?.longitude) {
      intel.fetchNearbyMarkets({
        lat: primaryLand.latitude,
        lon: primaryLand.longitude,
        radiusKm: 50,
        limit: 5,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primaryLand?.id]);

  const marketplaceAllowed = canUse('marketplace').allowed;

  const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.05 } },
  };
  const item = {
    hidden: { opacity: 0, y: 12 },
    show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] as any } },
  };

  return (
    <div
      className="min-h-full"
      style={{ backgroundColor: 'hsl(var(--market-bg))', color: 'hsl(var(--market-ink))' }}
    >
      <MarketTopBar
        cartItemCount={cartItemCount}
        onCartClick={onCartClick}
        district={district}
        farmerName={(user as any)?.name || (user as any)?.full_name}
      />

      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="px-3 pt-3 pb-28 space-y-3 max-w-screen-sm mx-auto"
      >
        {/* HERO — Today's crop price + AI Sell/Wait */}
        <motion.div variants={item}>
          <MyCropPriceHero
            crop={primaryCrop}
            district={district}
            land={primaryLand}
            onViewAll={() => navigate('/app/market?view=prices')}
          />
        </motion.div>

        {/* Row: Nearby Mandis + Price Trend */}
        <motion.div variants={item} className="grid grid-cols-2 gap-3">
          <NearbyMandisTile
            markets={intel.nearbyMarkets}
            hasLocation={!!(primaryLand?.latitude && primaryLand?.longitude)}
            onClick={() => navigate('/app/market?view=prices')}
          />
          <PriceTrendTile
            crop={primaryCrop}
            district={district}
            onClick={() => navigate('/app/market?view=prices')}
          />
        </motion.div>

        {/* Row: Shop + Orders */}
        <motion.div variants={item} className="grid grid-cols-2 gap-3">
          <ShopInputsTile
            locked={!marketplaceAllowed}
            onClick={() =>
              marketplaceAllowed ? navigate('/app/market?view=shop') : navigate('/app/subscription')
            }
          />
          <MyOrdersTile onClick={() => navigate('/app/market?view=orders')} />
        </motion.div>

        {/* Sell wide CTA */}
        <motion.div variants={item}>
          <SellProduceTile
            locked={!marketplaceAllowed}
            onClick={() =>
              marketplaceAllowed ? navigate('/app/market?view=sell') : navigate('/app/subscription')
            }
          />
        </motion.div>

        {/* Bottom: live price ticker */}
        <motion.div variants={item}>
          <PriceTickerStrip prices={intel.prices} loading={!tickerLoaded} />
        </motion.div>
      </motion.div>
    </div>
  );
}
