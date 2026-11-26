/**
 * providerWorkspaceService — everything the Provider Workspace reads or writes.
 *
 * Reads and writes go only through the provider_* and nursery_* database
 * functions (supabase/migrations/20261124140200_provider_workspace_functions.sql);
 * the session token header set by the shared client identifies the caller, so
 * no account id is ever sent. Every write returns the whole workspace again,
 * which replaces the copy in providerStore.
 *
 * The catalogue (service families and services, pricing units, equipment
 * types, …) is read from the lookup tables, which the app may only read.
 */
import { supabase } from '@/integrations/supabase/client';
import { useProviderStore } from '@/stores/providerStore';

// ── what the server returns ──────────────────────────────────────────────────
export type AvailabilityState = 'AVAILABLE' | 'BUSY' | 'NOT_ACCEPTING' | 'OFFLINE';
export type ListingStatus = 'DRAFT' | 'PENDING_REVIEW' | 'LISTED' | 'SUSPENDED';
export type ItemStatus = 'ACTIVE' | 'PAUSED' | 'REMOVED';

export interface ProviderProfile {
  provider_type: string;
  public_name: string;
  experience_years: number | null;
  about_text: string | null;
  about_language: string | null;
  languages_spoken: string[];
  accepts_requests: boolean;
  listing_status: ListingStatus;
  submitted_at: string | null;
  listed_at: string | null;
  review_note_code: string | null;
  verification_level: string | null;
  rating_average: number | null;
  rating_count: number;
  jobs_completed: number;
}

export interface ProviderService {
  id: string;
  category_code: string;
  title: string;
  description: string | null;
  description_language: string | null;
  pricing_unit: string;
  base_rate: number | null;
  currency: string;
  min_charge: number | null;
  min_billable_qty: number | null;
  advance_percent: number | null;
  includes_operator: boolean;
  includes_fuel: boolean;
  includes_material: boolean;
  capacity_value: number | null;
  capacity_unit: string | null;
  capacity_period: 'HOUR' | 'DAY' | null;
  travel_charge: number | null;
  free_travel_km: number | null;
  lead_time_days: number | null;
  same_day_cutoff: string | null;
  cancellation_hours: number | null;
  season_start_month: number | null;
  season_end_month: number | null;
  crew_size: number | null;
  skill_tier: string | null;
  equipment_id: string | null;
  payment_methods: string[];
  status: ItemStatus;
}

export interface WorkingDay {
  /** 0 = Sunday … 6 = Saturday */
  weekday: number;
  is_working: boolean;
  start_time: string | null;
  end_time: string | null;
}

export interface Blackout {
  id: string;
  from: string;
  to: string;
  source: 'MANUAL' | 'JOB';
  reason_code: string | null;
}

export interface ProviderEquipment {
  id: string;
  equipment_type: string;
  make: string | null;
  model: string | null;
  year_made: number | null;
  attributes: Record<string, number | string | boolean>;
  ownership: 'OWNED' | 'LEASED' | 'RENTED';
  condition: 'NEW' | 'GOOD' | 'FAIR' | null;
  registration_last4: string | null;
  status: 'ACTIVE' | 'REMOVED';
}

export interface NurseryBatch {
  id: string;
  total_qty: number;
  reserved_qty: number;
  ready_date: string;
  status: 'ACTIVE' | 'CLOSED';
}

export interface NurseryProduct {
  id: string;
  crop_id: string;
  /** From the seed variety master (v_crop_varieties.variety_id), when it is there. */
  variety_id: string | null;
  /** The variety as the nursery calls it, when it is not in the master. */
  variety_name_local: string | null;
  item_kind: string;
  pricing_unit: string;
  price: number | null;
  currency: string;
  min_order_qty: number | null;
  description: string | null;
  description_language: string | null;
  /** Up to three objects in the public bucket nursery-photos. */
  photo_paths: string[];
  status: ItemStatus;
  batches: NurseryBatch[];
}

export interface ProviderWorkspace {
  profile: ProviderProfile | null;
  availability: { state: AvailabilityState; next_free_date: string | null };
  reach_set: boolean;
  services: ProviderService[];
  working_hours: WorkingDay[];
  blackouts: Blackout[];
  equipment: ProviderEquipment[];
  nursery_products: NurseryProduct[];
  policy: {
    lead_time_days_default: number;
    same_day_cutoff: string;
    max_services: number;
    max_blackout_days: number;
  };
}

