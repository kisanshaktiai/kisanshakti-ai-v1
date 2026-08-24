import React, { useRef, useState, useCallback, useEffect } from 'react';
import { 
  Camera, Upload, X, Loader2, MapPin, CheckCircle2, AlertTriangle, 
  XCircle, Leaf, Droplets, Bug, Package, Sprout, Sparkles,
  Navigation, Image as ImageIcon, ChevronRight
} from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { resolveTaskTypeKey } from '@/lib/taskTypeIcons';

interface TaskPhotoUploadDialogProps {
  isOpen: boolean;
  onClose: () => void;
  taskId?: string;
  taskType?: string;
  taskName?: string;
  scheduleId: string;
  landId: string;
  farmerId: string;
  tenantId: string;
  cropName?: string;
  onUploadComplete?: () => void;
}

type UploadType = 'crop' | 'soil' | 'land_preparation' | 'irrigation' | 'pest' | 'fertilizer' | 'harvest' | 'general';

const uploadTypeConfig: Record<UploadType, { icon: any; colorClass: string; bgClass: string }> = {
  crop: { icon: Leaf, colorClass: 'text-success', bgClass: 'bg-success/10' },
  soil: { icon: Sprout, colorClass: 'text-warning', bgClass: 'bg-warning/10' },
  land_preparation: { icon: Sprout, colorClass: 'text-warning', bgClass: 'bg-warning/10' },
  irrigation: { icon: Droplets, colorClass: 'text-info', bgClass: 'bg-info/10' },
  pest: { icon: Bug, colorClass: 'text-destructive', bgClass: 'bg-destructive/10' },
  fertilizer: { icon: Leaf, colorClass: 'text-success', bgClass: 'bg-success/10' },
  harvest: { icon: Package, colorClass: 'text-warning', bgClass: 'bg-warning/10' },
  general: { icon: Camera, colorClass: 'text-foreground/80', bgClass: 'bg-muted-foreground/40/10' },
};

