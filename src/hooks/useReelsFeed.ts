/**
 * useReelsFeed — Cursor-paginated, multi-tenant safe reels feed.
 *
 * Reads from `reels_videos` (RLS already enforces:
 *   global OR tenant_id = current farmer's tenant).
 * Cursor: (trending_score DESC, id DESC) for stable pagination.
 */
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useLanguageStore } from '@/stores/languageStore';
import { useAuthStore } from '@/stores/authStore';

export type ReelSource = 'youtube' | 'upload' | 'external';

export interface Reel {
  id: string;
  tenant_id: string | null;
  visibility_scope: 'global' | 'tenant';
  title: string;
  description: string | null;
  category_id: string | null;
  language_code: string;
  tags: string[] | null;
  source: ReelSource;
  video_url: string;
  hls_url: string | null;
  thumbnail_url: string | null;
  preview_webp_url: string | null;
  duration_seconds: number | null;
  is_featured: boolean;
  total_views: number;
  total_likes: number;
  total_comments: number;
  total_shares: number;
  total_saves: number;
  trending_score: number;
  published_at: string;
  created_at: string;
}

export interface ReelCategory {
  id: string;
  slug: string;
  name_i18n: Record<string, string>;
  icon: string | null;
  color: string | null;
  sort_order: number;
}

const PAGE_SIZE = 8;

interface UseReelsFeedOptions {
  categoryId?: string | null;
  language?: string;
  savedOnly?: boolean;
}

export function useReelsFeed(opts: UseReelsFeedOptions = {}) {
  const { currentLanguage } = useLanguageStore();
  const { session } = useAuthStore();
  const farmerId = session?.farmerId;
  const language = opts.language ?? currentLanguage;

  return useInfiniteQuery({
    queryKey: ['reels-feed', { categoryId: opts.categoryId ?? null, language, savedOnly: !!opts.savedOnly, farmerId }],
    initialPageParam: null as { score: number; id: string } | null,
    queryFn: async ({ pageParam }) => {
      // Saved-only mode: join via reels_saves
      if (opts.savedOnly) {
        if (!farmerId) return { items: [] as Reel[], nextCursor: null };
        const { data, error } = await supabase
          .from('reels_saves')
          .select('reel:reels_videos(*)')
          .eq('farmer_id', farmerId)
          .order('created_at', { ascending: false })
          .limit(PAGE_SIZE);
        if (error) throw error;
        const items = (data || [])
          .map((r: { reel: Reel | null }) => r.reel)
          .filter((x): x is Reel => !!x);
        return { items, nextCursor: null };
      }

      let q = supabase
        .from('reels_videos')
        .select('*')
        .order('trending_score', { ascending: false })
        .order('id', { ascending: false })
        .limit(PAGE_SIZE);

      if (opts.categoryId) q = q.eq('category_id', opts.categoryId);
      if (language) {
        // Prefer current language but include English as fallback
        q = q.in('language_code', [language, 'en']);
      }
      if (pageParam) {
        // Cursor: rows with score < cursor.score, OR same score and id < cursor.id
        q = q.or(`trending_score.lt.${pageParam.score},and(trending_score.eq.${pageParam.score},id.lt.${pageParam.id})`);
      }

      const { data, error } = await q;
      if (error) throw error;
      const items = (data || []) as Reel[];
      const last = items[items.length - 1];
      const nextCursor = items.length === PAGE_SIZE && last
        ? { score: Number(last.trending_score), id: last.id }
        : null;
      return { items, nextCursor };
    },
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 30_000,
  });
}

/**
 * Lightweight hook for the Home page "featured reels" carousel.
 * Returns up to N most-engaging reels in the user's language (with English fallback).
 */
export function useFeaturedReels(limit: number = 8) {
  const { currentLanguage } = useLanguageStore();
  return useQuery({
    queryKey: ['reels-featured', currentLanguage, limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reels_videos')
        .select('*')
        .in('language_code', [currentLanguage, 'en'])
        .order('is_featured', { ascending: false })
        .order('trending_score', { ascending: false })
        .order('total_views', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data || []) as Reel[];
    },
    staleTime: 60_000,
  });
}

