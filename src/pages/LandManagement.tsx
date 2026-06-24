import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { 
  Plus, Grid3x3, List, Search, Filter, Download, Share2,
  MapPin, Sprout, Calendar, Camera, Activity, AlertCircle,
  SlidersHorizontal, X, ChevronUp
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuthStore } from '@/stores/authStore';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { useLands } from '@/hooks/useLands';
import { Progress } from '@/components/ui/progress';
import { ModernLandCard } from '@/components/land/ModernLandCard';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { motion, AnimatePresence } from 'framer-motion';
import { LandsSkeleton } from '@/components/skeletons';
import { useOwnershipLabel } from '@/lib/ownershipLabel';

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
  lifecycle_status?: string;
  soil_type?: string;
  water_source?: string;
  irrigation_type?: string;
  irrigation_source?: string;
  soil_ph?: number;
  organic_carbon_percent?: number;
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
  const ownershipLabel = useOwnershipLabel();
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
  const [showStats, setShowStats] = useState(true);

  // PERFORMANCE: Use React Query data directly instead of duplicate state
  const lands = useMemo(() => {
    return (fetchedLands || []).filter(land => land.id) as Land[];
  }, [fetchedLands]);

  // PERFORMANCE: Memoize helper functions
  const getSoilHealthColor = useCallback((ph?: number, organic?: number) => {
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
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      whileHover={{ x: 4 }}
    >
      <Card 
        className="cursor-pointer hover:shadow-lg transition-all duration-200 active:scale-[0.98]"
        onClick={() => navigate(`/app/lands/${land.id}`)}
      >
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3">
                <div className="min-w-0">
                  <h3 className="font-semibold truncate">{land.name}</h3>
                  <p className="text-sm text-muted-foreground truncate">
                    {land.village && `${land.village}, `}{land.taluka}
                  </p>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-3 flex-shrink-0">
              <div className="text-right">
                <p className="font-semibold text-sm">{land.area_acres} acres</p>
                <p className="text-xs text-muted-foreground">{ownershipLabel(land.ownership_type)}</p>
              </div>
              
              {land.current_crop && (
                <div className="text-right">
                  <p className="text-sm font-medium truncate max-w-[100px]">{land.current_crop}</p>
                  {land.lifecycle_status === 'WAITING_HARVEST_CONFIRMATION' ? (
                    <Badge className="bg-warning text-warning-foreground text-xs">
                      {t('schedule.harvest.land_badge.confirm', 'Confirm harvest')}
                    </Badge>
                  ) : land.lifecycle_status === 'READY_FOR_HARVEST' ? (
                    <Badge className="bg-success text-success-foreground text-xs">
                      {t('schedule.harvest.land_badge.ready', 'Ready')}
                    </Badge>
                  ) : land.crop_stage ? (
                    <Badge className={`${getCropStageColor(land.crop_stage)} text-primary-foreground text-xs`}>
                      {land.crop_stage}
                    </Badge>
                  ) : null}
                </div>
              )}
              
              <div className="flex items-center">
                <div className={`h-8 w-8 rounded-full ${getSoilHealthColor(land.soil_ph, land.organic_carbon_percent)} opacity-20`} />
                <div className={`h-4 w-4 rounded-full ${getSoilHealthColor(land.soil_ph, land.organic_carbon_percent)} -ml-6`} />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );

  if (isLoading) {
    return <LandsSkeleton />;
  }

  return (
    <div className="pb-6">
      {/* Compact Stats Bar - Mobile optimized */}
      {showStats && (
        <div className="bg-gradient-to-r from-primary/5 to-primary/10 border-b border-primary/10 px-4 py-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 overflow-x-auto">
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <MapPin className="h-3.5 w-3.5 text-primary" />
                <span className="text-sm font-semibold">{lands.length}</span>
                <span className="text-xs text-muted-foreground">{t('lands.stats.count', { count: lands.length }).split(' ')[1]}</span>
              </div>
              
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <Grid3x3 className="h-3.5 w-3.5 text-primary" />
                <span className="text-sm font-semibold">{totalArea.toFixed(1)}</span>
                <span className="text-xs text-muted-foreground">{t('lands.stats.total_area', { area: totalArea.toFixed(1) }).split(' ')[1]}</span>
              </div>
              
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <Sprout className="h-3.5 w-3.5 text-primary" />
                <span className="text-sm font-semibold">{cultivatedLands}</span>
                <span className="text-xs text-muted-foreground">{t('lands.stats.cultivated', { count: cultivatedLands }).split(' ')[1]}</span>
              </div>
            </div>
            
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 md:hidden flex-shrink-0"
              onClick={() => setShowStats(false)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Page Content (scrolls with global <main>) */}
      <div>
        {/* Offline Indicator */}
        {!isOnline && (
          <div className="mx-4 mt-2 mb-3 bg-warning/10 border-l-4 border-warning rounded-md p-2 flex items-center gap-2">
            <AlertCircle className="h-3.5 w-3.5 text-warning flex-shrink-0" />
            <p className="text-xs text-warning-foreground">{t('lands.offline_warning')}</p>
          </div>
        )}

        {/* Search and Actions Bar - Sticky under global header */}
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-md py-3 px-4 border-b border-border/40">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('lands.search.placeholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-9"
              />
            </div>
            
            {/* Mobile Filter Sheet */}
            <Sheet>
              <SheetTrigger asChild className="md:hidden">
                <Button variant="outline" size="icon" className="h-9 w-9">
                  <SlidersHorizontal className="h-4 w-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="h-auto">
                <SheetHeader>
                  <SheetTitle>{t('lands.filter.sheet_title')}</SheetTitle>
                </SheetHeader>
                <div className="space-y-4 mt-4">
                  <div>
                    <label className="text-sm font-medium mb-2 block">{t('lands.filter.by_label')}</label>
                    <Select value={filterBy} onValueChange={setFilterBy}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t('lands.filter.all')}</SelectItem>
                        <SelectItem value="withCrop">{t('lands.filter.with_crop')}</SelectItem>
                        <SelectItem value="noCrop">{t('lands.filter.no_crop')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium mb-2 block">{t('lands.sort.label')}</label>
                    <Select value={sortBy} onValueChange={setSortBy}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="name">{t('lands.sort.by_name')}</SelectItem>
                        <SelectItem value="area">{t('lands.sort.by_area')}</SelectItem>
                        <SelectItem value="date">{t('lands.sort.by_date')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium mb-2 block">{t('lands.view_mode.label')}</label>
                    <div className="flex gap-2">
                      <Button
                        variant={viewMode === 'grid' ? 'default' : 'outline'}
                        onClick={() => setViewMode('grid')}
                        className="flex-1"
                      >
                        <Grid3x3 className="h-4 w-4 mr-2" />
                        {t('lands.view_mode.grid')}
                      </Button>
                      <Button
                        variant={viewMode === 'list' ? 'default' : 'outline'}
                        onClick={() => setViewMode('list')}
                        className="flex-1"
                      >
                        <List className="h-4 w-4 mr-2" />
                        {t('lands.view_mode.list')}
                      </Button>
                    </div>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
            
            {/* Desktop Filters */}
            <div className="hidden md:flex gap-2">
              <Select value={filterBy} onValueChange={setFilterBy}>
                <SelectTrigger className="w-[140px] h-9">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('lands.filter.all')}</SelectItem>
                    <SelectItem value="withCrop">{t('lands.filter.with_crop')}</SelectItem>
                    <SelectItem value="noCrop">{t('lands.filter.no_crop')}</SelectItem>
                  </SelectContent>
              </Select>
              
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-[120px] h-9">
                  <SelectValue />
                </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="name">{t('lands.sort.by_name')}</SelectItem>
                    <SelectItem value="area">{t('lands.sort.by_area')}</SelectItem>
                    <SelectItem value="date">{t('lands.sort.by_date')}</SelectItem>
                  </SelectContent>
              </Select>
              
              <Button
                variant="outline"
                size="icon"
                onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
                className="h-9 w-9"
              >
                {viewMode === 'grid' ? <List className="h-4 w-4" /> : <Grid3x3 className="h-4 w-4" />}
              </Button>
              
              <Button variant="outline" size="icon" onClick={exportData} className="h-9 w-9">
                <Download className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Lands Display */}
        <div className="px-4">
          {filteredLands.length === 0 ? (
            <Card className="border-dashed mx-auto mt-8">
              <CardContent className="p-8 text-center">
                <MapPin className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">{t('lands.empty.title')}</h3>
                <p className="text-muted-foreground mb-6 text-sm">
                  {searchQuery ? t('lands.empty.search_message') : t('lands.empty.add_first')}
                </p>
                {!searchQuery && (
                  <Button onClick={() => navigate('/app/lands/add')} className="mx-auto">
                    <Plus className="h-4 w-4 mr-2" />
                    {t('lands.cta.add_first')}
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 mt-4">
              <AnimatePresence>
                {filteredLands.map(land => (
                  <ModernLandCard key={land.id} land={land} onRefresh={refetchLands} />
                ))}
              </AnimatePresence>
            </div>
          ) : (
            <div className="space-y-2 mt-4">
              <AnimatePresence>
                {filteredLands.map(land => (
                  <LandListItem key={land.id} land={land} />
                ))}
              </AnimatePresence>
            </div>
          )}

          {/* Add Land Button - Inline, below last card (only when there are lands) */}
          {filteredLands.length > 0 && (
            <div className="flex justify-center pt-6">
              <Button
                onClick={() => navigate('/app/lands/add')}
                className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg rounded-full px-8 py-6 flex items-center gap-3"
                size="lg"
              >
                <Plus className="h-5 w-5" />
                <span className="font-medium">{t('lands.cta.add')}</span>
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}