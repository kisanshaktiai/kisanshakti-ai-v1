import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Loader2, ChevronLeft, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface CropGroup {
  id: string;
  group_name: string;
  group_icon: string;
  display_order: number;
}

interface Crop {
  id: string;
  label: string;
  label_local?: string;
  icon?: string;
  season?: string;
  crop_group_id: string;
}

interface SimpleCropSelectorProps {
  selectedCropId?: string;
  onSelect: (cropId: string, cropName: string) => void;
  className?: string;
}

export function SimpleCropSelector({ 
  selectedCropId, 
  onSelect,
  className 
}: SimpleCropSelectorProps) {
  const [step, setStep] = useState<'groups' | 'crops'>('groups');
  const [groups, setGroups] = useState<CropGroup[]>([]);
  const [crops, setCrops] = useState<Crop[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<CropGroup | null>(null);
  const [selectedCrop, setSelectedCrop] = useState<Crop | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load crop groups on mount
  useEffect(() => {
    loadCropGroups();
  }, []);

  // Set initially selected crop if provided
  useEffect(() => {
    if (selectedCropId) {
      loadSelectedCrop(selectedCropId);
    }
  }, [selectedCropId]);

  const loadCropGroups = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const { data, error: fetchError } = await supabase
        .from('crop_groups')
        .select('*')
        .eq('is_active', true)
        .order('display_order');

      if (fetchError) throw fetchError;
      
      setGroups(data || []);
    } catch (err) {
      console.error('Error loading crop groups:', err);
      setError('Failed to load crop categories');
    } finally {
      setLoading(false);
    }
  };

  const loadSelectedCrop = async (cropId: string) => {
    try {
      const { data, error: fetchError } = await supabase
        .from('crops')
        .select('*')
        .eq('id', cropId)
        .single();

      if (!fetchError && data) {
        setSelectedCrop(data);
      }
    } catch (err) {
      console.error('Error loading selected crop:', err);
    }
  };

  const loadCrops = async (group: CropGroup) => {
    setLoading(true);
    setError(null);
    setCrops([]);
    
    try {
      const { data, error: fetchError } = await supabase
        .from('crops')
        .select('*')
        .eq('crop_group_id', group.id)
        .eq('is_active', true)
        .order('display_order');

      if (fetchError) throw fetchError;
      
      setCrops(data || []);
      setStep('crops');
    } catch (err) {
      console.error('Error loading crops:', err);
      setError('Failed to load crops');
    } finally {
      setLoading(false);
    }
  };

  const handleGroupSelect = (group: CropGroup) => {
    setSelectedGroup(group);
    loadCrops(group);
  };

  const handleCropSelect = (crop: Crop) => {
    setSelectedCrop(crop);
    onSelect(crop.id, crop.label);
  };

  const handleBack = () => {
    setStep('groups');
    setSelectedGroup(null);
    setCrops([]);
    setError(null);
  };

  const renderGroups = () => (
    <div className="grid grid-cols-2 gap-3 p-4">
      {groups.map((group) => (
        <Card
          key={group.id}
          className={cn(
            "p-4 cursor-pointer transition-all hover:shadow-md border-2",
            "hover:border-primary/50 active:scale-95"
          )}
          onClick={() => handleGroupSelect(group)}
        >
          <div className="flex flex-col items-center space-y-2">
            <span className="text-3xl">{group.group_icon}</span>
            <span className="text-sm font-medium text-center">
              {group.group_name}
            </span>
          </div>
        </Card>
      ))}
    </div>
  );

  const renderCrops = () => (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 p-4 border-b">
        <Button
          variant="ghost"
          size="icon"
          onClick={handleBack}
          className="h-8 w-8"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="font-medium">{selectedGroup?.group_name}</span>
      </div>

      <ScrollArea className="flex-1">
        <div className="grid grid-cols-1 gap-2 p-4">
          {crops.map((crop) => {
            const isSelected = selectedCrop?.id === crop.id || selectedCropId === crop.id;
            
            return (
              <Card
                key={crop.id}
                className={cn(
                  "p-3 cursor-pointer transition-all",
                  "hover:shadow-md active:scale-[0.98]",
                  isSelected ? "border-primary bg-primary/5" : "hover:border-primary/50"
                )}
                onClick={() => handleCropSelect(crop)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{crop.icon || "🌱"}</span>
                    <div>
                      <p className="font-medium">{crop.label}</p>
                      {crop.label_local && (
                        <p className="text-xs text-muted-foreground">{crop.label_local}</p>
                      )}
                      {crop.season && (
                        <Badge variant="outline" className="mt-1 text-xs">
                          {crop.season}
                        </Badge>
                      )}
                    </div>
                  </div>
                  {isSelected && (
                    <Check className="h-5 w-5 text-primary" />
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center p-8">
        <p className="text-destructive mb-4">{error}</p>
        <Button onClick={loadCropGroups} variant="outline">
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("bg-background", className)}>
      {step === 'groups' ? renderGroups() : renderCrops()}
    </div>
  );
}