/**
 * ACTIVATION QR SCANNER — full-screen live camera that reads the activation QR.
 * CHANGE LOG
 * 2026-11-25 — Created (farmer activation, app part). Camera handling follows
 *              Photo/LiveCameraViewfinder (back camera, portal to body).
 *
 * It only reads. A QR that is one of our codes is handed to the caller as its
 * 12 symbols; the server then decides whether the code is valid.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Keyboard, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useActivationText } from '@/hooks/useActivationText';
import { parseActivationQr } from '@/lib/activationCode';
import type { QrReader } from '@/lib/qrReader';

interface Props {
  read: QrReader;
  /** An activation QR was read: its 12 symbols. The scanner has already stopped. */
  onCode: (symbols: string) => void;
  onCancel: () => void;
  /** The camera cannot start (no device / denied); the caller falls back. */
  onUnavailable: () => void;
}

const SCAN_EVERY_MS = 250;
const NOT_OURS_HINT_MS = 2500;

export default function ActivationQrScanner({ read, onCode, onCancel, onUnavailable }: Props) {
  const tr = useActivationText();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [notOurs, setNotOurs] = useState(false);

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let hintTimer: ReturnType<typeof setTimeout> | undefined;

    const stop = () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      if (hintTimer) clearTimeout(hintTimer);
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
    };

    const scan = async () => {
      if (stopped) return;
      const video = videoRef.current;
      if (video && video.readyState >= 2 && video.videoWidth > 0) {
        try {
          const texts = await read(video);
          if (stopped) return;
          const symbols = texts.map(parseActivationQr).find((value): value is string => !!value);
          if (symbols) {
            stop();
            try { navigator.vibrate?.(60); } catch { /* no vibration on this device */ }
            onCode(symbols);
            return;
          }
          if (texts.length > 0) {
            setNotOurs(true);
            if (hintTimer) clearTimeout(hintTimer);
            hintTimer = setTimeout(() => setNotOurs(false), NOT_OURS_HINT_MS);
          }
        } catch { /* a frame that could not be read: try the next one */ }
      }
      timer = setTimeout(scan, SCAN_EVERY_MS);
    };

    (async () => {
      try {
        const media = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (stopped) { media.getTracks().forEach((track) => track.stop()); return; }
        stream = media;
        if (videoRef.current) {
          videoRef.current.srcObject = media;
          await videoRef.current.play().catch(() => undefined);
        }
        setReady(true);
        scan();
      } catch {
        if (!stopped) onUnavailable();
      }
    })();

    return stop;
    // The camera starts once for the life of the scanner.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={tr('scanner.title')}
      className="fixed inset-0 z-[9999] h-[100dvh] w-screen bg-foreground pointer-events-auto"
    >
      <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full object-cover" />

      {/* Aiming frame */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="aspect-square w-[72%] max-w-xs rounded-3xl border-4 border-primary-foreground/80 shadow-[0_0_0_100vmax_hsl(var(--foreground)/0.45)]" />
      </div>

      <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-foreground/70 to-transparent px-4 pb-10 pt-[max(1rem,var(--safe-top))]">
        <h2 className="text-lg font-semibold text-primary-foreground">{tr('scanner.title')}</h2>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onCancel}
          aria-label={tr('scanner.close')}
          className="h-11 w-11 rounded-full text-primary-foreground hover:bg-primary-foreground/20 hover:text-primary-foreground"
        >
          <X className="h-6 w-6" aria-hidden="true" />
        </Button>
      </div>

      <div className="absolute inset-x-0 bottom-0 space-y-4 bg-gradient-to-t from-foreground/80 to-transparent px-6 pt-12 pb-[max(1.5rem,var(--safe-bottom))] text-center">
        <p
          role="status"
          aria-live="polite"
          className={notOurs ? 'text-base font-semibold text-primary-foreground' : 'text-base text-primary-foreground/90'}
        >
          {!ready ? tr('scanner.starting') : notOurs ? tr('scanner.notActivationQr') : tr('scanner.hint')}
        </p>
        <Button type="button" variant="secondary" onClick={onCancel} className="h-12 w-full max-w-sm text-base">
          <Keyboard className="mr-2 h-5 w-5" aria-hidden="true" />
          {tr('scanner.typeInstead')}
        </Button>
      </div>
    </div>,
    document.body,
  );
}
