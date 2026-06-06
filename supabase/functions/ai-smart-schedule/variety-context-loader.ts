// ═══════════════════════════════════════════════════════════════════════
// BACKWARD-COMPAT SHIM
// ───────────────────────────────────────────────────────────────────────
// Canonical loader now lives in `_shared/variety-context.ts` so every
// edge function (chat, schedule, proactive, schedules-api) can import the
// same SSOT. This file is kept as a thin re-export so existing imports
// continue to work without changes.
// ═══════════════════════════════════════════════════════════════════════

export {
  loadVarietyProfile,
  formatVarietyProfileForPrompt,
  type VarietyProfile,
} from "../_shared/variety-context.ts";
