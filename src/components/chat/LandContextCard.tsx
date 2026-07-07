/**
 * LandContextCard
 *
 * "Welcome" panel shown at the top of a land-scoped AI Chat conversation.
 * Loads and displays the authoritative context for the selected land — land
 * meta, active crop + variety + sowing date, latest soil health, latest NDVI,
 * and live weather — BEFORE the farmer asks the first question.
 *
 * Data is fetched via `useLandChatContext`, which is also prefetched by the
 * chat interface on land-tab click so this panel paints instantly.
 */

import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Cloud,
  Droplets,
  Thermometer,
  Leaf,
  Sprout,
  Wind,
  FlaskConical,
  CalendarDays,
  Wheat,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLandChatContext } from '@/hooks/useLandChatContext';
import { cn } from '@/lib/utils';

interface LandContextCardProps {
  land: any;
  onQuickAction?: (action: string) => void;
}

function ndviStatus(score: number | null | undefined, t: (k: string) => string) {
  if (score == null) return { label: t('chat.noData'), color: 'bg-muted' };
  if (score > 0.7) return { label: t('chat.healthy'), color: 'bg-success' };
  if (score > 0.4) return { label: t('chat.moderate'), color: 'bg-warning' };
  return { label: t('chat.needsAttention'), color: 'bg-destructive' };
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function daysBetween(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

export function LandContextCard({ land, onQuickAction }: LandContextCardProps) {
  const { t } = useTranslation();
  const { context, isLoading } = useLandChatContext(land?.id);

  // Prefer freshly-loaded row; fall back to the summary row from the tab strip
  // so we still render something meaningful on the very first paint.
  const l = context.land ?? land;
  const schedule = context.activeCrop;           // crop_schedules SSOT
  const phen = context.phenology;                // resolve_crop_phenology SSOT
  const soil = context.soil;
  const ndvi = context.ndvi;
  const wx = context.weather;

  const ndviScore = ndvi?.ndvi_value ?? ndvi?.mean_ndvi ?? l?.last_ndvi_value ?? null;
  const ndvi_ = ndviStatus(ndviScore, t as any);

  // Crop identity + variety come from crop_schedules (authoritative).
  const cropName = schedule?.crop_name ?? l?.current_crop ?? null;
  const variety = schedule?.crop_variety ?? null;
  const sowingDate = schedule?.sowing_date ?? l?.last_sowing_date ?? l?.planting_date ?? null;
  const expectedHarvest = schedule?.expected_harvest_date ?? l?.expected_harvest_date ?? null;

  // Growth stage + DAS come ONLY from resolve_crop_phenology (variety-aware SSOT).
  // Never derive stage on the client.
  const growthStage = phen?.growth_stage ?? null;
  const das = phen?.current_das ?? daysBetween(sowingDate);

  const temperature = wx?.temperature_celsius;
  const humidity = wx?.humidity_percent;
  const windKmh = wx?.wind_speed_kmh;
  const rainMm = wx?.rain_24h_mm ?? wx?.rain_1h_mm ?? 0;

  return (
    <Card className="p-3 bg-gradient-to-br from-primary/5 via-secondary/5 to-accent/5 border-primary/20">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
            <Sprout className="w-4 h-4 text-primary" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground truncate">{l?.name}</h3>
            <p className="text-[10px] text-muted-foreground truncate">
              {l?.area_acres != null && (
                <>
                  {l.area_acres} {t('common.acres')}
                </>
              )}
              {(soil?.soil_type || l?.soil_type) && (
                <> • {soil?.soil_type ?? l?.soil_type}</>
              )}
              {l?.district && <> • {l.district}</>}
            </p>
          </div>
        </div>
        <Badge className={cn(ndvi_.color, 'text-white text-[10px] px-2 py-0.5 shrink-0')}>
          <Leaf className="w-2.5 h-2.5 mr-0.5" />
          {ndvi_.label}
          {ndviScore != null && <span className="ml-1">{ndviScore.toFixed(2)}</span>}
        </Badge>
      </div>

      {/* Crop row */}
      {isLoading && !cropName ? (
        <Skeleton className="h-10 w-full rounded-lg mb-2" />
      ) : cropName ? (
        <div className="flex items-start gap-2 p-2 rounded-lg bg-success/10 border border-success/20 mb-2">
          <Wheat className="w-4 h-4 text-success mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0 text-xs">
            <div className="font-semibold text-foreground truncate">
              {cropName}
              {variety && <span className="text-muted-foreground font-normal"> · {variety}</span>}
            </div>
            <div className="text-[10px] text-muted-foreground flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5">
              {sowingDate && (
                <span className="inline-flex items-center gap-1">
                  <CalendarDays className="w-3 h-3" />
                  {t('chat.sown', 'Sown')}: {fmtDate(sowingDate)}
                  {das != null && ` · ${das} ${t('common.daysShort', 'd')}`}
                </span>
              )}
              {growthStage && (
                <span className="inline-flex items-center gap-1">
                  <Sprout className="w-3 h-3" />
                  {growthStage}
                  {phen?.phenology_index != null && (
                    <span className="text-muted-foreground/70">
                      {' '}
                      · {Math.round(phen.phenology_index * 100)}%
                    </span>
                  )}
                </span>
              )}
              {expectedHarvest && (
                <span className="inline-flex items-center gap-1">
                  <CalendarDays className="w-3 h-3" />
                  {t('chat.harvest', 'Harvest')}: {fmtDate(expectedHarvest)}
                </span>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* Weather grid */}
      <div className="grid grid-cols-4 gap-1.5 mb-2">
        <MetricTile
          icon={<Thermometer className="w-3.5 h-3.5 text-warning" />}
          value={temperature != null ? `${Math.round(temperature)}°` : '—'}
          label="Temp"
          loading={isLoading && temperature == null}
        />
        <MetricTile
          icon={<Droplets className="w-3.5 h-3.5 text-info" />}
          value={humidity != null ? `${Math.round(humidity)}%` : '—'}
          label="RH"
          loading={isLoading && humidity == null}
        />
        <MetricTile
          icon={<Wind className="w-3.5 h-3.5 text-info" />}
          value={windKmh != null ? `${Math.round(windKmh)}` : '—'}
          label="km/h"
          loading={isLoading && windKmh == null}
        />
        <MetricTile
          icon={<Cloud className="w-3.5 h-3.5 text-info" />}
          value={`${Number(rainMm ?? 0).toFixed(rainMm && rainMm < 10 ? 1 : 0)}`}
          label="mm"
          loading={isLoading && !wx}
        />
      </div>

      {/* Soil summary */}
      {(soil?.ph_level != null ||
        soil?.nitrogen_level ||
        soil?.phosphorus_level ||
        soil?.potassium_level ||
        soil?.soil_moisture_surface_percent != null) && (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/40 border border-border/40 mb-2">
          <FlaskConical className="w-3.5 h-3.5 text-primary shrink-0" />
          <div className="text-[10px] text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
            {soil?.ph_level != null && (
              <span>
                pH <span className="text-foreground font-medium">{soil.ph_level.toFixed(1)}</span>
              </span>
            )}
            {(soil?.nitrogen_level ||
              soil?.phosphorus_level ||
              soil?.potassium_level) && (
              <span>
                NPK{' '}
                <span className="text-foreground font-medium">
                  {(soil?.nitrogen_level ?? '-')[0] ?? '-'}·
                  {(soil?.phosphorus_level ?? '-')[0] ?? '-'}·
                  {(soil?.potassium_level ?? '-')[0] ?? '-'}
                </span>
              </span>
            )}
            {soil?.soil_moisture_surface_percent != null && (
              <span>
                {t('chat.moisture', 'Moisture')}{' '}
                <span className="text-foreground font-medium">
                  {Math.round(soil.soil_moisture_surface_percent)}%
                </span>
              </span>
            )}
            {soil?.agro_climatic_zone && (
              <span className="truncate max-w-[140px]">{soil.agro_climatic_zone}</span>
            )}
          </div>
        </div>
      )}

      {/* Quick actions */}
      {onQuickAction && (
        <div className="flex gap-1 flex-wrap">
          <button
            onClick={() => onQuickAction('irrigation')}
            className="px-2 py-0.5 text-xs rounded-full bg-info/15 text-info hover:bg-info/25 transition-colors"
          >
            💧 {t('chat.irrigationTip')}
          </button>
          <button
            onClick={() => onQuickAction('fertilizer')}
            className="px-2 py-0.5 text-xs rounded-full bg-success/15 text-success hover:bg-success/25 transition-colors"
          >
            🌱 {t('chat.fertilizerAdvice')}
          </button>
          <button
            onClick={() => onQuickAction('pest')}
            className="px-2 py-0.5 text-xs rounded-full bg-destructive/15 text-destructive hover:bg-destructive/25 transition-colors"
          >
            🐛 {t('chat.pestRisk')}
          </button>
        </div>
      )}
    </Card>
  );
}

function MetricTile({
  icon,
  value,
  label,
  loading,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  loading?: boolean;
}) {
  return (
    <div className="flex flex-col items-center p-1.5 rounded-lg bg-background/60 border border-border/40">
      {icon}
      {loading ? (
        <Skeleton className="h-3 w-8 mt-1" />
      ) : (
        <span className="text-xs font-semibold text-foreground mt-0.5">{value}</span>
      )}
      <span className="text-[9px] text-muted-foreground">{label}</span>
    </div>
  );
}