// ── the catalogue ────────────────────────────────────────────────────────────
export interface CatalogueRow {
  code: string;
  label_en: string;
}
export interface ServiceCategory extends CatalogueRow {
  parent_code: string | null;
  /** The picture: one SVG path on a 24 x 24 grid (see src/lib/providerIcons.ts). */
  icon_path?: string | null;
}
export interface PricingUnit extends CatalogueRow {
  is_per_area: boolean;
  is_negotiable: boolean;
  /** Square metres in one unit, for the land units only. */
  area_sqm?: number | null;
}
export interface EquipmentAttribute {
  code: string;
  label_en: string;
  type: 'number' | 'text' | 'boolean';
  unit?: string;
}
export interface EquipmentType extends CatalogueRow {
  attribute_definitions: EquipmentAttribute[];
}
export interface ProviderCatalogue {
  categories: ServiceCategory[];
  pricingUnits: PricingUnit[];
  equipmentTypes: EquipmentType[];
  providerTypes: CatalogueRow[];
  skillTiers: CatalogueRow[];
  nurseryItemKinds: CatalogueRow[];
  paymentMethods: CatalogueRow[];
}

// ── errors ───────────────────────────────────────────────────────────────────
/** Codes raised by the database functions (see the functions migration header). */
const PROVIDER_CODES = [
  'NOT_AUTHENTICATED', 'PROVIDER_ROLE_NOT_ACTIVE', 'PROVIDER_POLICY_MISSING', 'PROVIDER_PROFILE_MISSING',
  'PROVIDER_INPUT_INVALID', 'PROVIDER_TYPE_INVALID', 'PROVIDER_NAME_INVALID', 'PROVIDER_LANGUAGES_INVALID',
  'PROVIDER_CATEGORY_INVALID', 'PROVIDER_UNIT_INVALID', 'PROVIDER_RATE_REQUIRED', 'PROVIDER_CAPACITY_INVALID',
  'PROVIDER_SKILL_TIER_INVALID', 'PROVIDER_PAYMENT_METHOD_INVALID', 'PROVIDER_LIMIT_REACHED',
  'PROVIDER_SERVICE_NOT_FOUND', 'PROVIDER_STATUS_INVALID', 'PROVIDER_HOURS_INVALID', 'PROVIDER_HOURS_NOT_SET',
  'PROVIDER_BLACKOUT_INVALID', 'PROVIDER_BLACKOUT_OVERLAP', 'PROVIDER_BLACKOUT_NOT_FOUND',
  'PROVIDER_EQUIPMENT_TYPE_INVALID', 'PROVIDER_EQUIPMENT_ATTRIBUTE_INVALID', 'PROVIDER_EQUIPMENT_NOT_FOUND',
  'PROVIDER_EQUIPMENT_INVALID', 'PROVIDER_NO_ACTIVE_SERVICE', 'PROVIDER_REACH_NOT_SET', 'PROVIDER_REVIEW_NOT_ALLOWED',
  'NURSERY_CROP_INVALID', 'NURSERY_KIND_INVALID', 'NURSERY_PRICE_REQUIRED', 'NURSERY_PRODUCT_NOT_FOUND',
  'NURSERY_BATCH_INVALID', 'NURSERY_BATCH_NOT_FOUND', 'NURSERY_BATCH_BELOW_RESERVED',
  'NURSERY_VARIETY_INVALID', 'NURSERY_PHOTO_LIMIT', 'NURSERY_PHOTO_PATH_INVALID',
] as const;
export type ProviderErrorCode = (typeof PROVIDER_CODES)[number] | 'PROVIDER_UNAVAILABLE';

export class ProviderError extends Error {
  code: ProviderErrorCode;
  constructor(code: ProviderErrorCode) {
    super(code);
    this.code = code;
  }
}

function toProviderError(error: any): ProviderError {
  const text = `${error?.message ?? ''}`;
  // The server sends exactly one code as the whole message.
  const code = PROVIDER_CODES.find((c) => text.trim() === c) ?? PROVIDER_CODES.find((c) => text.includes(c));
  return new ProviderError(code ?? 'PROVIDER_UNAVAILABLE');
}

// The functions and lookup tables are newer than the generated types file.
const rpc = (name: string, args?: Record<string, unknown>) =>
  (supabase as any).rpc(name, args) as Promise<{ data: any; error: any }>;
