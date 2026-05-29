/**
 * Sprint 6 — Centralized frontend telemetry / error reporting.
 *
 * Design notes:
 * - Fail-OPEN: any logging error is swallowed; never break user flows.
 * - Batches events into a small in-memory queue, flushes every 5s or when 10 events accumulate.
 * - Coalesces duplicate errors within a 10s window to avoid log floods.
 * - Uses anon Supabase client (INSERT-only RLS allows this).
 */
import { supabase } from '@/integrations/supabase/client';

type Severity = 'critical' | 'error' | 'warning' | 'info';
type EventType = 'error' | 'warning' | 'info' | 'perf' | 'health_check';

interface TelemetryEvent {
  event_type: EventType;
  source: string;
  severity: Severity;
  message: string;
  context?: Record<string, unknown>;
  tenant_id?: string | null;
  farmer_id?: string | null;
  user_agent?: string;
  url?: string;
}

const queue: TelemetryEvent[] = [];
const dedupe = new Map<string, number>();
const DEDUPE_WINDOW_MS = 10_000;
const FLUSH_INTERVAL_MS = 5_000;
const MAX_QUEUE = 10;
let flushTimer: ReturnType<typeof setInterval> | null = null;
let initialized = false;

function shouldDrop(key: string): boolean {
  const now = Date.now();
  // prune old
  for (const [k, t] of dedupe) if (now - t > DEDUPE_WINDOW_MS) dedupe.delete(k);
  if (dedupe.has(key)) return true;
  dedupe.set(key, now);
  return false;
}

async function flush() {
  if (queue.length === 0) return;
  const batch = queue.splice(0, queue.length);
  try {
    // Best-effort; ignore network / RLS errors silently
    await supabase.from('system_health_events').insert(batch as never);
  } catch {
    /* swallow */
  }
}

export function initObservability() {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;

  // Periodic flush
  flushTimer = setInterval(flush, FLUSH_INTERVAL_MS);

  // Flush on tab hide / unload using sendBeacon-like behaviour
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flush();
  });
}

export function reportEvent(evt: Omit<TelemetryEvent, 'user_agent' | 'url'>) {
  try {
    const key = `${evt.source}:${evt.severity}:${evt.message?.slice(0, 120)}`;
    if (shouldDrop(key)) return;

    queue.push({
      ...evt,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      url: typeof location !== 'undefined' ? location.href : undefined,
    });

    if (queue.length >= MAX_QUEUE) void flush();
  } catch {
    /* never throw from telemetry */
  }
}

export function reportError(
  err: unknown,
  context: { source?: string; severity?: Severity; extra?: Record<string, unknown> } = {},
) {
  const e = err instanceof Error ? err : new Error(String(err));
  reportEvent({
    event_type: 'error',
    source: context.source ?? 'frontend',
    severity: context.severity ?? 'error',
    message: e.message || 'unknown error',
    context: {
      stack: e.stack?.split('\n').slice(0, 8).join('\n'),
      ...context.extra,
    },
  });
}

export function shutdownObservability() {
  if (flushTimer) clearInterval(flushTimer);
  flushTimer = null;
  void flush();
}

/**
 * Production health probe — calls system_health_snapshot RPC.
 */
export async function probeHealth(): Promise<{
  ok: boolean;
  latencyMs: number;
  snapshot?: unknown;
  error?: string;
}> {
  const start = Date.now();
  try {
    const { data, error } = await supabase.rpc('system_health_snapshot' as never);
    if (error) throw error;
    return { ok: true, latencyMs: Date.now() - start, snapshot: data };
  } catch (e) {
    return { ok: false, latencyMs: Date.now() - start, error: String((e as Error)?.message ?? e) };
  }
}
