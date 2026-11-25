import i18n from '@/i18n/config';
import type { FarmServicesError } from '@/services/farmServicesService';

/** Text for an error code raised by a "services near me" function. */
export function farmServicesErrorMessage(error: unknown): string {
  const code = (error as Partial<FarmServicesError> | null | undefined)?.code;
  const key = `farmServices.errors.${code ?? ''}`;
  return code && i18n.exists(key) ? i18n.t(key) : i18n.t('farmServices.errors.generic');
}

/** "4.5 km" in the chosen language. */
export function distanceText(km: number): string {
  return i18n.t('farmServices.distance', { km: new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 }).format(km) });
}
