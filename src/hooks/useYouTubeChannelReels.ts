/**
 * useYouTubeChannelReels — fetches the latest videos from the official
 * KisanShakti AI YouTube channel (@kisanshaktiai) directly from the
 * public RSS feed. No API key, no edge function required.
 *
 * Resilience: tries multiple public CORS proxies in sequence so a single
 * proxy outage never blanks the Home "Farming Reels" section.
 */
import { useQuery } from '@tanstack/react-query';

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

// Official KisanShakti AI channel: https://www.youtube.com/@kisanshaktiai
const CHANNEL_ID = 'UCBCO3X-fNJ4g41KxeDZwG3w';
const FEED_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;

// Public CORS proxies — tried in order. All return raw upstream body.
const PROXIES: Array<(u: string) => string> = [
  (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
  (u) => `https://r.jina.ai/${u}`,
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
        video_url: `https://www.youtube.com/watch?v=${videoId}`,
        thumbnail_url: thumbnail,
        published_at: published,
        total_views: views,
        is_featured: false,
      } as YouTubeChannelVideo;
    })
    .filter((v): v is YouTubeChannelVideo => !!v);
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

export function useYouTubeChannelReels(limit = 8) {
  return useQuery({
    queryKey: ['youtube-channel-reels', CHANNEL_ID, limit],
    queryFn: async (): Promise<YouTubeChannelVideo[]> => {
      const xml = await fetchViaProxies();
      return parseFeed(xml).slice(0, limit);
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });
}
