import {
  Banknote, Compass, Droplets, Hammer, Landmark, PawPrint, Recycle, Shovel, Shrub, Smartphone,
  SprayCan, Sprout, Tractor, TreePine, Truck, Users, Warehouse, Wheat, Wrench, createLucideIcon, type LucideIcon,
} from 'lucide-react';

/**
 * One picture for each kind of work in the service catalogue, so a provider
 * or farmer who reads little can pick by the picture.
 *
 * The pictures live in the database: service_categories.icon_path holds one
 * SVG path on a 24 x 24 grid for every family and every service
 * (supabase/migrations/20261126140000_service_category_icons.sql). They are
 * drawn here as ordinary outline icons, so they take the theme colour and the
 * size of the place they are shown in, like every other icon in the app.
 *
 * The family pictures below are only the fallback, for the moment before the
 * catalogue is read and for a row that has no picture.
 */
const FAMILY_ICONS: Record<string, LucideIcon> = {
  LAND_PREP: Shovel,
  SOWING_PLANTING: Sprout,
  NURSERY: TreePine,
  IRRIGATION: Droplets,
  CROP_PROTECTION: SprayCan,
  INTERCULTURE: Shrub,
  HARVESTING: Wheat,
  RESIDUE: Recycle,
  POST_HARVEST: Warehouse,
  TRANSPORT: Truck,
  LABOUR: Users,
  MACHINERY_HIRE: Tractor,
  INFRASTRUCTURE: Hammer,
  SURVEY_ADVISORY: Compass,
  ANIMAL_ALLIED: PawPrint,
  REPAIR: Wrench,
};

export function familyIcon(code: string | null | undefined): LucideIcon {
  return (code && FAMILY_ICONS[code]) || Wrench;
}

/** The part of a catalogue row the pictures need. */
export interface ServiceIconRow {
  code: string;
  parent_code?: string | null;
  icon_path?: string | null;
}

/** Path data only: the same rule the database column enforces. */
const PATH_DATA = /^[MmLlHhVvCcSsQqTtAaZz0-9 ,.-]+$/;
const PATH_MAX_LENGTH = 4000;
/** One component per drawing, made once, so a list never remounts its icons. */
const drawn = new Map<string, LucideIcon>();

/** A stored drawing as an icon component; null when there is none or it is not path data. */
export function iconFromPath(path: string | null | undefined): LucideIcon | null {
  if (!path || path.length > PATH_MAX_LENGTH || !PATH_DATA.test(path)) return null;
  let icon = drawn.get(path);
  if (!icon) {
    icon = createLucideIcon('ServiceIcon', [['path', { d: path, key: 'd' }]]);
    drawn.set(path, icon);
  }
  return icon;
}

/**
 * The picture for a family or service code: its own drawing from the
 * catalogue, else its family's drawing, else the built-in family picture.
 * `familyCode` is used when the catalogue rows are not there yet.
 */
export function serviceIcon(
  rows: readonly ServiceIconRow[] | null | undefined,
  code: string | null | undefined,
  familyCode?: string | null,
): LucideIcon {
  const row = code ? rows?.find((r) => r.code === code) : undefined;
  const family = row?.parent_code ?? familyCode ?? code;
  return iconFromPath(row?.icon_path)
    ?? iconFromPath(family && family !== code ? rows?.find((r) => r.code === family)?.icon_path : null)
    ?? familyIcon(family);
}

/** Pictures for the ways a provider takes payment. */
const PAYMENT_ICONS: Record<string, LucideIcon> = {
  CASH: Banknote,
  UPI: Smartphone,
  BANK_TRANSFER: Landmark,
  CREDIT_AFTER_HARVEST: Wheat,
};

export function paymentIcon(code: string): LucideIcon {
  return PAYMENT_ICONS[code] || Banknote;
}
