import {
  Banknote, Compass, Droplets, Hammer, Landmark, PawPrint, Recycle, Shovel, Smartphone,
  SprayCan, Sprout, Tractor, TreePine, Truck, Users, Warehouse, Wheat, Wrench, type LucideIcon,
} from 'lucide-react';

/**
 * One picture for each kind of work in the service catalogue
 * (supabase/migrations/20261124140000_provider_catalogue_lookups.sql), so a
 * provider or farmer who reads little can pick by the picture. A code with no
 * picture falls back to the generic tool.
 */
const FAMILY_ICONS: Record<string, LucideIcon> = {
  LAND_PREP: Shovel,
  SOWING_PLANTING: Sprout,
  NURSERY: TreePine,
  IRRIGATION: Droplets,
  CROP_PROTECTION: SprayCan,
  INTERCULTURE: Wheat,
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