const taskTypeToUploadType: Record<string, UploadType> = {
  irrigation: 'irrigation',
  fertilizer: 'fertilizer',
  pesticide: 'pest',
  pest_control: 'pest',
  weeding: 'crop',
  weed_management: 'crop',
  harvest: 'harvest',
  harvesting: 'harvest',
  soil_preparation: 'land_preparation',
  sowing: 'crop',
};

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function TaskPhotoUploadDialog({
  isOpen,
  onClose,
  taskId,
  taskType,
  taskName,
  scheduleId,
  landId,
  farmerId,
  tenantId,
  cropName,
  onUploadComplete,
}: TaskPhotoUploadDialogProps) {
  const { t, i18n } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [uploadType, setUploadType] = useState<UploadType>(() => 
    taskType ? (taskTypeToUploadType[resolveTaskTypeKey(taskTypeToUploadType, taskType) ?? ''] || 'crop') : 'crop'
  );
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [landCenter, setLandCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [locationValidation, setLocationValidation] = useState<{
    isValid: boolean;
    distance: number | null;
    level: 'at_land' | 'nearby' | 'far' | 'unknown';
  }>({ isValid: false, distance: null, level: 'unknown' });

  useEffect(() => {
    async function fetchLandCenter() {
      if (!landId) return;
      const { data } = await supabase
        .from('lands')
        .select('center_lat, center_lon')
        .eq('id', landId)
        .single();
      if (data?.center_lat && data?.center_lon) {
        setLandCenter({ lat: data.center_lat, lng: data.center_lon });
      }
    }
    fetchLandCenter();
  }, [landId]);

  useEffect(() => {
    if (location && landCenter) {
      const distance = calculateDistance(location.lat, location.lng, landCenter.lat, landCenter.lng);
      let level: 'at_land' | 'nearby' | 'far' = 'far';
      let isValid = false;
      if (distance <= 100) { level = 'at_land'; isValid = true; }
      else if (distance <= 500) { level = 'nearby'; isValid = true; }
      else { level = 'far'; isValid = false; }
      setLocationValidation({ isValid, distance, level });
    } else {
      setLocationValidation({ isValid: false, distance: null, level: 'unknown' });
    }
  }, [location, landCenter]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setPreview(reader.result as string);
      reader.readAsDataURL(file);
      getLocation();
    }
  }, []);

  const getLocation = useCallback(() => {
    if (!navigator.geolocation) {
      toast.error('Geolocation not supported');
      return;
    }
    setGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
        setGettingLocation(false);
      },
      (error) => {
        console.error('Location error:', error);
        setGettingLocation(false);
        toast.error(t('cropGrowth.pleaseAddLocation'));
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }, [t]);

  const handleUpload = async () => {
    if (!selectedFile) return;
    if (!location) {
      toast.error(t('cropGrowth.pleaseAddLocation'));
      getLocation();
      return;
    }
    if (locationValidation.level === 'far') {
      const confirmFar = window.confirm(t('cropGrowth.photoTakenAway'));
      if (!confirmFar) return;
    }

    setIsUploading(true);
    try {
      const fileExt = selectedFile.name.split('.').pop()?.toLowerCase();
      const fileName = `${farmerId}/${landId}/${Date.now()}.${fileExt}`;
      const fileType = selectedFile.type.startsWith('video/') ? 'video' : 'image';

      const { error: uploadError } = await supabase.storage
        .from('crop-growth-media')
        .upload(fileName, selectedFile, { cacheControl: '3600', upsert: false });
      if (uploadError) throw uploadError;

      const { data: urlData } = await supabase.storage
        .from('crop-growth-media')
        .createSignedUrl(fileName, 60 * 60 * 24 * 7);
      const fileUrl = urlData?.signedUrl;
      if (!fileUrl) throw new Error('Failed to get file URL');

      const { data: upload, error: insertError } = await supabase
        .from('crop_growth_uploads')
        .insert({
          land_id: landId,
          farmer_id: farmerId,
          tenant_id: tenantId,
          schedule_id: scheduleId,
          task_id: taskId || null,
          file_url: fileUrl,
          file_type: fileType,
          upload_type: uploadType,
          notes: notes || null,
          capture_location: location,
          location_validated: locationValidation.isValid,
          distance_from_land_meters: locationValidation.distance,
          is_processed: false
        })
        .select()
        .single();
      if (insertError) throw insertError;

      await supabase.functions.invoke('ai-crop-scan', {
        body: {
          images: [fileUrl],
          mode: 'growth_tracking',
          uploadId: upload.id,
          landId, farmerId, tenantId,
          landCrop: cropName,
          scheduleId, taskId,
          uploadType,
          language: i18n.language
        }
      });

      toast.success(t('cropGrowth.uploadSuccess'));
      onUploadComplete?.();
      handleClose();
    } catch (error) {
      console.error('Upload error:', error);
      toast.error(t('cropGrowth.uploadFailed'));
    } finally {
      setIsUploading(false);
    }
  };

  const handleClose = () => {
    setSelectedFile(null);
    setPreview(null);
    setNotes('');
    setLocation(null);
    setLocationValidation({ isValid: false, distance: null, level: 'unknown' });
    onClose();
  };

  const UploadTypeIcon = uploadTypeConfig[uploadType]?.icon || Camera;
  const currentConfig = uploadTypeConfig[uploadType];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-[95vw] sm:max-w-md p-0 gap-0 rounded-3xl border-0 shadow-2xl overflow-hidden bg-background">
        {/* Header Card */}
        <div className="relative px-5 pt-6 pb-4">
          {/* Decorative gradient blob */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          
          <div className="relative flex items-start gap-4">
            <div className={cn(
              "flex-shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg",
              currentConfig.bgClass
            )}>
              <UploadTypeIcon className={cn("h-7 w-7", currentConfig.colorClass)} />
            </div>
            <div className="flex-1 min-w-0 pt-1">
              <h2 className="text-xl font-bold text-foreground truncate">
                {taskName || t('cropGrowth.uploadPhoto')}
              </h2>
              {cropName && (
                <div className="flex items-center gap-1.5 mt-1">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs font-medium text-primary">
                    {t('cropGrowth.aiAnalysisEnabled')}
                  </span>
                </div>
              )}
            </div>
            <button
              onClick={handleClose}
              className="flex-shrink-0 w-8 h-8 rounded-full bg-muted/80 flex items-center justify-center hover:bg-muted transition-colors"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        <div className="px-5 pb-6 space-y-4">
          {/* Photo Type Card */}
          <div className="rounded-2xl bg-muted/30 p-4 shadow-sm border border-border/50">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 block">
              {t('cropGrowth.photoType')}
            </Label>
            <Select value={uploadType} onValueChange={(v) => setUploadType(v as UploadType)}>
              <SelectTrigger className="h-12 rounded-xl bg-background border-border/60 shadow-sm focus:ring-2 focus:ring-primary/20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-2xl shadow-xl border-border/50">
                {Object.entries(uploadTypeConfig).map(([key, config]) => {
                  const Icon = config.icon;
                  return (
                    <SelectItem key={key} value={key} className="rounded-xl py-3 cursor-pointer">
                      <div className="flex items-center gap-3">
                        <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", config.bgClass)}>
                          <Icon className={cn("h-4 w-4", config.colorClass)} />
                        </div>
                        <span className="font-medium">{t(`cropGrowth.uploadTypes.${key}`)}</span>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Upload Area or Preview */}
          {!selectedFile ? (
            <div className="rounded-2xl bg-muted/30 p-5 shadow-sm border border-border/50">
              <div className="text-center">
                <div className="w-16 h-16 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center mb-4 shadow-inner">
                  <ImageIcon className="h-8 w-8 text-primary" />
                </div>
                
                <div className="flex gap-3 justify-center mb-4">
                  <button
                    onClick={() => cameraInputRef.current?.click()}
                    className="flex-1 max-w-[140px] flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl bg-primary text-primary-foreground font-semibold shadow-lg shadow-primary/20 active:scale-[0.98] transition-transform"
                  >
                    <Camera className="h-5 w-5" />
                    <span>{t('cropGrowth.takePhoto')}</span>
                  </button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1 max-w-[140px] flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl bg-background border-2 border-border font-semibold shadow-sm active:scale-[0.98] transition-transform"
                  >
                    <Upload className="h-5 w-5" />
                    <span>{t('cropGrowth.uploadFile')}</span>
                  </button>
                </div>
                
                <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
                  <MapPin className="h-4 w-4" />
                  {t('cropGrowth.photoFromField')}
                </p>
              </div>
              
              <input ref={fileInputRef} type="file" accept="image/*,video/*" onChange={handleFileSelect} className="hidden" />
              <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleFileSelect} className="hidden" />
            </div>
          ) : (
            <>
              {/* Image Preview Card */}
              <div className="rounded-2xl overflow-hidden shadow-lg border border-border/50 bg-black">
                <div className="relative">
                  {preview && (
                    <img src={preview} alt="Preview" className="w-full aspect-[4/3] object-cover" />
                  )}
                  <button
                    onClick={() => { setSelectedFile(null); setPreview(null); }}
                    className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-white active:scale-95 transition-transform"
                  >
                    <X className="h-4 w-4" />
                  </button>
                  
                  {/* AI Badge */}
                  <div className="absolute bottom-3 left-3 right-3">
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-black/60 backdrop-blur-sm">
                      <Sparkles className="h-4 w-4 text-primary" />
                      <span className="text-xs text-white font-medium">{t('cropGrowth.readyForAI')}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Location Card */}
              <div className="rounded-2xl bg-muted/30 p-4 shadow-sm border border-border/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                      <MapPin className="h-4 w-4 text-primary" />
                    </div>
                    <span className="font-medium text-sm">{t('cropGrowth.location')}</span>
                  </div>
                  
                  {gettingLocation ? (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-primary/10">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      <span className="text-xs font-medium text-primary">{t('cropGrowth.gettingLocation')}</span>
                    </div>
                  ) : !location ? (
                    <button
                      onClick={getLocation}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-primary/10 text-primary font-medium text-sm active:scale-95 transition-transform"
                    >
                      <Navigation className="h-4 w-4" />
                      {t('cropGrowth.addLocation')}
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      {locationValidation.level === 'at_land' && (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-success/10 border border-success/30">
                          <CheckCircle2 className="h-4 w-4 text-success" />
                          <span className="text-xs font-semibold text-success">{t('cropGrowth.atLand')}</span>
                        </div>
                      )}
                      {locationValidation.level === 'nearby' && (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-warning/10 border border-warning/30">
                          <AlertTriangle className="h-4 w-4 text-warning" />
                          <span className="text-xs font-semibold text-warning">
                            {Math.round(locationValidation.distance || 0)}m
                          </span>
                        </div>
                      )}
                      {locationValidation.level === 'far' && (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-destructive/10 border border-destructive/30">
                          <XCircle className="h-4 w-4 text-destructive" />
                          <span className="text-xs font-semibold text-destructive">
                            {Math.round(locationValidation.distance || 0)}m
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Notes Card */}
              <div className="rounded-2xl bg-muted/30 p-4 shadow-sm border border-border/50">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 block">
                  {t('cropGrowth.notesOptional')}
                </Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={t('cropGrowth.describeCropCondition')}
                  className="min-h-[80px] rounded-xl bg-background border-border/60 resize-none shadow-sm focus:ring-2 focus:ring-primary/20"
                />
              </div>

              {/* Upload Button */}
              <button
                onClick={handleUpload}
                disabled={isUploading || !selectedFile}
                className={cn(
                  "w-full flex items-center justify-center gap-3 py-4 rounded-2xl font-bold text-base shadow-lg transition-all active:scale-[0.98]",
                  isUploading || !selectedFile
                    ? "bg-muted text-muted-foreground cursor-not-allowed shadow-none"
                    : "bg-primary text-primary-foreground shadow-primary/25"
                )}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    {t('cropGrowth.uploading')}
                  </>
                ) : (
                  <>
                    <Upload className="h-5 w-5" />
                    {t('cropGrowth.uploadAndAnalyze')}
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
