import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Satellite, Sun, Map as MapIcon, LineChart, CloudOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
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
import { cn } from '@/lib/utils';

interface LandRow { id: string; name: string; area_acres: number; current_crop?: string; boundary_polygon_old?: { coordinates?: number[][][] } | null; center_point_old?: { coordinates?: number[] } | null; last_ndvi_value?: number; ndvi_thumbnail_url?: string | null; last_ndvi_calculation?: string | null; }
const CROP_EMOJI: Record<string, string> = { sugarcane: '🎋', maize: '🌽', corn: '🌽', wheat: '🌾', rice: '🌾', cotton: '🪻' };
function cropEmoji(crop?: string) { if (!crop) return '🌱'; const k = crop.toLowerCase(); for (const key of Object.keys(CROP_EMOJI)) if (k.includes(key)) return CROP_EMOJI[key]; return '🌱'; }

/**
 * "My field from the sky." Every card shows a picture, a comparison and one
 * sentence. Values are read from governed sources (see useFieldSky); this page
 * holds no agronomic thresholds and issues no recommendations — the ask-back
 * card hands the question to the farmer's own eyes and camera.
 */
export default function NDVIAnalysis() {
  const { t } = useTranslation(); const navigate = useNavigate(); const { id: urlLandId } = useParams<{ id?: string }>();
  const { session } = useAuthStore(); const { tenant } = useTenant(); const { toast } = useToast(); const { speak, isSpeaking, stop } = useTextToSpeech();
  const [selectedLandId, setSelectedLandId] = useState<string | null>(urlLandId || null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [tab, setTab] = useState<'today' | 'map' | 'season'>('today');
  type SkyTab = 'today' | 'map' | 'season';

  const tenantId = session?.tenantId ?? tenant?.id;
  const { data: lands = [], isLoading: landsLoading, refetch: refetchLands } = useQuery({ queryKey: ['lands', session?.farmerId, tenantId], queryFn: async () => ((await landsApi.fetchLands()) || []) as LandRow[], enabled: !!session?.farmerId && !!tenantId });
  const hasSatellite = (l: LandRow) => l.last_ndvi_value != null || !!l.last_ndvi_calculation;
  const landsWithData = useMemo(() => lands.filter(hasSatellite), [lands]);
  useEffect(() => { if (!selectedLandId && lands.length) setSelectedLandId((landsWithData[0] ?? lands[0]).id); }, [lands, landsWithData, selectedLandId]);
  const selectedLand = lands.find(l => l.id === selectedLandId) || null;

  const sky = useFieldSky(selectedLandId);

  const onRefresh = async () => { setIsRefreshing(true); await refetchLands(); toast({ title: t('ndvi.refresh.data_refreshed', 'Data refreshed') }); setIsRefreshing(false); };
  const onSpeak = (text: string) => { if (isSpeaking) return stop(); speak(text); };

  const boundary = useMemo(() => { const coords = selectedLand?.boundary_polygon_old?.coordinates?.[0]; return coords ? coords.map((c: number[]) => ({ lat: c[1], lng: c[0] })) : []; }, [selectedLand]);
  const centerPoint = useMemo(() => { const c = selectedLand?.center_point_old?.coordinates; return c ? { lat: c[1], lng: c[0] } : { lat: 20.5937, lng: 78.9629 }; }, [selectedLand]);
  const landName = selectedLand?.name || t('sky.your_field', 'your field');

  return <div className="min-h-full bg-background flex flex-col">
    <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border/40">
      <div className="flex items-center justify-between px-2 h-11">
        <div className="flex items-center gap-1.5 min-w-0">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="h-9 w-9 rounded-xl shrink-0"><ArrowLeft className="h-4 w-4" /></Button>
          <h1 className="text-sm font-bold truncate">{t('sky.title', 'My field from the sky')}</h1><Satellite className="h-3.5 w-3.5 text-primary shrink-0" />
        </div>
        <Button variant="ghost" size="icon" onClick={onRefresh} disabled={isRefreshing} className="h-9 w-9 rounded-xl"><RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} /></Button>
      </div>
    </header>

    <ScrollArea className="w-full shrink-0 border-b border-border/40 bg-card/40"><div className="flex gap-1.5 px-2 py-2">
      {landsLoading ? [1, 2, 3].map(i => <Skeleton key={i} className="h-11 w-[110px] rounded-xl shrink-0" />) : lands.map(land => (
        <button key={land.id} onClick={() => setSelectedLandId(land.id)} className={cn('shrink-0 flex items-center gap-2 px-3 h-11 rounded-xl border text-left transition', land.id === selectedLandId ? 'bg-primary/10 border-primary text-foreground' : 'bg-card border-border/40 text-muted-foreground')}>
          <span className="text-base">{cropEmoji(land.current_crop)}</span>
          <span className="min-w-0"><span className="block text-xs font-semibold truncate max-w-[96px]">{land.name}</span><span className="block text-[10px] opacity-70">{land.area_acres} ac</span></span>
        </button>))}
    </div><ScrollBar orientation="horizontal" /></ScrollArea>

    <Tabs value={tab} onValueChange={v => setTab(v as SkyTab)} className="flex-1 flex flex-col">
      <div className="px-3 pt-2"><TabsList className="w-full grid grid-cols-3 h-11 rounded-2xl bg-muted/40">
        <TabsTrigger value="today" className="rounded-xl text-xs gap-1"><Sun className="h-3.5 w-3.5" />{t('sky.tab.today', 'Today')}</TabsTrigger>
        <TabsTrigger value="map" className="rounded-xl text-xs gap-1"><MapIcon className="h-3.5 w-3.5" />{t('sky.tab.map', 'Map')}</TabsTrigger>
        <TabsTrigger value="season" className="rounded-xl text-xs gap-1"><LineChart className="h-3.5 w-3.5" />{t('sky.tab.season', 'Season')}</TabsTrigger>
      </TabsList></div>

      <TabsContent value="today" className="flex-1 px-3 pt-3 pb-24 space-y-3 mt-0">
        {sky.loading ? <><Skeleton className="h-24 rounded-3xl" /><Skeleton className="h-32 rounded-3xl" /><Skeleton className="h-24 rounded-3xl" /></>
        : sky.error ? <Card className="rounded-3xl border-destructive/40"><CardContent className="py-8 text-center space-y-2"><CloudOff className="h-5 w-5 mx-auto text-destructive" /><p className="text-sm text-destructive">{t('ndvi.error.load_failed', 'Could not load satellite data. Please try again.')}</p><Button variant="outline" size="sm" onClick={onRefresh} className="rounded-lg">{t('ndvi.error.retry', 'Retry')}</Button></CardContent></Card>
        : <>
          <FieldStateCard sky={sky} landName={landName} onSpeak={onSpeak} isSpeaking={isSpeaking} />
          <SkyCard sky={sky} />
          {selectedLandId && session?.farmerId && tenantId && <AttentionCard sky={sky} landId={selectedLandId} cropName={selectedLand?.current_crop} farmerId={session.farmerId} tenantId={tenantId} onShowOnMap={() => setTab('map')} />}
          <NeighbourCard sky={sky} />
          <WaterCard sky={sky} />
          {selectedLandId && session?.farmerId && tenantId && <AskCard sky={sky} landId={selectedLandId} cropName={selectedLand?.current_crop} farmerId={session.farmerId} tenantId={tenantId} />}
          <DetailsCard sky={sky} />
        </>}
      </TabsContent>

      {/* forceMount: Radix unmounts inactive tabs, and every remount of the Google map is a billable load. Keep it alive, hide it. */}
      <TabsContent value="map" forceMount className={cn('flex-1 px-0 pt-1 pb-16 mt-0', tab !== 'map' && 'hidden')}>
        {selectedLandId && <FieldSkyMap sky={sky} landId={selectedLandId} boundary={boundary} centerLat={centerPoint.lat} centerLng={centerPoint.lng} />}
      </TabsContent>

      <TabsContent value="season" className="flex-1 px-3 pt-3 pb-24 space-y-3 mt-0">
        {sky.loading ? <Skeleton className="h-56 rounded-3xl" /> : <><SeasonCard sky={sky} /><SkyCard sky={sky} /></>}
      </TabsContent>
    </Tabs>
  </div>;
}
