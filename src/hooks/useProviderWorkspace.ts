import { useCallback, useEffect, useState } from 'react';
import { useProviderStore } from '@/stores/providerStore';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import {
  providerWorkspaceService,
  type ProviderCatalogue,
  type ProviderWorkspace,
} from '@/services/providerWorkspaceService';
import { providerErrorMessage } from '@/lib/providerText';

interface UseProviderWorkspace {
  workspace: ProviderWorkspace | null;
  catalogue: ProviderCatalogue | null;
  /** True while the first load of this screen runs. */
  loading: boolean;
  /** Text of the load error, when the workspace could not be read. */
  loadError: string | null;
  isOnline: boolean;
  /** True while a write started through run() is on its way. */
  saving: boolean;
  /** Text of the last write error; cleared when the next write starts. */
  saveError: string | null;
  clearSaveError: () => void;
  /** Runs one write. Resolves true when it succeeded. */
  run: (action: () => Promise<unknown>) => Promise<boolean>;
  reload: () => void;
}

/**
 * The provider's business and the catalogue for one screen. Each screen that
 * mounts it reads the workspace again, so what is shown is what the server
 * holds; writes go through run(), which replaces the stored workspace with the
 * one the server returns.
 */
export function useProviderWorkspace(): UseProviderWorkspace {
  const workspace = useProviderStore((s) => s.workspace);
  const catalogue = useProviderStore((s) => s.catalogue);
  const isOnline = useOfflineStatus();
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!isOnline) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    Promise.all([providerWorkspaceService.get(), providerWorkspaceService.loadCatalogue()])
      .catch((err) => { if (!cancelled) setLoadError(providerErrorMessage(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isOnline, attempt]);

  const run = useCallback(async (action: () => Promise<unknown>) => {
    setSaving(true);
    setSaveError(null);
    try {
      await action();
      return true;
    } catch (err) {
      setSaveError(providerErrorMessage(err));
      return false;
    } finally {
      setSaving(false);
    }
  }, []);

  return {
    workspace, catalogue, loading, loadError, isOnline, saving, saveError,
    clearSaveError: useCallback(() => setSaveError(null), []),
    run,
    reload: useCallback(() => setAttempt((n) => n + 1), []),
  };
}
