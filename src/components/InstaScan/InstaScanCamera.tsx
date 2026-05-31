import React, { useRef, useState, useEffect } from 'react';
import { Camera, X, Loader2, Sun, Moon, Droplets } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface InstaScanCameraProps {
  onCapture: (imageData: string[]) => void; // Now accepts multiple frames
  onClose: () => void;
}

type QualityStatus = 'good' | 'acceptable' | 'poor';

export function InstaScanCamera({ onCapture, onClose }: InstaScanCameraProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [qualityStatus, setQualityStatus] = useState<QualityStatus>('acceptable');
  const [stabilityLevel, setStabilityLevel] = useState<number>(0); // 0-100
  const [autoCapturing, setAutoCapturing] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [liveDetection, setLiveDetection] = useState<string | null>(null);

  useEffect(() => {
    requestCameraPermission();
    
    // Set up motion detection for stability
    let motionListener: ((event: DeviceMotionEvent) => void) | null = null;
    
    if (typeof DeviceMotionEvent !== 'undefined' && 'requestPermission' in DeviceMotionEvent) {
      // iOS requires permission
      (DeviceMotionEvent as any).requestPermission().then((response: string) => {
        if (response === 'granted') {
          motionListener = handleMotion;
          window.addEventListener('devicemotion', motionListener);
        }
      });
    } else {
      // Android or desktop
      motionListener = handleMotion;
      window.addEventListener('devicemotion', motionListener);
    }
    
    // REDUCED frequency to prevent flickering - check quality every 2 seconds instead of 0.5s
    const qualityInterval = setInterval(checkQuality, 2000);
    
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      if (motionListener) {
        window.removeEventListener('devicemotion', motionListener);
      }
      clearInterval(qualityInterval);
    };
  }, [stream]);

  // Relaxed quality validation for rural farming conditions
  const checkQuality = () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const video = videoRef.current;
    const context = canvas.getContext('2d');
    if (!context) return;
    
    // Use small canvas for quick quality check
    canvas.width = 320;
    canvas.height = 240;
    context.drawImage(video, 0, 0, 320, 240);
    
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;
    
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
    
    // EXTREMELY RELAXED thresholds - only warn on very dark/bright images
    let status: QualityStatus = 'good';
    
    if (avgBrightness < 20 || avgBrightness > 250) {
      status = 'poor';
    } else if (avgBrightness < 30 || avgBrightness > 240) {
      status = 'acceptable';
    }
    
    // Only update state if status actually changed to minimize re-renders
    setQualityStatus(prev => prev === status ? prev : status);
  };
  
  // Motion detection for stability
  const handleMotion = (event: DeviceMotionEvent) => {
    const acceleration = event.accelerationIncludingGravity;
    if (!acceleration) return;
    
    const { x = 0, y = 0, z = 0 } = acceleration;
    const totalMotion = Math.abs(x) + Math.abs(y) + Math.abs(z);
    
    // Map motion to stability (0-100, higher = more stable)
    const stability = Math.max(0, 100 - totalMotion * 5);
    setStabilityLevel(stability);
    
    // Auto-capture when stable enough for 1.5 seconds
    if (stability > 85 && qualityStatus !== 'poor' && !isCapturing && !autoCapturing) {
      triggerAutoCapture();
    }
  };
  
  const triggerAutoCapture = () => {
    setAutoCapturing(true);
    setCountdown(3);
    
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev === null || prev <= 1) {
          clearInterval(interval);
          captureMultiFrame();
          return null;
        }
        return prev - 1;
      });
    }, 500);
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

  // Multi-frame burst capture - capture 3 frames and select the best
  const captureMultiFrame = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    setIsCapturing(true);
    setAutoCapturing(false);
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    
    if (!context) return;
    
    // Get dimensions
    const originalWidth = video.videoWidth;
    const originalHeight = video.videoHeight;
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
    
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    
    // Capture 3 frames with 100ms delay
    const frames: string[] = [];
    
    for (let i = 0; i < 3; i++) {
      context.drawImage(video, 0, 0, targetWidth, targetHeight);
      const imageData = canvas.toDataURL('image/jpeg', 0.92);
      frames.push(imageData);
      
      if (i < 2) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    console.log('📷 Captured 3 frames for burst analysis');
    
    // Flash animation
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 bg-white animate-flash pointer-events-none z-50';
    document.body.appendChild(overlay);
    
    setTimeout(() => {
      overlay.remove();
      onCapture(frames);
    }, 300);
  };
  
  const captureManual = () => {
    setCountdown(null);
    captureMultiFrame();
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

        {/* Viewfinder Frame with Quality Indicator */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="relative w-80 h-80 max-w-[80vw] max-h-[60vh]">
            {/* Quality Ring - Green/Yellow/Red - REMOVED animation to prevent flickering */}
            <div
              className={cn(
                "absolute inset-0 rounded-3xl border-4 transition-colors duration-300",
                qualityStatus === 'good' && "border-success shadow-[0_0_30px_rgba(34,197,94,0.5)]",
                qualityStatus === 'acceptable' && "border-warning shadow-[0_0_30px_rgba(234,179,8,0.5)]",
                qualityStatus === 'poor' && "border-destructive shadow-[0_0_30px_rgba(239,68,68,0.5)]"
              )}
            />
            
            {/* Corner Markers */}
            <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl-2xl" />
            <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr-2xl" />
            <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl-2xl" />
            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-white rounded-br-2xl" />
            
            {/* Visual Quality Indicators */}
            <AnimatePresence>
              {qualityStatus === 'poor' && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 bg-black/70 rounded-full"
                >
                  {qualityStatus === 'poor' && (
                    <>
                      <Sun className="w-5 h-5 text-warning animate-pulse" />
                      <span className="text-white text-sm font-medium">Better Light Needed</span>
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
            
            {/* Stability Meter */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
              <div className="flex gap-1">
                {[...Array(5)].map((_, i) => (
                  <div
                    key={i}
                    className={cn(
                      "w-2 h-8 rounded-full transition-all duration-200",
                      stabilityLevel > i * 20 ? "bg-success" : "bg-white/30"
                    )}
                  />
                ))}
              </div>
              {stabilityLevel > 85 && (
                <span className="text-success text-xs font-medium">✓ Steady</span>
              )}
            </div>
            
            {/* Live Detection Overlay */}
            {liveDetection && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 px-4 py-2 bg-primary/90 rounded-full text-white font-medium"
              >
                {liveDetection}
              </motion.div>
            )}
            
            {/* Countdown Indicator */}
            <AnimatePresence>
              {countdown && (
                <motion.div
                  initial={{ scale: 2, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  className="absolute inset-0 flex items-center justify-center"
                >
                  <div className="w-24 h-24 rounded-full bg-primary/90 flex items-center justify-center">
                    <span className="text-6xl font-bold text-white">{countdown}</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Bottom Controls */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-safe-bottom pointer-events-auto">
          <div className="flex flex-col items-center gap-4 px-4 py-6">
            {/* Icon-Based Instructions */}
            <div className="flex items-center gap-3 text-white/80">
              <span className="text-2xl">📱➡️🌱</span>
              {stabilityLevel > 85 ? (
                <span className="text-sm">🖐️✓ {t('instaScan.steadyHold')}</span>
              ) : (
                <span className="text-sm">{t('instaScan.holdSteady')}</span>
              )}
            </div>
            
            {/* Capture Button */}
            <button
              onClick={captureManual}
              disabled={isCapturing || !stream || autoCapturing}
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
            
            {/* Auto-capture status */}
            {autoCapturing && !countdown && (
              <span className="text-success text-sm font-medium animate-pulse">
                ✨ Auto-capturing...
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}