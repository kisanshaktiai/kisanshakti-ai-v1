import React, { useState, memo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useCropNames } from '@/hooks/useCropNames';
import { landAttributeLabel } from '@/lib/landLabels';
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
import { LandThumbnail } from './LandThumbnail';
import '@/living/living.css';
import { useLocalizedPlace } from '@/hooks/useLocalizedPlace';

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
    current_crop_id?: string | null;
    previous_crop_id?: string | null;
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
  const { t, i18n } = useTranslation();
  const cropNameOf = useCropNames();
  const { join: joinPlace, place: placeName } = useLocalizedPlace();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
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
    let areaText = `${land.area_acres.toFixed(2)} ${t('common.acres')}`;
    if (land.area_guntas && land.area_guntas > 0) {
      areaText += ` ${land.area_guntas} ${t('living.land.guntas')}`;
    }
    return areaText;
  }, [land.area_acres, land.area_guntas, t]);

  const updatedOn = land.updated_at
    ? new Date(land.updated_at).toLocaleDateString(`${i18n.language || 'en'}-IN-u-nu-latn`, { day: 'numeric', month: 'short' })
    : null;
  const place = joinPlace(land, ['village', 'district', 'state']);
  const openDetails = () => navigate(`/app/lands/${land.id}`);
  const action = 'lf-cap flex min-w-0 items-center justify-center gap-1.5 rounded-2xl border border-border bg-card px-2 font-bold text-foreground';
  const iconAction = 'grid shrink-0 place-items-center rounded-2xl border border-border bg-card';
  const tap = { minHeight: 'var(--lf-tap)' } as const;
  const tapSquare = { width: 'var(--lf-tap)', height: 'var(--lf-tap)' } as const;

  return (
    <>
      <article className="flex h-full flex-col overflow-hidden rounded-[var(--lf-r)] border border-border bg-card shadow-sm">
        {/* The farmer's own field from above */}
        <button type="button" onClick={openDetails} aria-label={t('lands.card.view_details')} className="relative block w-full overflow-hidden bg-muted" style={{ height: 'clamp(120px, 36vw, 190px)' }}>
          <LandThumbnail
            boundary={land.boundary_polygon_old}
            centerPoint={land.center_point_old}
            landName={land.name}
            className="h-full w-full"
          />
          <span className="lf-pill lf-pill-sm absolute bottom-2 left-2 bg-card text-foreground shadow-sm">
            <Mountain size={14} aria-hidden />
            {formatArea()}
          </span>
        </button>

        <div className="flex flex-1 flex-col gap-3" style={{ padding: 'clamp(12px, 3.6vw, 18px)' }}>
          <button type="button" onClick={openDetails} className="flex w-full items-start gap-2 text-start">
            <span className="min-w-0 flex-1">
              <span className="lf-head block" style={{ overflowWrap: 'anywhere' }}>{land.name}</span>
              {land.survey_number && (
                <span className="lf-cap mt-0.5 flex items-center gap-1 text-muted-foreground">
                  <MapPin size={14} className="shrink-0" aria-hidden />
                  {t('lands.card.survey_no', { number: land.survey_number })}
                </span>
              )}
              {place && <span className="lf-cap mt-0.5 block text-muted-foreground" style={{ overflowWrap: 'anywhere' }}>{place}</span>}
            </span>
            <ChevronRight size={22} className="mt-1 shrink-0 text-muted-foreground rtl:rotate-180" aria-hidden />
          </button>

          {(land.current_crop || land.previous_crop) && (
            <div className="grid grid-cols-2 gap-2">
              {land.current_crop && (
                <div className="min-w-0 rounded-2xl bg-primary/10 px-3 py-2">
                  <p className="lf-cap text-muted-foreground">{t('lands.card.current')}</p>
                  <p className="lf-lab flex items-center gap-1.5"><Wheat size={18} className="shrink-0 text-primary" aria-hidden /><span className="min-w-0 truncate">{cropNameOf(land.current_crop, land.current_crop_id)}</span></p>
                </div>
              )}
              {land.previous_crop && (
                <div className="min-w-0 rounded-2xl bg-muted px-3 py-2">
                  <p className="lf-cap text-muted-foreground">{t('lands.card.previous')}</p>
                  <p className="lf-lab flex items-center gap-1.5 font-normal"><TreePine size={18} className="shrink-0 text-muted-foreground" aria-hidden /><span className="min-w-0 truncate">{cropNameOf(land.previous_crop, land.previous_crop_id)}</span></p>
                </div>
              )}
            </div>
          )}

          {(land.irrigation_type || land.soil_type || land.ownership_type) && (
            <div className="flex flex-wrap gap-1.5">
              {land.irrigation_type && (
                <span className="lf-pill lf-pill-sm bg-info/15 text-foreground"><Droplets size={14} className="text-info" aria-hidden />{landAttributeLabel(t, 'irrigation_type', land.irrigation_type)}</span>
              )}
              {land.soil_type && (
                <span className="lf-pill lf-pill-sm bg-muted text-foreground"><Globe size={14} aria-hidden />{landAttributeLabel(t, 'soil_type', land.soil_type)}</span>
              )}
              {land.ownership_type && (
                <span className="lf-pill lf-pill-sm bg-muted text-foreground">{landAttributeLabel(t, 'ownership_type', land.ownership_type)}</span>
              )}
            </div>
          )}

          <div className="mt-auto grid grid-cols-2 gap-2">
            <button type="button" className={action} style={tap} onClick={() => navigate(`/app/lands/${land.id}/soil`)}>
              <Activity size={18} className="shrink-0 text-primary" aria-hidden /><span className="min-w-0 leading-tight" style={{ overflowWrap: 'anywhere' }}>{t('lands.card.soil_health')}</span>
            </button>
            <button type="button" className={action} style={tap} onClick={() => navigate(`/app/lands/${land.id}/ndvi`)}>
              <Satellite size={18} className="shrink-0 text-primary" aria-hidden /><span className="min-w-0 leading-tight" style={{ overflowWrap: 'anywhere' }}>{t('lands.card.ndvi_data')}</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <p className="lf-cap flex min-w-0 flex-1 items-center gap-1 text-muted-foreground">
              {updatedOn && <><Clock size={14} className="shrink-0" aria-hidden /><span className="min-w-0 truncate">{t('lands.card.updated', { date: updatedOn })}</span></>}
            </p>
            <button type="button" className={`${iconAction} text-foreground`} style={tapSquare} onClick={handleEdit} aria-label={t('lands.card.edit')}>
              <Edit3 size={20} aria-hidden />
            </button>
            <button type="button" className={`${iconAction} text-destructive`} style={tapSquare} onClick={() => setDeleteDialogOpen(true)} aria-label={t('lands.card.delete')}>
              <Trash2 size={20} aria-hidden />
            </button>
          </div>
        </div>
      </article>

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