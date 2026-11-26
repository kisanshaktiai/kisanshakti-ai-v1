import { supabase } from '@/integrations/supabase/client';
import type { AvailabilityState } from '@/services/providerWorkspaceService';

/**
 * "Services near me" in the farmer app. Every read is one database function
 * that knows the farmer from the session token, finds the listed providers
 * whose reach covers one of his lands, and returns only what a farmer may see
 * of a provider. The farmer side has no write in this step.
 *
 * Behind the farm_services_search flag (per tenant): the functions refuse
 * with FEATURE_DISABLED while it is off, and farmServicesService.enabled()
 * asks the server whether to show the entry at all.
 */

const FLAG_KEY = 'ks_farm_services';

export const FARM_SERVICES_CODES = [
  'NOT_AUTHENTICATED', 'FEATURE_DISABLED', 'SERVICE_FAMILY_INVALID', 'NURSERY_STORE_NOT_FOUND',
  'REQUEST_INPUT_INVALID', 'REQUEST_QUANTITY_INVALID', 'REQUEST_DATE_INVALID', 'REQUEST_LAND_INVALID',
  'REQUEST_LAND_NOT_LOCATED', 'REQUEST_LIMIT_REACHED', 'REQUEST_SERVICE_NOT_FOUND', 'REQUEST_UNIT_INVALID',
  'REQUEST_NOT_FOUND', 'REQUEST_NOT_AVAILABLE', 'PROVIDER_NOT_ACCEPTING', 'PROVIDER_OUT_OF_REACH',
  'PROVIDER_NOT_FOUND', 'NURSERY_STOCK_SHORT', 'OFFER_NOT_FOUND', 'OFFER_NOT_AVAILABLE', 'RATING_INVALID',
] as const;
export type FarmServicesErrorCode = (typeof FARM_SERVICES_CODES)[number] | 'UNAVAILABLE';

export class FarmServicesError extends Error {
  code: FarmServicesErrorCode;
  constructor(code: FarmServicesErrorCode) {
    super(code);
    this.code = code;
  }
}

export interface ServiceFamilyCount { code: string; label_en?: string; count: number; }
/** What is waiting for the farmer, counted by the server on each read. */
export interface RequestCounts { offers_waiting: number; open: number; booked: number; to_rate: number; }
export interface NearbyFamilies { located: boolean; families: ServiceFamilyCount[]; requests?: RequestCounts; }

export interface NearbyService {
  id: string;
  title: string;
  category_code: string;
  base_rate: number | null;
  currency: string;
  pricing_unit: string;
  includes_operator: boolean;
  includes_fuel: boolean;
  includes_material: boolean;
  min_charge: number | null;
  payment_methods: string[];
}
export interface NearbyStoreSummary { product_count: number; crop_ids: string[]; photo_paths: string[]; }
export interface NearbyProvider {
  account_id: string;
  public_name: string;
  provider_type: string;
  verification_level: string | null;
  rating_average: number | null;
  rating_count: number;
  jobs_completed: number;
  distance_km: number;
  accepts_requests: boolean;
  /** Saved by this farmer. */
  saved?: boolean;
  availability: { state: AvailabilityState; next_free_date: string | null };
  services: NearbyService[];
  store: NearbyStoreSummary | null;
}

export interface StoreProduct {
  id: string;
  crop_id: string;
  variety_id: string | null;
  variety_names: Record<string, string | null> | null;
  variety_name_local: string | null;
  item_kind: string;
  price: number | null;
  currency: string;
  pricing_unit: string;
  min_order_qty: number | null;
  description: string | null;
  description_language: string | null;
  photo_paths: string[];
  available_qty: number;
  batches: { ready_date: string; available_qty: number }[];
}
export interface NurseryStore {
  provider: NearbyProvider & { about_text: string | null; about_language: string | null };
  products: StoreProduct[];
}

