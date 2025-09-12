import React, { useState, useMemo, useEffect } from 'react';
import { Search, Wheat, Leaf, TreePine, Apple, DollarSign, TrendingUp } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';

interface Crop {
  id: string;
  value: string;
  label: string;
  local_name?: string;
  season?: string;
  duration_days?: number;
  crop_group_id?: string;
  is_popular?: boolean;
}

interface CropGroup {
  id: string;
  group_name: string;
  group_key: string;
  group_icon?: string;
  description?: string;
  display_order?: number;
}

interface EnhancedCropSelectorProps {
  selectedCropId?: string;
  onSelect: (cropId: string, cropName: string, localName?: string) => void;
  onBack?: () => void;
}

const groupIcons: Record<string, React.ReactNode> = {
  grains: <Wheat className="h-4 w-4" />,
  vegetables: <Leaf className="h-4 w-4" />,
  fruits: <Apple className="h-4 w-4" />,
  cash_crops: <DollarSign className="h-4 w-4" />,
  pulses: <TreePine className="h-4 w-4" />,
  oilseeds: <TrendingUp className="h-4 w-4" />,
};

// Popular crops for quick access (can be fetched from DB based on region)
const popularCropIds = [
  'rice', 'wheat', 'cotton', 'sugarcane', 'maize', 
  'tomato', 'onion', 'potato', 'groundnut', 'mustard'
];

export function EnhancedCropSelector({ selectedCropId, onSelect, onBack }: EnhancedCropSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [crops, setCrops] = useState<Crop[]>([]);
  const [cropGroups, setCropGroups] = useState<CropGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState('all');

  // Load crops and groups from database
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        
        // Load crop groups
        const { data: groupsData, error: groupsError } = await supabase
          .from('crop_groups')
          .select('*')
          .order('display_order', { ascending: true });
          
        if (groupsError) throw groupsError;
        
        // Load all crops
        const { data: cropsData, error: cropsError } = await supabase
          .from('crops')
          .select('*')
          .order('label', { ascending: true });
          
        if (cropsError) throw cropsError;
        
        setCropGroups(groupsData || []);
        
        // Mark popular crops
        const cropsWithPopularity = (cropsData || []).map(crop => ({
          ...crop,
          is_popular: popularCropIds.includes(crop.value)
        }));
        
        setCrops(cropsWithPopularity);
      } catch (err) {
        console.error('Error loading crop data:', err);
        setError('Failed to load crops');
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, []);

  // Filter crops based on search and selected tab
  const filteredCrops = useMemo(() => {
    let filtered = crops;
    
    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(crop => 
        crop.label.toLowerCase().includes(query) ||
        crop.value.toLowerCase().includes(query) ||
        (crop.local_name && crop.local_name.toLowerCase().includes(query))
      );
    }
    
    // Filter by tab
    if (selectedTab === 'popular') {
      filtered = filtered.filter(crop => crop.is_popular);
    } else if (selectedTab !== 'all') {
      // Filter by crop group
      filtered = filtered.filter(crop => crop.crop_group_id === selectedTab);
    }
    
    return filtered;
  }, [crops, searchQuery, selectedTab]);

  // Get current season based on month
  const getCurrentSeason = () => {
    const month = new Date().getMonth() + 1;
    if (month >= 6 && month <= 10) return 'kharif';
    if (month >= 10 || month <= 3) return 'rabi';
    return 'zaid';
  };

  const currentSeason = getCurrentSeason();

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-10 w-full" />
        <div className="grid grid-cols-2 gap-2">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-center">
        <p className="text-destructive">{error}</p>
        <Button onClick={() => window.location.reload()} className="mt-2">
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search Bar */}
      <div className="p-4 border-b">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search crops by name (English/Local)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            autoFocus
          />
        </div>
        
        {/* Season Indicator */}
        <div className="mt-2 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Current Season:</span>
          <Badge variant="secondary" className="text-xs capitalize">
            {currentSeason}
          </Badge>
        </div>
      </div>

      {/* Tabs for Categories */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="flex-1 flex flex-col">
        <TabsList className="grid grid-cols-4 gap-1 mx-4 mt-2">
          <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
          <TabsTrigger value="popular" className="text-xs">Popular</TabsTrigger>
          {cropGroups.slice(0, 2).map(group => (
            <TabsTrigger key={group.id} value={group.id} className="text-xs">
              {group.group_name}
            </TabsTrigger>
          ))}
        </TabsList>
        
        {/* Additional category tabs if more groups exist */}
        {cropGroups.length > 2 && (
          <div className="flex gap-1 px-4 mt-1 overflow-x-auto">
            {cropGroups.slice(2).map(group => (
              <Button
                key={group.id}
                variant={selectedTab === group.id ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedTab(group.id)}
                className="text-xs whitespace-nowrap"
              >
                {groupIcons[group.group_key]}
                <span className="ml-1">{group.group_name}</span>
              </Button>
            ))}
          </div>
        )}

        <TabsContent value={selectedTab} className="flex-1 mt-0">
          <ScrollArea className="h-[400px]">
            <div className="p-4 space-y-2">
              {filteredCrops.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">No crops found</p>
                  {searchQuery && (
                    <Button
                      variant="link"
                      onClick={() => setSearchQuery('')}
                      className="mt-2"
                    >
                      Clear search
                    </Button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2">
                  {filteredCrops.map(crop => (
                    <Button
                      key={crop.id}
                      variant={selectedCropId === crop.id ? "default" : "outline"}
                      className={cn(
                        "justify-start h-auto py-3 px-4",
                        selectedCropId === crop.id && "ring-2 ring-primary"
                      )}
                      onClick={() => onSelect(crop.id, crop.label, crop.local_name)}
                    >
                      <div className="flex items-start justify-between w-full">
                        <div className="text-left">
                          <div className="font-medium">{crop.label}</div>
                          {crop.local_name && (
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {crop.local_name}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-1 ml-2">
                          {crop.is_popular && (
                            <Badge variant="secondary" className="text-xs">
                              Popular
                            </Badge>
                          )}
                          {crop.season && crop.season.toLowerCase() === currentSeason && (
                            <Badge variant="default" className="text-xs">
                              In Season
                            </Badge>
                          )}
                        </div>
                      </div>
                    </Button>
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>

      {/* Back button if needed */}
      {onBack && (
        <div className="p-4 border-t">
          <Button variant="outline" onClick={onBack} className="w-full">
            Back
          </Button>
        </div>
      )}
    </div>
  );
}