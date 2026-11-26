import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { cropIndexLoaded, cropName, loadCropIndex, subscribeCropIndex } from '@/lib/cropNames';

/**
 * Crop names in the farmer's language for any screen. Returns a function:
 * give it the stored text (and the crop id when the row has one) and it gives
 * the name to show. Before the crop table has arrived it gives the stored
 * text, and the screen redraws by itself once the table is there.
 */
export function useCropNames(): (text: string | null | undefined, cropId?: string | null) => string {
  const { i18n } = useTranslation();
  const loaded = useSyncExternalStore(subscribeCropIndex, cropIndexLoaded, () => false);
  useEffect(() => {
    if (!loaded) loadCropIndex().catch(() => { /* the stored text is shown instead */ });
  }, [loaded]);
  const language = i18n.language;
  return useCallback(
    (text: string | null | undefined, cropId?: string | null) => cropName(text, cropId, language),
    // `loaded` is in the list on purpose: the same inputs give a new answer once the table is there
    [language, loaded], // eslint-disable-line react-hooks/exhaustive-deps
  );
}
