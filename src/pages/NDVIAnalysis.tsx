import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, RefreshCw, Volume2, Satellite, Calendar,
  TrendingUp, TrendingDown, Minus, AlertTriangle, Sparkles,
  Heart, BarChart3, Map as MapIcon, Lightbulb, CloudOff, Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { landsApi } from '@/services/landsApi';
import { NDVIMapView } from '@/components/land/NDVIMapView';
import { NDVITrendChart } from '@/components/land/NDVITrendChart';
import { useNDVIAnalysis } from '@/hooks/useNDVIAnalysis';
import {
  getScientificHealthStatus, formatNDVI, ndviToColor,
  getStageAwareStatus, isObservationReliable, NDVI_THRESHOLDS,
} from '@/lib/ndviScience';
import { useAuthStore } from '@/stores/authStore';
import { useTenant } from '@/contexts/TenantContext';
import { useToast } from '@/hooks/use-toast';
import { useTextToSpeech } from '@/hooks/useTextToSpeech';
import { cn } from '@/lib/utils';

interface LandRow {
  id: string;
  name: string;
  area_acres: number;
  current_crop?: string;
  boundary_polygon_old?: any;
  center_point_old?: any;
  last_ndvi_value?: number;
  ndvi_thumbnail_url?: string | null;
  last_ndvi_calculation?: string | null;
  planting_date?: string;
  last_sowing_date?: string;
}

const CROP_EMOJI: Record<string, string> = {
  sugarcane: '🎋', maize: '🌽', corn: '🌽', wheat: '🌾', rice: '🌾', cotton: '🪻',
};
function cropEmoji(crop?: string) {
  if (!crop) return '🌱';
  const k = crop.toLowerCase();
  for (const key of Object.keys(CROP_EMOJI)) if (k.includes(key)) return CROP_EMOJI[key];
  return '🌱';
}

