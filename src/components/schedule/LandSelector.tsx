import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  MapPin, 
  Droplets, 
  Mountain, 
  Sprout, 
  Trees, 
  MoreVertical,
  Plus,
  Wheat,
  TreePine,
  ChevronRight,
  Waves,
  Grid3x3,
  Sparkles,
  CalendarCheck,
  Calendar,
  Zap,
  Edit,
  Trash2
} from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { supabaseWithAuth } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { useLandRefLabels } from '@/hooks/useLandRefLabels';

interface Land {
  id: string;
  name: string;
  area_acres: number;
  area_guntas?: number;
  village?: string;
  taluka?: string;
  district?: string;
  state?: string;
  survey_number?: string;
  soil_type?: string;
  water_source?: string;
  irrigation_type?: string;
  current_crop?: string;
  soil_ph?: number;
  organic_carbon_percent?: number;
}

interface LandSelectorProps {
  lands: Land[];
  onSelectLand: (land: Land) => void;
  onViewSchedule?: (landId: string) => void;
  onEditSchedule?: (landId: string) => void;
}

interface LandScheduleStatus {
  landId: string;
  hasSchedule: boolean;
  cropName?: string;
  scheduleId?: string;
}

const getSoilIcon = (soilType?: string) => {
  if (!soilType) return Mountain;
  const type = soilType.toLowerCase();
  if (type.includes('clay')) return Mountain;
  if (type.includes('loam')) return TreePine;
  return Mountain;
};

const getWaterIcon = (waterSource?: string) => {
  if (!waterSource) return Droplets;
  const source = waterSource.toLowerCase();
  if (source.includes('well')) return Droplets;
  if (source.includes('river') || source.includes('canal')) return Waves;
  return Droplets;
};

const getCropIcon = (crop?: string) => {
  if (!crop) return Sprout;
  const cropName = crop.toLowerCase();
  if (cropName.includes('wheat') || cropName.includes('rice')) return Wheat;
  if (cropName.includes('tree') || cropName.includes('fruit')) return Trees;
  return Sprout;
};

