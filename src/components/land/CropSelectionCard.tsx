import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Check, Wheat, Carrot, Apple, Trees, Coffee } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface CropGroup {
  id: string;
  group_key: string;
  group_name: string;
  group_icon: string;
  display_order: number;
}

interface Crop {
  id: string;
  value: string;
  label: string;
  label_local?: string;
  crop_group_id: string;
  icon: string;
  season?: string;
  duration_days?: number;
}

interface CropSelectionCardProps {
  value?: string;
  cropName?: string;
  onChange: (cropId: string, cropName: string) => void;
  label?: string;
  required?: boolean;
  className?: string;
}

// Icon mapping for crop groups
const groupIconMap: Record<string, React.ElementType> = {
  grain: Wheat,
  vegetable: Carrot,
  fruit: Apple,
  tree: Trees,
  cash: Coffee,
};

export function CropSelectionCard({
  value,
  cropName,
  onChange,
  label,
  required,
  className
}: CropSelectionCardProps) {
  const [open, setOpen] = useState(false);
  const [cropGroups, setCropGroups] = useState<CropGroup[]>([]);
  const [crops, setCrops] = useState<Crop[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string>('');
  const [selectedCrop, setSelectedCrop] = useState<string>(value || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch crop groups on component mount
  useEffect(() => {
    fetchCropGroups();
  }, []);

  // Fetch crops when group is selected
  useEffect(() => {
    if (selectedGroup) {
      fetchCrops(selectedGroup);
    }
  }, [selectedGroup]);

  const fetchCropGroups = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('crop_groups')
        .select('*')
        .eq('is_active', true)
        .order('display_order');

      if (error) throw error;
      setCropGroups(data || []);
      
      // Auto-select first group
      if (data && data.length > 0) {
        setSelectedGroup(data[0].id);
      }
    } catch (err) {
      console.error('Error fetching crop groups:', err);
      setError('Failed to load crop groups');
    } finally {
      setLoading(false);
    }
  };

  const fetchCrops = async (groupId: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('crops')
        .select('*')
        .eq('crop_group_id', groupId)
        .eq('is_active', true)
        .order('display_order');

      if (error) throw error;
      setCrops(data || []);
    } catch (err) {
      console.error('Error fetching crops:', err);
      setError('Failed to load crops');
    } finally {
      setLoading(false);
    }
  };

  const handleCropSelect = (crop: Crop) => {
    setSelectedCrop(crop.id);
    onChange(crop.id, crop.label);
    setOpen(false);
  };

  const getGroupIcon = (iconName: string) => {
    const Icon = groupIconMap[iconName] || Wheat;
    return Icon;
  };

  const getCropIcon = (iconName: string) => {
    // Simple emoji mapping for crops
    const emojiMap: Record<string, string> = {
      rice: '🌾',
      wheat: '🌾',
      corn: '🌽',
      cotton: '🥋',
      tomato: '🍅',
      potato: '🥔',
      onion: '🧅',
      carrot: '🥕',
      cabbage: '🥬',
      apple: '🍎',
      mango: '🥭',
      banana: '🍌',
      orange: '🍊',
      grapes: '🍇',
      coffee: '☕',
      tea: '🍵',
      sugarcane: '🎋',
      default: '🌱'
    };
    return emojiMap[iconName] || emojiMap.default;
  };

  return (
    <>
      <Card 
        className={cn(
          "p-4 cursor-pointer hover:border-primary transition-colors",
          className
        )}
        onClick={() => setOpen(true)}
      >
        <div className="space-y-1">
          {label && (
            <p className="text-sm font-medium text-muted-foreground">
              {label}
              {required && <span className="text-destructive ml-1">*</span>}
            </p>
          )}
          <div className="flex items-center justify-between">
            <span className={cn(
              "text-sm",
              cropName ? "text-foreground" : "text-muted-foreground"
            )}>
              {cropName || "Select a crop"}
            </span>
            {cropName && (
              <Badge variant="secondary" className="text-xs">
                Selected
              </Badge>
            )}
          </div>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] p-0">
          <DialogHeader className="p-4 pb-2">
            <DialogTitle>{label || "Select Crop"}</DialogTitle>
          </DialogHeader>
          
          {loading && (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}

          {error && (
            <div className="p-4 text-center text-destructive">
              {error}
            </div>
          )}

          {!loading && !error && (
            <Tabs value={selectedGroup} onValueChange={setSelectedGroup} className="w-full">
              <TabsList className="grid grid-cols-3 lg:grid-cols-5 gap-1 mx-4">
                {cropGroups.map((group) => {
                  const Icon = getGroupIcon(group.group_icon);
                  return (
                    <TabsTrigger 
                      key={group.id} 
                      value={group.id}
                      className="flex flex-col gap-1 h-auto py-2"
                    >
                      <Icon className="h-4 w-4" />
                      <span className="text-[10px]">{group.group_name}</span>
                    </TabsTrigger>
                  );
                })}
              </TabsList>

              <ScrollArea className="h-[400px] w-full">
                {cropGroups.map((group) => (
                  <TabsContent 
                    key={group.id} 
                    value={group.id}
                    className="mt-0 p-4"
                  >
                    <div className="grid grid-cols-3 lg:grid-cols-4 gap-2">
                      {crops.map((crop) => (
                        <Card
                          key={crop.id}
                          className={cn(
                            "p-3 cursor-pointer transition-all hover:border-primary",
                            selectedCrop === crop.id && "border-primary bg-primary/10"
                          )}
                          onClick={() => handleCropSelect(crop)}
                        >
                          <div className="flex flex-col items-center space-y-2">
                            <span className="text-2xl">
                              {getCropIcon(crop.icon)}
                            </span>
                            <div className="text-center">
                              <p className="text-xs font-medium">
                                {crop.label}
                              </p>
                              {crop.label_local && (
                                <p className="text-[10px] text-muted-foreground">
                                  {crop.label_local}
                                </p>
                              )}
                            </div>
                            {crop.season && (
                              <Badge variant="outline" className="text-[10px] px-1">
                                {crop.season}
                              </Badge>
                            )}
                            {selectedCrop === crop.id && (
                              <Check className="h-3 w-3 text-primary" />
                            )}
                          </div>
                        </Card>
                      ))}
                    </div>
                    {crops.length === 0 && (
                      <div className="text-center text-muted-foreground py-8">
                        No crops available in this category
                      </div>
                    )}
                  </TabsContent>
                ))}
              </ScrollArea>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}