# Home "Farming Reels" not showing — root cause and fix

## Root cause (confirmed)
1. The video service the home screen calls first (`youtube-channel-feed`) is **not deployed**. It returns `404 NOT_FOUND` (checked live); the browser logs it as "Failed to fetch".
2. The app then falls back to reading the channel's Shorts page through a free text-reader service. That service now gets YouTube's consent/shell page with no video links, so nothing is found.
3. The last fallback goes through public relay services for the channel feed. They either fail or get "not found" from YouTube.
4. All three sources come back empty, so the section is hidden on purpose. The code says: "If the feed is unavailable, the section hides itself". That's why the thumbnails that showed before are gone now.

The channel itself is fine. Its official feed returns 4 videos when checked directly (pnmSYco8yPU, GtcfVHuzcvY, u56UkYiB064, LDR_y9n7sc8).

## Fix
1. Deploy `youtube-channel-feed`. The code and config already exist, and `verify_jwt = false` stays as it is. The service reads YouTube's official feed on the server, so it doesn't need the unreliable relays.
2. In the server feed, use the Shorts link format (`/shorts/ID`) to match the app's own parser. Also read view counts from the feed.
3. In `useYouTubeChannelReels`, don't cache an empty result for 10 minutes. Retry once after a short delay so a temporary failure doesn't hide the section.
4. Check that the service returns the 4 videos, and that the home screen shows the thumbnails on a phone-sized screen.

## Not changing
- The card's look, the Reels page and the video table.
- The "official channel only" rule: no demo or made-up videos.
