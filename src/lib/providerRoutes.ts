import { WORKSPACE_HOME } from '@/lib/accountRoles';

/** Routes of the Provider Workspace (children of the provider layout). */
const HOME = WORKSPACE_HOME.SERVICE_PROVIDER;
const BUSINESS = `${HOME}/business`;

export const PROVIDER_ROUTES = {
  home: HOME,
  requests: `${HOME}/requests`,
  business: BUSINESS,
  profile: `${BUSINESS}/profile`,
  services: `${BUSINESS}/services`,
  serviceNew: `${BUSINESS}/services/new`,
  serviceEdit: (id: string) => `${BUSINESS}/services/${id}`,
  hours: `${BUSINESS}/hours`,
  daysOff: `${BUSINESS}/days-off`,
  equipment: `${BUSINESS}/equipment`,
  nursery: `${BUSINESS}/nursery`,
} as const;
