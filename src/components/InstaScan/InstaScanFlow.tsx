/**
 * REPO: kisanshaktiai/kisanshakti-ai-v1  (farmer app)
 * PATH: src/components/InstaScan/InstaScanFlow.tsx
 *
 * CHANGE LOG (newest first, keep entries short)
 * 2026-09-23 — InstaScan now opens the central CropPhotoCapture tool with
 *   purpose 'instascan'. Every scan is bound to a land (the tool asks which
 *   land when the farmer has more than one), stored as land evidence, read by
 *   the perception engine, and answered by the Decision Brain. The old path
 *   (InstaScanCamera → ai-crop-scan full mode, no land, model-written doses,
 *   result parked unread in sessionStorage) is no longer used.
 */
import React from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useTenant } from '@/contexts/TenantContext';
import { useLands } from '@/hooks/useLands';
import { CropPhotoCapture } from '@/components/Photo/CropPhotoCapture';

interface InstaScanFlowProps {
  isOpen: boolean;
  onClose: () => void;
}

export function InstaScanFlow({ isOpen, onClose }: InstaScanFlowProps) {
  const { user } = useAuthStore();
  const { tenant } = useTenant();
  const { lands } = useLands();

  if (!isOpen || !user?.id || !tenant?.id) return null;

  const landOptions = (lands ?? []).map((l) => ({ id: l.id, name: l.name }));

  return (
    <CropPhotoCapture
      isOpen={isOpen}
      onClose={onClose}
      purpose="instascan"
      farmerId={user.id}
      tenantId={tenant.id}
      lands={landOptions}
      landId={landOptions.length === 1 ? landOptions[0].id : undefined}
    />
  );
}
