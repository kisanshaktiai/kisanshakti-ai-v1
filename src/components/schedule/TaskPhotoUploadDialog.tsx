import React, { useRef, useState, useCallback, useEffect } from 'react';
import { 
  Camera, Upload, X, Loader2, MapPin, CheckCircle2, AlertTriangle, 
  XCircle, Leaf, Droplets, Bug, Scissors, Package, Sprout
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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

const uploadTypeConfig: Record<UploadType, { icon: any; label: { en: string; hi: string; mr: string }; color: string }> = {
  crop: { icon: Leaf, label: { en: 'Crop Photo', hi: 'फसल फोटो', mr: 'पीक फोटो' }, color: 'text-green-500' },
  soil: { icon: Sprout, label: { en: 'Soil Photo', hi: 'मिट्टी फोटो', mr: 'माती फोटो' }, color: 'text-amber-700' },
  land_preparation: { icon: Sprout, label: { en: 'Land Preparation', hi: 'भूमि तैयारी', mr: 'जमीन तयारी' }, color: 'text-amber-600' },
  irrigation: { icon: Droplets, label: { en: 'Irrigation', hi: 'सिंचाई', mr: 'सिंचन' }, color: 'text-blue-500' },
  pest: { icon: Bug, label: { en: 'Pest/Disease', hi: 'कीट/रोग', mr: 'कीड/रोग' }, color: 'text-orange-500' },
  fertilizer: { icon: Leaf, label: { en: 'Fertilizer Application', hi: 'उर्वरक', mr: 'खत' }, color: 'text-emerald-500' },
  harvest: { icon: Package, label: { en: 'Harvest', hi: 'कटाई', mr: 'काढणी' }, color: 'text-amber-500' },
  general: { icon: Camera, label: { en: 'General', hi: 'सामान्य', mr: 'सामान्य' }, color: 'text-gray-500' },
};

// Map task types to default upload types
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

// Haversine formula to calculate distance in meters
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth's radius in meters
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
    taskType ? (taskTypeToUploadType[taskType] || 'crop') : 'crop'
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

  const lang = (i18n.language as 'en' | 'hi' | 'mr') || 'en';

  // Fetch land center coordinates
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

  // Validate location when both location and land center are available
  useEffect(() => {
    if (location && landCenter) {
      const distance = calculateDistance(
        location.lat, location.lng,
        landCenter.lat, landCenter.lng
      );
      
      let level: 'at_land' | 'nearby' | 'far' = 'far';
      let isValid = false;
      
      if (distance <= 100) {
        level = 'at_land';
        isValid = true;
      } else if (distance <= 500) {
        level = 'nearby';
        isValid = true;
      } else {
        level = 'far';
        isValid = false;
      }
      
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
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
      
      // Auto-get location when file is selected
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
        setLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
        setGettingLocation(false);
      },
      (error) => {
        console.error('Location error:', error);
        setGettingLocation(false);
        toast.error(lang === 'hi' ? 'स्थान प्राप्त नहीं हो सका' : lang === 'mr' ? 'स्थान मिळू शकले नाही' : 'Could not get location');
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }, [lang]);

  const handleUpload = async () => {
    if (!selectedFile) return;
    
    // Require location for task photos
    if (!location) {
      toast.error(lang === 'hi' ? 'कृपया स्थान जोड़ें' : lang === 'mr' ? 'कृपया स्थान जोडा' : 'Please add location');
      getLocation();
      return;
    }
    
    // Warn if location is far from land
    if (locationValidation.level === 'far') {
      const confirmFar = window.confirm(
        lang === 'hi' 
          ? `फोटो खेत से ${Math.round(locationValidation.distance || 0)}m दूर से लिया गया है। क्या आप जारी रखना चाहते हैं?`
          : lang === 'mr'
          ? `फोटो शेतापासून ${Math.round(locationValidation.distance || 0)}m दूर घेतला आहे. तुम्हाला सुरू ठेवायचे आहे का?`
          : `Photo taken ${Math.round(locationValidation.distance || 0)}m away from land. Continue anyway?`
      );
      if (!confirmFar) return;
    }

    setIsUploading(true);

    try {
      const fileExt = selectedFile.name.split('.').pop()?.toLowerCase();
      const fileName = `${farmerId}/${landId}/${Date.now()}.${fileExt}`;
      const fileType = selectedFile.type.startsWith('video/') ? 'video' : 'image';

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('crop-growth-media')
        .upload(fileName, selectedFile, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) throw uploadError;

      // Get signed URL
      const { data: urlData } = await supabase.storage
        .from('crop-growth-media')
        .createSignedUrl(fileName, 60 * 60 * 24 * 7);

      const fileUrl = urlData?.signedUrl;
      if (!fileUrl) throw new Error('Failed to get file URL');

      // Create upload record with schedule/task context
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

      // Trigger AI analysis
      const { data: analysisData, error: analysisError } = await supabase.functions.invoke('ai-crop-scan', {
        body: {
          images: [fileUrl],
          mode: 'growth_tracking',
          uploadId: upload.id,
          landId: landId,
          farmerId: farmerId,
          tenantId: tenantId,
          landCrop: cropName,
          scheduleId: scheduleId,
          taskId: taskId,
          uploadType: uploadType,
          language: i18n.language
        }
      });

      if (analysisError) {
        console.error('Analysis error:', analysisError);
      }

      toast.success(
        lang === 'hi' ? 'फोटो अपलोड और विश्लेषण हो गया' 
        : lang === 'mr' ? 'फोटो अपलोड आणि विश्लेषण झाले' 
        : 'Photo uploaded and analyzed'
      );
      
      onUploadComplete?.();
      handleClose();
    } catch (error) {
      console.error('Upload error:', error);
      toast.error(
        lang === 'hi' ? 'अपलोड विफल' 
        : lang === 'mr' ? 'अपलोड अयशस्वी' 
        : 'Upload failed'
      );
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

  const LocationStatus = () => {
    if (gettingLocation) {
      return (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          {lang === 'hi' ? 'स्थान प्राप्त हो रहा है...' : lang === 'mr' ? 'स्थान मिळवत आहे...' : 'Getting location...'}
        </div>
      );
    }

    if (!location) {
      return (
        <Button variant="outline" size="sm" onClick={getLocation} className="gap-1 text-xs">
          <MapPin className="h-3 w-3" />
          {lang === 'hi' ? 'स्थान जोड़ें' : lang === 'mr' ? 'स्थान जोडा' : 'Add Location'}
        </Button>
      );
    }

    const { level, distance } = locationValidation;
    
    return (
      <div className="flex items-center gap-2">
        {level === 'at_land' && (
          <Badge variant="outline" className="bg-green-500/10 text-green-700 border-green-500/30 gap-1">
            <CheckCircle2 className="h-3 w-3" />
            {lang === 'hi' ? 'खेत पर' : lang === 'mr' ? 'शेतावर' : 'At land'}
          </Badge>
        )}
        {level === 'nearby' && (
          <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-500/30 gap-1">
            <AlertTriangle className="h-3 w-3" />
            {lang === 'hi' ? `${Math.round(distance || 0)}m दूर` : lang === 'mr' ? `${Math.round(distance || 0)}m दूर` : `${Math.round(distance || 0)}m away`}
          </Badge>
        )}
        {level === 'far' && (
          <Badge variant="outline" className="bg-red-500/10 text-red-700 border-red-500/30 gap-1">
            <XCircle className="h-3 w-3" />
            {lang === 'hi' ? `${Math.round(distance || 0)}m दूर` : lang === 'mr' ? `${Math.round(distance || 0)}m दूर` : `${Math.round(distance || 0)}m away`}
          </Badge>
        )}
        <span className="text-[10px] text-muted-foreground">
          {location.lat.toFixed(4)}, {location.lng.toFixed(4)}
        </span>
      </div>
    );
  };

  const UploadTypeIcon = uploadTypeConfig[uploadType]?.icon || Camera;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className={cn("p-2 rounded-full bg-primary/10", uploadTypeConfig[uploadType]?.color)}>
              <UploadTypeIcon className="h-4 w-4" />
            </div>
            {taskName || (lang === 'hi' ? 'फोटो अपलोड करें' : lang === 'mr' ? 'फोटो अपलोड करा' : 'Upload Photo')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Upload Type Selector */}
          <div className="space-y-2">
            <Label className="text-xs">
              {lang === 'hi' ? 'फोटो प्रकार' : lang === 'mr' ? 'फोटो प्रकार' : 'Photo Type'}
            </Label>
            <Select value={uploadType} onValueChange={(v) => setUploadType(v as UploadType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(uploadTypeConfig).map(([key, config]) => {
                  const Icon = config.icon;
                  return (
                    <SelectItem key={key} value={key}>
                      <div className="flex items-center gap-2">
                        <Icon className={cn("h-4 w-4", config.color)} />
                        {config.label[lang]}
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* File Selection / Preview */}
          {!selectedFile ? (
            <div className="space-y-3">
              <div className="text-center py-8 border-2 border-dashed border-border rounded-lg bg-muted/20">
                <div className="flex justify-center gap-3">
                  <Button
                    variant="default"
                    size="lg"
                    className="gap-2 shadow-lg"
                    onClick={() => cameraInputRef.current?.click()}
                  >
                    <Camera className="h-5 w-5" />
                    {lang === 'hi' ? 'फोटो लें' : lang === 'mr' ? 'फोटो घ्या' : 'Take Photo'}
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    className="gap-2"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-5 w-5" />
                    {lang === 'hi' ? 'अपलोड' : lang === 'mr' ? 'अपलोड' : 'Upload'}
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground mt-4">
                  {lang === 'hi' ? 'खेत से फोटो लें - स्थान स्वचालित रूप से जुड़ेगा' 
                   : lang === 'mr' ? 'शेतातून फोटो घ्या - स्थान आपोआप जोडले जाईल' 
                   : 'Take photo from field - location will be added automatically'}
                </p>
              </div>
              
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                onChange={handleFileSelect}
                className="hidden"
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="relative">
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-2 right-2 z-10 bg-background/80"
                  onClick={() => {
                    setSelectedFile(null);
                    setPreview(null);
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
                
                {selectedFile.type.startsWith('video/') ? (
                  <video
                    src={preview!}
                    className="w-full rounded-lg max-h-48 object-cover"
                    controls
                  />
                ) : (
                  <img
                    src={preview!}
                    alt="Preview"
                    className="w-full rounded-lg max-h-48 object-cover"
                  />
                )}
              </div>

              {/* Location Status */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border">
                <span className="text-xs font-medium">
                  {lang === 'hi' ? 'स्थान' : lang === 'mr' ? 'स्थान' : 'Location'}
                </span>
                <LocationStatus />
              </div>

              {/* Notes */}
              <Textarea
                placeholder={lang === 'hi' ? 'नोट जोड़ें (वैकल्पिक)...' : lang === 'mr' ? 'नोट जोडा (पर्यायी)...' : 'Add notes (optional)...'}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="resize-none"
                rows={2}
              />

              {/* Upload Button */}
              <Button
                onClick={handleUpload}
                disabled={isUploading || !selectedFile}
                className="w-full gap-2"
                size="lg"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {lang === 'hi' ? 'अपलोड हो रहा है...' : lang === 'mr' ? 'अपलोड होत आहे...' : 'Uploading...'}
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    {lang === 'hi' ? 'अपलोड और विश्लेषण' : lang === 'mr' ? 'अपलोड आणि विश्लेषण' : 'Upload & Analyze'}
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}