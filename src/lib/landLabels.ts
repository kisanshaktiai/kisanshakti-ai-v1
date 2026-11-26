import type { TFunction } from 'i18next';
import { normalizeSoilType } from '@/lib/soilType';

/**
 * Names for the stored codes on a land row (soil_type, irrigation_type,
 * water_source, ownership_type) in the farmer's language. The codes were
 * typed in several spellings over time ("Manual", "manual", "Well",
 * "Rainwater"), so they are normalised before the lookup; a code with no
 * translation is shown humanised rather than as raw snake_case.
 */
export type LandAttribute = 'soil_type' | 'irrigation_type' | 'water_source' | 'ownership_type';

const SECTION: Record<LandAttribute, string> = {
  soil_type: 'soil_types',
  irrigation_type: 'irrigation_types',
  water_source: 'water_sources',
  ownership_type: 'ownership',
};

const humanise = (code: string) =>
  code.split(/[_\s]+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');

export function landAttributeLabel(t: TFunction, attribute: LandAttribute, value: string | null | undefined): string {
  if (!value) return '';
  const raw = value.trim();
  const code = (attribute === 'soil_type' ? normalizeSoilType(raw) || raw : raw).toLowerCase().replace(/[\s-]+/g, '_');
  return t(`lands.wizard.${SECTION[attribute]}.${code}`, { defaultValue: humanise(raw) });
}
