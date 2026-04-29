# Ask AI from Proactive Alerts → Land-Scoped, AI-Generated, Multilingual Question

## Problem (recap)

Tapping **Ask AI** on a proactive alert card today:
1. Always opens **General Chat** (ignores `alert.land_id`).
2. Sends a static templated string ("Tell me more about {category} on {land}") — not a real, actionable farmer question.
3. Does not guarantee a fresh session — may append to an old, unrelated conversation.
4. Language coverage is hard-coded to en/hi/mr; ignores other supported languages.

## Goal (2030-Ready)

When a farmer taps **Ask AI** on a proactive alert:
- Open the **AI Chat for that exact land** (not general).
- The AI itself **generates a smart, farmer-friendly question** seeded from the alert's content (title, message, category, evidence, decision_reasoning, trigger_data) — in the farmer's working language.
- A **new chat session starts** so the conversation begins clean, with the alert as authoritative context.
- The composer is prefilled with that AI-generated question; farmer reviews, edits if they want, then sends (or taps "Send" with one tap).

---

## Architecture

```text
ProactiveAlerts card
        │ tap "Ask AI"
        ▼
handleAskAI(alert)
        │  • guarantees alert.land_id is propagated
        │  • opens fresh session for that land
        ▼
navigate(`/app/chat?landId=…&fromAlert=…&seedSession=new`)
        ▼
EnhancedAIChatInterface  (reads URL params)
        │  • setActiveTab(landId) once lands list contains it
        │  • forces NEW session (skips loading old messages)
        │  • calls edge fn `proactive-question-seed`
        ▼
Edge: proactive-question-seed
        │  • loads alert by id (RLS-safe, tenant+farmer scoped)
        │  • loads farmer language from profile (SSOT)
        │  • Decision-Brain-first: build question from rule metadata
        │  • LLM = NARRATION ONLY (translate + simplify, no agronomy)
        │  • returns { question, language, sessionHint }
        ▼
Chat composer prefilled, focused, one-tap Send
```

Follows existing memory rules:
- `architecture/symbolic-engine-strict-invariants` — agronomy from DB only; LLM only narrates.
- `architecture/canonical-language-governance` — language locked from farmer profile.
- `architecture/proactive-alerts-realtime-singleton-contract` — no new realtime channels.

---

## Implementation Plan

### 1. `src/pages/ProactiveAlerts.tsx` — pass land + alert id, force new session

Replace `handleAskAI` (lines ~68–78):

```ts
const handleAskAI = (alert: ProactiveAlert) => {
  const params = new URLSearchParams({
    fromAlert: alert.id,
    seedSession: 'new',
  });
  if (alert.land_id) params.set('landId', alert.land_id);
  navigate(`/app/chat?${params.toString()}`);
};
```

No client-side template strings anymore — the AI builds the question.

### 2. `src/components/chat/EnhancedAIChatInterface.tsx` — consume params + new session

- Add `useSearchParams` from `react-router-dom`.
- New `useEffect` (runs once `lands` loaded):
  1. Read `landId`, `fromAlert`, `seedSession`.
  2. If `landId` exists in `lands` → `setActiveTab(landId)`. Otherwise toast "Land not found, opening general chat" and stay on `general` (multi-tenant safety).
  3. If `seedSession === 'new'` → start a fresh session for that land (clear `sessionIds[landId]`, `messages[landId] = []`, `loadedSessionIds.delete(landId)`).
  4. If `fromAlert` is present → call edge function `proactive-question-seed` with `{ alertId, landId, language }`; on success, set `inputValue` with returned question and auto-focus composer. Show a small "Generated from your alert" chip above composer.
  5. `setSearchParams({}, { replace: true })` so a refresh doesn't replay.