const lookup = (table: string, columns: string) =>
  (supabase as any).from(table).select(columns).order('sort_order') as Promise<{ data: any[] | null; error: any }>;

/** Runs one function that returns the workspace and keeps the store current. */
async function workspaceCall(name: string, args?: Record<string, unknown>): Promise<ProviderWorkspace> {
  const { data, error } = await rpc(name, args);
  if (error || !data) throw toProviderError(error);
  const workspace = data as ProviderWorkspace;
  useProviderStore.getState().setWorkspace(workspace);
  return workspace;
}

/** Fields a form may leave empty are sent as null, never as an empty string. */
export type ServiceInput = Partial<Omit<ProviderService, 'status' | 'currency'>> & {
  category_code: string;
  title: string;
  pricing_unit: string;
};
export interface EquipmentInput {
  id?: string;
  equipment_type: string;
  make?: string | null;
  model?: string | null;
  year_made?: number | null;
  attributes?: Record<string, number | string | boolean>;
  ownership?: ProviderEquipment['ownership'];
  condition?: ProviderEquipment['condition'];
  /** Sent only when the person typed one; the server keeps the last four characters. */
  registration?: string;
}
export interface ProfileInput {
  provider_type: string;
  public_name: string;
  experience_years: number | null;
  about_text: string | null;
  about_language: string | null;
  languages_spoken: string[];
}
export interface NurseryProductInput {
  id?: string;
  crop_id: string;
  variety_id?: string | null;
  variety_name_local?: string | null;
  item_kind: string;
  pricing_unit: string;
  price: number | null;
  min_order_qty: number | null;
  description?: string | null;
  description_language?: string | null;
  status?: ItemStatus;
}
export interface NurseryBatchInput {
  id?: string;
  product_id?: string;
  total_qty: number;
  ready_date: string;
  status?: NurseryBatch['status'];
}

// ── names from the crop masters ──────────────────────────────────────────────
/** A name per language code, plus `default` (the master's own name). */
export type LocalNames = Record<string, string>;
export interface NamedOption {
  id: string;
  names: LocalNames;
}

/**
 * The crop masters keep the name in `<column>` and further languages in
 * `<column>_<language code>`. Whatever language columns exist are picked up, so
 * a column added later needs no change here.
 */
function namesOf(row: Record<string, unknown>, column: string): LocalNames {
  const names: LocalNames = {};
  for (const [key, value] of Object.entries(row)) {
    if (typeof value !== 'string' || !value.trim()) continue;
    if (key === column) names.default = value;
    else if (key.startsWith(`${column}_`)) names[key.slice(column.length + 1)] = value;
  }
  return names;
}

/** The name in the chosen language, else the master's own name. */
export function localName(names: LocalNames | undefined, language: string): string {
  if (!names) return '';
  return names[language] || names[language.split('-')[0]] || names.default || '';
}