export default function LandSelector({ lands, onSelectLand, onViewSchedule, onEditSchedule }: LandSelectorProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const refLabels = useLandRefLabels();
  const { user } = useAuthStore();
  const { t } = useTranslation();
  const [scheduleStatuses, setScheduleStatuses] = useState<LandScheduleStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [scheduleToDelete, setScheduleToDelete] = useState<string | null>(null);

  useEffect(() => {
    if (user?.id && user?.tenantId && lands.length > 0) {
      fetchScheduleStatuses();
    }
  }, [lands, user?.id, user?.tenantId]);

  const fetchScheduleStatuses = async () => {
    if (!user?.id || !user?.tenantId) {
      console.warn('Cannot fetch schedules: Missing user authentication');
      setLoading(false);
      return;
    }

    try {
      const landIds = lands.map(l => l.id);
      const client = supabaseWithAuth(user.id, user.tenantId);
      
      console.log('Fetching schedules with auth:', { userId: user.id, tenantId: user.tenantId, landIds });
      
      const { data, error } = await client
        .from('crop_schedules')
        .select('id, land_id, crop_name')
        .in('land_id', landIds)
        .eq('is_active', true);

      if (error) {
        console.error('Error fetching schedules:', error);
        throw error;
      }
      
      console.log('Fetched schedules:', data);

      const statuses: LandScheduleStatus[] = lands.map(land => {
        const schedule = data?.find(s => s.land_id === land.id);
        return {
          landId: land.id,
          hasSchedule: !!schedule,
          cropName: schedule?.crop_name,
          scheduleId: schedule?.id
        };
      });

      setScheduleStatuses(statuses);
    } catch (error) {
      console.error('Error fetching schedule statuses:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLandClick = (land: Land) => {
    const status = scheduleStatuses.find(s => s.landId === land.id);
    
    if (status?.hasSchedule && onViewSchedule) {
      onViewSchedule(land.id);
    } else {
      onSelectLand(land);
    }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: {
        type: "spring" as const,
        stiffness: 100
      }
    }
  };

  const handleDeleteSchedule = async (landId: string) => {
    setScheduleToDelete(landId);
    setDeleteDialogOpen(true);
  };

  const confirmDeleteSchedule = async () => {
    if (!scheduleToDelete || !user?.id || !user?.tenantId) return;

    try {
      const status = scheduleStatuses.find(s => s.landId === scheduleToDelete);
      if (!status?.scheduleId) return;

      const client = supabaseWithAuth(user.id, user.tenantId);

      // Delete all tasks for this schedule
      const { error: tasksError } = await client
        .from('schedule_tasks')
        .delete()
        .eq('schedule_id', status.scheduleId);

      if (tasksError) throw tasksError;

      // Delete the schedule
      const { error: scheduleError } = await client
        .from('crop_schedules')
        .delete()
        .eq('id', status.scheduleId);

      if (scheduleError) throw scheduleError;

      toast({
        title: t('schedule.land_selector.toast.deleted'),
        description: t('schedule.land_selector.toast.deleted_message'),
        className: 'bg-success/10 border-success/20',
      });

      // Refresh schedule statuses
      fetchScheduleStatuses();
    } catch (error) {
      console.error('Error deleting schedule:', error);
      toast({
        title: t('schedule.land_selector.toast.delete_failed'),
        description: t('schedule.land_selector.toast.delete_failed_message'),
        variant: 'destructive',
      });
    } finally {
      setDeleteDialogOpen(false);
      setScheduleToDelete(null);
    }
  };

  const handleCreateSchedule = (land: Land) => {
    onSelectLand(land);
  };

  const handleEditSchedule = (landId: string) => {
    if (onEditSchedule) {
      onEditSchedule(landId);
    }
  };

  return (
    <div className="relative px-4 py-4">
      <motion.div 
        className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {lands.map((land) => {
          const SoilIcon = getSoilIcon(land.soil_type);
          const WaterIcon = getWaterIcon(land.water_source);
          const CropIcon = getCropIcon(land.current_crop);
          const status = scheduleStatuses.find(s => s.landId === land.id);
          const hasSchedule = status?.hasSchedule || false;
          
          return (
            <motion.div key={land.id} variants={itemVariants}>
              <Card 
                className={cn(
                  "group relative overflow-hidden cursor-pointer",
                  "bg-card/80 backdrop-blur-md",
                  "border",
                  hasSchedule 
                    ? "border-primary/70 bg-gradient-to-br from-primary/5 to-accent/5" 
                    : "border-border/50",
                  "hover:border-primary/70",
                  "shadow-lg hover:shadow-xl",
                  "transition-all duration-300 ease-out",
                  "hover:scale-[1.02]"
                )}
                onClick={() => handleLandClick(land)}
              >
                {/* Gradient overlay on hover */}
                <div className={cn(
                  "absolute inset-0 transition-opacity duration-300",
                  hasSchedule 
                    ? "bg-gradient-to-br from-primary/10 via-accent/5 to-success/10 opacity-50 group-hover:opacity-70"
                    : "bg-gradient-to-br from-primary/5 via-transparent to-accent/5 opacity-0 group-hover:opacity-100"
                )} />
                
                {/* AI Generated Badge */}
                {hasSchedule && (
                  <motion.div
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 200, damping: 15 }}
                    className="absolute top-2 right-2 z-10"
                  >
                    <Badge className="bg-gradient-to-r from-primary to-accent text-primary-foreground border-0 shadow-lg flex items-center gap-1.5 px-2.5 py-1">
                      <Sparkles className="h-3 w-3 animate-pulse" />
                      <span className="text-xs font-semibold">{t('schedule.land_selector.ai_schedule_ready')}</span>
                    </Badge>
                  </motion.div>
                )}
                
                {/* Pending Generation Badge */}
                {!hasSchedule && (
                  <div className="absolute top-2 right-2 z-10">
                    <Badge variant="outline" className="bg-background/80 backdrop-blur-sm border-muted-foreground/30 flex items-center gap-1.5 px-2.5 py-1">
                      <Calendar className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs font-medium text-muted-foreground">{t('schedule.land_selector.generate_schedule')}</span>
                    </Badge>
                  </div>
                )}
                
                {/* Content */}
                <div className="relative p-4 space-y-3">
                  {/* Header */}
                  <div className="flex items-start justify-between">
                    <div className="space-y-0.5 flex-1">
                      <h3 className={cn(
                        "text-lg font-bold transition-colors",
                        hasSchedule 
                          ? "text-foreground group-hover:text-primary" 
                          : "text-foreground group-hover:text-primary"
                      )}>
                        {land.name}
                      </h3>
                      <div className="flex items-center gap-2">
                        {land.survey_number && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Grid3x3 className="h-3 w-3" />
                            {t('schedule.land_selector.survey', { number: land.survey_number })}
                          </p>
                        )}
                        {hasSchedule && status?.cropName && (
                          <Badge variant="secondary" className="text-xs px-2 py-0.5">
                            <Wheat className="h-2.5 w-2.5 mr-1" />
                            {status.cropName}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {hasSchedule ? (
                        <div className="flex items-center gap-1 text-primary">
                          <CalendarCheck className="h-4 w-4" />
                          <ChevronRight className="h-4 w-4 group-hover:translate-x-1 transition-transform duration-300" />
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-muted-foreground group-hover:text-primary transition-colors">
                          <Zap className="h-4 w-4" />
                          <ChevronRight className="h-4 w-4 group-hover:translate-x-1 transition-transform duration-300" />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Area Display with Status */}
                  <div className={cn(
                    "rounded-lg p-3",
                    hasSchedule 
                      ? "bg-gradient-to-r from-primary/15 to-accent/15 border border-primary/20" 
                      : "bg-gradient-to-r from-primary/10 to-accent/10"
                  )}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          "p-1.5 rounded-md",
                          hasSchedule ? "bg-primary/20" : "bg-background/80"
                        )}>
                          <Trees className={cn(
                            "h-4 w-4",
                            hasSchedule ? "text-primary" : "text-primary"
                          )} />
                        </div>
                        <div>
                          <p className="text-xl font-bold text-foreground">
                            {land.area_acres} <span className="text-sm font-medium text-muted-foreground">{t('schedule.land_selector.acres')}</span>
                          </p>
                          {land.area_guntas && land.area_guntas > 0 && (
                            <p className="text-xs text-muted-foreground">
                              {land.area_guntas} {t('schedule.land_selector.guntas')}
                            </p>
                          )}
                        </div>
                      </div>
                      
                      {hasSchedule && (
                        <div className="text-right">
                          <p className="text-xs text-primary font-semibold">{t('schedule.land_selector.active')}</p>
                          <p className="text-[10px] text-muted-foreground">{t('schedule.land_selector.click_to_view')}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Location */}
                  {(land.village || land.district) && (
                    <div className="flex items-start gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <div className="text-sm text-muted-foreground">
                        {refLabels.location({
                          village: land.village,
                          taluka: land.taluka,
                          district: land.district,
                          state: land.state,
                        })}
                      </div>
                    </div>
                  )}

                  {/* Pills for attributes */}
                  <div className="flex flex-wrap gap-2">
                    {land.soil_type && (() => {
                      const d = refLabels.display(land.soil_type, 'soil');
                      return (
                        <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary/10 border border-secondary/20 ${d.isFallback ? 'opacity-70' : ''}`}>
                          <SoilIcon className="h-3.5 w-3.5 text-secondary" />
                          <span className={`text-xs font-medium text-foreground ${d.isFallback ? 'italic' : ''}`}>{d.text}</span>
                        </div>
                      );
                    })()}

                    {land.water_source && (() => {
                      const d = refLabels.display(land.water_source, 'water');
                      return (
                        <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-info/10 border border-info/20 ${d.isFallback ? 'opacity-70' : ''}`}>
                          <WaterIcon className="h-3.5 w-3.5 text-info" />
                          <span className={`text-xs font-medium text-foreground ${d.isFallback ? 'italic' : ''}`}>{d.text}</span>
                        </div>
                      );
                    })()}

                    {land.irrigation_type && (() => {
                      const d = refLabels.display(land.irrigation_type, 'irrigation');
                      return (
                        <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-accent/10 border border-accent/20 ${d.isFallback ? 'opacity-70' : ''}`}>
                          <Droplets className="h-3.5 w-3.5 text-accent" />
                          <span className={`text-xs font-medium text-foreground ${d.isFallback ? 'italic' : ''}`}>{d.text}</span>
                        </div>
                      );
                    })()}

                    {land.current_crop && (() => {
                      const d = refLabels.display(land.current_crop, 'crop');
                      return (
                        <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-success/10 border border-success/20 ${d.isFallback ? 'opacity-70' : ''}`}>
                          <CropIcon className="h-3.5 w-3.5 text-success" />
                          <span className={`text-xs font-medium text-foreground ${d.isFallback ? 'italic' : ''}`}>{d.text}</span>
                        </div>
                      );
                    })()}
                   </div>


                   {/* Schedule Actions */}
                   {hasSchedule && (
                     <div className="flex gap-2 mt-3 pt-3 border-t border-border/50">
                       <Button
                         variant="outline"
                         size="sm"
                         className="flex-1 gap-2"
                         onClick={(e) => {
                           e.stopPropagation();
                           onViewSchedule?.(land.id);
                         }}
                        >
                          <Calendar className="h-3.5 w-3.5" />
                          {t('schedule.land_selector.view')}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 gap-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditSchedule(land.id);
                          }}
                        >
                          <Edit className="h-3.5 w-3.5" />
                          {t('schedule.land_selector.edit')}
                        </Button>
                       <Button
                         variant="outline"
                         size="sm"
                         className="gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                         onClick={(e) => {
                           e.stopPropagation();
                           handleDeleteSchedule(land.id);
                         }}
                       >
                         <Trash2 className="h-3.5 w-3.5" />
                       </Button>
                     </div>
                   )}

                    {!hasSchedule && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full mt-3 gap-2"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCreateSchedule(land);
                        }}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        {t('schedule.land_selector.create_schedule')}
                      </Button>
                    )}
                 </div>
               </Card>
             </motion.div>
           );
         })}
       </motion.div>

      {/* Add Land Button - Centered Below Last Card */}
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ 
          delay: (lands.length * 0.1) + 0.2,
          type: "spring",
          stiffness: 200,
          damping: 15
        }}
        className="flex justify-center mt-6 mb-4"
      >
        <Button
          onClick={() => navigate('/app/lands/add')}
          className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg rounded-full px-8 py-6 flex items-center gap-3"
          size="lg"
        >
          <Plus className="h-5 w-5" />
          <span className="font-medium">{t('schedule.land_selector.add_land_btn')}</span>
        </Button>
      </motion.div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('schedule.land_selector.delete_ai_dialog.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('schedule.land_selector.delete_ai_dialog.description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('schedule.land_selector.delete_dialog.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteSchedule}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('schedule.land_selector.delete_dialog.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}