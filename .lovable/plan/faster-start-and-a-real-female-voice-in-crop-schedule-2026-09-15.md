# Faster start and a real female voice in Crop Schedule

## What is happening today

**Slow start.** When the speaker icon is tapped, the app first asks the voice service which voices exist, then sends the first paragraph for synthesis and waits for the whole clip before any sound plays. Inside the service, every single request still tries Bhashini first (whose pipeline ID is rejected), then Google (whose text-to-speech is switched off in the Google project), and only then reaches the working backup voice. So each paragraph pays for two failing calls — including two Bhashini setup calls — before the farmer hears anything.

**Male voice.** When those calls take too long or fail, the reading falls back to the phone's own built-in voice, which on most handsets is male for Hindi/Marathi. The female backup voice only speaks when the online path actually succeeds.

## What will change

1. **Remember which voices are broken.** The service marks a provider as unusable for a while after it fails with a permanent error (bad pipeline, API switched off). After the first attempt, requests go straight to the working female backup voice. This alone removes most of the waiting.
2. **Start speaking sooner.** The app asks for the first paragraph and, while it plays, quietly prepares the next one, so there is no gap between paragraphs and the first sound arrives as fast as one request allows.
3. **Warm up in the background.** The "which voices exist" check runs once when the schedule screen opens, not on the tap, so the tap goes straight to speech.
4. **Never fall back to a male voice silently.** If the online female voice cannot be reached, the phone voice is chosen female-first (already in place) and, when only a male voice exists on the handset, the screen says the natural voice is unavailable rather than reading in a male voice by surprise.
5. **Keep the female, native-accent instruction** already set for the backup voice.

## Still needed from you (outside the code)

- A valid **Bhashini pipeline ID** — the saved one is rejected by Bhashini. Once added, Bhashini becomes first choice and quality improves further.
- **Enable Cloud Text-to-Speech** in Google Cloud project 344274070940, or Google stays skipped.

Neither is required for this fix; both simply add better voices.

## Technical notes

- `supabase/functions/text-to-speech/index.ts`: add an in-memory negative cache (vendor → cooldown until) set on permanent failures (Bhashini config 400, Google 403/404); skip cooling-down vendors in the synthesis loop; return the vendor actually used. Cooldown ~15 min, cleared on cold start.
- `src/services/tts/providers/cloudProvider.ts`: add `prefetch(chunk, language)` writing into the existing audio cache so the engine can pipeline.
- `src/services/tts/ttsEngine.ts`: after starting chunk *i*, kick off synthesis for chunk *i+1*; no change to the public API or to `offline_first` / `data_saver`.
- `src/components/schedule/FarmerTaskTimeline.tsx` and `CropScheduleView.tsx`: warm `cloudProvider.status()` on mount (fire and forget).
- No new secrets, no API keys in code, no change to text preparation or chunking.
