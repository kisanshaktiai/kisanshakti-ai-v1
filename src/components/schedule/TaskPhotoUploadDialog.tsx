/**
 * REPO: kisanshaktiai/kisanshakti-ai-v1  (farmer app)
 * PATH: src/components/schedule/TaskPhotoUploadDialog.tsx
 *
 * CHANGE LOG (newest first, keep entries short)
 * 2026-09-23 — Thin wrapper over the central CropPhotoCapture tool (purpose
 *   'schedule_task'). Props are unchanged, so CropScheduleView keeps working.
 *   The photo is stored once as land evidence with this schedule and task,
 *   GPS is still required for task proof, and the answer comes from the
 *   Decision Brain. The old direct upload (blocked by auth.uid() RLS under PIN
 *   login) and the ai-crop-scan growth call are no longer used.
 */
import React from 'react';
import { CropPhotoCapture } from '@/components/Photo/CropPhotoCapture';
import { resolveTaskTypeKey } from '@/lib/taskTypeIcons';
import type { CropPhotoUploadType } from '@/services/cropPhotoService';

interface TaskPhotoUploadDialogProps {
  isOpen: boolean;
  onClose: () => void;
  taskId?: string;
  taskType?: string;
  taskName?: string;
  scheduleId: string;
  landId: string;
  farmerId: string;
  tenantId: string;
  cropName?: string;
  onUploadComplete?: () => void;
}

// Unchanged mapping from the previous dialog: task type → photo subject.
const taskTypeToUploadType: Record<string, CropPhotoUploadType> = {
  irrigation: 'irrigation',
  fertilizer: 'fertilizer',
  pesticide: 'pest',
  pest_control: 'pest',
  weeding: 'crop',
  weed_management: 'crop',
  harvest: 'harvest',
  harvesting: 'harvest',
  soil_preparation: 'land_preparation',
  sowing: 'crop',
};

export function TaskPhotoUploadDialog({
  isOpen,
  onClose,
  taskId,
  taskType,
  scheduleId,
  landId,
  farmerId,
  tenantId,
  onUploadComplete,
}: TaskPhotoUploadDialogProps) {
  const uploadType: CropPhotoUploadType =
    taskType ? (taskTypeToUploadType[resolveTaskTypeKey(taskTypeToUploadType, taskType) ?? ''] || 'crop') : 'crop';

  return (
    <CropPhotoCapture
      isOpen={isOpen}
      onClose={onClose}
      purpose="schedule_task"
      farmerId={farmerId}
      tenantId={tenantId}
      landId={landId}
      scheduleId={scheduleId}
      taskId={taskId}
      uploadType={uploadType}
      requireLocation
      onAnswer={() => onUploadComplete?.()}
    />
  );
}

export default TaskPhotoUploadDialog;
