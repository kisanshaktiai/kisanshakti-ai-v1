import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Check, Wheat, Sprout, TreePine, Flower, Apple, Carrot, Bean, ChevronRight } from 'lucide-react';
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

interface CropSelectionDialogProps {
  open: boolean;
  onClose: () => void;
  onSelect: (cropId: string, cropName: string) => void;
  selectedCropId?: string;
  title?: string;
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

export function CropSelectionDialog({ 
  open, 
  onClose, 
  onSelect, 
  selectedCropId,
  title = "Select Crop"
}: CropSelectionDialogProps) {
  const [cropGroups, setCropGroups] = useState<CropGroup[]>([]);
  const [crops, setCrops] = useState<Crop[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [selectedCrop, setSelectedCrop] = useState<string | null>(selectedCropId || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'groups' | 'crops'>('groups');

  // Reset selected crop when prop changes
  useEffect(() => {
    if (selectedCropId !== undefined) {
      setSelectedCrop(selectedCropId);
    }
  }, [selectedCropId]);

  // Fetch crop groups when dialog opens
  useEffect(() => {
    if (!open) {
      // Reset state when dialog closes
      setTimeout(() => {
        setSelectedGroup(null);
        setStep('groups');
        setCrops([]);
        setError(null);
        setSelectedCrop(selectedCropId || null);
      }, 200); // Small delay to allow animation to complete
      return;
    }

    // Fetch crop groups when dialog opens
    const fetchCropGroups = async () => {
      console.log('Fetching crop groups...');
      setLoading(true);
      setError(null);
      
      try {
        const { data, error } = await supabase
          .from('crop_groups')
          .select('*')
          .eq('is_active', true)
          .order('display_order');

        if (error) {
          console.error('Supabase error fetching crop groups:', error);
          throw error;
        }
        
        console.log('Fetched crop groups:', data);
        setCropGroups(data || []);
      } catch (err) {
        console.error('Error fetching crop groups:', err);
        setError('Failed to load crop groups. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchCropGroups();
  }, [open, selectedCropId]);

  // Fetch crops when a group is selected
  useEffect(() => {
    if (!selectedGroup || !open) {
      return;
    }

    const fetchCrops = async () => {
      console.log('Fetching crops for group:', selectedGroup);
      setLoading(true);
      setError(null);
      setCrops([]); // Clear previous crops
      
      try {
        const { data, error } = await supabase
          .from('crops')
          .select('*')
          .eq('crop_group_id', selectedGroup)
          .eq('is_active', true)
          .order('display_order');

        if (error) {
          console.error('Supabase error fetching crops:', error);
          throw error;
        }
        
        console.log('Fetched crops for group:', selectedGroup, data);
        if (data && data.length > 0) {
          setCrops(data);
          setStep('crops');
        } else {
          setError('No crops available in this group');
          setCrops([]);
          setStep('crops');
        }
      } catch (err) {
        console.error('Error fetching crops:', err);
        setError('Failed to load crops. Please try again.');
        setCrops([]);
      } finally {
        setLoading(false);
      }
    };

    fetchCrops();
  }, [selectedGroup, open]);

  const handleGroupSelect = (groupId: string) => {
    setSelectedGroup(groupId);
    setSelectedCrop(null);
  };

  const handleCropSelect = (cropId: string) => {
    setSelectedCrop(cropId);
  };

  const handleConfirm = () => {
    if (selectedCrop) {
      const crop = crops.find(c => c.id === selectedCrop);
      if (crop) {
        console.log('Confirming crop selection:', crop);
        onSelect(crop.id, crop.label);
        handleClose();
      }
    }
  };

  const handleBack = () => {
    setStep('groups');
    setSelectedGroup(null);
    setSelectedCrop(null);
    setCrops([]);
  };

  const getGroupIcon = (iconName: string) => {
    const Icon = groupIcons[iconName.toLowerCase()] || groupIcons.default;
    return Icon;
  };

  const handleClose = () => {
    // Reset state when closing
    setSelectedCrop(null);
    setSelectedGroup(null);
    setStep('groups');
    setCrops([]);
    setError(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {step === 'crops' && (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleBack}
                className="h-6 w-6 mr-1"
              >
                <ChevronRight className="h-4 w-4 rotate-180" />
              </Button>
            )}
            {title}
            {step === 'crops' && selectedGroup && (
              <Badge variant="secondary" className="ml-2">
                {cropGroups.find(g => g.id === selectedGroup)?.group_name}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {step === 'groups' ? 'Choose a crop category to get started' : 'Select a specific crop from the list'}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {loading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="text-center p-8">
              <p className="text-sm text-destructive">{error}</p>
              <Button 
                variant="outline" 
                onClick={() => window.location.reload()} 
                className="mt-4"
              >
                Retry
              </Button>
            </div>
          ) : step === 'groups' ? (
            <div className="grid grid-cols-2 gap-3">
              {cropGroups.length > 0 ? (
                cropGroups.map((group) => {
                  const Icon = getGroupIcon(group.group_icon);
                  const isSelected = selectedGroup === group.id;
                  
                  return (
                    <Card
                      key={group.id}
                      className={cn(
                        "p-4 cursor-pointer transition-all hover:shadow-md",
                        "border-2 group",
                        isSelected
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      )}
                      onClick={() => handleGroupSelect(group.id)}
                    >
                      <div className="flex flex-col items-center space-y-2">
                        <div className={cn(
                          "p-3 rounded-full transition-colors",
                          isSelected 
                            ? "bg-primary/10" 
                            : "bg-muted group-hover:bg-primary/5"
                        )}>
                          <Icon className={cn(
                            "h-6 w-6",
                            isSelected ? "text-primary" : "text-muted-foreground"
                          )} />
                        </div>
                        <p className={cn(
                          "text-sm font-medium text-center",
                          isSelected ? "text-primary" : "text-foreground"
                        )}>
                          {group.group_name}
                        </p>
                        {group.description && (
                          <p className="text-xs text-muted-foreground text-center line-clamp-2">
                            {group.description}
                          </p>
                        )}
                      </div>
                    </Card>
                  );
                })
              ) : (
                <p className="text-sm text-muted-foreground text-center col-span-2">
                  No crop groups available
                </p>
              )}
            </div>
          ) : null}

          {step === 'crops' && crops.length > 0 && (
            <ScrollArea className="h-[300px] w-full pr-4">
              <div className="grid grid-cols-2 gap-2">
                {crops.map((crop) => {
                  const isSelected = selectedCrop === crop.id;
                  
                  return (
                    <Card
                      key={crop.id}
                      className={cn(
                        "p-3 cursor-pointer transition-all",
                        isSelected
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      )}
                      onClick={() => handleCropSelect(crop.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <p className={cn(
                            "text-sm font-medium truncate",
                            isSelected ? "text-primary" : "text-foreground"
                          )}>
                            {crop.label}
                          </p>
                          {crop.label_local && (
                            <p className="text-xs text-muted-foreground truncate">
                              {crop.label_local}
                            </p>
                          )}
                          {crop.season && (
                            <Badge variant="outline" className="mt-1 text-xs">
                              {crop.season}
                            </Badge>
                          )}
                        </div>
                        {isSelected && (
                          <Check className="h-4 w-4 text-primary flex-shrink-0 ml-2" />
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            </ScrollArea>
          )}

          {step === 'crops' && crops.length === 0 && (
            <p className="text-sm text-muted-foreground text-center p-8">
              No crops available in this group
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          {step === 'crops' && (
            <Button 
              onClick={handleConfirm} 
              disabled={!selectedCrop}
            >
              Confirm Selection
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}