export function useReelCategories() {
  return useQuery({
    queryKey: ['reels-categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reels_categories')
        .select('id, slug, name_i18n, icon, color, sort_order')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data || []) as ReelCategory[];
    },
    staleTime: 5 * 60_000,
  });
}

/** Likes/saves the current farmer has on a list of reel ids */
export function useReelEngagementState(reelIds: string[]) {
  const { session } = useAuthStore();
  const farmerId = session?.farmerId;

  return useQuery({
    queryKey: ['reels-engagement-state', farmerId, reelIds.sort().join(',')],
    enabled: !!farmerId && reelIds.length > 0,
    queryFn: async () => {
      const [likes, saves] = await Promise.all([
        supabase.from('reels_likes').select('reel_id').eq('farmer_id', farmerId!).in('reel_id', reelIds),
        supabase.from('reels_saves').select('reel_id').eq('farmer_id', farmerId!).in('reel_id', reelIds),
      ]);
      return {
        liked: new Set((likes.data || []).map((r: { reel_id: string }) => r.reel_id)),
        saved: new Set((saves.data || []).map((r: { reel_id: string }) => r.reel_id)),
      };
    },
    staleTime: 30_000,
  });
}

export function useToggleReelLike() {
  const { session } = useAuthStore();
  const farmerId = session?.farmerId;
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ reelId, liked }: { reelId: string; liked: boolean }) => {
      if (!farmerId) throw new Error('Not signed in');
      if (liked) {
        const { error } = await supabase
          .from('reels_likes')
          .delete()
          .eq('reel_id', reelId)
          .eq('farmer_id', farmerId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('reels_likes')
          .insert({ reel_id: reelId, farmer_id: farmerId });
        if (error && !error.message.includes('duplicate')) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reels-engagement-state'] });
    },
  });
}

export function useToggleReelSave() {
  const { session } = useAuthStore();
  const farmerId = session?.farmerId;
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ reelId, saved }: { reelId: string; saved: boolean }) => {
      if (!farmerId) throw new Error('Not signed in');
      if (saved) {
        const { error } = await supabase
          .from('reels_saves')
          .delete()
          .eq('reel_id', reelId)
          .eq('farmer_id', farmerId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('reels_saves')
          .insert({ reel_id: reelId, farmer_id: farmerId });
        if (error && !error.message.includes('duplicate')) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reels-engagement-state'] });
      qc.invalidateQueries({ queryKey: ['reels-feed'] });
    },
  });
}

export function useRecordReelShare() {
  const { session } = useAuthStore();
  const farmerId = session?.farmerId;
  return useMutation({
    mutationFn: async ({ reelId, channel }: { reelId: string; channel: string }) => {
      if (!farmerId) return;
      await supabase.from('reels_shares').insert({ reel_id: reelId, farmer_id: farmerId, channel });
    },
  });
}

export function useReportReel() {
  const { session } = useAuthStore();
  const farmerId = session?.farmerId;
  return useMutation({
    mutationFn: async ({ reelId, reason, details }: { reelId: string; reason: string; details?: string }) => {
      if (!farmerId) throw new Error('Not signed in');
      const { error } = await supabase
        .from('reels_reports')
        .insert({ reel_id: reelId, farmer_id: farmerId, reason: reason as 'spam' | 'misinformation' | 'abuse' | 'copyright' | 'unsafe' | 'other', details });
      if (error && !error.message.includes('duplicate')) throw error;
    },
  });
}

export async function recordReelView(reelId: string, farmerId: string | undefined, watchedSeconds: number, completed: boolean) {
  try {
    // Atomic RPC – replaces the racy read-then-write counter.
    await supabase.rpc('reels_record_view', {
      _reel_id: reelId,
      _farmer_id: farmerId ?? null,
      _watched_seconds: Math.round(watchedSeconds * 100) / 100,
      _completed: completed,
    });
  } catch (e) {
    console.warn('[reels] record view failed', e);
  }
}
