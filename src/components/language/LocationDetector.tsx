import { useEffect, useState } from 'react';
import { MapPin, Loader2, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { useReverseGeocoding } from '@/hooks/useReverseGeocoding';

interface LocationDetectorProps {
  onLocationDetected: (state: string, district: string) => void;
}

export function LocationDetector({ onLocationDetected }: LocationDetectorProps) {
  const { reverseGeocode } = useReverseGeocoding();
  const [status, setStatus] = useState<'idle' | 'detecting' | 'success' | 'denied' | 'error'>('idle');
  const [location, setLocation] = useState<{ state: string; district: string } | null>(null);

  const handleSuccess = async (latitude: number, longitude: number) => {
    const result = await reverseGeocode(latitude, longitude);
    const locationData = {
      latitude,
      longitude,
      state: result.state,
      district: result.district,
      timestamp: Date.now()
    };
    localStorage.setItem('userLocation', JSON.stringify(locationData));
    setLocation({ state: result.state, district: result.district || '' });
    setStatus('success');
    onLocationDetected(result.state, result.district || '');
  };

  const isIosSafari = () => {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    const iOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Mac') && 'ontouchend' in document);
    return iOS && !Capacitor.isNativePlatform();
  };

  const detectLocation = async () => {
    setStatus('detecting');
    const isNative = Capacitor.isNativePlatform();

    // Hard watchdog: iOS Safari sometimes never fires success/error when
    // the prompt is suppressed. Force a state transition after 12s so the
    // UI never gets stuck on "Detecting location...".
    let settled = false;
    const watchdog = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        setStatus('denied');
      }
    }, 12000);

    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(watchdog);
      fn();
    };

    try {
      if (isNative) {
        const perm = await Geolocation.checkPermissions();
        let locPerm = perm.location;
        if (locPerm === 'prompt' || locPerm === 'prompt-with-rationale') {
          const req = await Geolocation.requestPermissions({ permissions: ['location'] });
          locPerm = req.location;
        }
        if (locPerm !== 'granted') {
          settle(() => setStatus('denied'));
          return;
        }
        const pos = await Geolocation.getCurrentPosition({
          enableHighAccuracy: false,
          timeout: 15000,
          maximumAge: 600000,
        });
        settle(() => {});
        await handleSuccess(pos.coords.latitude, pos.coords.longitude);
        return;
      }

      if (!navigator.geolocation) {
        settle(() => setStatus('error'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          settle(() => {});
          handleSuccess(position.coords.latitude, position.coords.longitude);
        },
        (err) => {
          console.warn('[LocationDetector] geo error', err?.code, err?.message);
          settle(() => setStatus('denied'));
        },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 }
      );
    } catch (e) {
      console.warn('[LocationDetector] failed:', e);
      settle(() => setStatus('denied'));
    }
  };

  useEffect(() => {
    const cachedLocation = localStorage.getItem('userLocation');
    if (cachedLocation) {
      try {
        const parsed = JSON.parse(cachedLocation);
        const cacheTime = parsed.timestamp || 0;
        if (Date.now() - cacheTime < 3600000) {
          setLocation({ state: parsed.state || '', district: parsed.district || '' });
          setStatus('success');
          onLocationDetected(parsed.state || '', parsed.district || '');
          return;
        }
      } catch {}
    }

    // iOS Safari/WKWebView blocks non-gesture geolocation prompts and
    // often never fires success/error. Skip auto-detect and let the user
    // tap to grant. On native iOS the Capacitor plugin handles it fine.
    if (isIosSafari()) {
      setStatus('denied');
      return;
    }

    detectLocation();
  }, []);

  return (
    <AnimatePresence mode="wait">
      {status === 'detecting' && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="flex items-center gap-2 text-xs bg-primary/10 text-primary px-3 py-1.5 rounded-full"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
          <span className="font-medium">Detecting location...</span>
        </motion.div>
      )}
      
      {status === 'success' && location && location.state !== 'default' && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex items-center gap-1.5 text-xs bg-primary/10 text-primary px-3 py-1.5 rounded-full border border-primary/20"
          role="status"
          aria-live="polite"
        >
          <MapPin className="w-3 h-3" aria-hidden="true" />
          <span className="font-bold">{location.state}</span>
          {location.district && (
            <>
              <span className="text-muted-foreground">•</span>
              <span className="font-medium text-muted-foreground">{location.district}</span>
            </>
          )}
        </motion.div>
      )}
      
      {(status === 'denied' || status === 'error') && (
        <motion.button
          type="button"
          onClick={detectLocation}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center gap-1.5 text-xs text-warning bg-warning/10 px-3 py-1.5 rounded-full hover:bg-warning/20 active:scale-95 transition"
          aria-label="Retry location detection"
        >
          <AlertCircle className="w-3 h-3" aria-hidden="true" />
          <span className="font-medium">Tap to enable location</span>
        </motion.button>
      )}
    </AnimatePresence>
  );
}
