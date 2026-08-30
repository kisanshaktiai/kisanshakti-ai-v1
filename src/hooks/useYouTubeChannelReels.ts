/**
 * useYouTubeChannelReels — official KisanShakti AI Shorts only.
 * Source of truth: https://www.youtube.com/@kisanshaktiai/shorts
 * No demo table fallback, no curated hardcoded videos, no API key required.
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

// Official KisanShakti AI channel: https://www.youtube.com/@kisanshaktiai/shorts
const CHANNEL_ID = 'UCBCO3X-fNJ4g41KxeDZwG3w';
const SHORTS_URL = 'https://www.youtube.com/@kisanshaktiai/shorts';
const FEED_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;
const JINA_SHORTS_URL = 'https://r.jina.ai/http://www.youtube.com/@kisanshaktiai/shorts';

// Public CORS proxies — tried in order. All return raw upstream body.
const PROXIES: Array<(u: string) => string> = [
  (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
  (u) => `https://r.jina.ai/http://${u.replace(/^https?:\/\//, '')}`,
];

function pick(re: RegExp, src: string): string {
  const m = src.match(re);
  return m ? m[1] : '';
}

function parseFeed(xml: string): YouTubeChannelVideo[] {
  const entries = xml.split('<entry>').slice(1);
  return entries
    .map((raw) => {
      const block = raw.split('</entry>')[0];
      const videoId = pick(/<yt:videoId>([^<]+)<\/yt:videoId>/, block);
      if (!videoId) return null;
      const title = pick(/<title>([\s\S]*?)<\/title>/, block).trim();
      const description = pick(/<media:description>([\s\S]*?)<\/media:description>/, block).trim();
      const published = pick(/<published>([^<]+)<\/published>/, block);
      const views = Number(pick(/<media:statistics\s+views="(\d+)"/, block) || '0');
      const thumbnail =
        pick(/<media:thumbnail\s+url="([^"]+)"/, block) ||
        `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
      return {
        id: videoId,
        video_id: videoId,
        title,
        description,
        video_url: `https://www.youtube.com/shorts/${videoId}`,
        thumbnail_url: thumbnail,
        published_at: published,
        total_views: views,
        is_featured: false,
      } as YouTubeChannelVideo;
    })
    .filter((v): v is YouTubeChannelVideo => !!v);
}

function parseShortsMarkdown(markdown: string): YouTubeChannelVideo[] {
  const seen = new Set<string>();
  const videos: YouTubeChannelVideo[] = [];
  const itemRe = /!\[[^\]]*\]\((https?:\/\/i\.ytimg\.com\/vi\/([A-Za-z0-9_-]{11})\/[^)\s]+)[^)]*\)\]\(https?:\/\/www\.youtube\.com\/shorts\/\2\)[\s\S]*?### \[([^\]]+)\]\(https?:\/\/www\.youtube\.com\/shorts\/\2/g;
  let match: RegExpExecArray | null;
  while ((match = itemRe.exec(markdown)) !== null) {
    const [, thumbnail, videoId, rawTitle] = match;
    if (seen.has(videoId)) continue;
    seen.add(videoId);
    videos.push({
      id: videoId,
      video_id: videoId,
      title: rawTitle.trim(),
      description: rawTitle.trim(),
      video_url: `https://www.youtube.com/shorts/${videoId}`,
      thumbnail_url: thumbnail.replace(/^http:\/\//, 'https://'),
      published_at: new Date().toISOString(),
      total_views: 0,
      is_featured: false,
    });
  }

  // Defensive fallback for minor YouTube/Jina markdown changes.
  const idRe = /youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/g;
  while ((match = idRe.exec(markdown)) !== null) {
    const videoId = match[1];
    if (seen.has(videoId)) continue;
    seen.add(videoId);
    videos.push({
      id: videoId,
      video_id: videoId,
      title: 'KisanShakti AI Shorts',
      description: '',
      video_url: `https://www.youtube.com/shorts/${videoId}`,
      thumbnail_url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      published_at: new Date().toISOString(),
      total_views: 0,
      is_featured: false,
    });
  }
  return videos;
}

async function fetchViaProxies(): Promise<string> {
  let lastErr: unknown = null;
  for (const wrap of PROXIES) {
    try {
      const res = await fetch(wrap(FEED_URL), {
        method: 'GET',
        headers: { Accept: 'application/atom+xml, application/xml, text/xml, */*' },
      });
      if (!res.ok) {
        lastErr = new Error(`proxy ${res.status}`);
        continue;
      }
      const text = await res.text();
      if (text.includes('<entry>')) return text;
      lastErr = new Error('empty feed');
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('all proxies failed');
}

async function fetchViaEdgeFunction(): Promise<YouTubeChannelVideo[]> {
  const { data, error } = await supabase.functions.invoke('youtube-channel-feed');
  if (error) throw error;
  const videos = (data as { videos?: YouTubeChannelVideo[] } | null)?.videos ?? [];
  return videos;
}

async function fetchOfficialShorts(): Promise<YouTubeChannelVideo[]> {
  // 1) Server-side proxy (cached, no third-party CORS proxy dependency).
  try {
    const viaEdge = await fetchViaEdgeFunction();
    if (viaEdge.length > 0) return viaEdge;
  } catch {
    // fall through to client-side sources
  }

  try {
    const res = await fetch(JINA_SHORTS_URL, { method: 'GET', headers: { Accept: 'text/markdown, text/plain, */*' } });
    if (res.ok) {
      const text = await res.text();
      const shorts = parseShortsMarkdown(text);
      if (shorts.length > 0) return shorts;
    }
  } catch {
    // Fall through to official RSS. Never fall back to app demo database data.
  }

  const xml = await fetchViaProxies();
  return parseFeed(xml);
}


export function useYouTubeChannelReels(limit = 8) {
  return useQuery({
    queryKey: ['youtube-channel-shorts', SHORTS_URL, limit, 'official-v2'],
    queryFn: async (): Promise<YouTubeChannelVideo[]> => {
      const videos = await fetchOfficialShorts();
      return videos.slice(0, limit);
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });
}