- Do NOT auto-send. Farmer reviews → taps Send. (Reason: rural connectivity + farmer's right to edit.)

### 3. New edge function `supabase/functions/proactive-question-seed/index.ts`

Responsibilities:
- Validate JWT, enforce tenant + farmer isolation.
- Load `proactive_alerts` row by `alertId` (must match `farmer_id`).
- Load farmer language from `farmers.preferred_language` (fallback to alert's localized fields).
- Build the question deterministically from Decision Brain data (no LLM agronomy):
  - `alert_category`, `priority`, `decision_reasoning`, `trigger_data` (weather, NDVI, growth stage, crop, land name).
- Pass that structured context to the LLM with strict instruction:
  > "You are a NARRATOR. Convert the agronomic facts below into ONE short, simple, conversational question (max 18 words) a rural Indian farmer would naturally ask their advisor. Output ONLY the question in `{language}` script. No greetings, no explanations, no English fallback."
- Validate LLM output (script ratio, length, single sentence, ends with `?` / `?` / Devanagari `?` equivalent).
- Return `{ question: string, language: string, alertSnapshot: {...} }`.
- Cache by `alertId + language` for 24h (alerts are immutable post-creation) → instant on repeat taps.

Example output (Marathi alert about Shoot Borer on "मधले शेत"):
> "मधले शेत मधील ऊसावर शेंडा पोखर किडीचा प्रादुर्भाव कसा थांबवू?"

Example (English, NDVI stress on "North Plot"):
> "North Plot looks weak on satellite — what should I do today to recover it?"

### 4. Multilingual coverage

Use the farmer's `preferred_language` (already canonical SSOT in profiles). Supported: en, hi, mr, pa, ta, te, kn, gu, bn, or, ml — same set as `src/i18n/locales/`. The edge function passes the language to the LLM and validates the script ratio per `architecture/multilingual-symbolic-governance-v3`. If validation fails, fall back to a deterministic DB-built question in the alert's localized title.

### 5. New-session enforcement

In `EnhancedAIChatInterface`:
- Add a helper `startFreshLandSession(landId)` that:
  - Clears in-memory state for that land tab.
  - Inserts a new row in `ai_chat_sessions` with `session_type: 'land_specific'`, `session_title: 'From Alert: <category>'`, `metadata: { source: 'proactive_alert', alert_id }`.
  - Stores it in `sessionIds[landId]`.
- This guarantees the alert-driven conversation is never mixed with prior land chat history (clean audit trail + better LLM context window).

---

## Files Touched

| File | Change |
|---|---|
| `src/pages/ProactiveAlerts.tsx` | Replace `handleAskAI` to pass `landId` + `fromAlert` + `seedSession=new` |
| `src/components/chat/EnhancedAIChatInterface.tsx` | URL param consumption, fresh-session helper, seed-question fetch, prefill |
| `supabase/functions/proactive-question-seed/index.ts` | NEW edge function (DB-first, LLM-narration-only, multilingual) |
| `supabase/config.toml` | Register new function (`verify_jwt = true`) |

No DB schema changes required. (Optional: add a partial index `ai_chat_sessions(metadata->>'alert_id')` later if alert-traceability becomes a frequent query — not in this phase.)

---

## 2030-Ready Innovations (recommendations for rural Indian farmers)

Pick any combo — happy to scope into follow-up phases:

1. **One-tap voice question.** Beside the prefilled text, show a glowing mic. Farmer can press once and the AI-generated question is *spoken aloud* in their dialect via TTS, then the farmer can press-and-hold to reply by voice (STT → same chat). Zero typing required for non-literate users.

2. **Visual evidence carousel.** The seeded message in the chat shows the alert's evidence as small chips: 🌡 32°C · 💧 78% · 🛰 NDVI 0.41 · 📅 90-day stage. Tappable — each chip expands into a one-line rural-language explanation. Farmer instantly *sees why* the AI is asking.

3. **WhatsApp / SMS bridge.** A "Continue on WhatsApp" button on the seeded question — opens WhatsApp with the same question + a deep-link back into the app. Critical for farmers who lose data connectivity in the field.

4. **Offline question seeding.** Cache the last 20 alerts + their AI-generated questions in IndexedDB. When farmer taps "Ask AI" offline, the prefilled question appears immediately; the actual chat reply is queued and delivered when online (already aligns with `chat-sync-service` retry queue).

5. **Family / agronomist co-pilot.** Long-press "Ask AI" → "Ask together" — opens the same seeded question in a 3-way chat with the farmer's son/daughter or village agronomist (uses existing `group_chat_messages` table). Decisions on chemicals/spend get a second pair of eyes — directly addresses the agronomic-safety memory.

6. **Hyper-local proof.** Below the seeded question, a small line: *"3 farmers near you acted on this alert in the last 24h."* Anonymous, opt-in, builds trust. Pulls from `proactive_alerts.status = 'ACTED'` aggregated by `pin_code`.

7. **Spoken alert preview before chat opens.** Tapping "Ask AI" first plays a 3-second TTS of the question in the farmer's language, *then* opens the chat. Reinforces understanding for low-literacy users.

8. **"Why this question?" ghost-text.** Sub-text under the prefilled composer: *"This question was made from your North Plot alert (NDVI 0.41, no rain 6 days)."* Total transparency — farmer always knows the AI is grounded in *their* field, not generic advice.

My top picks for **Phase 1 next**: #1 (voice), #2 (evidence chips), #8 (transparency). They are the highest-leverage for rural literacy + trust and reuse infrastructure that already exists.

---

## Open Questions

1. **Auto-send vs review-and-send?** Default = review (farmer taps Send). Confirm.
2. **Which 2030 innovations** (1–8 above) should I bundle into this phase vs follow-ups? Default = none in this phase, ship the core fix first.
3. **Cache TTL for the seed question** — 24h ok, or longer? Default = 24h.
