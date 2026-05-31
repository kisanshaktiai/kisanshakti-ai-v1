## Audit findings

1. **General tab request is still reaching symbolic brain in the live app**
   - The network trace from the attached screenshot shows `mode: "general"` was sent, but the response came back as:
     - `metadata.type: "clarification"`
     - `orchestrator_type: "CLARIFICATION_QUESTION"`
     - `source: "orchestrator_v1"`
   - That proves the deployed/current runtime path did not use the direct General LLM handler for that request.

2. **Root cause of repeated land selection**
   - In `EnhancedAIChatInterface.tsx`, `setGeneralLandId(picked)` is asynchronous.
   - Immediately after selection, code calls `sendMessage(queued)` in `setTimeout`.
   - React may not have committed `generalLandId` yet, so `sendMessage()` still sees `generalLandId === undefined` and opens the picker again.

3. **Root cause of raw i18n key in the green tab card**
   - `t('chat.general')` conflicts with two shapes:
     - base bundle: `chat.general` is a string
     - lazy chat bundle: `chat.general` is an object containing picker keys
   - After lazy loading, `t('chat.general')` returns an object, causing the visible error: `key 'chat.general (mr)' returned an object instead of string`.

4. **General history pollution is worsening the bug**
   - The request body includes older symbolic clarification messages in General chat history.
   - Even after routing is fixed, those old clarification messages can bias General LLM responses unless filtered for General mode.

## Implementation plan

### Phase 1: Fix General land-picker state race
- Add a local send helper for General tab that accepts the selected land id explicitly, instead of depending on delayed React state.
- When the farmer selects a land:
  - close picker
  - store selected land id
  - send the queued message once using that selected id
- Add a small guard so the same queued message cannot be resumed twice.

### Phase 2: Make General tab routing unambiguous
- In the frontend request body for General mode:
  - always send `mode: "general"`
  - keep `landId` absent/null for routing
  - send selected land only inside `metadata.landContext`
  - add a stricter marker such as `metadata.orchestratorBypass: true`
- In the Edge Function, move/keep the General short-circuit before any symbolic/session/proactive logic that can return clarification.
- Treat any of these as General mode:
  - `mode === "general"`
  - `metadata.chatMode === "general"`
  - `metadata.source === "general_tab"`
  - `metadata.orchestratorBypass === true`

### Phase 3: Prevent symbolic cards from rendering in General tab
- For General responses, create the frontend AI message as normal text, not `messageType: "orchestrator"`.
- Do not attach `clarificationOptions`, `structuredAdvisory`, or Decision Brain metadata for `GENERAL_LLM_DIRECT` responses.
- If an old General response from history has `CLARIFICATION_QUESTION`/symbolic metadata, display it as plain historical text only, not interactive symbolic cards.

### Phase 4: Fix General tab i18n key collision
- Replace `t('chat.general')` in the General tab button with `t('chat.tabs.general')` or `t('chat.generalChat')`.
- Keep picker keys under `chat.general.*` unchanged.
- Ensure Marathi/Hindi/English labels resolve as strings.

### Phase 5: Filter General LLM conversation history
- Before sending General mode to the Edge Function, remove previous symbolic clarification messages from the history payload.
- In `general-chat-handler.ts`, also ignore history entries whose content or metadata indicates symbolic clarification/options.
- This keeps General tab as direct agronomist chat while land-specific tabs continue using the symbolic decision brain.

### Validation
- Verify a General Marathi query like `हिरवी मिरची पिक घ्यायच आहे काय करावे?` returns a direct senior-agronomist answer, not plant-part options.
- Verify selecting a land opens the picker only once and then sends immediately.
- Verify land-specific tabs still show symbolic clarification/Decision Brain cards as before.
- Verify the green General tab label no longer shows raw i18n-key/object errors.