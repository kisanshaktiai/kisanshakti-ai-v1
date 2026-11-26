import { supabase } from '@/integrations/supabase/client';
import { useProviderRequestsStore } from '@/stores/providerRequestsStore';
import type { RequestPlant } from '@/services/farmServicesService';

/**
 * Requests from farmers, on the provider's side. Every call is one database
 * function that knows the provider from the session token and answers with
 * the whole inbox, which is kept in providerRequestsStore.
 *
 * Until a request is booked with this provider the card carries the work, the
 * amount, the day and the distance in whole kilometres only; the farmer's
 * name, number, village and land place arrive with the booking.
 */

export const PROVIDER_REQUEST_CODES = [
  'NOT_AUTHENTICATED', 'PROVIDER_ROLE_NOT_ACTIVE', 'REQUEST_NOT_AVAILABLE', 'REQUEST_INPUT_INVALID',
  'REQUEST_DATE_INVALID', 'REQUEST_OFFERS_FULL', 'OFFER_RATE_REQUIRED', 'NURSERY_STOCK_SHORT', 'JOB_NOT_STARTED',
] as const;
export type ProviderRequestErrorCode = (typeof PROVIDER_REQUEST_CODES)[number] | 'UNAVAILABLE';

export class ProviderRequestError extends Error {
  code: ProviderRequestErrorCode;
  constructor(code: ProviderRequestErrorCode) {
    super(code);
    this.code = code;
  }
}

export interface ProviderRequestCard {
  id: string;
  kind: 'SERVICE' | 'NURSERY';
  family_code: string;
  category_code: string | null;
  status: 'OPEN' | 'CONFIRMED' | 'DONE' | 'CANCELLED' | 'DECLINED';
  /** Sent to this provider alone (true) or to every provider of the work near the land. */
  is_direct: boolean;
  quantity: number;
  quantity_unit: string;
  needed_date: string;
  /** The rate the farmer saw when he asked this provider; null for a request to everyone. */
  quoted_rate: number | null;
  currency: string;
  distance_km: number | null;
  my_service: { id: string; title: string; base_rate: number | null; pricing_unit: string } | null;
  plant: RequestPlant | null;
  my_offer: { rate: number | null; pricing_unit: string | null; offer_date: string; status: string } | null;
  agreed_rate: number | null;
  agreed_unit: string | null;
  agreed_date: string | null;
  cancelled_by: 'FARMER' | 'PROVIDER' | null;
  farmer_rating: number | null;
  created_at: string;
  /** Present only once the request is booked with this provider. */
  farmer: {
    name: string | null; mobile: string | null; land_name: string | null; village: string | null;
    lat: number | null; lon: number | null;
  } | null;
}
export interface ProviderInbox {
  new: ProviderRequestCard[];
  waiting: ProviderRequestCard[];
  jobs: ProviderRequestCard[];
  past: ProviderRequestCard[];
}
export type ProviderAnswer =
  | { action: 'ACCEPT' }
  | { action: 'OFFER'; rate: number; offer_date: string }
  | { action: 'REFUSE' };

function toError(error: unknown): ProviderRequestError {
  const message = (error as { message?: unknown } | null)?.message;
  const code = typeof message === 'string'
    ? [...PROVIDER_REQUEST_CODES].sort((a, b) => b.length - a.length).find((c) => message.includes(c))
    : undefined;
  return new ProviderRequestError(code ?? 'UNAVAILABLE');
}

/** Runs one function that answers with the inbox and keeps the store current. */
async function inboxCall(name: string, args?: Record<string, unknown>): Promise<ProviderInbox> {
  // The generated types do not know these functions yet.
  const client = supabase as unknown as {
    rpc: (fn: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  };
  const { data, error } = await client.rpc(name, args);
  if (error || !data) throw toError(error);
  const inbox = data as ProviderInbox;
  useProviderRequestsStore.getState().setInbox(inbox);
  return inbox;
}

export const providerRequestsService = {
  inbox: () => inboxCall('provider_requests_inbox'),
  /** Yes as asked, yes with his own rate or day, or no. */
  respond: (requestId: string, answer: ProviderAnswer) =>
    inboxCall('provider_request_respond', { p_request_id: requestId, p: answer }),
  /** Takes back an answer the farmer has not accepted yet, or cancels a booked job. */
  cancel: (requestId: string) => inboxCall('provider_request_cancel', { p_request_id: requestId }),
  done: (requestId: string) => inboxCall('provider_job_done', { p_request_id: requestId }),
};
