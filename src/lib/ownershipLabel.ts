/**
 * ownershipLabel — single source of truth for translating the canonical
 * `ownership_type` slug (owned | leased | shared | contract) into the
 * farmer's selected language.
 *
 * The DB stores `lands.ownership_type` as a plain text slug. UI must never
 * render the raw slug — always go through this helper so language switches
 * surface the localized label.
 */
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

export const OWNERSHIP_TYPES = ['owned', 'leased', 'shared', 'contract'] as const;
export type OwnershipType = (typeof OWNERSHIP_TYPES)[number];

export function isOwnershipType(v: string | null | undefined): v is OwnershipType {
  return !!v && (OWNERSHIP_TYPES as readonly string[]).includes(String(v).toLowerCase().trim());
}

/**
 * React hook returning a translator for any ownership slug.
 * Falls back gracefully to the humanized slug when the key is missing.
 */
export function useOwnershipLabel() {
  const { t } = useTranslation();
  return useCallback(
    (raw?: string | null) => {
      if (!raw || !String(raw).trim()) {
        return t('lands.wizard.ownership.unspecified', { defaultValue: '—' });
      }
      const key = String(raw).toLowerCase().trim();
      const humanized = key.charAt(0).toUpperCase() + key.slice(1);
      return t(`lands.wizard.ownership.${key}`, { defaultValue: humanized });
    },
    [t],
  );
}
