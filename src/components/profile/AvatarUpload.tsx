import { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import Cropper, { Area } from 'react-easy-crop';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Camera, Check, ZoomIn, ZoomOut, Loader2, User } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { useToast } from '@/hooks/use-toast';
import { farmerAuthService } from '@/services/farmerAuthService';
import { cn } from '@/lib/utils';

interface AvatarUploadProps {
  currentAvatarUrl?: string;
  onAvatarUpdate?: (url: string) => void;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  editable?: boolean;
}

export function AvatarUpload({ 
  currentAvatarUrl, 
  onAvatarUpdate,
  size = 'lg',
  editable = true 
}: AvatarUploadProps) {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [showCropDialog, setShowCropDialog] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [uploading, setUploading] = useState(false);

  const sizeClasses = {
    sm: 'w-12 h-12',
    md: 'w-16 h-16',
    lg: 'w-20 h-20',
    xl: 'w-24 h-24'
  };

  const onCropComplete = useCallback((croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: t('toast.avatar_upload_failed'),
        description: t('profile.avatar.invalid_type'),
        variant: 'destructive'
      });
      return;
    }

    // Validate file size (5MB limit)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: t('toast.avatar_upload_failed'),
        description: t('profile.avatar.too_large'),
        variant: 'destructive'
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setImageSrc(reader.result as string);
      setShowCropDialog(true);
    };
    reader.readAsDataURL(file);
  };

  const createImage = (url: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const image = new Image();
      image.addEventListener('load', () => resolve(image));
      image.addEventListener('error', (error) => reject(error));
      image.src = url;
    });

  const getCroppedImg = async (
    imageSrc: string,
    pixelCrop: Area
  ): Promise<Blob> => {
    const image = await createImage(imageSrc);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('No 2d context');
    }

    // Resize to max 512x512 for profile pictures to reduce file size
    const maxSize = 512;
    let width = pixelCrop.width;
    let height = pixelCrop.height;

    if (width > maxSize || height > maxSize) {
      if (width > height) {
        height = (height / width) * maxSize;
        width = maxSize;
      } else {
        width = (width / height) * maxSize;
        height = maxSize;
      }
    }

    // Set canvas size to resized dimensions
    canvas.width = width;
    canvas.height = height;

    // Draw the cropped and resized image
    ctx.drawImage(
      image,
      pixelCrop.x,
      pixelCrop.y,
      pixelCrop.width,
      pixelCrop.height,
      0,
      0,
      width,
      height
    );

    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Canvas is empty'));
          return;
        }
        resolve(blob);
      }, 'image/jpeg', 0.85); // Reduced quality to 85% for smaller file size
    });
  };

  const handleCropSave = async () => {
    if (!imageSrc || !croppedAreaPixels || !user) return;

    setUploading(true);
    try {
      // Use farmerId from custom auth store (not Supabase Auth)
      const farmerId = user.id;
      const tenantId = user.tenantId;
      
      if (!farmerId || !tenantId) {
        throw new Error('Not authenticated. Please log in again.');
      }
      
      
      // Crop and compress the image
      const croppedImageBlob = await getCroppedImg(imageSrc, croppedAreaPixels);
      
      // Check compressed file size
      const fileSizeMB = croppedImageBlob.size / (1024 * 1024);
      console.log('Compressed image size:', fileSizeMB.toFixed(2), 'MB');
      
      // Upload through a server-signed slot bound to the verified session;
      // direct storage writes are refused since the privilege lockdown.
      const slot = await farmerAuthService.avatarUploadSign();
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .uploadToSignedUrl(slot.path, slot.token, croppedImageBlob, { contentType: 'image/jpeg' });
      if (uploadError) {
        console.error('Upload error:', uploadError);
        throw uploadError;
      }
      const publicUrl = slot.publicUrl;

      // The verified-session service owns the profile write; no farmer ID or
      // tenant ID from the browser is accepted as write authorization.
      await farmerAuthService.updateFarmerProfile({ avatarUrl: publicUrl });

      toast({
        title: t('common.success'),
        description: t('toast.avatar_updated')
      });

      onAvatarUpdate?.(publicUrl);
      setShowCropDialog(false);
      setImageSrc(null);
      setZoom(1);
      // The new picture is shown through onAvatarUpdate; a full reload restarted the whole app.
    } catch (error: any) {
      console.error('Error uploading avatar:', error);
      
      // The farmer reads the reason in the app language; the technical
      // message stays in the console line above.
      let errorMessage = t('common.tryAgain');

      if (error.message?.includes('Not authenticated')) {
        errorMessage = t('toast.session_expired');
      } else if (error.message?.includes('row-level security')) {
        errorMessage = t('toast.permission_denied');
      } else if (error.message?.includes('size')) {
        errorMessage = t('profile.avatar.too_large');
      }

      toast({
        title: t('toast.avatar_upload_failed'),
        description: errorMessage,
        variant: 'destructive'
      });
    } finally {
      setUploading(false);
    }
  };

  const handleCancel = () => {
    setShowCropDialog(false);
    setImageSrc(null);
    setZoom(1);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const initials = user?.fullName || user?.name || 'F';
  const displayInitials = initials.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  return (
    <>
      <div className="relative shrink-0">
        <Avatar className={cn(sizeClasses[size], "ring-2 ring-background shadow-md")}>
          <AvatarImage src={currentAvatarUrl} alt="" />
          <AvatarFallback className="bg-muted text-primary">
            <User className="w-1/2 h-1/2" aria-hidden="true" />
          </AvatarFallback>
        </Avatar>
        
        {editable && (
          <>
            {/* The input stays in the page (not display:none) so it can take
                keyboard focus; the label over the photo is the touch target. */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="peer sr-only"
              id="avatar-upload"
              aria-label={t('profile_edit.changePhoto')}
            />
            <label
              htmlFor="avatar-upload"
              className={cn(
                "absolute inset-0 rounded-full cursor-pointer",
                "peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background",
                sizeClasses[size]
              )}
            >
              {/* Always visible: a phone has no hover to reveal it. */}
              <span className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-background bg-card text-primary shadow-sm">
                <Camera className="h-4 w-4" aria-hidden="true" />
              </span>
            </label>
          </>
        )}
      </div>

      {/* Crop Dialog */}
      <Dialog open={showCropDialog} onOpenChange={setShowCropDialog}>
        <DialogContent className="max-w-md rounded-2xl w-[calc(100%-2rem)]">
          <DialogHeader>
            <DialogTitle>{t('profile.avatar.crop_title')}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Cropper */}
            <div className="relative w-full h-64 bg-muted rounded-xl overflow-hidden">
              {imageSrc && (
                <Cropper
                  image={imageSrc}
                  crop={crop}
                  zoom={zoom}
                  aspect={1}
                  cropShape="round"
                  showGrid={false}
                  onCropChange={setCrop}
                  onCropComplete={onCropComplete}
                  onZoomChange={setZoom}
                />
              )}
            </div>

            {/* Zoom Control */}
            <div className="flex items-center gap-3 text-muted-foreground">
              <ZoomOut className="w-5 h-5 shrink-0" aria-hidden="true" />
              <Slider
                value={[zoom]}
                min={1}
                max={3}
                step={0.1}
                onValueChange={(value) => setZoom(value[0])}
                className="w-full py-3"
                aria-label={t('profile.avatar.zoom')}
              />
              <ZoomIn className="w-5 h-5 shrink-0" aria-hidden="true" />
            </div>
          </div>

          <DialogFooter className="flex-row gap-3 sm:space-x-0">
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={uploading}
              className="h-12 flex-1 text-base"
            >
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleCropSave}
              disabled={uploading}
              className="h-12 flex-1 text-base"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  {t('common.saving')}
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" aria-hidden="true" />
                  {t('common.save')}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
