import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { 
  Plus, Grid3x3, List, Search, Filter, Download, Share2,
  MapPin, Sprout, Calendar, Camera, Activity, AlertCircle
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { Progress } from '@/components/ui/progress';
import { ModernLandCard } from '@/components/land/ModernLandCard';

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
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuthStore();
  const isOnline = useOfflineStatus();
  
  const [lands, setLands] = useState<Land[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterBy, setFilterBy] = useState('all');
  const [sortBy, setSortBy] = useState('name');

  useEffect(() => {
    fetchLands();
  }, [user]);

  const fetchLands = async () => {
    if (!user?.id) return;
    
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('lands')
        .select('*')
        .eq('farmer_id', user.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setLands(data || []);
      
      // Store in localStorage for offline access
      if (data) {
        localStorage.setItem(`lands_${user.id}`, JSON.stringify(data));
      }
    } catch (error) {
      console.error('Error fetching lands:', error);
      // Try to load from localStorage if online fetch fails
      const cachedData = localStorage.getItem(`lands_${user.id}`);
      if (cachedData) {
        setLands(JSON.parse(cachedData));
        toast({
          title: 'Offline Mode',
          description: 'Showing cached land data',
        });
      } else {
        toast({
          title: 'Error',
          description: 'Failed to fetch land data',
          variant: 'destructive',
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const getSoilHealthColor = (ph?: number, organic?: number) => {
    if (!ph && !organic) return 'bg-muted';
    
    const phScore = ph ? (ph >= 6.0 && ph <= 7.5 ? 3 : ph >= 5.5 && ph <= 8.0 ? 2 : 1) : 0;
    const organicScore = organic ? (organic >= 0.75 ? 3 : organic >= 0.5 ? 2 : 1) : 0;
    const totalScore = (phScore + organicScore) / 2;
    
    if (totalScore >= 2.5) return 'bg-land-health-excellent';
    if (totalScore >= 1.5) return 'bg-land-health-good';
    return 'bg-destructive';
  };

  const getCropStageColor = (stage?: string) => {
    switch (stage) {
      case 'germination': return 'bg-crop-stage-germination';
      case 'vegetative': return 'bg-crop-stage-vegetative';
      case 'flowering': return 'bg-crop-stage-flowering';
      case 'fruiting': return 'bg-crop-stage-fruiting';
      case 'harvesting': return 'bg-crop-stage-harvesting';
      default: return 'bg-muted';
    }
  };

  const filteredLands = lands
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

  const totalArea = lands.reduce((sum, land) => sum + land.area_acres, 0);
  const cultivatedLands = lands.filter(land => land.current_crop).length;

  const exportData = () => {
    const dataStr = JSON.stringify(filteredLands, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const exportFileDefaultName = `lands_${new Date().toISOString().split('T')[0]}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
    
    toast({
      title: 'Exported Successfully',
      description: `${filteredLands.length} land records exported`,
    });
  };


  const LandListItem = ({ land }: { land: Land }) => (
    <Card 
      className="cursor-pointer hover:shadow-md transition-all"
      onClick={() => navigate(`/app/lands/${land.id}`)}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <div>
                <h3 className="font-semibold">{land.name}</h3>
                <p className="text-sm text-muted-foreground">
                  {land.village && `${land.village}, `}{land.taluka}
                </p>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="font-semibold">{land.area_acres} acres</p>
              <p className="text-xs text-muted-foreground">{land.ownership_type || 'Owned'}</p>
            </div>
            
            {land.current_crop && (
              <div className="text-right">
                <p className="text-sm font-medium">{land.current_crop}</p>
                {land.crop_stage && (
                  <Badge className={`${getCropStageColor(land.crop_stage)} text-primary-foreground text-xs`}>
                    {land.crop_stage}
                  </Badge>
                )}
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
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto" />
          <p className="text-muted-foreground">Loading land data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Compact Summary Stats */}
      <div className="bg-gradient-to-r from-primary/5 to-primary/10 rounded-lg border border-primary/10 p-2">
        <div className="grid grid-cols-4 gap-2">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-background rounded-md">
              <MapPin className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-2xs text-muted-foreground">Lands</p>
              <p className="text-sm font-semibold">{lands.length}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-background rounded-md">
              <Grid3x3 className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-2xs text-muted-foreground">Area</p>
              <p className="text-sm font-semibold">{totalArea.toFixed(1)} ac</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-background rounded-md">
              <Sprout className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-2xs text-muted-foreground">Active</p>
              <p className="text-sm font-semibold">{cultivatedLands}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-background rounded-md">
              <Activity className="h-4 w-4 text-primary" />
            </div>
            <div className="flex items-center gap-1.5">
              <div className="flex-1">
                <p className="text-2xs text-muted-foreground">Usage</p>
                <p className="text-sm font-semibold">{lands.length ? Math.round((cultivatedLands / lands.length) * 100) : 0}%</p>
              </div>
              <Progress value={(cultivatedLands / lands.length) * 100} className="h-1 w-8" />
            </div>
          </div>
        </div>
      </div>

      {/* Offline Indicator */}
      {!isOnline && (
        <Card className="border-warning bg-warning/10">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-warning" />
              <p className="text-sm text-warning-foreground">
                You're offline. Changes will sync when connection is restored.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actions Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search lands..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              
              <Select value={filterBy} onValueChange={setFilterBy}>
                <SelectTrigger className="w-[140px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Lands</SelectItem>
                  <SelectItem value="withCrop">With Crop</SelectItem>
                  <SelectItem value="noCrop">No Crop</SelectItem>
                </SelectContent>
              </Select>
              
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">Name</SelectItem>
                  <SelectItem value="area">Area</SelectItem>
                  <SelectItem value="date">Date</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
              >
                {viewMode === 'grid' ? <List className="h-4 w-4" /> : <Grid3x3 className="h-4 w-4" />}
              </Button>
              
              <Button variant="outline" size="icon" onClick={exportData}>
                <Download className="h-4 w-4" />
              </Button>
              
              <Button variant="outline" size="icon">
                <Share2 className="h-4 w-4" />
              </Button>
              
              <Button onClick={() => navigate('/app/lands/add')}>
                <Plus className="h-4 w-4 mr-2" />
                Add Land
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lands Display */}
      {filteredLands.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <MapPin className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Lands Found</h3>
            <p className="text-muted-foreground mb-4">
              {searchQuery ? 'Try adjusting your search or filters' : 'Start by adding your first land parcel'}
            </p>
            {!searchQuery && (
              <Button onClick={() => navigate('/app/lands/add')}>
                <Plus className="h-4 w-4 mr-2" />
                Add Your First Land
              </Button>
            )}
          </CardContent>
        </Card>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredLands.map(land => (
            <ModernLandCard key={land.id} land={land} onRefresh={fetchLands} />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredLands.map(land => (
            <LandListItem key={land.id} land={land} />
          ))}
        </div>
      )}
    </div>
  );
}