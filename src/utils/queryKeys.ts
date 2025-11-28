// Centralized query keys for React Query
export const queryKeys = {
  tenant: ['tenant'],
  user: ['user'],
  weather: (lat: number, lon: number) => ['weather', { lat, lon }],
  marketPrices: (crop?: string) => ['market', crop],
  advisory: (type?: string) => ['advisory', type],
  schemes: ['schemes'],
  notifications: ['notifications'],
} as const;