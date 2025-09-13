import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Loader2, ChevronLeft, Check, Search, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

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
  is_popular?: boolean;
}

interface CentralizedCropSelectorProps {
  selectedCropId?: string;
  onSelect: (cropId: string, cropName: string) => void;
  className?: string;
  showSearch?: boolean;
  showHeader?: boolean;
  variant?: 'default' | 'compact' | 'modal';
}

export function CentralizedCropSelector({ 
  selectedCropId, 
  onSelect,
  className,
  showSearch = true,
  showHeader = true,
  variant = 'default'
}: CentralizedCropSelectorProps) {
  const [step, setStep] = useState<'groups' | 'crops'>('groups');
  const [groups, setGroups] = useState<CropGroup[]>([]);
  const [crops, setCrops] = useState<Crop[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<CropGroup | null>(null);
  const [selectedCrop, setSelectedCrop] = useState<Crop | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

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
      
      // Mark popular crops
      const processedCrops = (data || []).map(crop => ({
        ...crop,
        is_popular: ['rice', 'wheat', 'cotton', 'sugarcane'].includes(crop.label.toLowerCase())
      }));
      
      setCrops(processedCrops);
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
    setSearchQuery('');
  };

  const filteredCrops = crops.filter(crop => 
    crop.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (crop.label_local && crop.label_local.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const renderGroups = () => (
    <AnimatePresence mode="wait">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4"
      >
        {groups.map((group, index) => (
          <motion.div
            key={group.id}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.05 }}
          >
            <Card
              className={cn(
                "relative p-4 cursor-pointer transition-all hover:shadow-lg border-2",
                "hover:border-primary/50 active:scale-95",
                "bg-gradient-to-br from-background to-muted/20",
                "group overflow-hidden"
              )}
              onClick={() => handleGroupSelect(group)}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-primary/10 opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative flex flex-col items-center space-y-2">
                <span className="text-3xl transform group-hover:scale-110 transition-transform">
                  {group.group_icon}
                </span>
                <span className="text-sm font-medium text-center">
                  {group.group_name}
                </span>
              </div>
            </Card>
          </motion.div>
        ))}
      </motion.div>
    </AnimatePresence>
  );

  const renderCrops = () => (
    <div className="flex flex-col h-full">
      {showHeader && (
        <div className="flex items-center gap-2 p-4 border-b bg-muted/30">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleBack}
            className="h-8 w-8"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="font-medium flex items-center gap-2">
            <span className="text-lg">{selectedGroup?.group_icon}</span>
            {selectedGroup?.group_name}
          </span>
        </div>
      )}

      {showSearch && (
        <div className="p-4 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search crops..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
      )}

      <ScrollArea className="flex-1">
        <AnimatePresence mode="wait">
          <motion.div 
            className="grid grid-cols-1 gap-2 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {filteredCrops.map((crop, index) => {
              const isSelected = selectedCrop?.id === crop.id || selectedCropId === crop.id;
              
              return (
                <motion.div
                  key={crop.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.02 }}
                >
                  <Card
                    className={cn(
                      "p-3 cursor-pointer transition-all group",
                      "hover:shadow-md active:scale-[0.98]",
                      isSelected ? "border-primary bg-gradient-to-r from-primary/10 to-primary/5 shadow-md" : "hover:border-primary/50",
                      "relative overflow-hidden"
                    )}
                    onClick={() => handleCropSelect(crop)}
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="relative flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <motion.span 
                          className="text-xl"
                          whileHover={{ scale: 1.1 }}
                          transition={{ type: "spring", stiffness: 400 }}
                        >
                          {crop.icon || "🌱"}
                        </motion.span>
                        <div>
                          <p className="font-medium flex items-center gap-2">
                            {crop.label}
                            {crop.is_popular && (
                              <Badge variant="secondary" className="text-xs px-1.5 py-0">
                                <Sparkles className="h-3 w-3 mr-1" />
                                Popular
                              </Badge>
                            )}
                          </p>
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
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ type: "spring", stiffness: 400 }}
                        >
                          <div className="bg-primary text-primary-foreground rounded-full p-1">
                            <Check className="h-4 w-4" />
                          </div>
                        </motion.div>
                      )}
                    </div>
                  </Card>
                </motion.div>
              );
            })}
          </motion.div>
        </AnimatePresence>
      </ScrollArea>
    </div>
  );

  if (loading && groups.length === 0) {
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

  const containerClass = cn(
    "bg-background rounded-lg",
    variant === 'compact' && "max-h-[400px]",
    variant === 'modal' && "min-h-[500px]",
    className
  );

  return (
    <div className={containerClass}>
      {step === 'groups' ? renderGroups() : renderCrops()}
    </div>
  );
}