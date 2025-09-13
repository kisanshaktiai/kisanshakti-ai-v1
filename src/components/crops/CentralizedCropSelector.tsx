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
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="grid grid-cols-3 lg:grid-cols-4 gap-4 p-6"
      >
        {groups.map((group, index) => (
          <motion.div
            key={group.id}
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ 
              delay: index * 0.03,
              type: "spring",
              stiffness: 260,
              damping: 20
            }}
            whileHover={{ scale: 1.05, y: -5 }}
            whileTap={{ scale: 0.98 }}
          >
            <div
              className={cn(
                "relative cursor-pointer transition-all duration-300",
                "glass-card-premium hover:glass-card-glow",
                "group"
              )}
              onClick={() => handleGroupSelect(group)}
            >
              {/* Gradient background effect */}
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/10 via-accent/5 to-secondary/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              
              {/* Content */}
              <div className="relative flex flex-col items-center p-6 space-y-3">
                {/* Icon with gradient background */}
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-accent/20 rounded-full blur-xl group-hover:blur-2xl transition-all duration-300" />
                  <span className="relative text-4xl lg:text-5xl transform group-hover:scale-110 transition-transform duration-300 filter drop-shadow-lg">
                    {group.group_icon}
                  </span>
                </div>
                
                {/* Label */}
                <span className="text-sm font-semibold text-foreground/90 group-hover:text-foreground transition-colors duration-300">
                  {group.group_name}
                </span>
              </div>
              
              {/* Hover glow effect */}
              <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none">
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/10 via-transparent to-accent/10" />
              </div>
            </div>
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
                  <div
                    className={cn(
                      "relative cursor-pointer transition-all duration-300",
                      "glass-card hover:glass-card-glow",
                      isSelected && "glass-card-selected",
                      "group"
                    )}
                    onClick={() => handleCropSelect(crop)}
                  >
                    {/* Selection overlay */}
                    {isSelected && (
                      <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-primary/20 via-accent/10 to-secondary/10 animate-pulse-subtle" />
                    )}
                    
                    {/* Hover gradient */}
                    <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-primary/5 via-transparent to-accent/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    
                    <div className="relative flex items-center justify-between p-4">
                      <div className="flex items-center gap-3">
                        {/* Icon with gradient shadow */}
                        <motion.div 
                          className="relative"
                          whileHover={{ scale: 1.15, rotate: 5 }}
                          transition={{ type: "spring", stiffness: 300 }}
                        >
                          <div className="absolute inset-0 bg-gradient-to-br from-primary/30 to-accent/30 rounded-full blur-lg group-hover:blur-xl transition-all duration-300" />
                          <span className="relative text-2xl filter drop-shadow-md">
                            {crop.icon || "🌱"}
                          </span>
                        </motion.div>
                        
                        <div className="flex-1">
                          <p className="font-semibold text-foreground/90 group-hover:text-foreground flex items-center gap-2 transition-colors duration-300">
                            {crop.label}
                            {crop.is_popular && (
                              <Badge className="glass-badge text-xs px-2 py-0.5">
                                <Sparkles className="h-3 w-3 mr-1" />
                                Popular
                              </Badge>
                            )}
                          </p>
                          {crop.label_local && (
                            <p className="text-xs text-muted-foreground/80 mt-0.5">{crop.label_local}</p>
                          )}
                          {crop.season && (
                            <Badge variant="outline" className="mt-2 text-xs glass-badge">
                              {crop.season}
                            </Badge>
                          )}
                        </div>
                      </div>
                      
                      {/* Selection checkmark */}
                      {isSelected && (
                        <motion.div
                          initial={{ scale: 0, rotate: -180 }}
                          animate={{ scale: 1, rotate: 0 }}
                          transition={{ type: "spring", stiffness: 500, damping: 20 }}
                        >
                          <div className="glass-checkmark">
                            <Check className="h-4 w-4 text-white" />
                          </div>
                        </motion.div>
                      )}
                    </div>
                  </div>
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