/** A plant as shown on a request (the crop's name is looked up by crop_id). */
export interface RequestPlant {
  crop_id: string;
  item_kind: string;
  variety_name_local: string | null;
  variety_names: Record<string, string | null> | null;
  photo_path: string | null;
}
export type FarmRequestStatus = 'OPEN' | 'CONFIRMED' | 'DONE' | 'CANCELLED' | 'DECLINED' | 'EXPIRED';
export interface RequestOffer {
  id: string;
  public_name: string;
  rating_average: number | null;
  rating_count: number;
  distance_km: number | null;
  rate: number | null;
  pricing_unit: string | null;
  offer_date: string;
}
export interface FarmRequest {
  id: string;
  kind: 'SERVICE' | 'NURSERY';
  family_code: string;
  category_code: string | null;
  status: FarmRequestStatus;
  /** Sent to one provider (true) or to every provider of the service near the land. */
  is_direct: boolean;
  service_title: string | null;
  plant: RequestPlant | null;
  land: { id: string; name: string | null } | null;
  quantity: number;
  quantity_unit: string;
  needed_date: string;
  quoted_rate: number | null;
  currency: string;
  agreed_rate: number | null;
  agreed_unit: string | null;
  agreed_date: string | null;
  cancelled_by: 'FARMER' | 'PROVIDER' | null;
  farmer_rating: number | null;
  created_at: string;
  /** The provider's number is present only once the request is booked. */
  provider: { account_id: string; public_name: string; mobile: string | null } | null;
  offers: RequestOffer[];
}
/** One of: a provider's service, a nursery plant, or a service asked of everyone near the land. */
export interface FarmRequestInput {
  kind: 'SERVICE' | 'NURSERY';
  land_id: string;
  needed_date: string;
  quantity: number;
  provider_service_id?: string;
  nursery_product_id?: string;
  category_code?: string;
  quantity_unit?: string;
}

function toError(error: unknown): FarmServicesError {
  const message = (error as { message?: unknown } | null)?.message;
  const code = typeof message === 'string'
    ? [...FARM_SERVICES_CODES].sort((a, b) => b.length - a.length).find((c) => message.includes(c))
    : undefined;
  return new FarmServicesError(code ?? 'UNAVAILABLE');
}

async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  // The generated types do not know these functions yet; same pattern as providerWorkspaceService.
  const { data, error } = await (supabase as any).rpc(name, args);
  if (error) throw toError(error);
  return data as T;
}

export function rememberFarmServicesFlag(value: boolean) {
  try { localStorage.setItem(FLAG_KEY, value ? '1' : '0'); } catch { /* storage may be closed */ }
}
export function isFarmServicesRemembered(): boolean {
  try { return localStorage.getItem(FLAG_KEY) === '1'; } catch { return false; }
}

export const farmServicesService = {
  /** Asks the server whether the flag is on for this farmer's tenant and remembers the answer. */
  async enabled(): Promise<boolean> {
    try {
      const value = await rpc<boolean>('farm_services_enabled');
      rememberFarmServicesFlag(value === true);
      return value === true;
    } catch {
      return isFarmServicesRemembered();
    }
  },
  nearby: () => rpc<NearbyFamilies>('farm_services_nearby'),
  providers: (familyCode: string) => rpc<NearbyProvider[]>('farm_services_providers', { p_family_code: familyCode }),
  store: (accountId: string) => rpc<NurseryStore>('nursery_store', { p_account_id: accountId }),

  // Requests. Every write returns the farmer's whole list as the server now holds it.
  myRequests: () => rpc<FarmRequest[]>('farm_service_requests_mine'),
  createRequest: (input: FarmRequestInput) => rpc<FarmRequest[]>('farm_service_request_create', { p: input }),
  acceptOffer: (offerId: string) => rpc<FarmRequest[]>('farm_service_offer_accept', { p_offer_id: offerId }),
  declineOffer: (offerId: string) => rpc<FarmRequest[]>('farm_service_offer_decline', { p_offer_id: offerId }),
  cancelRequest: (requestId: string) => rpc<FarmRequest[]>('farm_service_request_cancel', { p_request_id: requestId }),
  rateRequest: (requestId: string, stars: number) =>
    rpc<FarmRequest[]>('farm_service_request_rate', { p_request_id: requestId, p_stars: stars }),
  saveProvider: (accountId: string, saved: boolean) =>
    rpc<boolean>('farm_services_save_provider', { p_account_id: accountId, p_saved: saved }),
};
