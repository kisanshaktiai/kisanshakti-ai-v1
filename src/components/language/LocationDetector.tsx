import { useEffect, useState } from 'react';
import { MapPin, Loader2, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useReverseGeocoding } from '@/hooks/useReverseGeocoding';

interface LocationDetectorProps {
  onLocationDetected: (state: string, district: string) => void;
}

export function LocationDetector({ onLocationDetected }: LocationDetectorProps) {
  const { reverseGeocode } = useReverseGeocoding();
  const [status, setStatus] = useState<'detecting' | 'success' | 'denied' | 'error'>('detecting');
  const [location, setLocation] = useState<{ state: string; district: string } | null>(null);

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

    if (!navigator.geolocation) {
      setStatus('error');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
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
      },
      () => {
        setStatus('denied');
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 }
    );
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
      
      {status === 'denied' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center gap-1.5 text-xs text-warning bg-warning/10 px-3 py-1.5 rounded-full"
          role="alert"
        >
          <AlertCircle className="w-3 h-3" aria-hidden="true" />
          <span className="font-medium">Location access denied</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