export default function NDVIAnalysis() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id: urlLandId } = useParams<{ id?: string }>();
  const { session } = useAuthStore();
  const { tenant } = useTenant();
  const { toast } = useToast();
  const { speak, isSpeaking, stop } = useTextToSpeech();
  const [selectedLandId, setSelectedLandId] = useState<string | null>(urlLandId || null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [tab, setTab] = useState<'now' | 'trend' | 'map'>('now');

  const { data: lands = [], isLoading: landsLoading, refetch: refetchLands } = useQuery({
    queryKey: ['lands', session?.farmerId, tenant?.id],
    queryFn: async () => ((await landsApi.fetchLands()) || []) as LandRow[],
    enabled: !!session?.farmerId && !!tenant?.id,
  });

  useEffect(() => {
    if (!selectedLandId && lands.length > 0) setSelectedLandId(lands[0].id);
  }, [lands, selectedLandId]);

  const selectedLand = lands.find((l) => l.id === selectedLandId) || null;
  const { current, history, latestRaw, prediction, isLoading, refetch } = useNDVIAnalysis(selectedLandId);

  const stageDays = useMemo(() => {
    const d = selectedLand?.planting_date || selectedLand?.last_sowing_date;
    if (!d) return null;
    return Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000));
  }, [selectedLand]);

  const stageAware = useMemo(() => {
    if (!current) return null;
    return getStageAwareStatus(current.ndvi_value, selectedLand?.current_crop, stageDays);
  }, [current, selectedLand, stageDays]);

  const onRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([refetchLands(), refetch()]);
    toast({ title: t('ndvi.refresh.data_refreshed', '✅ Data refreshed') });
    setIsRefreshing(false);
  };

  const speakSummary = () => {
    if (isSpeaking) return stop();
    if (!current) return;
    const status = getScientificHealthStatus(current.ndvi_value);
    speak(`${t(status.labelKey, status.label)}. NDVI ${formatNDVI(current.ndvi_value, 2)}`);
  };

  const boundary = useMemo(() => {
    const coords = selectedLand?.boundary_polygon_old?.coordinates?.[0];
    return coords ? coords.map((c: number[]) => ({ lat: c[1], lng: c[0] })) : [];
  }, [selectedLand]);
  const centerPoint = useMemo(() => {
    const c = selectedLand?.center_point_old?.coordinates;
    return c ? { lat: c[1], lng: c[0] } : { lat: 20.5937, lng: 78.9629 };
  }, [selectedLand]);

  const hasStale = !!latestRaw && !isObservationReliable(latestRaw);
  const status = current ? getScientificHealthStatus(current.ndvi_value) : null;

  return (
    <div className="min-h-full bg-background flex flex-col">
      {/* Compact 32px header */}
      <header className="sticky top-0 z-30 bg-background/95 border-b border-border/40">
        <div className="flex items-center justify-between px-2 h-10">
          <div className="flex items-center gap-1.5 min-w-0">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="h-8 w-8 rounded-lg shrink-0">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-sm font-bold truncate">{t('ndvi.title', 'NDVI Analysis')}</h1>
            <Satellite className="h-3 w-3 text-primary animate-pulse shrink-0" />
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <Button variant="ghost" size="icon" onClick={speakSummary} className="h-8 w-8 rounded-lg">
              <Volume2 className={cn('h-3.5 w-3.5', isSpeaking && 'text-primary animate-pulse')} />
            </Button>
            <Button variant="ghost" size="icon" onClick={onRefresh} disabled={isRefreshing} className="h-8 w-8 rounded-lg">
              <RefreshCw className={cn('h-3.5 w-3.5', isRefreshing && 'animate-spin')} />
            </Button>
          </div>
        </div>
      </header>

      {/* Compact horizontal Land rail — small chips for max map area */}
      <ScrollArea className="w-full shrink-0 border-b border-border/40 bg-card/40">
        <div className="flex gap-1.5 px-2 py-1.5">
          {landsLoading
            ? [1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-[100px] rounded-lg shrink-0" />)
            : lands.map((land) => {
                const isActive = land.id === selectedLandId;
                const dotColor = land.last_ndvi_value
                  ? ndviToColor(land.last_ndvi_value)
                  : 'hsl(var(--muted-foreground))';
                return (
                  <button
                    key={land.id}
                    onClick={() => setSelectedLandId(land.id)}
                    className={cn(
                      'shrink-0 flex items-center gap-1.5 h-10 px-2 rounded-lg text-left transition-all',
                      isActive
                        ? 'bg-primary/10 ring-2 ring-primary shadow-sm'
                        : 'bg-card ring-1 ring-border/40 hover:bg-muted/40',
                    )}
                  >
                    <span className="text-sm leading-none">{cropEmoji(land.current_crop)}</span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold truncate leading-tight max-w-[80px]">
                        {land.name}
                      </p>
                      <p className="text-[9px] text-muted-foreground truncate leading-tight">
                        {land.area_acres?.toFixed(2)} ac
                        {land.last_ndvi_value != null && <span> · {land.last_ndvi_value.toFixed(2)}</span>}
                      </p>
                    </div>
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: dotColor }}
                      aria-hidden
                    />
                  </button>
                );
              })}
        </div>
        <ScrollBar orientation="horizontal" className="hidden" />
      </ScrollArea>

      {/* Stale banner — semantic warning tokens */}
      {hasStale && (
        <div className="px-3 pt-2">
          <div className="flex items-center gap-2 bg-warning/10 border border-warning/30 rounded-lg px-2.5 py-1.5">
            <CloudOff className="h-3.5 w-3.5 text-warning shrink-0" />
            <p className="text-[11px] text-warning-foreground leading-tight">
              {t(
                'ndvi.reliability.stale',
                'Latest satellite reading hidden — cloud cover or low coverage. Showing last clean observation.',
              )}
            </p>
          </div>
        </div>
      )}

      {/* 3-segment tabs */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="flex-1 flex flex-col">
        <div className="px-3 pt-2">
          <TabsList className="w-full grid grid-cols-3 h-10 rounded-xl bg-muted/40">
            <TabsTrigger value="now" className="rounded-lg text-xs gap-1">
              <Heart className="h-3.5 w-3.5" /> {t('ndvi.tab.now', 'Now')}
            </TabsTrigger>
            <TabsTrigger value="trend" className="rounded-lg text-xs gap-1">
              <BarChart3 className="h-3.5 w-3.5" /> {t('ndvi.tab.trend', 'Trend')}
            </TabsTrigger>
            <TabsTrigger value="map" className="rounded-lg text-xs gap-1">
              <MapIcon className="h-3.5 w-3.5" /> {t('ndvi.tab.map', 'Map')}
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ───────── NOW ───────── */}
        <TabsContent value="now" className="flex-1 px-3 pt-3 pb-24 space-y-3 mt-0">
          {isLoading ? (
            <Skeleton className="h-40 rounded-2xl" />
          ) : !current ? (
            <NoData />
          ) : (
            <>
              {/* Hero: compact 96px ring */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl p-4 bg-card border border-border/40 shadow-sm flex items-center gap-4"
              >
                <HealthRing ndvi={current.ndvi_value} />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {t('ndvi.now.status', 'Status')}
                  </p>
                  <p className="text-lg font-bold" style={{ color: ndviToColor(current.ndvi_value) }}>
                    {t(status!.labelKey, status!.label)}
                  </p>
                  {stageAware && stageAware.stageKey !== 'unknown' && stageAware.stageKey !== 'generic' && (
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {t(`ndvi.stage_aware.${stageAware.verdict}`, '{{verdict}} for stage', { verdict: stageAware.verdict })}
                      {' · '}
                      <span className="font-medium">
                        {t(`ndvi.stages.${stageAware.cropKey}.${stageAware.stageKey}`, stageAware.stageKey)}
                      </span>
                    </p>
                  )}
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-1">
                    <Calendar className="h-3 w-3" />
                    {new Date(current.date).toLocaleDateString()}
                  </p>
                </div>
              </motion.div>

              {/* Vital strip */}
              <div className="grid grid-cols-4 gap-2">
                <Vital label="NDVI" value={current.ndvi_value} colored />
                <Vital label="NDWI" value={current.ndwi_value} />
                <Vital
                  label={t('ndvi.now.cloud', 'Cloud')}
                  value={current.cloud_coverage}
                  suffix="%"
                  reverse
                />
                <Vital
                  label={t('ndvi.now.quality', 'Quality')}
                  value={current.quality_score != null ? current.quality_score * 100 : null}
                  suffix="%"
                />
              </div>

              {/* Field stats */}
              {(current.min_ndvi != null || current.max_ndvi != null) && (
                <Card className="rounded-2xl border-border/40">
                  <CardContent className="p-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                      {t('ndvi.now.field_stats', 'Field Statistics')}
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      <Mini label={t('ndvi.map.min', 'Min')} value={current.min_ndvi} />
                      <Mini label={t('ndvi.map.mean', 'Mean')} value={current.mean_ndvi ?? current.ndvi_value} emphasis />
                      <Mini label={t('ndvi.map.max', 'Max')} value={current.max_ndvi} />
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Guided actions (i18n keys, not LLM) */}
              <Card className="rounded-2xl border-border/40">
                <CardContent className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                      <Lightbulb className="h-3 w-3" /> {t('ndvi.now.guided_actions', 'Guided actions')}
                    </p>
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0">
                      {t('ndvi.now.rule_based', 'Rule-based')}
                    </Badge>
                  </div>
                  <ul className="space-y-1.5">
                    {(prediction?.recommended_action_keys ?? defaultActions(current.ndvi_value)).map((k) => (
                      <li key={k} className="text-xs flex items-start gap-2">
                        <span className="w-1 h-1 rounded-full bg-primary mt-1.5 shrink-0" />
                        <span>{t(k)}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              {current.metadata?.alerts && current.metadata.alerts.length > 0 && (
                <Card className="rounded-2xl border-amber-500/30 bg-amber-500/5">
                  <CardContent className="p-3 flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <div className="text-xs space-y-0.5">
                      {current.metadata.alerts.map((a, i) => (
                        <p key={i}>{a}</p>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        {/* ───────── TREND ───────── */}
        <TabsContent value="trend" className="flex-1 px-3 pt-3 pb-24 space-y-3 mt-0">
          {history.length < 2 ? (
            <Card className="rounded-2xl border-dashed">
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                {t('ndvi.trend.need_more', 'Need at least 2 clean observations for trend')}
              </CardContent>
            </Card>
          ) : (
            <>
              <NDVITrendChart
                data={history.map((d) => ({
                  date: d.date,
                  ndvi: d.ndvi_value,
                  evi: d.evi_value || 0,
                  ndwi: d.ndwi_value || 0,
                  savi: d.savi_value || 0,
                }))}
                selectedIndex="ndvi"
              />
              {prediction && (
                <Card className="rounded-2xl border-border/40">
                  <CardContent className="p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold flex items-center gap-1.5">
                        <Sparkles className="h-3.5 w-3.5 text-primary" />
                        {t('ndvi.projection.title', 'Indicative Projection')}
                      </p>
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 flex items-center gap-1">
                        <Info className="h-2.5 w-2.5" />
                        {t('ndvi.projection.indicative', 'Linear · Not AI')}
                      </Badge>
                    </div>
                    <Forecast label="7d" p={prediction.days7} />
                    <Forecast label="14d" p={prediction.days14} />
                    <p className="text-[10px] text-muted-foreground leading-snug">
                      {t(
                        'ndvi.projection.disclaimer',
                        'Linear extrapolation of recent clean readings only. Not a machine-learning forecast. Confidence drops with longer horizons.',
                      )}
                    </p>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        {/* ───────── MAP ───────── */}
        <TabsContent value="map" className="flex-1 px-0 pt-1 pb-16 mt-0">
          {selectedLandId && (
            <NDVIMapView
              landId={selectedLandId}
              boundary={boundary}
              centerLat={centerPoint.lat}
              centerLng={centerPoint.lng}
              areaAcres={selectedLand?.area_acres}
              currentCrop={selectedLand?.current_crop}
              landThumbnailUrl={selectedLand?.ndvi_thumbnail_url ?? null}
              landThumbnailDate={selectedLand?.last_ndvi_calculation ?? null}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function HealthRing({ ndvi }: { ndvi: number }) {
  const size = 96;
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = r * 2 * Math.PI;
  const offset = c - Math.max(0, Math.min(1, ndvi)) * c;
  const color = ndviToColor(ndvi);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round"
          stroke={color} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1, ease: 'easeOut' }} style={{ strokeDasharray: c }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-black" style={{ color }}>{formatNDVI(ndvi)}</span>
        <span className="text-[9px] uppercase tracking-widest text-muted-foreground">NDVI</span>
      </div>
    </div>
  );
}

function Vital({
  label, value, suffix, colored, reverse,
}: { label: string; value: number | null | undefined; suffix?: string; colored?: boolean; reverse?: boolean }) {
  const v = value == null ? null : value;
  return (
    <div className="rounded-xl bg-card border border-border/40 p-2 text-center">
      <p className="text-[9px] uppercase text-muted-foreground tracking-wider truncate">{label}</p>
      <p
        className="text-sm font-bold"
        style={
          colored && v != null
            ? { color: ndviToColor(v) }
            : reverse && v != null
            ? { color: v > 50 ? 'hsl(var(--destructive))' : v > 20 ? 'hsl(var(--warning, 38 92% 50%))' : undefined }
            : undefined
        }
      >
        {v != null ? `${v.toFixed(v >= 1 ? 0 : 2)}${suffix ?? ''}` : '—'}
      </p>
    </div>
  );
}

function Mini({ label, value, emphasis }: { label: string; value: number | null | undefined; emphasis?: boolean }) {
  return (
    <div className={cn('text-center p-2 rounded-lg', emphasis ? 'bg-primary/10 ring-1 ring-primary/20' : 'bg-muted/40')}>
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-sm font-bold" style={value != null ? { color: emphasis ? undefined : ndviToColor(value) } : {}}>
        {value != null ? value.toFixed(2) : '—'}
      </p>
    </div>
  );
}

function Forecast({ label, p }: { label: string; p: { predicted_ndvi: number; trend_direction: string; confidence: number } }) {
  const Icon = p.trend_direction === 'improving' ? TrendingUp : p.trend_direction === 'declining' ? TrendingDown : Minus;
  return (
    <div>
      <div className="flex justify-between items-center text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="flex items-center gap-1 font-semibold">
          <Icon className="h-3 w-3" /> {p.predicted_ndvi.toFixed(3)}
        </span>
      </div>
      <Progress value={p.predicted_ndvi * 100} className="h-1.5 mt-1" />
      <p className="text-[9px] text-muted-foreground text-right mt-0.5">{p.confidence}% confidence</p>
    </div>
  );
}

function NoData() {
  const { t } = useTranslation();
  return (
    <Card className="rounded-2xl border-dashed">
      <CardContent className="py-10 text-center space-y-2">
        <Satellite className="h-8 w-8 text-muted-foreground/40 mx-auto" />
        <p className="text-sm text-muted-foreground">{t('ndvi.no_clean', 'No clean satellite reading yet')}</p>
        <p className="text-[11px] text-muted-foreground">{t('ndvi.check_back', 'Check after next satellite pass')}</p>
      </CardContent>
    </Card>
  );
}

function defaultActions(ndvi: number): string[] {
  if (ndvi < NDVI_THRESHOLDS.POOR) return ['ndvi.actions.irrigate_immediately', 'ndvi.actions.contact_expert'];
  if (ndvi < NDVI_THRESHOLDS.MODERATE) return ['ndvi.actions.increase_irrigation', 'ndvi.actions.check_nutrients'];
  if (ndvi < NDVI_THRESHOLDS.HEALTHY) return ['ndvi.actions.maintain_water', 'ndvi.actions.continue_monitoring'];
  return ['ndvi.actions.maintain_water', 'ndvi.actions.continue_monitoring'];
}
