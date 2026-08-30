/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CROP PHOTO CAPTURE — the single photo tool for AI chat and crop schedule
 *
 * REPO: kisanshaktiai/kisanshakti-ai-v1  (farmer app)
 * PATH: src/components/photo/CropPhotoCapture.tsx
 *
 * CHANGE LOG (newest first, keep entries short)
 * 2026-08-30 — NEW. One capture dialog for every surface. Replaces the
 *   divergent handlers in EnhancedAIChatInterface.tsx (processAttachedImages
 *   + handleWorldClassCapture) and TaskPhotoUploadDialog.tsx.
 *   Uploads and analysis both go through src/services/cropPhotoService.ts.
 *
 * Styling follows the existing TaskPhotoUploadDialog.tsx conventions:
 * shadcn Dialog, semantic colour tokens (primary/success/warning/destructive),
 * lucide-react icons, sonner toast, `cn` from '@/lib/utils'.
 *
 * i18n: every key used here already exists in
 * src/i18n/locales/{en,hi,mr}/cropGrowth.json — verified 2026-08-30.
 * No new translation keys are introduced.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  Upload,
  X,
  Loader2,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  Navigation,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  uploadCropPhoto,
  analyzeCropPhoto,
  classifyLocation,
  fetchLandCenter,
  type PhotoSurface,
  type CropPhotoUploadType,
  type CropPhotoGeo,
  type CropPhotoLocationValidation,
  type AnalyzeCropPhotoResult,
} from '@/services/cropPhotoService';

export interface CropPhotoCaptureProps {
  isOpen: boolean;
  onClose: () => void;
  surface: PhotoSurface;
  farmerId: string;
  tenantId: string;
  landId?: string;
  cropName?: string;
  /** Chat surface. */
  sessionId?: string;
  /** Schedule surface. */
  scheduleId?: string;
  taskId?: string;
  taskName?: string;
  uploadType?: CropPhotoUploadType;
  /** Require GPS before allowing analysis. Schedule task proof needs it;
   *  a chat question about a leaf does not. */
  requireLocation?: boolean;
  onAnalysisComplete?: (result: AnalyzeCropPhotoResult, fileUrl: string) => void;
}

type Phase = 'select' | 'review' | 'uploading' | 'analyzing';

