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

/**
 * Semantic background/border/text classes per ownership type. Keeps the
 * tiny ownership chip visually distinct across all land cards.
 */
const OWNERSHIP_STYLES: Record<string, string> = {
  owned: 'bg-success/15 border-success/30 text-success',
  leased: 'bg-info/15 border-info/30 text-info',
  shared: 'bg-warning/15 border-warning/30 text-warning',
  contract: 'bg-accent/20 border-accent/40 text-accent-foreground',
};

export function ownershipChipClasses(raw?: string | null): string {
  const key = String(raw || '').toLowerCase().trim();
  return OWNERSHIP_STYLES[key] || 'bg-muted/40 border-border/40 text-foreground';
}