export const providerWorkspaceService = {
  /**
   * Is the provider_workspace flag on for this session's tenant? Any failure
   * (no network, function not there yet) keeps the last known answer.
   */
  async refreshEnabled(): Promise<boolean> {
    const { data, error } = await rpc('provider_workspace_enabled');
    if (error || typeof data !== 'boolean') return useProviderStore.getState().enabled;
    useProviderStore.getState().setEnabled(data);
    return data;
  },

  get: () => workspaceCall('provider_workspace_get'),
  saveProfile: (input: ProfileInput) => workspaceCall('provider_save_profile', { p: input }),
  setAccepting: (accepting: boolean) => workspaceCall('provider_set_accepting', { p_accepting: accepting }),
  saveService: (input: ServiceInput) => workspaceCall('provider_save_service', { p: input }),
  setServiceStatus: (serviceId: string, status: ItemStatus) =>
    workspaceCall('provider_set_service_status', { p_service_id: serviceId, p_status: status }),
  setWorkingHours: (days: WorkingDay[]) => workspaceCall('provider_set_working_hours', { p_days: days }),
  addBlackout: (from: Date, to: Date, reasonCode: string | null) =>
    workspaceCall('provider_add_blackout', {
      p_from: from.toISOString(), p_to: to.toISOString(), p_reason_code: reasonCode,
    }),
  cancelBlackout: (blackoutId: string) => workspaceCall('provider_cancel_blackout', { p_blackout_id: blackoutId }),
  saveEquipment: (input: EquipmentInput) => workspaceCall('provider_save_equipment', { p: input }),
  removeEquipment: (equipmentId: string) =>
    workspaceCall('provider_remove_equipment', { p_equipment_id: equipmentId }),
  saveNurseryProduct: (input: NurseryProductInput) => workspaceCall('nursery_save_product', { p: input }),
  saveNurseryBatch: (input: NurseryBatchInput) => workspaceCall('nursery_save_batch', { p: input }),
  /** Takes a photo off a plant; the object stays in the bucket. */
  removeNurseryPhoto: (productId: string, path: string) =>
    workspaceCall('nursery_remove_photo', { p_product_id: productId, p_path: path }),
  submitForReview: () => workspaceCall('provider_submit_for_review'),

  /** The lookup rows, read once per app start. Only active rows are readable. */
  async loadCatalogue(): Promise<ProviderCatalogue> {
    const cached = useProviderStore.getState().catalogue;
    if (cached) return cached;
    const [categories, pricingUnits, equipmentTypes, providerTypes, skillTiers, nurseryItemKinds, paymentMethods] =
      await Promise.all([
        // every column, so the picture column is read where the database has it and is not asked for where it does not
        lookup('service_categories', '*'),
        lookup('pricing_units', 'code, label_en, is_per_area, is_negotiable, area_sqm, sort_order'),
        lookup('equipment_types', 'code, label_en, attribute_definitions, sort_order'),
        lookup('provider_types', 'code, label_en, sort_order'),
        lookup('skill_tiers', 'code, label_en, sort_order'),
        lookup('nursery_item_kinds', 'code, label_en, sort_order'),
        lookup('provider_payment_methods', 'code, label_en, sort_order'),
      ]);
    const results = [categories, pricingUnits, equipmentTypes, providerTypes, skillTiers, nurseryItemKinds, paymentMethods];
    if (results.some((r) => r.error || !r.data)) throw new ProviderError('PROVIDER_UNAVAILABLE');
    const catalogue: ProviderCatalogue = {
      categories: categories.data as ServiceCategory[],
      pricingUnits: pricingUnits.data as PricingUnit[],
      equipmentTypes: equipmentTypes.data as EquipmentType[],
      providerTypes: providerTypes.data as CatalogueRow[],
      skillTiers: skillTiers.data as CatalogueRow[],
      nurseryItemKinds: nurseryItemKinds.data as CatalogueRow[],
      paymentMethods: paymentMethods.data as CatalogueRow[],
    };
    useProviderStore.getState().setCatalogue(catalogue);
    return catalogue;
  },

  /** Crop names for the nursery store, from the public crops master (display only). */
  async cropNames(cropIds: string[]): Promise<Record<string, LocalNames>> {
    if (cropIds.length === 0) return {};
    const { data, error } = await supabase.from('crops').select('*').in('id', cropIds);
    if (error || !data) return {};
    const names: Record<string, LocalNames> = {};
    for (const row of data as Record<string, unknown>[]) names[String(row.id)] = namesOf(row, 'label');
    return names;
  },

  /** Crop groups and the crops of one group, for choosing what a nursery sells. */
  async cropGroups(): Promise<NamedOption[]> {
    const { data, error } = await supabase
      .from('crop_groups').select('*').eq('is_active', true).order('display_order');
    if (error || !data) throw new ProviderError('PROVIDER_UNAVAILABLE');
    return (data as Record<string, unknown>[]).map((row) => ({ id: String(row.id), names: namesOf(row, 'group_name') }));
  },
  /** Seed varieties of one crop from the variety master, named in the languages it holds. */
  async varietiesOfCrop(cropId: string): Promise<NamedOption[]> {
    const { data, error } = await (supabase as any)
      .from('v_crop_varieties').select('variety_id, name, label_hi, label_mr')
      .eq('crop_id', cropId).eq('status', 'active').order('name');
    if (error || !data) throw new ProviderError('PROVIDER_UNAVAILABLE');
    return (data as Record<string, unknown>[]).map((row) => ({
      id: String(row.variety_id),
      names: { ...namesOf(row, 'label'), default: String(row.name ?? '') },
    }));
  },

  async cropsOfGroup(groupId: string): Promise<NamedOption[]> {
    const { data, error } = await supabase
      .from('crops').select('*').eq('crop_group_id', groupId).eq('is_active', true).order('display_order');
    if (error || !data) throw new ProviderError('PROVIDER_UNAVAILABLE');
    return (data as Record<string, unknown>[]).map((row) => ({ id: String(row.id), names: namesOf(row, 'label') }));
  },
};
