import React, { useState, memo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { 
  MapPin, 
  Mountain, 
  Droplets, 
  Trash2,
  Edit3,
  Wheat,
  TreePine,
  Globe,
  ChevronRight,
  Clock,
  Satellite,
  Activity,
  Percent
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useVarietyLabel } from '@/hooks/useVarietyLabel';
import { LandThumbnail } from './LandThumbnail';
import { useLandRefLabels } from '@/hooks/useLandRefLabels';

interface ModernLandCardProps {
  land: {
    id: string;
    name: string;
    area_acres: number;
    area_guntas?: number;
    village?: string;
    district?: string;
    state?: string;
    survey_number?: string;
    ownership_type?: string;
    soil_type?: string;
    water_source?: string;
    irrigation_type?: string;
    current_crop?: string;
    current_crop_variety_id?: string | null;
    previous_crop?: string;
    planting_date?: string;
    expected_harvest_date?: string;
    boundary_polygon_old?: any;
    center_point_old?: any;
    updated_at?: string;
    created_at?: string;
  };
  onRefresh: () => void;
}

// PERFORMANCE: Memoize component to prevent unnecessary re-renders
export const ModernLandCard = memo(function ModernLandCard({ land, onRefresh }: ModernLandCardProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { label: varietyLabel } = useVarietyLabel(land.current_crop_variety_id);
  const refLabels = useLandRefLabels();
  const soil = refLabels.display(land.soil_type, 'soil');
  const water = refLabels.display(land.water_source, 'water');
  const irrigation = refLabels.display(land.irrigation_type, 'irrigation');
  const crop = refLabels.display(land.current_crop, 'crop');
  const previousCrop = refLabels.display(land.previous_crop, 'crop');

  
  // Removed inline map URL generation - now using LandThumbnail component
  
  // PERFORMANCE: Memoize callbacks to prevent child re-renders
  const handleEdit = useCallback(() => {
    navigate(`/app/lands/${land.id}/edit`);
  }, [navigate, land.id]);
  
  const handleDelete = useCallback(async () => {
    setIsDeleting(true);
    try {
      console.log('🗑️ [ModernLandCard] Starting delete for land:', land.id, land.name);
      const { landsApi } = await import('@/services/landsApi');
      await landsApi.deleteLand(land.id);
      
      console.log('✅ [ModernLandCard] Delete successful for land:', land.id);
      toast({
        title: t('lands.card.toast.removed_title'),
        description: t('lands.card.toast.removed_message', { name: land.name }),
      });
      
      onRefresh();
    } catch (error: any) {
      console.error('❌ [ModernLandCard] Error deleting land:', {
        landId: land.id,
        landName: land.name,
        error: error?.message || error,
        stack: error?.stack
      });
      toast({
        title: t('lands.details.error.not_found_title'),
        description: error?.message || t('lands.card.toast.error'),
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
      setDeleteDialogOpen(false);
    }
  }, [land.id, land.name, onRefresh, t, toast]);
  
  const handleShare = useCallback(() => {
    if (navigator.share) {
      navigator.share({
        title: land.name,
        text: `Check out my land parcel: ${land.name}`,
        url: window.location.href,
      });
    } else {
      navigator.clipboard.writeText(window.location.href);
      toast({
        title: t('lands.card.toast.link_copied'),
        description: t('lands.card.toast.link_copied_message'),
      });
    }
  }, [land.name, t, toast]);
  
  const formatArea = useCallback(() => {
    let areaText = `${land.area_acres.toFixed(2)} acres`;
    if (land.area_guntas && land.area_guntas > 0) {
      areaText += ` ${land.area_guntas} guntas`;
    }
    return areaText;
  }, [land.area_acres, land.area_guntas]);
  
  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ scale: 1.02, y: -5 }}
        whileTap={{ scale: 0.98 }}
        transition={{ duration: 0.2 }}
        className="h-full"
      >
        <Card className="overflow-hidden cursor-pointer group relative bg-card hover:shadow-2xl transition-all duration-300 border-border/50 h-full flex flex-col">
          {/* Map Image Section */}
          <div className="relative h-40 sm:h-48 overflow-hidden bg-muted">
            <div className="absolute inset-0 bg-gradient-to-t from-background/60 via-background/20 to-transparent z-10 pointer-events-none" />
            
            <LandThumbnail
              boundary={land.boundary_polygon_old}
              centerPoint={land.center_point_old}
              landName={land.name}
              className="w-full h-full group-hover:scale-110 transition-transform duration-500"
            />
            
            {/* Direct Action Icons */}
            <div className="absolute top-2 right-2 flex gap-1 z-20">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant="secondary"
                      className="h-8 w-8 bg-background/90 backdrop-blur hover:bg-background shadow-lg"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEdit();
                      }}
                    >
                      <Edit3 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Edit</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant="secondary"
                      className="h-8 w-8 bg-background/90 backdrop-blur hover:bg-background shadow-lg"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteDialogOpen(true);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Delete</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            
            {/* Utilized Percentage Badge */}
            <Badge className="absolute top-2 left-2 bg-black/70 text-white border-white/20 backdrop-blur-sm shadow-lg z-20 text-xs sm:text-sm">
              <Percent className="h-3 w-3 mr-1" />
              {t('lands.card.utilized', { percent: land.current_crop ? 85 : 0 })}
            </Badge>
            
            {/* Area Badge */}
            <Badge className="absolute bottom-2 left-2 bg-black/70 text-white border-white/20 backdrop-blur-sm shadow-lg z-20 text-xs sm:text-sm">
              <Mountain className="h-3 w-3 mr-1" />
              {formatArea()}
            </Badge>
          </div>
          
          {/* Content Section */}
          <CardContent 
            className="p-3 sm:p-4 space-y-3 flex-1 flex flex-col"
            onClick={() => navigate(`/app/lands/${land.id}`)}
          >
            {/* Land Name and Survey Number */}
            <div className="space-y-1">
              <h3 className="font-bold text-base sm:text-lg tracking-tight flex items-center gap-1 line-clamp-1">
                {land.name}
                <ChevronRight className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
              </h3>
              {land.survey_number && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {t('lands.card.survey_no', { number: land.survey_number })}
                </p>
              )}
            </div>
            
            {/* Crop Information - Mobile optimized */}
            {(land.current_crop || land.previous_crop) && (
              <div className="grid grid-cols-2 gap-2">
                {land.current_crop && (
                  <div className="space-y-0.5">
                    <p className="text-xs text-muted-foreground">{t('lands.card.current')}</p>
                    <div className="flex items-center gap-1 flex-wrap">
                      <Wheat className="h-3 w-3 sm:h-4 sm:w-4 text-primary flex-shrink-0" />
                      <span className={`text-xs sm:text-sm font-medium truncate ${crop.isFallback ? 'italic text-muted-foreground' : ''}`}>{crop.text}</span>
                      {varietyLabel && (
                        <Badge variant="secondary" className="text-[10px] sm:text-xs px-1.5 py-0 h-4 sm:h-5">
                          {varietyLabel}
                        </Badge>
                      )}
                    </div>
                  </div>
                )}
                
                {land.previous_crop && (
                  <div className="space-y-0.5">
                    <p className="text-xs text-muted-foreground">{t('lands.card.previous')}</p>
                    <div className="flex items-center gap-1">
                      <TreePine className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground flex-shrink-0" />
                      <span className={`text-xs sm:text-sm truncate ${previousCrop.isFallback ? 'italic text-muted-foreground' : ''}`}>{previousCrop.text}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {/* Smart Action Buttons */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 h-8 text-xs font-medium"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/app/lands/${land.id}/soil`);
                }}
              >
                <Activity className="h-3 w-3 mr-1" />
                {t('lands.card.soil_health')}
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                className="flex-1 h-8 text-xs font-medium"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/app/lands/${land.id}/ndvi`);
                }}
              >
                <Satellite className="h-3 w-3 mr-1" />
                {t('lands.card.ndvi_data')}
              </Button>
            </div>
            
            {/* Land Details Tags */}
            <div className="flex flex-wrap gap-1.5">
              {land.irrigation_type && (
                <Badge variant="secondary" className={`text-xs px-2 py-0.5 ${irrigation.isFallback ? 'italic opacity-70' : ''}`}>
                  <Droplets className="h-2.5 w-2.5 mr-1" />
                  {irrigation.text}
                </Badge>
              )}
              
              {land.soil_type && (
                <Badge variant="outline" className={`text-xs px-2 py-0.5 ${soil.isFallback ? 'italic opacity-70' : ''}`}>
                  <Globe className="h-2.5 w-2.5 mr-1" />
                  {soil.text}
                </Badge>
              )}

              
              {land.ownership_type && (
                <Badge variant="outline" className="text-xs px-2 py-0.5">
                  {land.ownership_type}
                </Badge>
              )}
            </div>
            
            {/* Location Footer */}
            {(land.village || land.district) && (
              <div className="pt-2 border-t border-border/50">
                <p className="text-xs text-muted-foreground truncate">
                  {refLabels.location({
                    village: land.village,
                    district: land.district,
                    state: land.state,
                  })}

                </p>
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                  <Clock className="h-2.5 w-2.5" />
                  {t('lands.card.updated', { date: land.updated_at ? format(new Date(land.updated_at), 'MMM d') : 'Never' })}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
      
      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="max-w-[90vw] sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('lands.card.delete_dialog.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('lands.card.delete_dialog.description', { name: land.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col-reverse sm:flex-row gap-2 sm:gap-0">
            <AlertDialogCancel className="w-full sm:w-auto">{t('lands.card.delete_dialog.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="w-full sm:w-auto bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? t('lands.card.delete_dialog.removing') : t('lands.card.delete_dialog.remove')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
});