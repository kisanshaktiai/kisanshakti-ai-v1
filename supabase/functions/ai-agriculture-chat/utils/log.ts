// LOG LEVEL GATE — performance only, no behavioural effect.
// LOG_LEVEL env: error | warn | info | debug | trace  (default: info)
// Hot-path / per-item diagnostics should use logDebug/logTrace so production
// runs do not pay the string-building + I/O cost for thousands of lines.

export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'trace';

const ORDER: Record<LogLevel, number> = {
  error: 0, warn: 1, info: 2, debug: 3, trace: 4,
};

function resolveLevel(): LogLevel {
  let raw = 'info';
  try {
    raw = (Deno.env.get('LOG_LEVEL') || 'info').toLowerCase();
  } catch {
    // env access unavailable — keep default
  }
  return (raw in ORDER ? raw : 'info') as LogLevel;
}

const CURRENT: LogLevel = resolveLevel();
const CURRENT_N = ORDER[CURRENT];

export function isEnabled(level: LogLevel): boolean {
  return ORDER[level] <= CURRENT_N;
}

export const logError = (...a: unknown[]) => { if (CURRENT_N >= 0) console.error(...a); };
export const logWarn  = (...a: unknown[]) => { if (CURRENT_N >= 1) console.warn(...a); };
export const logInfo  = (...a: unknown[]) => { if (CURRENT_N >= 2) console.log(...a); };
export const logDebug = (...a: unknown[]) => { if (CURRENT_N >= 3) console.log(...a); };
export const logTrace = (...a: unknown[]) => { if (CURRENT_N >= 4) console.log(...a); };

// Lazy variants: the message is only built when the level is active.
export const logDebugLazy = (fn: () => string) => { if (CURRENT_N >= 3) console.log(fn()); };
export const logTraceLazy = (fn: () => string) => { if (CURRENT_N >= 4) console.log(fn()); };

export const LOG_LEVEL = CURRENT;
