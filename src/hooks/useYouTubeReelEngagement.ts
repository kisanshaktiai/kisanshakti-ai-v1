/**
 * useYouTubeReelEngagement — record farmer engagement with official YouTube reels.
 * All real engagement (like/comment) is forwarded to YouTube via deep links; we
 * persist a local audit record (tenant-isolated) for analytics.
 */
import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';

export type YTAction =
  | 'view'
  | 'like'
  | 'unlike'
  | 'comment'
  | 'save'
  | 'unsave'
  | 'share'
  | 'open_youtube'
  | 'watch_complete';

export function useYouTubeReelEngagement() {
  const { session } = useAuthStore();
  const farmerId = session?.farmerId;
  const tenantId = session?.tenantId;

  const track = useCallback(
    async (
      videoId: string,
      action: YTAction,
      extra?: { watched_seconds?: number; metadata?: Record<string, unknown> },
    ) => {
      if (!farmerId || !tenantId || !videoId) return;
      try {
        await supabase.from('youtube_reel_engagement').insert([
          {
            tenant_id: tenantId,
            farmer_id: farmerId,
            video_id: videoId,
            action,
            channel: 'kisanshaktiai',
            watched_seconds: extra?.watched_seconds ?? undefined,
            metadata: (extra?.metadata ?? {}) as never,
          },
        ]);
      } catch (e) {
        // Non-blocking telemetry
        console.warn('[yt-engagement] insert failed', e);
      }
    },
    [farmerId, tenantId],
  );

  return { track };
}
