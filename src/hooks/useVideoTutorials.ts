import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/utils/supabase';
import { useLanguageStore } from '@/stores/languageStore';

export interface VideoTutorial {
  id: string;
  title: string;
  description: string | null;
  video_url: string;
  thumbnail_url: string | null;
  category: string;
  subcategory: string | null;
  language: string;
  duration_minutes: number | null;
  tags: string[] | null;
  view_count: number;
  is_featured: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface UseVideoTutorialsOptions {
  category?: string;
  language?: string;
  enabled?: boolean;
}

export function useVideoTutorials(options: UseVideoTutorialsOptions = {}) {
  const { currentLanguage: userLanguage } = useLanguageStore();
  const { category, language = userLanguage, enabled = true } = options;

  return useQuery({
    queryKey: ['video_tutorials', category, language],
    queryFn: async () => {
      let query = supabase
        .from('video_tutorials')
        .select('*')
        .eq('is_active', true)
        .order('is_featured', { ascending: false })
        .order('view_count', { ascending: false });
      
      if (category) {
        query = query.eq('category', category);
      }
      
      if (language) {
        query = query.eq('language', language);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      
      return (data || []) as VideoTutorial[];
    },
    enabled,
  });
}

export async function incrementVideoViewCount(videoId: string) {
  try {
    const { error } = await supabase.rpc('increment_video_view_count', {
      video_id: videoId,
    });
    
    if (error) {
      // Fallback to manual increment if RPC doesn't exist
      const { data: video } = await supabase
        .from('video_tutorials')
        .select('view_count')
        .eq('id', videoId)
        .single();
      
      if (video) {
        await supabase
          .from('video_tutorials')
          .update({ view_count: (video.view_count || 0) + 1 })
          .eq('id', videoId);
      }
    }
  } catch (error) {
    console.error('Error incrementing video view count:', error);
  }
}
