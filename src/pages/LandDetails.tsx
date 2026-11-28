import { lazy, Suspense, useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useCropNames } from '@/hooks/useCropNames';
import { 
  ArrowLeft, Edit, Trash2, Share2, Download, MapPin, 
  Droplets, Mountain, Sprout, Calendar, Camera, Activity,
  AlertTriangle, TrendingUp, History, FileText, Plus
} from 'lucide-react';
import { LandSoilSummary } from '@/components/soil/LandSoilSummary';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useAuthStore } from '@/stores/authStore';
import { landsApi } from '@/services/landsApi';
import { isolatedSupabase } from '@/services/dataIsolationService';
import { supabase } from '@/integrations/supabase/client';
import { LandDetailsSkeleton } from '@/components/skeletons';
import { FarmIntelligenceCard } from '@/components/farm-intelligence/FarmIntelligenceCard';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useLocalizedPlace } from '@/hooks/useLocalizedPlace';
import { useFieldSky } from '@/hooks/useFieldSky';
import { landAttributeLabel } from '@/lib/landLabels';
import { FieldScene } from '@/living/FieldScene';
import { normaliseRing, ringFromBoundary } from '@/living/fieldGeometry';
import { rememberChosenLand } from '@/living/useChosenLand';
import '@/living/living.css';

// The charts carry the chart library; they are fetched when their tab is first opened.
const LandActivityChart = lazy(() => import('@/components/land/LandDetailsCharts').then((m) => ({ default: m.LandActivityChart })));
const LandYieldChart = lazy(() => import('@/components/land/LandDetailsCharts').then((m) => ({ default: m.LandYieldChart })));

interface Land {
  id: string;
  name: string;
  area_acres: number;
  area_guntas?: number;
  village?: string;
  taluka?: string;
  district?: string;
  state?: string;
  current_crop?: string;
  crop_stage?: string;
  soil_type?: string;
  irrigation_source?: string;
  water_source?: string;
  soil_ph?: number;
  organic_carbon_percent?: number;
  nitrogen_kg_per_ha?: number;
  phosphorus_kg_per_ha?: number;
  potassium_kg_per_ha?: number;
  survey_number?: string;
  ownership_type?: string;
  last_soil_test_date?: string;
  soil_data_source?: string;
  last_sowing_date?: string;
  expected_harvest_date?: string;
  created_at: string;
  updated_at: string;
}

interface LandActivity {
  id: string;
  activity_date: string;
  activity_type: string;
  description?: string;
  cost?: number;
  quantity?: number;
  unit?: string;
  notes?: string;
}

interface CropHistory {
  id: string;
  crop_name: string;
  variety?: string;
  planting_date: string;
  harvest_date?: string;
  yield_kg_per_acre?: number;
  growth_stage?: string;
  season?: string;
  status?: string;
  notes?: string;
}

