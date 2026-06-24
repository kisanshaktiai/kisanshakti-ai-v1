import { useState, useCallback, useRef } from 'react';
import Cropper, { Area } from 'react-easy-crop';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Camera, Upload, X, ZoomIn, ZoomOut, Loader2, User } from 'lucide-react';
import { supabaseWithAuth } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { useToast } from '@/hooks/use-toast';
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
        title: 'Invalid file type',
        description: 'Please select an image file (JPG, PNG, WEBP)',
        variant: 'destructive'
      });
      return;
    }

    // Validate file size (5MB limit)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: 'File too large',
        description: 'Image must be less than 5MB',
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
      
      console.log('🔐 Using authenticated client with:', { farmerId, tenantId });
      
      // Create authenticated Supabase client with custom headers
      const authClient = supabaseWithAuth(farmerId, tenantId);
      
      // Crop and compress the image
      const croppedImageBlob = await getCroppedImg(imageSrc, croppedAreaPixels);
      
      // Check compressed file size
      const fileSizeMB = croppedImageBlob.size / (1024 * 1024);
      console.log('Compressed image size:', fileSizeMB.toFixed(2), 'MB');
      
      // Create file name with farmer ID for RLS
      const fileName = `${farmerId}/avatar-${Date.now()}.jpg`;
      console.log('Uploading to path:', fileName);
      
      // Delete old avatar if exists
      if (currentAvatarUrl) {
        try {
          const oldPath = currentAvatarUrl.split('/').slice(-2).join('/');
          console.log('Deleting old avatar:', oldPath);
          await authClient.storage.from('avatars').remove([oldPath]);
        } catch (error) {
          console.warn('Failed to delete old avatar:', error);
          // Continue even if deletion fails
        }
      }

      // Upload to Supabase Storage with authenticated client
      console.log('Starting upload with authenticated client...');
      const { data: uploadData, error: uploadError } = await authClient.storage
        .from('avatars')
        .upload(fileName, croppedImageBlob, {
          contentType: 'image/jpeg',
          upsert: true,
          cacheControl: '3600'
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        throw uploadError;
      }

      console.log('Upload successful:', uploadData);

      // Get public URL
      const { data: { publicUrl } } = authClient.storage
        .from('avatars')
        .getPublicUrl(uploadData.path);

      console.log('Public URL:', publicUrl);

      // Update user_profiles table using authenticated client
      console.log('Updating user_profiles for farmer_id:', farmerId);
      const { data: updateData, error: updateError } = await authClient
        .from('user_profiles')
        .update({ avatar_url: publicUrl })
        .eq('farmer_id', farmerId)
        .select();

      if (updateError) {
        console.error('Update error:', updateError);
        throw updateError;
      }

      console.log('Profile updated:', updateData);

      toast({
        title: 'Success!',
        description: 'Profile picture updated successfully'
      });

      onAvatarUpdate?.(publicUrl);
      setShowCropDialog(false);
      setImageSrc(null);
      setZoom(1);
      
      // Refresh the page to show updated avatar
      setTimeout(() => {
        window.location.reload();
      }, 500);
    } catch (error: any) {
      console.error('Error uploading avatar:', error);
      
      let errorMessage = 'Failed to update profile picture. Please try again.';
      
      if (error.message?.includes('Not authenticated')) {
        errorMessage = error.message;
      } else if (error.message?.includes('row-level security')) {
        errorMessage = 'Permission denied. Please log in again.';
      } else if (error.message?.includes('size')) {
        errorMessage = 'Image file is too large. Please use a smaller image.';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      toast({
        title: 'Upload failed',
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
      <div className="relative group">
        <Avatar className={cn(sizeClasses[size], "ring-2 ring-border shadow-lg")}>
          <AvatarImage src={currentAvatarUrl} alt="Profile" />
          <AvatarFallback className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground text-xl font-bold">
            <User className="w-1/2 h-1/2" />
          </AvatarFallback>
        </Avatar>
        
        {editable && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
              id="avatar-upload"
            />
            <label
              htmlFor="avatar-upload"
              className={cn(
                "absolute inset-0 flex items-center justify-center rounded-full",
                "bg-black/60 backdrop-blur-sm opacity-0 group-hover:opacity-100",
                "transition-all duration-300 cursor-pointer",
                sizeClasses[size]
              )}
            >
              <Camera className="w-1/3 h-1/3 text-white" />
            </label>
          </>
        )}
      </div>

      {/* Crop Dialog */}
      <Dialog open={showCropDialog} onOpenChange={setShowCropDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Crop Profile Picture</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Cropper */}
            <div className="relative w-full h-64 bg-muted rounded-lg overflow-hidden">
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
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <ZoomOut className="w-4 h-4" />
                <span>Zoom</span>
                <ZoomIn className="w-4 h-4" />
              </div>
              <Slider
                value={[zoom]}
                min={1}
                max={3}
                step={0.1}
                onValueChange={(value) => setZoom(value[0])}
                className="w-full"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={uploading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCropSave}
              disabled={uploading}
              className="min-w-24"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Save
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
