# Read Aloud: fix the robotic voice and finish the Bhashini setup

## What the audit found (verified, not assumed)

1. **The phone's own voice is doing almost all the talking.** The speech engine only
   uses an online natural voice when a screen explicitly asks for "high quality", or
   when the phone has no voice for the language at all. No screen in the app asks for
   it, so Hindi/Marathi/English always play through the handset's built-in voice —
   that is the machine-like sound.

2. **The live voice service is running old code.** The version currently deployed
   answers with vendors `google` + `lovable` and does not recognise the newer
   `discover` action that exists in the project code. So the Bhashini work that was
   written was never actually deployed.

3. **Bhashini cannot start yet.** A live check of the deployed service shows Bhashini
   is not among the available vendors. Bhashini's pipeline needs three values; you have
   saved `BHASHINI_API_KEY`, `BHASHINI_USER_ID` and `BHASHINI_INFERENCE_KEY`, but
   **`BHASHINI_PIPELINE_ID` is missing** — without it the first Bhashini call (the
   pipeline config call) cannot be made at all.

4. The reading text preparation, chunking and number handling are sound; nothing there
   is causing the robotic sound. No changes needed.

## The fix (surgical)

**A. Natural voice becomes the default**
- In the speech engine, the default quality mode changes from `auto` to natural-voice-first:
  when the farmer is online and a cloud vendor is configured, the online voice speaks;
  offline or when no vendor is configured, the phone voice speaks exactly as it does today.
- No screen or hook signature changes. Existing `offline_first` / `data_saver` behaviour
  is untouched, and the existing cloud→device rescue on failure stays.
- Keep the per-phrase audio cache already in the cloud provider so repeated lines are not
  re-synthesised (saves data and cost).

**B. Bhashini goes live**
- Ask you to save `BHASHINI_PIPELINE_ID` through the secure secret form (no key ever goes
  into the code).
- Deploy the current `text-to-speech` function so the Bhashini path actually runs.
- Verify live with the `status` and `discover` actions: `bhashini` must appear in the vendor
  list, and the language list must come back from Bhashini itself. Then synthesise one Hindi
  and one Marathi line and confirm real audio and the vendor tag.
- If Bhashini rejects the credentials, the exact error is reported back to you and the app
  keeps speaking through Google's natural voice in the meantime — farmers never hit silence.

**C. Voice quality tuning**
- For Google, the natural "Chirp 3: HD" voices are already mapped per Indian language and are
  used ahead of the older robotic Wavenet ones; only languages with no HD voice fall back.
- Speaking rate stays at the setting the farmer chose; no artificial pause between paragraphs.

## Technical notes

- `src/services/tts/ttsEngine.ts`: `preferCloud` currently requires `mode === 'high_quality'`
  or an absent device locale. Change the default `QualityMode` to prefer cloud whenever
  `cloudAvailable` is true and the mode is not `offline_first` / `data_saver`.
- `supabase/functions/text-to-speech/index.ts` is already Bhashini-first; it needs deploying,
  plus `BHASHINI_PIPELINE_ID` in secrets. `BHASHINI_INFERENCE_KEY` is already read by the code.
- Verification via `status`, `discover`, and one `synthesize` call per language.

## Out of scope

No new TTS provider, no hardcoded keys, no changes to text preparation, chat, or UI layout.
