// Centralized query keys for React Query
export const queryKeys = {
  tenant: ['tenant'],
  user: ['user'],
  weather: (location: string) => ['weather', location],
  marketPrices: (crop?: string) => ['market', crop],
  advisory: (type?: string) => ['advisory', type],
  schemes: ['schemes'],
  notifications: ['notifications'],
} as const;