import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Camera, Video, X, Check, RotateCcw, 
  Zap, ZapOff, SwitchCamera, Loader2,
  Circle, Square, Timer
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

interface WorldClassCameraProps {
  onCapture: (data: { type: 'photo' | 'video'; data: string; duration?: number }) => void;
  onClose: () => void;
  maxVideoDuration?: number; // in seconds
  language?: string;
}

export function WorldClassCamera({ 
  onCapture, 
  onClose, 
  maxVideoDuration = 10,
  language = 'en'
}: WorldClassCameraProps) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  
  const [mode, setMode] = useState<'photo' | 'video'>('photo');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [capturedMedia, setCapturedMedia] = useState<{ type: 'photo' | 'video'; data: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [flashEnabled, setFlashEnabled] = useState(false);
  const [hasFlash, setHasFlash] = useState(false);
  
  // Recording timer
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (isRecording) {
      interval = setInterval(() => {
        setRecordingDuration(prev => {
          if (prev >= maxVideoDuration) {
            stopRecording();
            return prev;
          }
          return prev + 1;
        });
      }, 1000);
    } else {
      setRecordingDuration(0);
    }
    
    return () => clearInterval(interval);
  }, [isRecording, maxVideoDuration]);
  
  // Initialize camera
  const initCamera = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Stop existing stream if any
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode,
          width: { ideal: 1920, max: 4096 },
          height: { ideal: 1080, max: 2160 },
          frameRate: { ideal: 30 }
        },
        audio: mode === 'video'
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      
      // Check if flash is available
      const videoTrack = stream.getVideoTracks()[0];
      const capabilities = videoTrack.getCapabilities?.() as MediaTrackCapabilities & { torch?: boolean };
      setHasFlash(!!capabilities?.torch);
      
      setIsLoading(false);
    } catch (err) {
      console.error('Camera error:', err);
      setError(language === 'hi' 
        ? 'कैमरा खोलने में समस्या। कृपया अनुमति दें।' 
        : language === 'mr'
        ? 'कॅमेरा उघडण्यात समस्या. कृपया परवानगी द्या.'
        : 'Failed to access camera. Please grant permission.');
      setIsLoading(false);
    }
  }, [facingMode, mode, language]);
  
  useEffect(() => {
    initCamera();
    
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (mediaRecorderRef.current && isRecording) {
        mediaRecorderRef.current.stop();
      }
    };
  }, [initCamera]);
  
  // Toggle flash
  const toggleFlash = async () => {
    if (!streamRef.current || !hasFlash) return;
    
    const videoTrack = streamRef.current.getVideoTracks()[0];
    const newFlashState = !flashEnabled;
    
    try {
      await videoTrack.applyConstraints({
        advanced: [{ torch: newFlashState } as any]
      });
      setFlashEnabled(newFlashState);
    } catch (err) {
      console.error('Flash toggle error:', err);
    }
  };
  
  // Switch camera
  const switchCamera = () => {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
  };
  
  // Capture photo
  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    // Set canvas dimensions to video dimensions
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Draw video frame to canvas
    ctx.drawImage(video, 0, 0);
    
    // Get high-quality JPEG
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    setCapturedMedia({ type: 'photo', data: dataUrl });
  };
  
  // Start video recording
  const startRecording = () => {
    if (!streamRef.current) return;
    
    chunksRef.current = [];
    
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : MediaRecorder.isTypeSupported('video/webm')
      ? 'video/webm'
      : 'video/mp4';
    
    try {
      const mediaRecorder = new MediaRecorder(streamRef.current, {
        mimeType,
        videoBitsPerSecond: 2500000 // 2.5 Mbps for good quality
      });
      
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };
      
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result as string;
          setCapturedMedia({ type: 'video', data: base64 });
        };
        reader.readAsDataURL(blob);
      };
      
      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(100); // Collect data every 100ms
      setIsRecording(true);
    } catch (err) {
      console.error('Recording start error:', err);
      setError(language === 'hi'
        ? 'वीडियो रिकॉर्डिंग शुरू नहीं हो सकी'
        : language === 'mr'
        ? 'व्हिडिओ रेकॉर्डिंग सुरू होऊ शकली नाही'
        : 'Could not start video recording');
    }
  };
  
  // Stop video recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };
  
  // Confirm and send
  const handleConfirm = () => {
    if (capturedMedia) {
      onCapture({
        ...capturedMedia,
        duration: capturedMedia.type === 'video' ? recordingDuration : undefined
      });
    }
  };
  
  // Retake
  const handleRetake = () => {
    setCapturedMedia(null);
    setRecordingDuration(0);
  };
  
  // Get localized text
  const getText = (key: string) => {
    const texts: Record<string, Record<string, string>> = {
      photo: { en: 'Photo', hi: 'फोटो', mr: 'फोटो' },
      video: { en: 'Video', hi: 'वीडियो', mr: 'व्हिडिओ' },
      recording: { en: 'Recording...', hi: 'रिकॉर्ड हो रहा...', mr: 'रेकॉर्डिंग...' },
      tapToCapture: { en: 'Tap to capture', hi: 'कैप्चर करें', mr: 'कॅप्चर करा' },
      tapToRecord: { en: 'Hold to record', hi: 'रिकॉर्ड करें', mr: 'रेकॉर्ड करा' },
      send: { en: 'Send for Analysis', hi: 'विश्लेषण के लिए भेजें', mr: 'विश्लेषणासाठी पाठवा' },
      retake: { en: 'Retake', hi: 'दोबारा लें', mr: 'पुन्हा घ्या' },
      close: { en: 'Close', hi: 'बंद करें', mr: 'बंद करा' },
      maxDuration: { 
        en: `Max ${maxVideoDuration}s`, 
        hi: `अधिकतम ${maxVideoDuration} सेकंड`, 
        mr: `जास्तीत जास्त ${maxVideoDuration} सेकंद` 
      },
      analyzing: { en: 'AI will analyze', hi: 'AI विश्लेषण करेगा', mr: 'AI विश्लेषण करेल' }
    };
    return texts[key]?.[language] || texts[key]?.en || key;
  };
  
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black"
    >
      {/* Camera View / Preview */}
      <div className="relative h-full w-full">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black">
            <Loader2 className="h-8 w-8 animate-spin text-white" />
          </div>
        )}
        
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black p-4">
            <p className="text-white text-center mb-4">{error}</p>
            <Button onClick={initCamera} variant="secondary">
              {language === 'hi' ? 'पुनः प्रयास करें' : language === 'mr' ? 'पुन्हा प्रयत्न करा' : 'Retry'}
            </Button>
          </div>
        )}
        
        {/* Live Camera Feed */}
        <video
          ref={videoRef}
          className={cn(
            "h-full w-full object-cover",
            capturedMedia && "hidden"
          )}
          playsInline
          muted
          autoPlay
        />
        
        {/* Captured Preview */}
        {capturedMedia && (
          <div className="absolute inset-0 bg-black">
            {capturedMedia.type === 'photo' ? (
              <img 
                src={capturedMedia.data} 
                alt="Captured" 
                className="h-full w-full object-contain"
              />
            ) : (
              <video 
                src={capturedMedia.data} 
                className="h-full w-full object-contain"
                controls
                autoPlay
                loop
              />
            )}
          </div>
        )}
        
        {/* Hidden canvas for photo capture */}
        <canvas ref={canvasRef} className="hidden" />
        
        {/* Top Controls */}
        <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/60 to-transparent">
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="text-white hover:bg-white/20"
            >
              <X className="h-6 w-6" />
            </Button>
            
            {!capturedMedia && (
              <div className="flex items-center gap-2">
                {hasFlash && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={toggleFlash}
                    className="text-white hover:bg-white/20"
                  >
                    {flashEnabled ? <Zap className="h-5 w-5" /> : <ZapOff className="h-5 w-5" />}
                  </Button>
                )}
                
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={switchCamera}
                  className="text-white hover:bg-white/20"
                >
                  <SwitchCamera className="h-5 w-5" />
                </Button>
              </div>
            )}
          </div>
          
          {/* Recording Indicator */}
          {isRecording && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center justify-center gap-2 mt-4"
            >
              <div className="w-3 h-3 bg-destructive rounded-full animate-pulse" />
              <span className="text-white font-medium">
                {getText('recording')} {recordingDuration}s / {maxVideoDuration}s
              </span>
            </motion.div>
          )}
        </div>
        
        {/* Bottom Controls */}
        <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/80 to-transparent">
          <AnimatePresence mode="wait">
            {!capturedMedia ? (
              <motion.div
                key="capture"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
              >
                {/* Mode Switch */}
                <div className="flex justify-center mb-6">
                  <div className="bg-white/20 backdrop-blur-sm rounded-full p-1 flex gap-1">
                    <button
                      onClick={() => setMode('photo')}
                      className={cn(
                        "px-4 py-2 rounded-full text-sm font-medium transition-all",
                        mode === 'photo' 
                          ? "bg-white text-black" 
                          : "text-white hover:bg-white/10"
                      )}
                    >
                      <Camera className="h-4 w-4 inline mr-1" />
                      {getText('photo')}
                    </button>
                    <button
                      onClick={() => setMode('video')}
                      className={cn(
                        "px-4 py-2 rounded-full text-sm font-medium transition-all",
                        mode === 'video' 
                          ? "bg-white text-black" 
                          : "text-white hover:bg-white/10"
                      )}
                    >
                      <Video className="h-4 w-4 inline mr-1" />
                      {getText('video')}
                    </button>
                  </div>
                </div>
                
                {/* Video Duration Info */}
                {mode === 'video' && (
                  <div className="flex justify-center mb-4">
                    <Badge variant="secondary" className="bg-white/20 text-white">
                      <Timer className="h-3 w-3 mr-1" />
                      {getText('maxDuration')}
                    </Badge>
                  </div>
                )}
                
                {/* Capture Button */}
                <div className="flex justify-center">
                  {mode === 'photo' ? (
                    <button
                      onClick={capturePhoto}
                      disabled={isLoading}
                      className="w-20 h-20 rounded-full border-4 border-white bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-white/40 transition-all active:scale-95 disabled:opacity-50"
                    >
                      <div className="w-16 h-16 rounded-full bg-white" />
                    </button>
                  ) : (
                    <button
                      onClick={isRecording ? stopRecording : startRecording}
                      disabled={isLoading}
                      className={cn(
                        "w-20 h-20 rounded-full border-4 border-white flex items-center justify-center transition-all active:scale-95 disabled:opacity-50",
                        isRecording 
                          ? "bg-destructive" 
                          : "bg-destructive/20 backdrop-blur-sm hover:bg-destructive/40"
                      )}
                    >
                      {isRecording ? (
                        <Square className="h-8 w-8 text-white" fill="white" />
                      ) : (
                        <Circle className="h-16 w-16 text-destructive" fill="currentColor" />
                      )}
                    </button>
                  )}
                </div>
                
                {/* Hint Text */}
                <p className="text-center text-white/70 text-sm mt-4">
                  {mode === 'photo' ? getText('tapToCapture') : getText('tapToRecord')}
                </p>
              </motion.div>
            ) : (
              <motion.div
                key="preview"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="flex flex-col gap-4"
              >
                {/* AI Analysis Info */}
                <div className="flex justify-center">
                  <Badge className="bg-primary text-primary-foreground">
                    🤖 {getText('analyzing')}
                  </Badge>
                </div>
                
                {/* Action Buttons */}
                <div className="flex items-center justify-center gap-4">
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={handleRetake}
                    className="bg-white/20 border-white text-white hover:bg-white/30"
                  >
                    <RotateCcw className="h-5 w-5 mr-2" />
                    {getText('retake')}
                  </Button>
                  
                  <Button
                    size="lg"
                    onClick={handleConfirm}
                    className="bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    <Check className="h-5 w-5 mr-2" />
                    {getText('send')}
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
