import React, { useRef, useState, useEffect } from 'react';
import { Camera, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

interface InstaScanCameraProps {
  onCapture: (imageData: string) => void;
  onClose: () => void;
}

export function InstaScanCamera({ onCapture, onClose }: InstaScanCameraProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  useEffect(() => {
    requestCameraPermission();
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Image quality validation function
  const validateImageQuality = (canvas: HTMLCanvasElement): {
    isValid: boolean;
    reason?: string;
    metrics: {
      brightness: number;
      contrast: number;
    }
  } => {
    const context = canvas.getContext('2d');
    if (!context) {
      return { isValid: true, metrics: { brightness: 0, contrast: 0 } };
    }

    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;
    
    // Calculate average brightness (0-255)
    let totalBrightness = 0;
    let minBrightness = 255;
    let maxBrightness = 0;
    
    for (let i = 0; i < pixels.length; i += 4) {
      const brightness = (pixels[i] + pixels[i+1] + pixels[i+2]) / 3;
      totalBrightness += brightness;
      minBrightness = Math.min(minBrightness, brightness);
      maxBrightness = Math.max(maxBrightness, brightness);
    }
    
    const avgBrightness = totalBrightness / (pixels.length / 4);
    const contrast = maxBrightness - minBrightness;
    
    // Check if too dark
    if (avgBrightness < 40) {
      return { 
        isValid: false, 
        reason: 'Image too dark - please use better lighting', 
        metrics: { brightness: avgBrightness, contrast } 
      };
    }
    
    // Check if overexposed
    if (avgBrightness > 240) {
      return { 
        isValid: false, 
        reason: 'Image overexposed - reduce lighting or avoid direct sunlight', 
        metrics: { brightness: avgBrightness, contrast } 
      };
    }
    
    // Check contrast (low contrast = blurry/foggy)
    if (contrast < 50) {
      return { 
        isValid: false, 
        reason: 'Image appears blurry or low contrast - hold camera steady', 
        metrics: { brightness: avgBrightness, contrast } 
      };
    }
    
    return { 
      isValid: true, 
      metrics: { brightness: avgBrightness, contrast } 
    };
  };

  const requestCameraPermission = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      });
      
      setStream(mediaStream);
      setHasPermission(true);
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (error) {
      console.error('Camera permission denied:', error);
      setHasPermission(false);
      toast({
        title: t('instaScan.permissionDenied'),
        description: t('instaScan.enableCamera'),
        variant: 'destructive'
      });
    }
  };

  const captureImage = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    setIsCapturing(true);
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    
    if (!context) return;
    
    // Get original dimensions
    const originalWidth = video.videoWidth;
    const originalHeight = video.videoHeight;
    
    // Calculate dimensions to fit within 1536x1536 while maintaining aspect ratio (increased for better AI analysis)
    const maxDimension = 1536;
    let targetWidth = originalWidth;
    let targetHeight = originalHeight;
    
    if (originalWidth > maxDimension || originalHeight > maxDimension) {
      const aspectRatio = originalWidth / originalHeight;
      
      if (originalWidth > originalHeight) {
        targetWidth = maxDimension;
        targetHeight = Math.round(maxDimension / aspectRatio);
      } else {
        targetHeight = maxDimension;
        targetWidth = Math.round(maxDimension * aspectRatio);
      }
    }
    
    // Set canvas to target dimensions
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    
    // Draw scaled image
    context.drawImage(video, 0, 0, targetWidth, targetHeight);
    
    // Validate image quality before sending
    const qualityCheck = validateImageQuality(canvas);
    console.log('📷 Image Quality Metrics:', qualityCheck);
    
    if (!qualityCheck.isValid) {
      console.warn('⚠️ Image quality warning:', qualityCheck.reason);
      toast({
        title: 'Image Quality Warning',
        description: qualityCheck.reason + ' - Results may be less accurate.',
        variant: 'default'
      });
    }
    
    // Convert to base64 with higher quality JPEG compression (0.92 instead of 0.8 for better detail)
    const imageData = canvas.toDataURL('image/jpeg', 0.92);
    
    // Add capture animation
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 bg-white animate-flash pointer-events-none z-50';
    document.body.appendChild(overlay);
    
    setTimeout(() => {
      overlay.remove();
      onCapture(imageData);
    }, 300);
  };

  if (hasPermission === false) {
    return (
      <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-xl flex items-center justify-center">
        <div className="glassmorphism rounded-3xl p-8 max-w-sm mx-4 text-center">
          <Camera className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">{t('instaScan.cameraRequired')}</h3>
          <p className="text-muted-foreground mb-6">{t('instaScan.enableCameraInSettings')}</p>
          <Button onClick={onClose} variant="secondary" className="w-full">
            {t('common.close')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black">
      {/* Camera View */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="w-full h-full object-cover"
      />
      
      {/* Hidden Canvas for Capture */}
      <canvas ref={canvasRef} className="hidden" />
      
      {/* Overlay UI */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Top Bar */}
        <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/60 to-transparent p-safe-top pointer-events-auto">
          <div className="flex items-center justify-between px-4 py-3">
            <Button
              onClick={onClose}
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/20 rounded-full"
            >
              <X className="h-6 w-6" />
            </Button>
            <h2 className="text-white text-lg font-semibold">{t('instaScan.title')}</h2>
            <div className="w-10" />
          </div>
        </div>

        {/* Viewfinder Frame */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="relative w-80 h-80 max-w-[80vw] max-h-[60vh]">
            {/* Corner Markers */}
            <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl-2xl" />
            <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr-2xl" />
            <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl-2xl" />
            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-white rounded-br-2xl" />
            
            {/* Scanning Animation */}
            <div className="absolute inset-x-4 top-4 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent animate-scan" />
          </div>
        </div>

        {/* Bottom Controls */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-safe-bottom pointer-events-auto">
          <div className="flex flex-col items-center gap-4 px-4 py-6">
            <p className="text-white/80 text-sm text-center">{t('instaScan.instruction')}</p>
            
            {/* Capture Button */}
            <button
              onClick={captureImage}
              disabled={isCapturing || !stream}
              className={cn(
                "relative w-20 h-20 rounded-full",
                "bg-white shadow-2xl",
                "transition-all duration-200",
                "hover:scale-110 active:scale-95",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              {isCapturing ? (
                <Loader2 className="w-8 h-8 text-primary animate-spin absolute inset-0 m-auto" />
              ) : (
                <>
                  <div className="absolute inset-2 rounded-full bg-gradient-to-br from-primary to-primary-glow" />
                  <Camera className="w-8 h-8 text-white absolute inset-0 m-auto z-10" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}