export function CropPhotoCapture({
  isOpen,
  onClose,
  surface,
  farmerId,
  tenantId,
  landId,
  cropName,
  sessionId,
  scheduleId,
  taskId,
  taskName,
  uploadType = 'crop',
  requireLocation = surface === 'schedule',
  onAnalysisComplete,
}: CropPhotoCaptureProps) {
  const { t, i18n } = useTranslation();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const [phase, setPhase] = useState<Phase>('select');
  const [preview, setPreview] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [location, setLocation] = useState<CropPhotoGeo | null>(null);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [landCenter, setLandCenter] = useState<CropPhotoGeo | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [retakeTips, setRetakeTips] = useState<string[]>([]);

  const locationValidation: CropPhotoLocationValidation = useMemo(
    () => classifyLocation(location, landCenter),
    [location, landCenter]
  );

  useEffect(() => {
    if (!isOpen || !landId) return;
    let cancelled = false;
    fetchLandCenter(landId).then((center) => {
      if (!cancelled) setLandCenter(center);
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, landId]);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) return;
    setGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
        setGettingLocation(false);
      },
      (error) => {
        console.warn('[CropPhoto] location unavailable:', error.message);
        setGettingLocation(false);
        if (requireLocation) toast.error(t('cropGrowth.pleaseAddLocation'));
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }, [requireLocation, t]);

  const handleFileSelected = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;

      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
        setPhase('review');
        setRetakeTips([]);
      };
      reader.onerror = () => toast.error(t('cropGrowth.uploadFailed'));
      reader.readAsDataURL(file);
      requestLocation();
    },
    [requestLocation, t]
  );

  const reset = useCallback(() => {
    setPhase('select');
    setPreview(null);
    setNotes('');
    setLocation(null);
    setWarnings([]);
    setRetakeTips([]);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const handleSubmit = useCallback(async () => {
    if (!preview) return;

    if (requireLocation && !location) {
      toast.error(t('cropGrowth.pleaseAddLocation'));
      requestLocation();
      return;
    }
    if (locationValidation.level === 'far' && !window.confirm(t('cropGrowth.photoTakenAway'))) {
      return;
    }

    setPhase('uploading');
    setRetakeTips([]);

    const uploaded = await uploadCropPhoto({
      imageDataUrl: preview,
      surface,
      farmerId,
      tenantId,
      landId,
      sessionId,
      scheduleId,
      taskId,
      uploadType,
      notes: notes.trim() || undefined,
      location,
      locationValidation,
    });

    setWarnings(uploaded.warnings);

    if (!uploaded.success || !uploaded.fileUrl) {
      console.error('[CropPhoto] upload failed:', uploaded.error);
      toast.error(t('cropGrowth.uploadFailed'));
      setPhase('review');
      return;
    }

    setPhase('analyzing');

    const analysis = await analyzeCropPhoto({
      fileUrl: uploaded.fileUrl,
      farmerId,
      tenantId,
      language: i18n.language,
      landId,
      sessionId,
      farmerMessage: notes.trim() || undefined,
      qualityMetrics: uploaded.qualityMetrics,
      uploadId: uploaded.uploadId,
      surface,
    });

    if (!analysis.success) {
      toast.error(t('cropGrowth.uploadFailed'));
      setPhase('review');
      return;
    }

    // The brain judged the image unusable and asked for a retake. Keep the
    // dialog open and show its reasons rather than pretending it diagnosed.
    if (analysis.retakeRequested) {
      setRetakeTips(analysis.retakeTips);
      setPhase('review');
      return;
    }

    toast.success(t('cropGrowth.uploadSuccess'));
    onAnalysisComplete?.(analysis, uploaded.fileUrl);
    handleClose();
  }, [
    preview,
    requireLocation,
    location,
    locationValidation,
    surface,
    farmerId,
    tenantId,
    landId,
    sessionId,
    scheduleId,
    taskId,
    uploadType,
    notes,
    i18n.language,
    onAnalysisComplete,
    handleClose,
    requestLocation,
    t,
  ]);

  const busy = phase === 'uploading' || phase === 'analyzing';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !busy && handleClose()}>
      <DialogContent className="max-w-[95vw] sm:max-w-md p-0 gap-0 rounded-3xl border-0 shadow-2xl overflow-hidden bg-background">
        {/* Header */}
        <div className="relative px-5 pt-6 pb-4">
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          <div className="relative flex items-start gap-4">
            <div className="flex-shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg bg-success/10">
              <Camera className="h-7 w-7 text-success" />
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
              disabled={busy}
              className="flex-shrink-0 w-8 h-8 rounded-full bg-muted/80 flex items-center justify-center hover:bg-muted transition-colors disabled:opacity-40"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        <div className="px-5 pb-6 space-y-4">
          {phase === 'select' && (
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => cameraInputRef.current?.click()}
                className="flex flex-col items-center justify-center gap-2 py-8 rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5 hover:bg-primary/10 transition-colors"
              >
                <Camera className="h-7 w-7 text-primary" />
                <span className="text-sm font-semibold text-foreground">
                  {t('cropGrowth.takePhoto')}
                </span>
              </button>
              <button
                onClick={() => galleryInputRef.current?.click()}
                className="flex flex-col items-center justify-center gap-2 py-8 rounded-2xl border-2 border-dashed border-muted-foreground/30 bg-muted/40 hover:bg-muted/60 transition-colors"
              >
                <Upload className="h-7 w-7 text-muted-foreground" />
                <span className="text-sm font-semibold text-foreground">
                  {t('cropGrowth.uploadFile')}
                </span>
              </button>
            </div>
          )}

          {preview && phase !== 'select' && (
            <div className="relative rounded-2xl overflow-hidden bg-muted">
              <img src={preview} alt="" className="w-full max-h-64 object-cover" />
              {!busy && (
                <button
                  onClick={reset}
                  className="absolute top-2 right-2 w-8 h-8 rounded-full bg-background/90 flex items-center justify-center shadow"
                >
                  <RefreshCw className="h-4 w-4 text-foreground" />
                </button>
              )}
            </div>
          )}

          {/* Retake request from the Decision Brain */}
          {retakeTips.length > 0 && (
            <div className="rounded-2xl bg-warning/10 border border-warning/30 p-3 space-y-1">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-warning" />
                <span className="text-sm font-semibold text-foreground">
                  {t('cropGrowth.takePhoto')}
                </span>
              </div>
              <ul className="text-xs text-muted-foreground list-disc pl-5">
                {retakeTips.map((tip) => (
                  <li key={tip}>{tip}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Client-measured quality warnings */}
          {warnings.length > 0 && retakeTips.length === 0 && (
            <div className="rounded-2xl bg-muted/60 p-3">
              <ul className="text-xs text-muted-foreground list-disc pl-5">
                {warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {phase === 'review' && (
            <>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t('cropGrowth.addNotes')}
                rows={3}
                className="rounded-2xl resize-none"
              />

              {landId && (
                <button
                  onClick={requestLocation}
                  disabled={gettingLocation}
                  className={cn(
                    'w-full flex items-center gap-2 px-4 py-3 rounded-2xl border transition-colors',
                    locationValidation.level === 'at_land' && 'border-success/40 bg-success/10',
                    locationValidation.level === 'nearby' && 'border-warning/40 bg-warning/10',
                    locationValidation.level === 'far' && 'border-destructive/40 bg-destructive/10',
                    locationValidation.level === 'unknown' && 'border-muted-foreground/30 bg-muted/40'
                  )}
                >
                  {gettingLocation ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : locationValidation.isValid ? (
                    <CheckCircle2 className="h-4 w-4 text-success" />
                  ) : locationValidation.level === 'far' ? (
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                  ) : (
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="text-sm font-medium text-foreground flex-1 text-left">
                    {locationValidation.distanceMeters !== null
                      ? `${Math.round(locationValidation.distanceMeters)} m`
                      : t('cropGrowth.addLocation')}
                  </span>
                  <Navigation className="h-4 w-4 text-muted-foreground" />
                </button>
              )}

              <button
                onClick={handleSubmit}
                className="w-full py-3.5 rounded-2xl bg-primary text-primary-foreground font-semibold shadow-lg hover:opacity-90 transition-opacity"
              >
                {t('cropGrowth.uploadAndAnalyze')}
              </button>
            </>
          )}

          {busy && (
            <div className="flex items-center justify-center gap-2 py-4">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="text-sm font-medium text-muted-foreground">
                {phase === 'uploading' ? t('cropGrowth.uploading') : t('cropGrowth.analyzing')}
              </span>
            </div>
          )}
        </div>

        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileSelected}
          className="hidden"
        />
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelected}
          className="hidden"
        />
      </DialogContent>
    </Dialog>
  );
}

export default CropPhotoCapture;
