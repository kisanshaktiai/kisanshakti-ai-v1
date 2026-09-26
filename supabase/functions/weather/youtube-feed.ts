// Official KisanShakti AI channel feed, served via the weather function
// (youtube-channel-feed deployment is stuck on the platform).
const CHANNEL_ID = "UCBCO3X-fNJ4g41KxeDZwG3w"; // @kisanshaktiai
const FEED_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;

// In-memory cache (per edge-function instance) — 15 min TTL.
let cache: { at: number; payload: unknown } | null = null;
const TTL_MS = 15 * 60 * 1000;

interface YTVideo {
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

function pick(re: RegExp, src: string): string {
  const m = src.match(re);
  return m ? m[1] : "";
}

function parseFeed(xml: string): YTVideo[] {
  const entries = xml.split("<entry>").slice(1);
  return entries.map((raw) => {
    const block = raw.split("</entry>")[0];
    const videoId = pick(/<yt:videoId>([^<]+)<\/yt:videoId>/, block);
    const title = pick(/<title>([\s\S]*?)<\/title>/, block).trim();
    const description = pick(/<media:description>([\s\S]*?)<\/media:description>/, block).trim();
    const published = pick(/<published>([^<]+)<\/published>/, block);
    const thumbnail = pick(/<media:thumbnail url="([^"]+)"/, block) ||
      `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    const views = Number(pick(/<media:statistics\s+views="(\d+)"/, block) || "0");
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
    } as YTVideo;
  }).filter((v) => v.video_id);
}

export async function getYouTubeChannelFeed(): Promise<unknown> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache.payload;
  const res = await fetch(FEED_URL, { headers: { "User-Agent": "Mozilla/5.0 KisanShaktiAI" } });
  if (!res.ok) throw new Error(`Upstream ${res.status}`);
  const videos = parseFeed(await res.text()).slice(0, 12);
  const payload = { channel: "kisanshaktiai", channel_url: "https://www.youtube.com/@kisanshaktiai", videos, fetched_at: new Date().toISOString() };
  if (videos.length > 0) cache = { at: now, payload };
  return payload;
}
