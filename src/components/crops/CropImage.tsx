import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CropImageProps {
  /** public.crops.id (UUID) — the only lookup key for the photo. */
  cropId?: string | null;
  /** Accessible alt text. */
  cropName: string;
  /** Existing crops.icon emoji, shown when no photo exists. */
  fallbackIcon?: string | null;
  className?: string;
  /** Square edge in px; omit to size via className. */
  size?: number;
}

/** Deterministic, UUID-keyed crop photo (crop-icons/v1/{id}.webp) with emoji fallback. */
export const CropImage: React.FC<CropImageProps> = ({ cropId, cropName, fallbackIcon, className, size }) => {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => { setFailed(false); setLoaded(false); }, [cropId]);

  const src = useMemo(() => {
    if (!cropId || !UUID_RE.test(cropId)) return null;
    return supabase.storage.from('crop-icons').getPublicUrl(`v1/${cropId}.webp`).data.publicUrl;
  }, [cropId]);

  const style = size ? { width: size, height: size } : undefined;
  const showImage = !!src && !failed;

  return (
    <span
      className={cn('relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-card', className)}
      style={style}
    >
      {(!showImage || !loaded) && (
        <span aria-hidden={showImage} role={showImage ? undefined : 'img'} aria-label={showImage ? undefined : cropName} className="leading-none text-[1.5em]">
          {fallbackIcon || '🌱'}
        </span>
      )}
      {showImage && (
        <img
          src={src}
          alt={cropName}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={cn('absolute inset-0 h-full w-full object-contain p-0.5', loaded ? 'opacity-100' : 'opacity-0')}
        />
      )}
    </span>
  );
};

export default CropImage;
