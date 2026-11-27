import { useCallback, useState } from 'react';

const KEY = 'lf_chosen_land';

export interface ChoosableLand { id: string; is_active?: boolean | null }

/** The land the farmer last picked on a Living Farm screen, kept for the session so Field and Day show the same land. */
export function useChosenLand<T extends ChoosableLand>(lands: T[]): { land: T | null; choose: (id: string) => void } {
  const [chosenId, setChosenId] = useState<string | null>(() => {
    try { return sessionStorage.getItem(KEY); } catch { return null; }
  });
  const choose = useCallback((id: string) => {
    setChosenId(id);
    try { sessionStorage.setItem(KEY, id); } catch { /* the choice still holds for this screen */ }
  }, []);
  const land = lands.find((l) => l.id === chosenId) ?? lands.find((l) => l.is_active !== false) ?? lands[0] ?? null;
  return { land, choose };
}
