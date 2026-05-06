/**
 * Extracts a YouTube video ID from common URL shapes:
 *   - https://youtube.com/watch?v=ID
 *   - https://www.youtube.com/embed/ID
 *   - https://youtu.be/ID
 *   - https://www.youtube.com/shorts/ID
 */
export function getYouTubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null;
    if (u.hostname.endsWith('youtube.com')) {
      const v = u.searchParams.get('v');
      if (v) return v;
      const parts = u.pathname.split('/').filter(Boolean);
      const i = parts.findIndex(p => p === 'embed' || p === 'shorts' || p === 'v');
      if (i >= 0 && parts[i + 1]) return parts[i + 1];
    }
  } catch {
    /* not a URL */
  }
  return null;
}

export function isYouTubeUrl(url: string | null | undefined): boolean {
  return !!getYouTubeId(url);
}

/**
 * Build an embed URL with reels-friendly defaults.
 * autoplay & mute are required for browsers to auto-play.
 */
export function buildYouTubeEmbed(id: string, opts: { autoplay?: boolean; mute?: boolean; loop?: boolean } = {}) {
  const params = new URLSearchParams({
    autoplay: opts.autoplay ? '1' : '0',
    mute: opts.mute ? '1' : '0',
    controls: '0',
    modestbranding: '1',
    playsinline: '1',
    rel: '0',
    iv_load_policy: '3',
    loop: opts.loop ? '1' : '0',
    ...(opts.loop ? { playlist: id } : {}),
  });
  return `https://www.youtube.com/embed/${id}?${params.toString()}`;
}

/** YouTube thumbnail URL (no API key needed). */
export function youTubeThumb(id: string, quality: 'default' | 'hq' | 'maxres' = 'hq') {
  const map = { default: 'hqdefault', hq: 'hqdefault', maxres: 'maxresdefault' } as const;
  return `https://i.ytimg.com/vi/${id}/${map[quality]}.jpg`;
}
