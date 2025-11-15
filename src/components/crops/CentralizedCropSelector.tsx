import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Loader2, ChevronLeft, ChevronRight, Check, Search, Sparkles } from 'lucide-react';
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
        className="grid grid-cols-3 sm:grid-cols-4 gap-2 sm:gap-3 p-3 sm:p-4 h-full overflow-y-auto"
      >
        {groups.map((group, index) => (
          <motion.div
            key={group.id}
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ 
              delay: index * 0.02,
              type: "spring",
              stiffness: 400,
              damping: 25
            }}
            whileTap={{ scale: 0.97 }}
          >
            <button
              className={cn(
                "relative w-full aspect-square",
                "bg-gradient-to-br from-background/90 to-background/70",
                "backdrop-blur-2xl border border-border/50",
                "rounded-xl shadow-lg hover:shadow-xl",
                "transition-all duration-300 ease-out",
                "hover:-translate-y-0.5 active:translate-y-0",
                "group overflow-hidden"
              )}
              onClick={() => handleGroupSelect(group)}
            >
              {/* Animated gradient background */}
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-accent/10 to-transparent" />
              </div>
              
              {/* Glow effect */}
              <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 to-accent/20 rounded-xl blur-xl opacity-0 group-hover:opacity-60 transition-opacity duration-500" />
              
              {/* Content */}
              <div className="relative h-full flex flex-col items-center justify-center p-3 space-y-1">
                {/* Icon container with animation */}
                <motion.div
                  className="relative"
                  whileHover={{ rotate: [0, -5, 5, 0], scale: 1.1 }}
                  transition={{ duration: 0.5 }}
                >
                  <span className="text-2xl sm:text-3xl lg:text-4xl filter drop-shadow-lg">
                    {group.group_icon}
                  </span>
                </motion.div>
                
                {/* Label with better typography */}
                <span className="text-[10px] sm:text-xs font-semibold text-foreground/80 group-hover:text-foreground transition-colors text-center leading-tight">
                  {group.group_name}
                </span>
                
                {/* Subtle arrow indicator */}
                <motion.div
                  className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 transition-all duration-300"
                  initial={{ x: -10 }}
                  whileHover={{ x: 0 }}
                >
                  <ChevronRight className="h-3 w-3 text-primary/60" />
                </motion.div>
              </div>
            </button>
          </motion.div>
        ))}
      </motion.div>
    </AnimatePresence>
  );

  const renderCrops = () => (
    <div className="flex flex-col h-full">
      {showHeader && (
        <div className="flex items-center gap-2 p-4 border-b bg-muted/30">
          {step === 'crops' && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleBack}
              className="h-8 w-8"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          )}
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
              className="pl-10 glass-card"
            />
          </div>
        </div>
      )}

      <ScrollArea className="flex-1 h-full">
        <AnimatePresence mode="wait">
          <motion.div 
            className="grid grid-cols-3 sm:grid-cols-4 gap-2 p-3 sm:p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {filteredCrops.map((crop, index) => {
              const isSelected = selectedCrop?.id === crop.id || selectedCropId === crop.id;
              
              return (
                <motion.div
                  key={crop.id}
                  initial={{ opacity: 0, scale: 0.9, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ 
                    delay: index * 0.01,
                    type: "spring",
                    stiffness: 500,
                    damping: 30
                  }}
                  whileTap={{ scale: 0.97 }}
                >
                  <button
                    className={cn(
                      "relative w-full p-2 sm:p-3 text-left",
                      "bg-gradient-to-br from-background/80 to-background/60",
                      "backdrop-blur-xl border",
                      isSelected 
                        ? "border-primary/50 shadow-lg shadow-primary/20" 
                        : "border-border/40 shadow-md",
                      "rounded-lg transition-all duration-300",
                      "hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0",
                      "group overflow-hidden"
                    )}
                    onClick={() => handleCropSelect(crop)}
                  >
                    {/* Selection gradient overlay */}
                    {isSelected && (
                      <motion.div
                        className="absolute inset-0 bg-gradient-to-br from-primary/15 to-accent/10"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.3 }}
                      />
                    )}
                    
                    {/* Hover effect */}
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/0 to-accent/0 group-hover:from-primary/10 group-hover:to-accent/5 transition-all duration-500" />
                    
                    {/* Content - Compact for grid */}
                    <div className="relative flex flex-col items-center text-center space-y-2">
                      {/* Icon with modern effect */}
                      <motion.div 
                        className="relative"
                        whileHover={{ rotate: [0, -10, 10, 0], scale: 1.1 }}
                        transition={{ duration: 0.4 }}
                      >
                        {/* Icon shadow/glow */}
                        <div className={cn(
                          "absolute inset-0 rounded-full blur-lg transition-all duration-300",
                          isSelected 
                            ? "bg-gradient-to-br from-primary/40 to-accent/40" 
                            : "bg-gradient-to-br from-primary/20 to-accent/20 group-hover:from-primary/30 group-hover:to-accent/30"
                        )} />
                        <span className="relative text-2xl filter drop-shadow-lg">
                          {crop.icon || "🌱"}
                        </span>
                      </motion.div>
                      
                      {/* Labels - Compact */}
                      <div className="space-y-0.5 w-full">
                        <p className={cn(
                          "font-semibold text-xs leading-tight transition-colors",
                          isSelected ? "text-primary" : "text-foreground/80 group-hover:text-foreground"
                        )}>
                          {crop.label}
                        </p>
                        {crop.label_local && (
                          <p className="text-[10px] text-muted-foreground/70 leading-tight line-clamp-1">
                            {crop.label_local}
                          </p>
                        )}
                      </div>
                      
                      {/* Badges - Ultra compact */}
                      {(crop.is_popular || crop.season) && (
                        <div className="flex flex-wrap gap-1 justify-center">
                          {crop.is_popular && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border border-yellow-500/30">
                              <Sparkles className="h-2 w-2 text-yellow-600 dark:text-yellow-400" />
                              <span className="text-[9px] font-medium text-yellow-700 dark:text-yellow-300">Hot</span>
                            </span>
                          )}
                          {crop.season && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted/50 text-muted-foreground font-medium line-clamp-1">
                              {crop.season}
                            </span>
                          )}
                        </div>
                      )}
                      
                      {/* Selection indicator - Compact */}
                      {isSelected && (
                        <motion.div
                          className="absolute top-1 right-1"
                          initial={{ scale: 0, rotate: -180 }}
                          animate={{ scale: 1, rotate: 0 }}
                          transition={{ type: "spring", stiffness: 500, damping: 25 }}
                        >
                          <div className="w-4 h-4 rounded-full bg-gradient-to-br from-primary to-primary/80 shadow-md shadow-primary/30 flex items-center justify-center">
                            <Check className="h-2.5 w-2.5 text-white" />
                          </div>
                        </motion.div>
                      )}
                    </div>
                  </button>
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
    "bg-background/50 backdrop-blur-sm rounded-lg overflow-hidden flex flex-col",
    variant === 'compact' && "h-full",
    variant === 'modal' && "h-[calc(100vh-10rem)]",
    variant === 'default' && "h-full",
    className
  );

  return (
    <div className={containerClass}>
      {step === 'groups' ? renderGroups() : renderCrops()}
    </div>
  );
}