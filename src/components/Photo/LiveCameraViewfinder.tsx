/**
 * LIVE CAMERA VIEWFINDER — in-app camera for browser / PWA.
 * CHANGE LOG
 * 2026-11-23 18:10 UTC — Created: getUserMedia back-camera stream, switch camera, shutter → JPEG Blob.
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Camera as CameraIcon, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  onCapture: (blob: Blob) => void;
  onCancel: () => void;
  /** Called when the camera can't start (no device / denied); caller falls back to file input. */
  onUnavailable: () => void;
}

export function canUseLiveCamera(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && window.isSecureContext;
}

export default function LiveCameraViewfinder({ onCapture, onCancel, onUnavailable }: Props) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((tr) => tr.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        setReady(true);
      } catch {
        if (!cancelled) onUnavailable();
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facing]);

  const shoot = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement('canvas');
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext('2d')?.drawImage(v, 0, 0);
    c.toBlob((b) => { if (b) onCapture(b); }, 'image/jpeg', 0.95);
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-background" onClick={(e) => e.stopPropagation()}>
      <div className="relative flex-1 overflow-hidden bg-muted">
        <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
        <div className="pointer-events-none absolute inset-8 rounded-2xl border-2 border-primary/60" />
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            {t('cropGrowth.capture.cameraStarting', 'Starting camera…')}
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center justify-between px-6 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <Button type="button" variant="outline" size="icon" className="h-12 w-12 rounded-full" onClick={onCancel} aria-label={t('common.cancel', 'Cancel')}>
          <X className="h-5 w-5" />
        </Button>
        <button
          type="button"
          onClick={shoot}
          disabled={!ready}
          aria-label={t('cropGrowth.capture.takePhoto', 'Take photo')}
          className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-primary bg-primary/10 disabled:opacity-50"
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <CameraIcon className="h-6 w-6" />
          </span>
        </button>
        <Button type="button" variant="outline" size="icon" className="h-12 w-12 rounded-full" onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))} aria-label={t('cropGrowth.capture.switchCamera', 'Switch camera')}>
          <RefreshCw className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}
