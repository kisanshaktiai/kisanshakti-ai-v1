import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, useReducedMotion } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Satellite, Sun, Map as MapIcon, LineChart, CloudOff, Sprout } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { landsApi } from '@/services/landsApi';
import { useFieldSky } from '@/hooks/useFieldSky';
import { FieldStateCard } from '@/components/land/sky/FieldStateCard';
import { NeighbourCard } from '@/components/land/sky/NeighbourCard';
import { WaterCard } from '@/components/land/sky/WaterCard';
import { SkyCard } from '@/components/land/sky/SkyCard';
import { AskCard } from '@/components/land/sky/AskCard';
import { AttentionCard } from '@/components/land/sky/AttentionCard';
import { DetailsCard } from '@/components/land/sky/DetailsCard';
import { SeasonCard } from '@/components/land/sky/SeasonCard';
import { FieldSkyMap } from '@/components/land/sky/FieldSkyMap';
import { useAuthStore } from '@/stores/authStore';
import { useTenant } from '@/contexts/TenantContext';
import { useToast } from '@/hooks/use-toast';
import { useTextToSpeech } from '@/hooks/useTextToSpeech';
import { useLandCropIcons } from '@/hooks/useLandCropIcons';
import { cn } from '@/lib/utils';

interface LandRow { id: string; name: string; area_acres: number; current_crop?: string; current_crop_id?: string | null; stage_uuid?: string | null; boundary_polygon_old?: { coordinates?: number[][][] } | null; center_point_old?: { coordinates?: number[] } | null; last_ndvi_value?: number; ndvi_thumbnail_url?: string | null; last_ndvi_calculation?: string | null; }
// Every satellite query the screen is built from (see useFieldSky); the refresh button reloads all of them.
const SKY_QUERY_KEYS = ['ndvi-analysis', 'field-sky-intel', 'field-sky-radar', 'field-sky-schedule', 'land-weather-state'];
// One short sequence when a field's cards arrive (and again when the farmer picks another field).
const CARD_SEQUENCE = { hidden: {}, shown: { transition: { staggerChildren: 0.06 } } };
const CARD_ITEM = { hidden: { opacity: 0, y: 10 }, shown: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' as const } } };

/**
 * "My field from the sky." Every card shows a picture, a comparison and one
 * sentence. Values are read from governed sources (see useFieldSky); this page
 * holds no agronomic thresholds and issues no recommendations — the ask-back
 * card hands the question to the farmer's own eyes and camera.
 */
export default function NDVIAnalysis() {
  const { t } = useTranslation(); const navigate = useNavigate(); const { id: urlLandId } = useParams<{ id?: string }>();
  const { session } = useAuthStore(); const { tenant } = useTenant(); const { toast } = useToast(); const { speak, isSpeaking, stop } = useTextToSpeech(); const queryClient = useQueryClient(); const reduceMotion = useReducedMotion();
  const [selectedLandId, setSelectedLandId] = useState<string | null>(urlLandId || null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [tab, setTab] = useState<'today' | 'map' | 'season'>('today');
  // Cost: a Google map is billed when it is CREATED. Create it only when the farmer first opens
  // the Map tab; after that keep it mounted (forceMount + hidden) so switching tabs never re-bills.
  const [mapOpened, setMapOpened] = useState(false);
  useEffect(() => { if (tab === 'map') setMapOpened(true); }, [tab]);
  type SkyTab = 'today' | 'map' | 'season';

  const tenantId = session?.tenantId ?? tenant?.id;
  const { data: lands = [], isLoading: landsLoading, refetch: refetchLands } = useQuery({ queryKey: ['lands', session?.farmerId, tenantId], queryFn: async () => ((await landsApi.fetchLands()) || []) as LandRow[], enabled: !!session?.farmerId && !!tenantId });
  const hasSatellite = (l: LandRow) => l.last_ndvi_value != null || !!l.last_ndvi_calculation;
  const landsWithData = useMemo(() => lands.filter(hasSatellite), [lands]);
  useEffect(() => { if (!selectedLandId && lands.length) setSelectedLandId((landsWithData[0] ?? lands[0]).id); }, [lands, landsWithData, selectedLandId]);
  const selectedLand = lands.find(l => l.id === selectedLandId) || null;
  // each land's crop icon comes from the crops master (crops.icon), not from a crop list in code
  const cropIcons = useLandCropIcons(lands);

  const sky = useFieldSky(selectedLandId, reloadKey);

  const onRefresh = async () => { setIsRefreshing(true); setReloadKey(k => k + 1); await Promise.all([refetchLands(), ...SKY_QUERY_KEYS.map(key => queryClient.invalidateQueries({ queryKey: [key] }))]); toast({ title: t('ndvi.refresh.data_refreshed', 'Data refreshed') }); setIsRefreshing(false); };
  const onSpeak = (text: string) => { if (isSpeaking) return stop(); speak(text); };

  const boundary = useMemo(() => { const coords = selectedLand?.boundary_polygon_old?.coordinates?.[0]; return coords ? coords.map((c: number[]) => ({ lat: c[1], lng: c[0] })) : []; }, [selectedLand]);
  const centerPoint = useMemo(() => { const c = selectedLand?.center_point_old?.coordinates; return c ? { lat: c[1], lng: c[0] } : { lat: 20.5937, lng: 78.9629 }; }, [selectedLand]);
  // Back: return to the previous screen; when opened directly (no in-app history) go to Home instead of leaving the app.
  const goBack = () => { const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0; if (idx > 0) navigate(-1); else navigate('/app', { replace: true }); };
  const landName = selectedLand?.name || t('sky.your_field', 'your field');

  return <div className="min-h-full bg-background flex flex-col">
    <Tabs value={tab} onValueChange={v => setTab(v as SkyTab)} className="flex-1 flex flex-col">
    <header className="sticky top-0 z-30 bg-background border-b border-border/40 shadow-sm">
      <div className="flex items-center gap-1 px-2 h-12">
        <Button variant="ghost" size="icon" aria-label={t('common.back', 'Back')} onClick={goBack} className="h-10 w-10 rounded-full shrink-0 active:scale-95"><ArrowLeft className="h-5 w-5" /></Button>
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="relative h-8 w-8 rounded-full bg-primary/15 grid place-items-center shrink-0">
            <Satellite className="h-4 w-4 text-primary" />
            {!reduceMotion && <span className="absolute inset-0 rounded-full border border-primary/40 animate-ping" />}
          </span>
          <div className="min-w-0"><h1 className="text-sm font-bold truncate leading-tight">{t('sky.title', 'My field from the sky')}</h1>
            {selectedLand && <p className="text-[11px] text-muted-foreground truncate leading-tight">{selectedLand.name} · {selectedLand.area_acres} ac</p>}</div>
        </div>
        <Button variant="ghost" size="icon" aria-label={t('ndvi.refresh.button', 'Refresh')} onClick={onRefresh} disabled={isRefreshing} className="h-10 w-10 rounded-full shrink-0"><RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} /></Button>
      </div>
      <div className="flex gap-2 px-3 py-1.5 mb-1 scroll-px-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden snap-x">
        {landsLoading ? [1, 2, 3].map(i => <Skeleton key={i} className="h-8 w-24 rounded-full shrink-0" />) : lands.map(land => {
          const active = land.id === selectedLandId;
          return <button key={land.id} onClick={() => setSelectedLandId(land.id)} aria-pressed={active} className={cn('snap-start shrink-0 flex items-center gap-1.5 pl-1 pr-3 h-9 rounded-full border text-xs font-semibold transition active:scale-95', active ? 'bg-primary text-primary-foreground border-primary shadow-md' : 'bg-card border-border/50 text-muted-foreground')}>
            <span className={cn('h-6 w-6 rounded-full grid place-items-center text-sm', active ? 'bg-primary-foreground/20' : 'bg-muted')}>{cropIcons[land.id] ?? <Sprout className="h-3.5 w-3.5" aria-hidden />}</span>
            <span className="truncate max-w-[110px]">{land.name}</span>
            {hasSatellite(land) && <span className={cn('h-1.5 w-1.5 rounded-full', active ? 'bg-primary-foreground' : 'bg-success')} aria-hidden />}
          </button>;
        })}
      </div>
      <div className="px-3 pb-2.5"><TabsList className="w-full grid grid-cols-3 h-10 rounded-full bg-muted/60 p-1">
        <TabsTrigger value="today" className="rounded-full text-xs gap-1 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow"><Sun className="h-3.5 w-3.5" />{t('sky.tab.today', 'Today')}</TabsTrigger>
        <TabsTrigger value="map" className="rounded-full text-xs gap-1 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow"><MapIcon className="h-3.5 w-3.5" />{t('sky.tab.map', 'Map')}</TabsTrigger>
        <TabsTrigger value="season" className="rounded-full text-xs gap-1 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow"><LineChart className="h-3.5 w-3.5" />{t('sky.tab.season', 'Season')}</TabsTrigger>
      </TabsList></div>
    </header>

      <TabsContent value="today" className="flex-1 px-3 pt-3 pb-28 flex flex-col gap-3 mt-0 data-[state=inactive]:hidden">
        {sky.loading ? <><Skeleton className="h-24 rounded-3xl" /><Skeleton className="h-32 rounded-3xl" /><Skeleton className="h-24 rounded-3xl" /></>
        : sky.error ? <Card className="rounded-3xl border-destructive/40"><CardContent className="py-8 text-center space-y-2"><CloudOff className="h-5 w-5 mx-auto text-destructive" /><p className="text-sm text-destructive">{t('ndvi.error.load_failed', 'Could not load satellite data. Please try again.')}</p><Button variant="outline" size="sm" onClick={onRefresh} className="rounded-lg">{t('ndvi.error.retry', 'Retry')}</Button></CardContent></Card>
        : <motion.div key={selectedLandId ?? 'none'} variants={CARD_SEQUENCE} initial={reduceMotion ? false : 'hidden'} animate="shown" className="flex flex-col gap-3">
          <motion.div variants={CARD_ITEM}><FieldStateCard sky={sky} landName={landName} landId={selectedLandId} farmerId={session?.farmerId} tenantId={tenantId} onSpeak={onSpeak} isSpeaking={isSpeaking} onOpenMap={() => setTab('map')} /></motion.div>
          <motion.div variants={CARD_ITEM}><SkyCard sky={sky} /></motion.div>
          {selectedLandId && session?.farmerId && tenantId && <motion.div variants={CARD_ITEM} className="empty:hidden"><AttentionCard sky={sky} landId={selectedLandId} cropName={selectedLand?.current_crop} farmerId={session.farmerId} tenantId={tenantId} onShowOnMap={() => setTab('map')} /></motion.div>}
          <motion.div variants={CARD_ITEM}><NeighbourCard sky={sky} /></motion.div>
          <motion.div variants={CARD_ITEM}><WaterCard sky={sky} /></motion.div>
          {selectedLandId && session?.farmerId && tenantId && <motion.div variants={CARD_ITEM} className="empty:hidden"><AskCard sky={sky} landId={selectedLandId} cropName={selectedLand?.current_crop} farmerId={session.farmerId} tenantId={tenantId} /></motion.div>}
          <motion.div variants={CARD_ITEM}><DetailsCard sky={sky} /></motion.div>
        </motion.div>}
      </TabsContent>

      {/* forceMount: Radix unmounts inactive tabs, and every remount of the Google map is a billable load. Keep it alive, hide it. */}
      <TabsContent value="map" forceMount className={cn('px-0 pt-2 pb-0 mt-0', tab !== 'map' && 'hidden')}>
        {mapOpened && selectedLandId && <FieldSkyMap sky={sky} landId={selectedLandId} farmerId={session?.farmerId} tenantId={tenantId} boundary={boundary} centerLat={centerPoint.lat} centerLng={centerPoint.lng} />}
      </TabsContent>

      <TabsContent value="season" className="flex-1 px-3 pt-3 pb-24 space-y-3 mt-0">
        {sky.loading ? <Skeleton className="h-56 rounded-3xl" /> : <><SeasonCard sky={sky} /><SkyCard sky={sky} /></>}
      </TabsContent>
    </Tabs>
  </div>;
}