export default function LandDetails() {
  const { id } = useParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const numLocale = `${i18n.language || 'en'}-IN-u-nu-latn`;
  const cropNameOf = useCropNames();
  const { join: joinPlace, place: placeName } = useLocalizedPlace();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuthStore();
  
  const [land, setLand] = useState<Land | null>(null);
  const [activities, setActivities] = useState<LandActivity[]>([]);
  const [cropHistory, setCropHistory] = useState<CropHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  // This page is one land's own context: the same land stays chosen on Field, Day and Land afterwards.
  useEffect(() => { if (id) rememberChosenLand(id); }, [id]);
  // Crop stage and water for this land, from the same hook the Field home uses.
  const sky = useFieldSky(id ?? null);

  useEffect(() => {
    if (id) {
      fetchLandDetails();
      fetchActivities();
      fetchCropHistory();
    }
  }, [id]);

  // Real-time subscription for land data
  useEffect(() => {
    if (!id) return;

    const landChannel = supabase
      .channel(`land-${id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'lands',
        filter: `id=eq.${id}`
      }, () => {
        console.log('🔄 Land data changed, refetching...');
        fetchLandDetails();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(landChannel);
    };
  }, [id]);

  // Real-time subscription for land activities
  useEffect(() => {
    if (!id) return;

    const activitiesChannel = supabase
      .channel(`land-activities-${id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'land_activities',
        filter: `land_id=eq.${id}`
      }, () => {
        console.log('🔄 Land activities changed, refetching...');
        fetchActivities();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(activitiesChannel);
    };
  }, [id]);

  const fetchLandDetails = async () => {
    if (!id || !user?.id) return;
    
    try {
      const data = await landsApi.fetchLandById(id);
      
      if (!data) {
        toast({
          title: t('lands.details.error.not_found_title'),
          description: t('lands.details.error.not_found_message'),
          variant: 'destructive',
        });
        navigate('/app/lands');
        return;
      }
      
      setLand(data as Land);
    } catch (error) {
      console.error('Error fetching land details:', error);
      toast({
        title: t('lands.details.error.not_found_title'),
        description: t('lands.details.error.fetch_failed'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchActivities = async () => {
    if (!id) return;
    
    try {
      const { data, error } = await isolatedSupabase
        .from('land_activities')
        .select('*')
        .eq('land_id', id)
        .order('activity_date', { ascending: false })
        .limit(10);

      if (error) throw error;
      setActivities(data || []);
    } catch (error) {
      console.error('Error fetching activities:', error);
    }
  };

  const fetchCropHistory = async () => {
    if (!id) return;
    
    try {
      const { data, error } = await isolatedSupabase
        .from('crop_history')
        .select('*')
        .eq('land_id', id)
        .order('planting_date', { ascending: false });

      if (error) throw error;
      setCropHistory(data || []);
    } catch (error) {
      console.error('Error fetching crop history:', error);
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    
    try {
      await landsApi.deleteLand(id);

      toast({
        title: t('lands.details.delete.success_title'),
        description: t('lands.details.delete.success_message'),
      });
      navigate('/app/lands');
    } catch (error) {
      console.error('Error deleting land:', error);
      toast({
        title: t('lands.details.delete.error_title'),
        description: t('lands.details.delete.error_message'),
        variant: 'destructive',
      });
    }
  };

  // A health score is only shown for measured soil (lab or device). A soil-map
  // estimate has no plant-available N, P, K, so it is labelled, not scored.
  const soilIsEstimate = land?.soil_data_source === 'soilgrid';
  const getSoilHealthScore = () => {
    if (soilIsEstimate) return null;
    if (!land?.soil_ph && !land?.organic_carbon_percent && !land?.nitrogen_kg_per_ha) return null;
    
    let score = 0;
    let factors = 0;
    
    if (land.soil_ph) {
      factors++;
      if (land.soil_ph >= 6.0 && land.soil_ph <= 7.5) score += 100;
      else if (land.soil_ph >= 5.5 && land.soil_ph <= 8.0) score += 70;
      else score += 40;
    }
    
    if (land.organic_carbon_percent) {
      factors++;
      if (land.organic_carbon_percent >= 0.75) score += 100;
      else if (land.organic_carbon_percent >= 0.5) score += 70;
      else score += 40;
    }
    
    if (land.nitrogen_kg_per_ha) {
      factors++;
      if (land.nitrogen_kg_per_ha >= 280) score += 100;
      else if (land.nitrogen_kg_per_ha >= 140) score += 70;
      else score += 40;
    }
    
    return factors > 0 ? Math.round(score / factors) : null;
  };

  const soilHealthScore = getSoilHealthScore();
  

  const activityData = activities.reduce((acc: any[], activity) => {
    const date = new Date(activity.activity_date).toLocaleDateString(numLocale, { month: 'short', day: 'numeric' });
    const existing = acc.find(item => item.date === date);
    
    if (existing) {
      existing.activities++;
      existing.cost = (existing.cost || 0) + (activity.cost || 0);
    } else {
      acc.push({
        date,
        activities: 1,
        cost: activity.cost || 0,
      });
    }
    
    return acc;
  }, []);

  const yieldData = cropHistory.map(crop => ({
    crop: crop.crop_name,
    yield: crop.yield_kg_per_acre || 0,
    revenue: 0, // Revenue data not available in current schema
  }));

  const ring = useMemo(() => {
    const raw = ringFromBoundary((land as { boundary_polygon_old?: unknown } | null)?.boundary_polygon_old);
    return raw ? normaliseRing(raw) : null;
  }, [land]);

  if (loading) {
    return <LandDetailsSkeleton />;
  }

  if (!land) {
    return (
      <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
        <p className="lf-lab font-normal text-muted-foreground">{t('lands.details.not_found')}</p>
        <button type="button" onClick={() => navigate('/app/lands')} className="lf-lab rounded-full bg-primary px-6 text-primary-foreground" style={{ minHeight: 'var(--lf-tap)' }}>
          {t('lands.details.back_to_lands')}
        </button>
      </div>
    );
  }

  const day = (value: string, withYear = false) =>
    new Date(value).toLocaleDateString(numLocale, withYear ? { day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' });
  const stageProgress = sky.cropActive && sky.stage.index != null && sky.stage.ladder.length > 1
    ? sky.stage.index / (sky.stage.ladder.length - 1)
    : null;
  const irrigationNeeded = sky.cropActive ? sky.water.irrigationNeeded : null;
  const place = joinPlace({ village: land.village, taluka: land.taluka || undefined, district: land.taluka ? undefined : land.district }, ['village','taluka','district']);

  const card = 'rounded-[var(--lf-r)] border border-border bg-card shadow-sm';
  const pad = { padding: 'clamp(12px, 3.6vw, 18px)' } as const;
  const gut = { padding: '0 var(--lf-gut)' } as const;
  const tap = { minHeight: 'var(--lf-tap)' } as const;
  const round = 'lf-round shrink-0 border border-border bg-card';
  const solid = 'lf-lab flex shrink-0 items-center justify-center gap-2 rounded-full bg-primary px-4 text-primary-foreground';
  const tabs: Array<{ id: string; icon: typeof FileText; label: string }> = [
    { id: 'overview', icon: FileText, label: t('lands.details.tabs.overview') },
    { id: 'soil', icon: Mountain, label: t('lands.details.tabs.soil') },
    { id: 'activities', icon: Activity, label: t('lands.details.tabs.activities') },
    { id: 'history', icon: History, label: t('lands.details.tabs.history') },
    { id: 'gallery', icon: Camera, label: t('lands.details.tabs.gallery') },
  ];
  const info: Array<{ label: string; value: string }> = [
    { label: t('lands.details.survey_number_label'), value: land.survey_number || t('lands.details.not_available') },
    { label: t('lands.details.ownership_type_label'), value: landAttributeLabel(t, 'ownership_type', land.ownership_type) || t('lands.details.not_specified') },
    { label: t('lands.details.soil_type_label'), value: landAttributeLabel(t, 'soil_type', land.soil_type) || t('lands.details.not_specified') },
    { label: t('lands.details.location_label'), value: joinPlace(land) || t('lands.details.not_specified') },
    ...(land.last_sowing_date ? [{ label: t('lands.details.last_sowing'), value: day(land.last_sowing_date, true) }] : []),
    ...(land.expected_harvest_date ? [{ label: t('lands.details.expected_harvest'), value: day(land.expected_harvest_date, true) }] : []),
  ];
  const empty = (Icon: typeof FileText, text: string, more?: string) => (
    <div className="flex flex-col items-center gap-2 py-8 text-center">
      <span className="grid h-16 w-16 place-items-center rounded-[32%] bg-muted text-muted-foreground"><Icon className="h-8 w-8" aria-hidden /></span>
      <p className="lf-lab font-normal text-muted-foreground">{text}</p>
      {more && <p className="lf-cap text-muted-foreground">{more}</p>}
    </div>
  );
  const chartWait = <div className="h-[260px] rounded-2xl bg-muted" aria-hidden />;

  return (
    <div className="flex min-h-full flex-col gap-3 bg-background pb-4" style={{ fontSize: 'var(--lf-fs-body)', lineHeight: 1.55 }}>
      {/* This land: its name, and its own shape with today's crop and water */}
      <div className="sticky top-0 z-20 flex items-center gap-2 border-b border-border bg-background py-2" style={gut}>
        <button type="button" onClick={() => navigate('/app/lands')} aria-label={t('common.back')} className={`${round} text-foreground`}>
          <ArrowLeft size={22} className="rtl:rotate-180" aria-hidden />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="lf-head truncate">{land.name}</h1>
          {place && <p className="lf-cap flex items-center gap-1 text-muted-foreground"><MapPin size={14} className="shrink-0" aria-hidden /><span className="min-w-0 truncate">{place}</span></p>}
        </div>
        <button type="button" onClick={() => navigate(`/app/lands/${id}/edit`)} aria-label={t('lands.card.edit')} className={`${round} text-primary`}>
          <Edit size={20} aria-hidden />
        </button>
        <button type="button" onClick={() => setShowDeleteDialog(true)} aria-label={t('lands.card.delete')} className={`${round} text-destructive`}>
          <Trash2 size={20} aria-hidden />
        </button>
      </div>

      <div className="lf-scene lf-scene-land">
        <FieldScene
          ring={ring}
          stageProgress={stageProgress}
          irrigationNeeded={irrigationNeeded}
          sun={null}
          cloudy={false}
          raining={false}
          showSunPath={false}
          pins={[]}
          stageLabel={sky.cropActive && sky.stage.das != null ? t('living.scene.day', { day: sky.stage.das }) : null}
          waterLabel={irrigationNeeded == null ? null : t(irrigationNeeded ? 'living.scene.water_low' : 'living.scene.water_ok')}
          ariaLabel={t('living.scene.label', { land: land.name })}
        />
      </div>

      {/* Four facts about this land */}
      <section className="grid grid-cols-2 gap-2" style={gut}>
        <div className={`${card} min-w-0`} style={pad}>
          <p className="lf-cap flex items-center gap-1.5 text-muted-foreground"><MapPin size={16} className="shrink-0 text-primary" aria-hidden /><span className="min-w-0 truncate">{t('lands.details.total_area')}</span></p>
          <p className="lf-stat mt-1" style={{ fontSize: 'var(--lf-fs-head)' }}>{land.area_acres}</p>
          <p className="lf-cap text-muted-foreground">{t('lands.map.area.acres')}{land.area_guntas ? ` · ${land.area_guntas} ${t('lands.map.area.guntha')}` : ''}</p>
        </div>

        <div className={`${card} min-w-0`} style={pad}>
          <p className="lf-cap flex items-center gap-1.5 text-muted-foreground"><Sprout size={16} className="shrink-0 text-success" aria-hidden /><span className="min-w-0 truncate">{t('lands.details.current_crop')}</span></p>
          <p className="lf-head mt-1" style={{ overflowWrap: 'anywhere' }}>
            {land.current_crop ? cropNameOf(land.current_crop, (land as { current_crop_id?: string | null }).current_crop_id) : t('lands.details.no_crop')}
          </p>
          {land.crop_stage && (
            <span className="lf-pill lf-pill-sm mt-1 bg-success/15 text-success">
              {t(`schedule.graphical.stages.${String(land.crop_stage).toLowerCase().replace(/[^a-z0-9]+/g, '_')}`, { defaultValue: land.crop_stage })}
            </span>
          )}
        </div>

        <div className={`${card} min-w-0`} style={pad}>
          <p className="lf-cap flex items-center gap-1.5 text-muted-foreground"><Mountain size={16} className="shrink-0 text-warning" aria-hidden /><span className="min-w-0 truncate">{t('lands.details.soil_health')}</span></p>
          {soilHealthScore === null ? (
            <button type="button" onClick={() => navigate(`/app/lands/${id}/soil`)} className="mt-1 block w-full text-start" style={tap}>
              <span className="lf-lab block" style={{ overflowWrap: 'anywhere' }}>{t(soilIsEstimate ? 'soil.sourceTypes.satellite' : 'lands.details.not_tested')}</span>
              <span className="lf-cap block font-bold text-primary">{t(soilIsEstimate ? 'soil.needsLab' : 'lands.details.add_soil_test')} →</span>
            </button>
          ) : (
            <>
              <div className="mt-1 flex items-center gap-2">
                <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden><span className="block h-full rounded-full bg-success" style={{ width: `${soilHealthScore}%` }} /></span>
                <span className="lf-head" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>{soilHealthScore}%</span>
              </div>
              <p className="lf-cap text-muted-foreground">
                {soilHealthScore >= 70 ? t('lands.details.health_good') : soilHealthScore >= 40 ? t('lands.details.health_fair') : t('lands.details.health_needs_care')}
              </p>
            </>
          )}
        </div>

        <div className={`${card} min-w-0`} style={pad}>
          <p className="lf-cap flex items-center gap-1.5 text-muted-foreground"><Droplets size={16} className="shrink-0 text-info" aria-hidden /><span className="min-w-0 truncate">{t('lands.details.irrigation')}</span></p>
          <p className="lf-head mt-1" style={{ overflowWrap: 'anywhere' }}>
            {land.irrigation_source ? t(`lands.irrigation_sources.${String(land.irrigation_source).toLowerCase()}`, { defaultValue: land.irrigation_source }) : t('lands.details.not_set')}
          </p>
          {land.water_source && (
            <p className="lf-cap text-muted-foreground">{t(`lands.irrigation_sources.${String(land.water_source).toLowerCase()}`, { defaultValue: land.water_source })}</p>
          )}
        </div>
      </section>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col gap-3">
        <TabsList className="flex h-auto w-full justify-start gap-2 overflow-x-auto rounded-none bg-transparent" style={{ padding: '4px var(--lf-gut)' }}>
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className="lf-pill lf-pill-sm shrink-0 rounded-full border border-border bg-card font-bold text-foreground data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none"
              style={{ minHeight: 44 }}
            >
              <tab.icon size={18} aria-hidden />
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="mt-0 flex flex-col gap-3" style={gut}>
          {/* Farm Intelligence (environmental spine) */}
          {id && <FarmIntelligenceCard landId={id} />}

          <section className={card} style={pad}>
            <h2 className="lf-head flex items-center gap-2"><MapPin size={20} className="shrink-0 text-primary" aria-hidden />{t('lands.details.land_info')}</h2>
            <dl className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {info.map((item) => (
                <div key={item.label} className="rounded-2xl bg-muted px-3 py-2">
                  <dt className="lf-cap text-muted-foreground">{item.label}</dt>
                  <dd className="lf-lab" style={{ overflowWrap: 'anywhere' }}>{item.value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className={card} style={pad}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="lf-head flex min-w-0 items-center gap-2"><Activity size={20} className="shrink-0 text-primary" aria-hidden /><span className="min-w-0" style={{ overflowWrap: 'anywhere' }}>{t('lands.details.recent_activities')}</span></h2>
              <button type="button" onClick={() => navigate(`/app/lands/${id}/activities/add`)} className={solid} style={tap}>
                <Plus size={20} aria-hidden />{t('lands.details.add')}
              </button>
            </div>
            {activities.length === 0 ? empty(Activity, t('lands.details.no_activities'), t('lands.details.start_tracking')) : (
              <ul className="mt-2 flex flex-col gap-2">
                {activities.slice(0, 5).map(activity => (
                  <li key={activity.id} className="flex items-center justify-between gap-3 rounded-2xl bg-muted px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="lf-lab" style={{ overflowWrap: 'anywhere' }}>{activity.activity_type}</p>
                      {activity.description && <p className="lf-cap line-clamp-1 text-muted-foreground">{activity.description}</p>}
                    </div>
                    <div className="shrink-0 text-end">
                      <p className="lf-cap text-foreground">{day(activity.activity_date)}</p>
                      {activity.cost && <p className="lf-lab text-primary">₹{activity.cost}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </TabsContent>

        <TabsContent value="soil" className="mt-0 flex flex-col gap-3" style={gut}>
          {id && <LandSoilSummary landId={id} />}
        </TabsContent>

        <TabsContent value="activities" className="mt-0" style={gut}>
          <section className={card} style={pad}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="lf-head min-w-0" style={{ overflowWrap: 'anywhere' }}>{t('lands.details.activity_log')}</h2>
              <button type="button" onClick={() => navigate(`/app/lands/${id}/activities/add`)} className={solid} style={tap}>
                <Plus size={20} aria-hidden />{t('lands.details.log_activity')}
              </button>
            </div>
            {activityData.length > 0 && (
              <div className="mt-3">
                <Suspense fallback={chartWait}>
                  <LandActivityChart data={activityData} countLabel={t('lands.details.activities_count')} costLabel={t('lands.details.cost_label')} />
                </Suspense>
              </div>
            )}
            <ul className="mt-3 flex flex-col gap-2">
              {activities.map(activity => (
                <li key={activity.id} className="flex items-start justify-between gap-3 rounded-2xl border border-border px-3 py-2">
                  <div className="flex min-w-0 flex-1 gap-2">
                    <Activity size={18} className="mt-1 shrink-0 text-primary" aria-hidden />
                    <div className="min-w-0">
                      <p className="lf-lab" style={{ overflowWrap: 'anywhere' }}>{activity.activity_type}</p>
                      {activity.description && <p className="lf-cap text-muted-foreground">{activity.description}</p>}
                      {activity.notes && <p className="lf-cap mt-1 text-muted-foreground">{t('lands.details.note')}: {activity.notes}</p>}
                    </div>
                  </div>
                  <div className="shrink-0 text-end">
                    <p className="lf-cap text-muted-foreground">{day(activity.activity_date, true)}</p>
                    {activity.quantity && <p className="lf-cap text-foreground">{activity.quantity} {activity.unit}</p>}
                    {activity.cost && <p className="lf-lab">₹{activity.cost}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </TabsContent>

        <TabsContent value="history" className="mt-0" style={gut}>
          <section className={card} style={pad}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="lf-head min-w-0" style={{ overflowWrap: 'anywhere' }}>{t('lands.details.crop_history')}</h2>
              <button type="button" onClick={() => navigate(`/app/lands/${id}/crop-history/add`)} className={solid} style={tap}>
                <Plus size={20} aria-hidden /><span className="min-w-0">{t('lands.details.add_crop_record')}</span>
              </button>
            </div>
            {yieldData.length > 0 && (
              <div className="mt-3">
                <Suspense fallback={chartWait}>
                  <LandYieldChart data={yieldData} yieldLabel={t('lands.details.yield_label')} revenueLabel={t('lands.details.revenue_label')} />
                </Suspense>
              </div>
            )}
            {cropHistory.length === 0 ? empty(History, t('lands.details.no_crop_history')) : (
              <ul className="mt-3 flex flex-col gap-2">
                {cropHistory.map(crop => (
                  <li key={crop.id} className="flex items-start justify-between gap-3 rounded-2xl border border-border px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="lf-lab" style={{ overflowWrap: 'anywhere' }}>{crop.crop_name}</p>
                      <p className="lf-cap text-muted-foreground">
                        {t('lands.details.sown')}: {day(crop.planting_date, true)}
                        {crop.harvest_date && ` • ${t('lands.details.harvested')}: ${day(crop.harvest_date, true)}`}
                      </p>
                    </div>
                    <div className="shrink-0 text-end">
                      {crop.yield_kg_per_acre && <p className="lf-lab">{crop.yield_kg_per_acre} {t('lands.details.kg_acre')}</p>}
                      {crop.growth_stage && <span className="lf-pill lf-pill-sm mt-1 border border-border bg-card text-foreground">{crop.growth_stage}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </TabsContent>

        <TabsContent value="gallery" className="mt-0" style={gut}>
          <section className={card} style={pad}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="lf-head min-w-0" style={{ overflowWrap: 'anywhere' }}>{t('lands.details.photo_gallery')}</h2>
              <button type="button" onClick={() => navigate(`/app/lands/${id}/gallery/upload`)} className={solid} style={tap}>
                <Camera size={20} aria-hidden /><span className="min-w-0">{t('lands.details.upload_photos')}</span>
              </button>
            </div>
            {empty(Camera, t('lands.details.no_photos'))}
            <button type="button" onClick={() => navigate(`/app/lands/${id}/gallery/upload`)} className="lf-lab mx-auto flex items-center justify-center rounded-full border border-border bg-card px-6" style={tap}>
              {t('lands.details.upload_first_photo')}
            </button>
          </section>
        </TabsContent>
      </Tabs>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="max-w-md mx-4 rounded-2xl">
          <AlertDialogHeader>
            <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
              <AlertTriangle className="h-8 w-8 text-destructive" />
            </div>
            <AlertDialogTitle className="text-xl text-center">{t('lands.details.delete.dialog_title')}</AlertDialogTitle>
            <AlertDialogDescription className="text-center text-base">
              {t('lands.details.delete.dialog_description', { name: land.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel className="min-h-[48px] rounded-xl font-medium">{t('lands.details.delete.cancel')}</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete} 
              className="min-h-[48px] rounded-xl bg-destructive hover:bg-destructive/90 font-medium"
            >
              {t('lands.details.delete.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}