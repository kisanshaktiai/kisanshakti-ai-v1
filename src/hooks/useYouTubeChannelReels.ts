/**
 * useYouTubeChannelReels — fetches the latest videos from the KisanShakti AI
 * YouTube channel (@kisanshaktiai) via the `youtube-channel-feed` edge function.
 *
 * The returned shape is compatible with VideoHelpCard's `videos` prop and
 * the ReelPlayer (uses `video_url` + `thumbnail_url`).
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface YouTubeChannelVideo {
  id: string;
  video_id: string;
  title: string;
  description: string;
  video_url: string;
  thumbnail_url: string;
  published_at: string;
  total_views: number;
  is_featured: boolean;
}

export function useYouTubeChannelReels(limit = 8) {
  return useQuery({
    queryKey: ['youtube-channel-reels', limit],
    queryFn: async (): Promise<YouTubeChannelVideo[]> => {
      const { data, error } = await supabase.functions.invoke('youtube-channel-feed', {
        body: {},
      });
      if (error) throw error;
      const videos = (data?.videos ?? []) as YouTubeChannelVideo[];
      return videos.slice(0, limit);
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });
}
