import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Check, Wheat, Sprout, TreePine, Flower, Apple, Carrot, Bean } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface CropGroup {
  id: string;
  group_name: string;
  group_icon: string;
  description?: string;
}

interface Crop {
  id: string;
  value: string;
  label: string;
  label_local?: string;
  crop_group_id: string;
  season?: string;
  duration_days?: number;
}

interface CropSelectorProps {
  value?: string;
  onChange: (cropId: string, cropName: string) => void;
  mode?: 'single' | 'multiple';
  className?: string;
  label?: string;
}

const groupIcons: Record<string, React.ElementType> = {
  grain: Wheat,
  vegetable: Carrot,
  fruit: Apple,
  pulse: Bean,
  oilseed: Flower,
  spice: Sprout,
  cash: TreePine,
  default: Sprout,
};

export function CropSelector({ value, onChange, mode = 'single', className, label }: CropSelectorProps) {
  const [cropGroups, setCropGroups] = useState<CropGroup[]>([]);
  const [crops, setCrops] = useState<Crop[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [selectedCrop, setSelectedCrop] = useState<string | null>(value || null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch crop groups from database
  useEffect(() => {
    const fetchCropGroups = async () => {
      try {
        const { data, error } = await supabase
          .from('crop_groups')
          .select('*')
          .eq('is_active', true)
          .order('display_order');

        if (error) throw error;
        setCropGroups(data || []);
      } catch (err) {
        console.error('Error fetching crop groups:', err);
        setError('Failed to load crop groups');
      } finally {
        setLoading(false);
      }
    };

    fetchCropGroups();
  }, []);

  // Fetch crops when a group is selected
  useEffect(() => {
    if (!selectedGroup) {
      setCrops([]);
      return;
    }

    const fetchCrops = async () => {
      try {
        const { data, error } = await supabase
          .from('crops')
          .select('*')
          .eq('crop_group_id', selectedGroup)
          .eq('is_active', true)
          .order('display_order');

        if (error) throw error;
        setCrops(data || []);
      } catch (err) {
        console.error('Error fetching crops:', err);
        setError('Failed to load crops');
      }
    };

    fetchCrops();
  }, [selectedGroup]);

  const handleGroupSelect = (groupId: string) => {
    setSelectedGroup(groupId === selectedGroup ? null : groupId);
    setSelectedCrop(null);
  };

  const handleCropSelect = (cropId: string, cropName: string) => {
    if (mode === 'single') {
      setSelectedCrop(cropId);
      onChange(cropId, cropName);
    }
  };

  const getGroupIcon = (iconName: string) => {
    const Icon = groupIcons[iconName.toLowerCase()] || groupIcons.default;
    return Icon;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center p-4 text-destructive">
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      {label && <p className="text-sm font-medium text-foreground">{label}</p>}
      
      {/* Crop Groups */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {cropGroups.map((group) => {
          const Icon = getGroupIcon(group.group_icon);
          const isSelected = selectedGroup === group.id;
          
          return (
            <Card
              key={group.id}
              className={cn(
                "p-3 cursor-pointer transition-all hover:shadow-md",
                "border-2",
                isSelected
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50"
              )}
              onClick={() => handleGroupSelect(group.id)}
            >
              <div className="flex items-center space-x-2">
                <Icon className={cn(
                  "h-5 w-5",
                  isSelected ? "text-primary" : "text-muted-foreground"
                )} />
                <div className="flex-1 min-w-0">
                  <p className={cn(
                    "text-xs font-medium truncate",
                    isSelected ? "text-primary" : "text-foreground"
                  )}>
                    {group.group_name}
                  </p>
                </div>
                {isSelected && <Check className="h-4 w-4 text-primary flex-shrink-0" />}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Crops under selected group */}
      {selectedGroup && crops.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Select crop:</p>
          <ScrollArea className="h-32 w-full rounded-md border p-2">
            <div className="flex flex-wrap gap-1.5">
              {crops.map((crop) => {
                const isSelected = selectedCrop === crop.id;
                
                return (
                  <Badge
                    key={crop.id}
                    variant={isSelected ? "default" : "outline"}
                    className={cn(
                      "cursor-pointer transition-all",
                      isSelected
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-primary/10"
                    )}
                    onClick={() => handleCropSelect(crop.id, crop.label)}
                  >
                    {crop.label}
                    {crop.label_local && (
                      <span className="ml-1 text-xs opacity-75">
                        ({crop.label_local})
                      </span>
                    )}
                  </Badge>
                );
              })}
            </div>
          </ScrollArea>
        </div>
      )}

      {selectedGroup && crops.length === 0 && (
        <p className="text-xs text-muted-foreground text-center p-2">
          No crops available in this group
        </p>
      )}
    </div>
  );
}