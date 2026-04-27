import { cn } from '@/lib/utils';

/**
 * LandRef — the ONLY sanctioned way to render a land identifier in the UI.
 *
 *  - Forbids UUIDs from ever surfacing to the farmer.
 *  - Falls back to "🌾 (unknown)" + dev console.warn when the record is
 *    incomplete, so missing names are loud during development but never
 *    leak raw IDs to a farmer's screen.
 *  - Optional crop emoji + area suffix produce labels like "🌾 Mala 7.59ac".
 */
export interface LandRefShape {
  id?: string | null;
  name?: string | null;
  area_acres?: number | null;
  crop_emoji?: string | null;
  current_crop?: string | null;
}

interface LandRefProps {
  land?: LandRefShape | null;
  /** Show "7.59ac" suffix when area_acres is present. Default: true */
  showArea?: boolean;
  /** Show crop emoji prefix (defaults to 🌾 if none provided). Default: true */
  showEmoji?: boolean;
  className?: string;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const cropToEmoji = (crop?: string | null): string => {
  if (!crop) return '🌾';
  const c = crop.toLowerCase();
  if (c.includes('sugarcane') || c.includes('ऊस')) return '🎋';
  if (c.includes('cotton') || c.includes('कापूस')) return '🪶';
  if (c.includes('rice') || c.includes('paddy') || c.includes('धान')) return '🍚';
  if (c.includes('wheat') || c.includes('गहू')) return '🌾';
  if (c.includes('tomato') || c.includes('टोम')) return '🍅';
  if (c.includes('onion') || c.includes('कांदा')) return '🧅';
  if (c.includes('grape') || c.includes('द्राक्ष')) return '🍇';
  return '🌾';
};

export function LandRef({
  land,
  showArea = true,
  showEmoji = true,
  className,
}: LandRefProps) {
  const name = (land?.name ?? '').trim();
  const isUuidName = !!name && UUID_RE.test(name);

  if (!land || !name || isUuidName) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn(
        '[LandRef] Missing or invalid land name; rendering fallback.',
        { land }
      );
    }
    return (
      <span className={cn('inline-flex items-center gap-1', className)}>
        {showEmoji && <span aria-hidden>🌾</span>}
        <span className="text-muted-foreground italic">(unknown)</span>
      </span>
    );
  }

  const emoji = land.crop_emoji ?? cropToEmoji(land.current_crop);
  const areaText =
    showArea && typeof land.area_acres === 'number' && land.area_acres > 0
      ? `${land.area_acres.toFixed(2)}ac`
      : null;

  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      {showEmoji && <span aria-hidden>{emoji}</span>}
      <span className="font-medium truncate">{name}</span>
      {areaText && (
        <span className="text-muted-foreground text-xs">· {areaText}</span>
      )}
    </span>
  );
}
