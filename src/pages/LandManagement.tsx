import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useCropNames } from '@/hooks/useCropNames';
import { 
  Plus, Grid3x3, List, Search, Filter, Download, Share2,
  MapPin, Sprout, Calendar, Camera, Activity, AlertCircle,
  SlidersHorizontal, X, ChevronUp
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useAuthStore } from '@/stores/authStore';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { useLands } from '@/hooks/useLands';
import { ModernLandCard } from '@/components/land/ModernLandCard';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { LandsSkeleton } from '@/components/skeletons';
import { useLocalizedPlace } from '@/hooks/useLocalizedPlace';
import '@/living/living.css';

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
  previous_crop?: string;
  crop_stage?: string;
  soil_type?: string;
  water_source?: string;
  irrigation_type?: string;
  irrigation_source?: string;
  soil_ph?: number;
  organic_carbon_percent?: number;
  soil_data_source?: string | null;
  survey_number?: string;
  ownership_type?: string;
  last_soil_test_date?: string;
  planting_date?: string;
  expected_harvest_date?: string;
  boundary_polygon_old?: any;
  center_point_old?: any;
  created_at: string;
  updated_at: string;
}

export default function LandManagement() {
  const { t } = useTranslation();
  const cropNameOf = useCropNames();
  const { join: joinPlace, place: placeName } = useLocalizedPlace();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuthStore();
  const isOnline = useOfflineStatus();
  
  // Use the unified lands hook with real-time updates - use data directly
  const { lands: fetchedLands, isLoading, refetch: refetchLands } = useLands();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterBy, setFilterBy] = useState('all');
  const [sortBy, setSortBy] = useState('name');

  // PERFORMANCE: Use React Query data directly instead of duplicate state
  const lands = useMemo(() => {
    return (fetchedLands || []).filter(land => land.id) as Land[];
  }, [fetchedLands]);

  // PERFORMANCE: Memoize helper functions
  const getSoilHealthColor = useCallback((ph?: number, organic?: number, source?: string | null) => {
    // A satellite soil-map estimate is not a soil test, so it gets no health colour.
    if (source === 'soilgrid') return 'bg-muted';
    if (!ph && !organic) return 'bg-muted';
    
    const phScore = ph ? (ph >= 6.0 && ph <= 7.5 ? 3 : ph >= 5.5 && ph <= 8.0 ? 2 : 1) : 0;
    const organicScore = organic ? (organic >= 0.75 ? 3 : organic >= 0.5 ? 2 : 1) : 0;
    const totalScore = (phScore + organicScore) / 2;
    
    if (totalScore >= 2.5) return 'bg-land-health-excellent';
    if (totalScore >= 1.5) return 'bg-land-health-good';
    return 'bg-destructive';
  }, []);

  const getCropStageColor = useCallback((stage?: string) => {
    switch (stage) {
      case 'germination': return 'bg-crop-stage-germination';
      case 'vegetative': return 'bg-crop-stage-vegetative';
      case 'flowering': return 'bg-crop-stage-flowering';
      case 'fruiting': return 'bg-crop-stage-fruiting';
      case 'harvesting': return 'bg-crop-stage-harvesting';
      default: return 'bg-muted';
    }
  }, []);

  // PERFORMANCE: Memoize filtered and sorted lands
  const filteredLands = useMemo(() => {
    return lands
      .filter(land => {
        const matchesSearch = land.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                             land.village?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                             land.survey_number?.toLowerCase().includes(searchQuery.toLowerCase());
        
        if (filterBy === 'all') return matchesSearch;
        if (filterBy === 'withCrop') return matchesSearch && land.current_crop;
        if (filterBy === 'noCrop') return matchesSearch && !land.current_crop;
        return matchesSearch;
      })
      .sort((a, b) => {
        switch (sortBy) {
          case 'name': return a.name.localeCompare(b.name);
          case 'area': return b.area_acres - a.area_acres;
          case 'date': return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          default: return 0;
        }
      });
  }, [lands, searchQuery, filterBy, sortBy]);

  // PERFORMANCE: Memoize computed values
  const totalArea = useMemo(() => lands.reduce((sum, land) => sum + land.area_acres, 0), [lands]);
  const cultivatedLands = useMemo(() => lands.filter(land => land.current_crop).length, [lands]);

  const exportData = () => {
    const dataStr = JSON.stringify(filteredLands, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const exportFileDefaultName = `lands_${new Date().toISOString().split('T')[0]}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
    
    toast({
      title: t('lands.export.success_title'),
      description: t('lands.export.success_message', { count: filteredLands.length }),
    });
  };

  const LandListItem = ({ land }: { land: Land }) => (
    <button
      type="button"
      onClick={() => navigate(`/app/lands/${land.id}`)}
      className="flex w-full items-center gap-3 rounded-[var(--lf-r)] border border-border bg-card text-start shadow-sm"
      style={{ padding: 'clamp(10px, 3vw, 14px)', minHeight: 'var(--lf-tap)' }}
    >
      <span className="relative grid h-10 w-10 shrink-0 place-items-center" aria-hidden>
        <span className={`absolute inset-0 rounded-full ${getSoilHealthColor(land.soil_ph, land.organic_carbon_percent, land.soil_data_source)} opacity-20`} />
        <span className={`h-4 w-4 rounded-full ${getSoilHealthColor(land.soil_ph, land.organic_carbon_percent, land.soil_data_source)}`} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="lf-lab block truncate">{land.name}</span>
        <span className="lf-cap block truncate text-muted-foreground">{joinPlace(land, ['village','taluka'])}</span>
        {land.current_crop && (
          <span className="lf-cap mt-0.5 flex items-center gap-1 text-foreground">
            <Sprout size={14} className="shrink-0 text-primary" aria-hidden />
            <span className="min-w-0 truncate">{cropNameOf(land.current_crop, (land as { current_crop_id?: string | null }).current_crop_id)}</span>
            {land.crop_stage && <span className={`${getCropStageColor(land.crop_stage)} shrink-0 rounded-full px-2 text-primary-foreground`}>{land.crop_stage}</span>}
          </span>
        )}
      </span>
      <span className="shrink-0 text-end">
        <span className="lf-lab block" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>{land.area_acres}</span>
        <span className="lf-cap block text-muted-foreground">{t('common.acres')}</span>
      </span>
    </button>
  );

  if (isLoading) {
    return <LandsSkeleton />;
  }

  const chip = (active: boolean) =>
    `lf-pill lf-pill-sm shrink-0 border ${active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground'}`;
  const filters: Array<{ id: string; label: string }> = [
    { id: 'all', label: t('lands.filter.all') },
    { id: 'withCrop', label: t('lands.filter.with_crop') },
    { id: 'noCrop', label: t('lands.filter.no_crop') },
  ];
  const sorts: Array<{ id: string; label: string }> = [
    { id: 'name', label: t('lands.sort.by_name') },
    { id: 'area', label: t('lands.sort.by_area') },
    { id: 'date', label: t('lands.sort.by_date') },
  ];
  const gut = { padding: '0 var(--lf-gut)' } as const;

  return (
    <div className="flex flex-col gap-3 pb-4" style={{ fontSize: 'var(--lf-fs-body)' }}>
      {/* The whole farm in three numbers */}
      <section className="lf-grid3" style={{ padding: '12px var(--lf-gut) 0' }}>
        {[
          { icon: MapPin, value: String(lands.length), label: t('lands.stats.count', { count: lands.length }).replace(String(lands.length), '').trim() },
          { icon: Grid3x3, value: totalArea.toFixed(1), label: t('common.acres') },
          { icon: Sprout, value: String(cultivatedLands), label: t('lands.stats.cultivated', { count: cultivatedLands }).replace(String(cultivatedLands), '').trim() },
        ].map((stat, index) => (
          <div key={index} className="flex min-w-0 flex-col items-center rounded-[var(--lf-r)] border border-border bg-card text-center shadow-sm" style={{ padding: 'clamp(8px, 2.6vw, 14px) 4px' }}>
            <stat.icon size={20} className="text-primary" aria-hidden />
            <span className="lf-head" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>{stat.value}</span>
            <span className="lf-cap w-full truncate text-muted-foreground">{stat.label}</span>
          </div>
        ))}
      </section>

      {!isOnline && (
        <div className="lf-cap flex items-center gap-2 rounded-2xl bg-warning/15 px-3 py-2 text-foreground" style={{ margin: '0 var(--lf-gut)' }} role="status">
          <AlertCircle size={18} className="shrink-0 text-warning" aria-hidden />
          {t('lands.offline_warning')}
        </div>
      )}

      {/* Search and view controls stay in reach while the list scrolls */}
      <div className="sticky top-0 z-10 flex flex-col gap-2 border-b border-border bg-background py-2" style={gut}>
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search size={20} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              placeholder={t('lands.search.placeholder')}
              aria-label={t('lands.search.placeholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="rounded-full ps-10 text-base"
              style={{ height: 'var(--lf-tap)' }}
            />
          </div>

          <Sheet>
            <SheetTrigger asChild>
              <button type="button" className="lf-round border border-border bg-card text-foreground" aria-label={t('lands.filter.sheet_title')}>
                <SlidersHorizontal size={22} aria-hidden />
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="h-auto rounded-t-3xl">
              <SheetHeader>
                <SheetTitle>{t('lands.filter.sheet_title')}</SheetTitle>
              </SheetHeader>
              <div className="mt-4 flex flex-col gap-4">
                <div>
                  <p className="lf-lab mb-2">{t('lands.sort.label')}</p>
                  <div className="flex flex-wrap gap-2">
                    {sorts.map((sort) => (
                      <button key={sort.id} type="button" onClick={() => setSortBy(sort.id)} aria-pressed={sortBy === sort.id} className={chip(sortBy === sort.id)} style={{ minHeight: 'var(--lf-tap)' }}>{sort.label}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="lf-lab mb-2">{t('lands.view_mode.label')}</p>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setViewMode('grid')} aria-pressed={viewMode === 'grid'} className={`${chip(viewMode === 'grid')} flex-1 justify-center`} style={{ minHeight: 'var(--lf-tap)' }}><Grid3x3 size={18} aria-hidden />{t('lands.view_mode.grid')}</button>
                    <button type="button" onClick={() => setViewMode('list')} aria-pressed={viewMode === 'list'} className={`${chip(viewMode === 'list')} flex-1 justify-center`} style={{ minHeight: 'var(--lf-tap)' }}><List size={18} aria-hidden />{t('lands.view_mode.list')}</button>
                  </div>
                </div>
                {/* Export stays a wide-screen action, as before */}
                <button type="button" onClick={exportData} className="lf-lab hidden items-center justify-center gap-2 rounded-full border border-border bg-card md:flex" style={{ minHeight: 'var(--lf-tap)' }}>
                  <Download size={20} aria-hidden />{t('common.download')}
                </button>
              </div>
            </SheetContent>
          </Sheet>
        </div>

        <div className="flex gap-2 overflow-x-auto" role="group" aria-label={t('lands.filter.by_label')}>
          {filters.map((filter) => (
            <button key={filter.id} type="button" onClick={() => setFilterBy(filter.id)} aria-pressed={filterBy === filter.id} className={chip(filterBy === filter.id)} style={{ minHeight: 44 }}>{filter.label}</button>
          ))}
        </div>
      </div>

      <div style={gut}>
        {filteredLands.length === 0 ? (
          <div className="mt-6 flex flex-col items-center gap-2 rounded-[var(--lf-r)] border border-dashed border-border px-4 py-10 text-center">
            <span className="grid h-20 w-20 place-items-center rounded-[32%] bg-primary/10 text-primary"><MapPin className="h-10 w-10" aria-hidden /></span>
            <h2 className="lf-head mt-2">{t('lands.empty.title')}</h2>
            <p className="lf-lab font-normal text-muted-foreground">{searchQuery ? t('lands.empty.search_message') : t('lands.empty.add_first')}</p>
            {!searchQuery && (
              <button type="button" onClick={() => navigate('/app/lands/add')} className="lf-lab mt-3 flex items-center justify-center gap-2 rounded-full bg-primary px-6 text-primary-foreground" style={{ minHeight: 'var(--lf-tap)' }}>
                <Plus size={20} aria-hidden />{t('lands.cta.add_first')}
              </button>
            )}
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filteredLands.map(land => (
              <ModernLandCard key={land.id} land={land} onRefresh={refetchLands} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filteredLands.map(land => (
              <LandListItem key={land.id} land={land} />
            ))}
          </div>
        )}

        {filteredLands.length > 0 && (
          <button type="button" onClick={() => navigate('/app/lands/add')} className="lf-lab mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-primary text-primary-foreground shadow-sm" style={{ minHeight: 'var(--lf-tap)' }}>
            <Plus size={22} aria-hidden />{t('lands.cta.add')}
          </button>
        )}
      </div>
    </div>
  );
}
