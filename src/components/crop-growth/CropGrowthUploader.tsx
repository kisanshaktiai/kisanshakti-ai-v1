import React, { useRef, useState, useCallback } from 'react';
import { Camera, Upload, Video, X, Loader2, MapPin, Sprout } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { CropPhotoGuidelines } from './CropPhotoGuidelines';

interface CropGrowthUploaderProps {
  onUpload: (file: File, notes?: string, location?: { lat: number; lng: number }) => Promise<any>;
  isUploading: boolean;
  scheduleId?: string;
  cropName?: string;
  className?: string;
}

export function CropGrowthUploader({ onUpload, isUploading, scheduleId, cropName, className }: CropGrowthUploaderProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [gettingLocation, setGettingLocation] = useState(false);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const getLocation = useCallback(() => {
    if (!navigator.geolocation) {
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
      () => {
        setGettingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  const handleUpload = async () => {
    if (!selectedFile) return;
    
    const result = await onUpload(selectedFile, notes || undefined, location || undefined);
    
    if (result) {
      // Clear form
      setSelectedFile(null);
      setPreview(null);
      setNotes('');
      setLocation(null);
    }
  };

  const clearSelection = () => {
    setSelectedFile(null);
    setPreview(null);
    setNotes('');
    setLocation(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  return (
    <div className={cn("space-y-3", className)}>
      {/* Photo Guidelines - Always show */}
      <CropPhotoGuidelines collapsed={true} />
      
      <Card className="border-dashed border-primary/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Sprout className="h-4 w-4 text-primary" />
            {cropName ? `${t('cropGrowth.trackGrowth', 'Track Growth')}: ${cropName}` : t('cropGrowth.uploadPhoto', 'Upload Crop Photo')}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {!selectedFile ? (
            <div className="space-y-4">
              <div className="text-center py-6 border-2 border-dashed border-border/50 rounded-lg bg-muted/20">
                <div className="flex justify-center gap-3">
                  <Button
                    variant="default"
                    size="lg"
                    className="gap-2 shadow-lg"
                    onClick={() => cameraInputRef.current?.click()}
                  >
                    <Camera className="h-5 w-5" />
                    {t('cropGrowth.takePhoto', 'Take Photo')}
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    className="gap-2"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-5 w-5" />
                    {t('cropGrowth.uploadFile', 'Upload')}
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground mt-4">
                  {t('cropGrowth.uploadHint', 'Upload crop photos for AI-powered growth analysis')}
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
                onClick={clearSelection}
              >
                <X className="h-4 w-4" />
              </Button>
              
              {selectedFile.type.startsWith('video/') ? (
                <video
                  src={preview!}
                  className="w-full rounded-lg max-h-64 object-cover"
                  controls
                />
              ) : (
                <img
                  src={preview!}
                  alt="Preview"
                  className="w-full rounded-lg max-h-64 object-cover"
                />
              )}
            </div>

            <Textarea
              placeholder={t('cropGrowth.addNotes', 'Add notes about the crop condition (optional)...')}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="resize-none"
              rows={2}
            />

            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                onClick={getLocation}
                disabled={gettingLocation}
                className="gap-1 text-xs"
              >
                {gettingLocation ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <MapPin className="h-3 w-3" />
                )}
                {location ? (
                  <span className="text-primary">
                    {location.lat.toFixed(4)}, {location.lng.toFixed(4)}
                  </span>
                ) : (
                  t('cropGrowth.addLocation', 'Add Location')
                )}
              </Button>

              <Button
                onClick={handleUpload}
                disabled={isUploading}
                className="gap-2"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('cropGrowth.uploading', 'Uploading...')}
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    {t('cropGrowth.uploadAndAnalyze', 'Upload & Analyze')}
                  </>
                )}
              </Button>
            </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
