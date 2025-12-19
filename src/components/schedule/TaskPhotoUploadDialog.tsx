import React, { useRef, useState, useCallback, useEffect } from 'react';
import { 
  Camera, Upload, X, Loader2, MapPin, CheckCircle2, AlertTriangle, 
  XCircle, Leaf, Droplets, Bug, Scissors, Package, Sprout, Sparkles,
  Navigation, Image as ImageIcon
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
import { motion, AnimatePresence } from 'framer-motion';

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

const uploadTypeConfig: Record<UploadType, { icon: any; label: { en: string; hi: string; mr: string }; color: string; gradient: string }> = {
  crop: { 
    icon: Leaf, 
    label: { en: 'Crop Photo', hi: 'फसल फोटो', mr: 'पीक फोटो' }, 
    color: 'text-emerald-500',
    gradient: 'from-emerald-500/20 to-green-500/20'
  },
  soil: { 
    icon: Sprout, 
    label: { en: 'Soil Photo', hi: 'मिट्टी फोटो', mr: 'माती फोटो' }, 
    color: 'text-amber-600',
    gradient: 'from-amber-500/20 to-orange-500/20'
  },
  land_preparation: { 
    icon: Sprout, 
    label: { en: 'Land Preparation', hi: 'भूमि तैयारी', mr: 'जमीन तयारी' }, 
    color: 'text-amber-500',
    gradient: 'from-amber-500/20 to-yellow-500/20'
  },
  irrigation: { 
    icon: Droplets, 
    label: { en: 'Irrigation', hi: 'सिंचाई', mr: 'सिंचन' }, 
    color: 'text-blue-500',
    gradient: 'from-blue-500/20 to-cyan-500/20'
  },
  pest: { 
    icon: Bug, 
    label: { en: 'Pest/Disease', hi: 'कीट/रोग', mr: 'कीड/रोग' }, 
    color: 'text-orange-500',
    gradient: 'from-orange-500/20 to-red-500/20'
  },
  fertilizer: { 
    icon: Leaf, 
    label: { en: 'Fertilizer Application', hi: 'उर्वरक', mr: 'खत' }, 
    color: 'text-emerald-600',
    gradient: 'from-emerald-500/20 to-teal-500/20'
  },
  harvest: { 
    icon: Package, 
    label: { en: 'Harvest', hi: 'कटाई', mr: 'काढणी' }, 
    color: 'text-amber-500',
    gradient: 'from-amber-500/20 to-orange-500/20'
  },
  general: { 
    icon: Camera, 
    label: { en: 'General', hi: 'सामान्य', mr: 'सामान्य' }, 
    color: 'text-slate-500',
    gradient: 'from-slate-500/20 to-gray-500/20'
  },
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
    
    if (!location) {
      toast.error(lang === 'hi' ? 'कृपया स्थान जोड़ें' : lang === 'mr' ? 'कृपया स्थान जोडा' : 'Please add location');
      getLocation();
      return;
    }
    
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

      const { error: uploadError } = await supabase.storage
        .from('crop-growth-media')
        .upload(fileName, selectedFile, {
          cacheControl: '3600',
          upsert: false
        });

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
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-primary/5 border border-primary/20"
        >
          <div className="relative">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <div className="absolute inset-0 animate-ping">
              <Loader2 className="h-4 w-4 text-primary/30" />
            </div>
          </div>
          <span className="text-xs font-medium text-primary">
            {lang === 'hi' ? 'स्थान प्राप्त हो रहा है...' : lang === 'mr' ? 'स्थान मिळवत आहे...' : 'Getting location...'}
          </span>
        </motion.div>
      );
    }

    if (!location) {
      return (
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={getLocation}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20 hover:border-primary/40 transition-all duration-300"
        >
          <Navigation className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium text-primary">
            {lang === 'hi' ? 'स्थान जोड़ें' : lang === 'mr' ? 'स्थान जोडा' : 'Add Location'}
          </span>
        </motion.button>
      );
    }

    const { level, distance } = locationValidation;
    
    return (
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-2 flex-wrap"
      >
        {level === 'at_land' && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gradient-to-r from-emerald-500/10 to-green-500/10 border border-emerald-500/30">
            <div className="relative">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <motion.div 
                initial={{ scale: 0 }}
                animate={{ scale: [1, 1.5, 0] }}
                transition={{ duration: 1, repeat: Infinity, repeatDelay: 2 }}
                className="absolute inset-0"
              >
                <CheckCircle2 className="h-4 w-4 text-emerald-500/30" />
              </motion.div>
            </div>
            <span className="text-xs font-semibold text-emerald-600">
              {lang === 'hi' ? 'खेत पर' : lang === 'mr' ? 'शेतावर' : 'At land'}
            </span>
          </div>
        )}
        {level === 'nearby' && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/30">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <span className="text-xs font-semibold text-amber-600">
              {lang === 'hi' ? `${Math.round(distance || 0)}m दूर` : lang === 'mr' ? `${Math.round(distance || 0)}m दूर` : `${Math.round(distance || 0)}m away`}
            </span>
          </div>
        )}
        {level === 'far' && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gradient-to-r from-red-500/10 to-rose-500/10 border border-red-500/30">
            <XCircle className="h-4 w-4 text-red-500" />
            <span className="text-xs font-semibold text-red-600">
              {lang === 'hi' ? `${Math.round(distance || 0)}m दूर` : lang === 'mr' ? `${Math.round(distance || 0)}m दूर` : `${Math.round(distance || 0)}m away`}
            </span>
          </div>
        )}
        <span className="text-[10px] text-muted-foreground font-mono bg-muted/50 px-2 py-1 rounded-lg">
          {location.lat.toFixed(4)}, {location.lng.toFixed(4)}
        </span>
      </motion.div>
    );
  };

  const UploadTypeIcon = uploadTypeConfig[uploadType]?.icon || Camera;
  const currentConfig = uploadTypeConfig[uploadType];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto p-0 gap-0 bg-gradient-to-b from-background to-muted/30 border-border/50 shadow-2xl">
        {/* Header with Glassmorphism */}
        <div className={cn(
          "relative overflow-hidden",
          `bg-gradient-to-r ${currentConfig.gradient}`
        )}>
          {/* Animated Background Pattern */}
          <div className="absolute inset-0 opacity-30">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-white/20 to-transparent rounded-full blur-2xl transform translate-x-16 -translate-y-16" />
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-gradient-to-tr from-white/10 to-transparent rounded-full blur-xl transform -translate-x-8 translate-y-8" />
          </div>
          
          <DialogHeader className="relative p-5">
            <DialogTitle className="flex items-center gap-3">
              <motion.div 
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", bounce: 0.5 }}
                className={cn(
                  "p-3 rounded-2xl bg-background/80 backdrop-blur-xl shadow-lg border border-white/20",
                  currentConfig.color
                )}
              >
                <UploadTypeIcon className="h-5 w-5" />
              </motion.div>
              <div className="flex-1">
                <motion.h2 
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="text-lg font-bold text-foreground"
                >
                  {taskName || (lang === 'hi' ? 'फोटो अपलोड करें' : lang === 'mr' ? 'फोटो अपलोड करा' : 'Upload Photo')}
                </motion.h2>
                {cropName && (
                  <motion.p 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.1 }}
                    className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"
                  >
                    <Sparkles className="h-3 w-3" />
                    {lang === 'hi' ? 'AI विश्लेषण सक्षम' : lang === 'mr' ? 'AI विश्लेषण सक्षम' : 'AI Analysis Enabled'}
                  </motion.p>
                )}
              </div>
            </DialogTitle>
          </DialogHeader>
        </div>

        <div className="p-5 space-y-5">
          {/* Upload Type Selector - Modern Pill Style */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="space-y-2"
          >
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {lang === 'hi' ? 'फोटो प्रकार' : lang === 'mr' ? 'फोटो प्रकार' : 'Photo Type'}
            </Label>
            <Select value={uploadType} onValueChange={(v) => setUploadType(v as UploadType)}>
              <SelectTrigger className="h-12 rounded-xl border-2 border-border/50 bg-background/50 backdrop-blur-sm hover:border-primary/50 transition-all duration-300 focus:ring-2 focus:ring-primary/20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-border/50 bg-background/95 backdrop-blur-xl">
                {Object.entries(uploadTypeConfig).map(([key, config]) => {
                  const Icon = config.icon;
                  return (
                    <SelectItem 
                      key={key} 
                      value={key}
                      className="rounded-lg focus:bg-primary/10 cursor-pointer"
                    >
                      <div className="flex items-center gap-3 py-1">
                        <div className={cn("p-1.5 rounded-lg", `bg-gradient-to-r ${config.gradient}`)}>
                          <Icon className={cn("h-4 w-4", config.color)} />
                        </div>
                        <span className="font-medium">{config.label[lang]}</span>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </motion.div>

          {/* File Selection / Preview - Futuristic Design */}
          <AnimatePresence mode="wait">
            {!selectedFile ? (
              <motion.div
                key="upload-area"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                <div className="relative group">
                  {/* Animated Border */}
                  <div className="absolute -inset-0.5 bg-gradient-to-r from-primary via-primary/50 to-primary rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-sm" />
                  
                  <div className="relative text-center py-10 px-4 border-2 border-dashed border-border/50 rounded-2xl bg-gradient-to-b from-muted/20 to-muted/40 backdrop-blur-sm hover:border-primary/30 transition-all duration-300">
                    {/* Decorative Elements */}
                    <div className="absolute top-4 right-4">
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                      >
                        <Sparkles className="h-5 w-5 text-primary/30" />
                      </motion.div>
                    </div>
                    
                    <div className="mb-6">
                      <motion.div 
                        whileHover={{ scale: 1.05 }}
                        className="inline-flex p-4 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 mb-3"
                      >
                        <ImageIcon className="h-8 w-8 text-primary" />
                      </motion.div>
                    </div>
                    
                    <div className="flex justify-center gap-3">
                      <motion.button
                        whileHover={{ scale: 1.05, y: -2 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => cameraInputRef.current?.click()}
                        className="flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground font-semibold shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all duration-300"
                      >
                        <Camera className="h-5 w-5" />
                        {lang === 'hi' ? 'फोटो लें' : lang === 'mr' ? 'फोटो घ्या' : 'Take Photo'}
                      </motion.button>
                      
                      <motion.button
                        whileHover={{ scale: 1.05, y: -2 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-2 px-5 py-3 rounded-xl bg-background border-2 border-border hover:border-primary/50 font-semibold shadow-md hover:shadow-lg transition-all duration-300"
                      >
                        <Upload className="h-5 w-5" />
                        {lang === 'hi' ? 'अपलोड' : lang === 'mr' ? 'अपलोड' : 'Upload'}
                      </motion.button>
                    </div>
                    
                    <p className="text-sm text-muted-foreground mt-5 flex items-center justify-center gap-2">
                      <MapPin className="h-4 w-4" />
                      {lang === 'hi' ? 'खेत से फोटो लें - स्थान स्वचालित जुड़ेगा' 
                       : lang === 'mr' ? 'शेतातून फोटो घ्या - स्थान आपोआप जोडेल' 
                       : 'Take photo from field - location auto-captured'}
                    </p>
                  </div>
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
              </motion.div>
            ) : (
              <motion.div
                key="preview-area"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                {/* Image Preview with Futuristic Frame */}
                <div className="relative group">
                  <div className="absolute -inset-1 bg-gradient-to-r from-primary/50 via-primary/30 to-primary/50 rounded-2xl opacity-75 blur-sm" />
                  
                  <div className="relative rounded-2xl overflow-hidden bg-black">
                    {preview && (
                      <img
                        src={preview}
                        alt="Preview"
                        className="w-full aspect-[4/3] object-cover"
                      />
                    )}
                    
                    {/* Overlay Controls */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                    
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => {
                        setSelectedFile(null);
                        setPreview(null);
                      }}
                      className="absolute top-3 right-3 p-2 rounded-xl bg-black/50 backdrop-blur-sm border border-white/20 text-white hover:bg-red-500/80 transition-colors duration-300"
                    >
                      <X className="h-4 w-4" />
                    </motion.button>
                    
                    {/* AI Processing Badge */}
                    <div className="absolute bottom-3 left-3 right-3">
                      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-black/50 backdrop-blur-sm border border-white/20">
                        <Sparkles className="h-4 w-4 text-primary" />
                        <span className="text-xs text-white font-medium">
                          {lang === 'hi' ? 'AI विश्लेषण के लिए तैयार' : lang === 'mr' ? 'AI विश्लेषणासाठी तयार' : 'Ready for AI Analysis'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Location Status */}
                <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-muted/30 border border-border/50">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    <span className="font-medium">
                      {lang === 'hi' ? 'स्थान' : lang === 'mr' ? 'स्थान' : 'Location'}
                    </span>
                  </div>
                  <LocationStatus />
                </div>

                {/* Notes Input - Modern Style */}
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {lang === 'hi' ? 'नोट्स (वैकल्पिक)' : lang === 'mr' ? 'नोट्स (पर्यायी)' : 'Notes (Optional)'}
                  </Label>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={lang === 'hi' ? 'फसल की स्थिति के बारे में लिखें...' : lang === 'mr' ? 'पिकाच्या स्थितीबद्दल लिहा...' : 'Describe crop condition...'}
                    className="min-h-[80px] rounded-xl border-2 border-border/50 bg-background/50 backdrop-blur-sm resize-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all duration-300"
                  />
                </div>

                {/* Upload Button - Futuristic CTA */}
                <motion.button
                  whileHover={{ scale: 1.02, y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleUpload}
                  disabled={isUploading || !selectedFile}
                  className={cn(
                    "w-full flex items-center justify-center gap-3 px-6 py-4 rounded-xl font-bold text-base transition-all duration-300",
                    isUploading || !selectedFile
                      ? "bg-muted text-muted-foreground cursor-not-allowed"
                      : "bg-gradient-to-r from-primary via-primary to-primary/90 text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30"
                  )}
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      {lang === 'hi' ? 'अपलोड हो रहा है...' : lang === 'mr' ? 'अपलोड होत आहे...' : 'Uploading...'}
                    </>
                  ) : (
                    <>
                      <Upload className="h-5 w-5" />
                      {lang === 'hi' ? 'अपलोड और विश्लेषण करें' : lang === 'mr' ? 'अपलोड आणि विश्लेषण करा' : 'Upload & Analyze'}
                    </>
                  )}
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
}
