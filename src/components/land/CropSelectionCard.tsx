import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  ChevronRight, 
  ChevronLeft, 
  Check, 
  Search, 
  Sparkles, 
  Wheat, 
  TreePine,
  X,
  Loader2
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { useLocalizedRef } from '@/lib/i18nRef';

interface CropGroup {
  id: string;
  group_name: string;
  group_name_hi?: string;
  group_name_mr?: string;
  group_icon: string;
  display_order: number;
}

interface Crop {
  id: string;
  label: string;
  label_local?: string;
  label_hi?: string;
  label_mr?: string;
  icon?: string;
  season?: string;
  crop_group_id: string;
  is_popular?: boolean;
}

interface CropSelectionCardProps {
  label: string;
  value?: string;
  cropId?: string;
  onSelect: (cropId: string, cropName: string) => void;
  icon?: React.ReactNode;
  variant?: 'current' | 'previous';
  className?: string;
}

export function CropSelectionCard({ 
  label, 
  value, 
  cropId,
  onSelect, 
  icon,
  variant = 'current',
  className 
}: CropSelectionCardProps) {
  const { t, i18n } = useTranslation();
  const tRef = useLocalizedRef();
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<'groups' | 'crops'>('groups');
  const [groups, setGroups] = useState<CropGroup[]>([]);
  const [crops, setCrops] = useState<Crop[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<CropGroup | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // All-language resolver — see src/lib/i18nRef.ts
  const displayCropName = (crop: Crop) => tRef(crop as any, 'label') || crop.label;
  const displayGroupName = (group: CropGroup) => tRef(group as any, 'group_name') || group.group_name;

  useEffect(() => {
    if (isOpen && groups.length === 0) {
      loadCropGroups();
    }
  }, [isOpen]);

  const loadCropGroups = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('crop_groups')
        .select('*')
        .eq('is_active', true)
        .order('display_order');
      
      setGroups(data || []);
    } catch (err) {
      console.error('Error loading crop groups:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadCrops = async (group: CropGroup) => {
    setLoading(true);
    setCrops([]);
    
    try {
      const { data } = await supabase
        .from('crops')
        .select('*')
        .eq('crop_group_id', group.id)
        .eq('is_active', true)
        .order('display_order');
      
      const processedCrops = (data || []).map(crop => ({
        ...crop,
        is_popular: ['rice', 'wheat', 'cotton', 'sugarcane'].includes(crop.label.toLowerCase())
      }));
      
      setCrops(processedCrops);
      setStep('crops');
    } catch (err) {
      console.error('Error loading crops:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleGroupSelect = (group: CropGroup) => {
    setSelectedGroup(group);
    loadCrops(group);
  };

  const handleCropSelect = (crop: Crop) => {
    const localizedName = displayCropName(crop);
    onSelect(crop.id, localizedName);
    handleClose();
  };

  const handleBack = () => {
    setStep('groups');
    setSelectedGroup(null);
    setCrops([]);
    setSearchQuery('');
  };

  const handleClose = () => {
    setIsOpen(false);
    setStep('groups');
    setSelectedGroup(null);
    setCrops([]);
    setSearchQuery('');
  };

  const filteredCrops = crops.filter((crop) => {
    const q = searchQuery.toLowerCase();
    if (!q) return true;
    return (
      crop.label.toLowerCase().includes(q) ||
      (displayCropName(crop) || '').toLowerCase().includes(q)
    );
  });

  const gradientColors = variant === 'current' 
    ? 'from-primary/20 via-primary/10 to-accent/10' 
    : 'from-secondary/20 via-secondary/10 to-muted/10';
  
  const selectedColor = variant === 'current' 
    ? 'border-primary/50 bg-gradient-to-br from-primary/10 to-accent/5' 
    : 'border-secondary/50 bg-gradient-to-br from-secondary/10 to-muted/5';

  return (
    <>
      {/* Selection Card - Touch Friendly */}
      <motion.div
        whileTap={{ scale: 0.98 }}
        onClick={() => setIsOpen(true)}
        className={cn("cursor-pointer", className)}
      >
        <Card className={cn(
          "relative overflow-hidden transition-all duration-300",
          "border-2 hover:shadow-lg active:scale-[0.98]",
          "min-h-[100px] p-4",
          value ? selectedColor : "border-border/50 hover:border-primary/30"
        )}>
          {/* Background Gradient */}
          <div className={cn(
            "absolute inset-0 opacity-50 transition-opacity duration-300",
            value ? `bg-gradient-to-br ${gradientColors}` : "bg-transparent"
          )} />
          
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* Icon Container */}
              <div className={cn(
                "w-14 h-14 rounded-2xl flex items-center justify-center",
                "transition-all duration-300",
                value 
                  ? variant === 'current' 
                    ? "bg-gradient-to-br from-primary/30 to-primary/10 shadow-lg shadow-primary/20" 
                    : "bg-gradient-to-br from-secondary/30 to-secondary/10"
                  : "bg-muted/50"
              )}>
                {icon || (variant === 'current' 
                  ? <Wheat className={cn("w-7 h-7", value ? "text-primary" : "text-muted-foreground")} />
                  : <TreePine className={cn("w-7 h-7", value ? "text-secondary" : "text-muted-foreground")} />
                )}
              </div>
              
              {/* Text Content */}
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">{label}</p>
                {value ? (
                  <p className={cn(
                    "text-lg font-bold",
                    variant === 'current' ? "text-primary" : "text-foreground"
                  )}>
                    {value}
                  </p>
                ) : (
                  <p className="text-base text-muted-foreground/70">
                    {t('lands.wizard.tap_to_select')}
                  </p>
                )}
              </div>
            </div>
            
            {/* Action Indicator */}
            <div className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300",
              value 
                ? variant === 'current'
                  ? "bg-primary/20"
                  : "bg-secondary/20"
                : "bg-muted/30"
            )}>
              {value ? (
                <Check className={cn(
                  "w-5 h-5",
                  variant === 'current' ? "text-primary" : "text-secondary"
                )} />
              ) : (
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              )}
            </div>
          </div>
          
          {/* Touch Ripple Effect Indicator */}
          {!value && (
            <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2">
              <span className="text-xs text-muted-foreground/50">{t('lands.wizard.tap_to_select')}</span>
            </div>
          )}
        </Card>
      </motion.div>

      {/* Full Screen Crop Selector Overlay */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-background/95 backdrop-blur-xl"
          >
            {/* Header */}
            <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-xl border-b border-border/50 px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {step === 'crops' ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleBack}
                      className="h-10 w-10 rounded-xl"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleClose}
                      className="h-10 w-10 rounded-xl"
                    >
                      <X className="h-5 w-5" />
                    </Button>
                  )}
                  <div>
                    <h2 className="text-lg font-bold">
                      {step === 'groups' ? label : (
                        <span className="flex items-center gap-2">
                          <span className="text-xl">{selectedGroup?.group_icon}</span>
                          {selectedGroup && displayGroupName(selectedGroup)}
                        </span>
                      )}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      {step === 'groups' 
                        ? t('lands.wizard.select_crop_category')
                        : t('lands.wizard.select_crop')
                      }
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Search (only in crops step) */}
            {step === 'crops' && (
              <div className="px-4 py-3 border-b border-border/30">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={t('lands.wizard.search_crops')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 h-12 rounded-xl bg-muted/30 border-border/50"
                  />
                </div>
              </div>
            )}

            {/* Content */}
            <ScrollArea className="h-[calc(100vh-120px)]">
              {loading && (groups.length === 0 || crops.length === 0) ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : step === 'groups' ? (
                /* Group Selection Grid */
                <motion.div 
                  className="grid grid-cols-3 gap-3 p-4"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  {groups.map((group, index) => (
                    <motion.button
                      key={group.id}
                      initial={{ opacity: 0, scale: 0.9, y: 20 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      transition={{ delay: index * 0.03 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleGroupSelect(group)}
                      className={cn(
                        "relative aspect-square",
                        "bg-gradient-to-br from-background to-muted/30",
                        "border-2 border-border/50 hover:border-primary/50",
                        "rounded-2xl shadow-md hover:shadow-xl",
                        "transition-all duration-300",
                        "flex flex-col items-center justify-center gap-2",
                        "p-3 group"
                      )}
                    >
                      <motion.span 
                        className="text-3xl sm:text-4xl filter drop-shadow-lg"
                        whileHover={{ rotate: [0, -5, 5, 0], scale: 1.1 }}
                        transition={{ duration: 0.4 }}
                      >
                        {group.group_icon}
                      </motion.span>
                      <span className="text-xs font-semibold text-center text-foreground/80 group-hover:text-foreground leading-tight">
                        {displayGroupName(group)}
                      </span>
                      <ChevronRight className="absolute bottom-2 right-2 w-4 h-4 text-muted-foreground/50 group-hover:text-primary transition-colors" />
                    </motion.button>
                  ))}
                </motion.div>
              ) : (
                /* Crop Selection Grid */
                <motion.div 
                  className="grid grid-cols-3 gap-3 p-4"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  {filteredCrops.map((crop, index) => {
                    const isSelected = cropId === crop.id;
                    
                    return (
                      <motion.button
                        key={crop.id}
                        initial={{ opacity: 0, scale: 0.9, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        transition={{ delay: index * 0.02 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => handleCropSelect(crop)}
                        className={cn(
                          "relative p-3",
                          "bg-gradient-to-br from-background to-muted/30",
                          "border-2",
                          isSelected 
                            ? "border-primary bg-primary/10 shadow-lg shadow-primary/20" 
                            : "border-border/50 hover:border-primary/50",
                          "rounded-2xl shadow-md hover:shadow-xl",
                          "transition-all duration-300",
                          "flex flex-col items-center gap-2",
                          "min-h-[110px] group"
                        )}
                      >
                        {/* Selection indicator */}
                        {isSelected && (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center"
                          >
                            <Check className="w-3 h-3 text-primary-foreground" />
                          </motion.div>
                        )}
                        
                        <motion.span 
                          className="text-2xl sm:text-3xl filter drop-shadow-lg"
                          whileHover={{ scale: 1.1 }}
                        >
                          {crop.icon || "🌱"}
                        </motion.span>
                        
                        <div className="text-center space-y-0.5">
                          <p className={cn(
                            "text-xs font-semibold leading-tight",
                            isSelected ? "text-primary" : "text-foreground/80"
                          )}>
                            {displayCropName(crop)}
                          </p>
                          {crop.label !== displayCropName(crop) && (
                            <p className="text-[10px] text-muted-foreground leading-tight">
                              {crop.label}
                            </p>
                          )}
                        </div>
                        
                        {/* Badges */}
                        {crop.is_popular && (
                          <Badge variant="secondary" className="text-[9px] px-1.5 py-0 bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border-yellow-500/30">
                            <Sparkles className="w-2 h-2 mr-0.5" />
                            {t('lands.wizard.popular')}
                          </Badge>
                        )}
                      </motion.button>
                    );
                  })}
                </motion.div>
              )}
            </ScrollArea>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
