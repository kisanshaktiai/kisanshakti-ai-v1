/** Routes of "services near me" in the farmer app (under /app, behind the farmer gates). */
export const FARM_SERVICES_ROUTES = {
  home: '/app/services-near-me',
  family: (code: string) => `/app/services-near-me/${encodeURIComponent(code)}`,
  store: (accountId: string) => `/app/services-near-me/nursery/${accountId}`,
} as const;
