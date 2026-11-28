/**
 * LIVE CAMERA VIEWFINDER — in-app camera for browser / PWA.
 * CHANGE LOG
 * 2026-11-23 18:16 UTC — Portal to body for true full screen (dialog transform trapped it); max sensor resolution; overlay controls.
 * 2026-11-23 18:10 UTC — Created: getUserMedia back-camera stream, switch camera, shutter → JPEG Blob.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
          video: { facingMode: { ideal: facing }, width: { ideal: 4096 }, height: { ideal: 4096 } },
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

  return createPortal(
    <div className="fixed inset-0 z-[9999] h-[100dvh] w-screen bg-foreground pointer-events-auto" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <div className="absolute inset-0 overflow-hidden">
        <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
        <div className="pointer-events-none absolute inset-x-6 top-[15%] bottom-[25%] rounded-3xl border-2 border-primary-foreground/50" />
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-primary-foreground/80">
            {t('cropGrowth.capture.cameraStarting', 'Starting camera…')}
          </div>
        )}
      </div>
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-foreground/70 to-transparent px-6 pt-10 pb-[max(1.5rem,var(--safe-bottom))]">
        <Button type="button" variant="outline" size="icon" className="h-12 w-12 rounded-full border-primary-foreground/40 bg-foreground/40 text-primary-foreground hover:bg-foreground/60" onClick={onCancel} aria-label={t('common.cancel', 'Cancel')}>
          <X className="h-5 w-5" />
        </Button>
        <button
          type="button"
          onClick={shoot}
          disabled={!ready}
          aria-label={t('cropGrowth.capture.takePhoto', 'Take photo')}
          className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-primary-foreground bg-primary-foreground/20 disabled:opacity-50"
        >
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-foreground text-foreground">
            <CameraIcon className="h-6 w-6" />
          </span>
        </button>
        <Button type="button" variant="outline" size="icon" className="h-12 w-12 rounded-full border-primary-foreground/40 bg-foreground/40 text-primary-foreground hover:bg-foreground/60" onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))} aria-label={t('cropGrowth.capture.switchCamera', 'Switch camera')}>
          <RefreshCw className="h-5 w-5" />
        </Button>
      </div>
    </div>,
    document.body,
  );
}
