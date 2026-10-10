import { useEffect, useReducer } from 'react';
import { useTranslation } from 'react-i18next';
import { localizePlace, subscribeLocationI18n, type PlaceKind } from '@/lib/locationI18n';

export interface PlaceParts {
  village?: string | null;
  taluka?: string | null;
  district?: string | null;
  state?: string | null;
}

/** Returns a localiser bound to the current app language; re-renders when official names arrive. */
export function useLocalizedPlace() {
  const { i18n } = useTranslation();
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => { const off = subscribeLocationI18n(force); return () => { off(); }; }, []);
  const lang = i18n.language || 'en';
  const place = (name: string | null | undefined, kind: PlaceKind) => localizePlace(name, kind, lang);
  const join = (p: PlaceParts, order: PlaceKind[] = ['village', 'taluka', 'district', 'state']) =>
    order.map((k) => place(p[k], k)).filter(Boolean).join(', ');
  return { place, join, lang };
}
