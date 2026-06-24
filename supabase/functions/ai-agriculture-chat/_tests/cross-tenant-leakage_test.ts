/**
 * Cross-tenant leakage regression tests for RequestScope.
 *
 * Validates the core invariant that every request gets its own isolated
 * mutable state container — protecting the warm-isolate runtime against
 * Tenant A's clarification answers bleeding into Tenant B's request.
 */

import { assertEquals, assertNotEquals } from 'jsr:@std/assert@1';
import { createClient } from 'npm:@supabase/supabase-js@2.57.2';
import { createRequestScope } from '../runtime/request-scope.ts';

// Stub DB client so the test does not need real Supabase env vars.
// `createClient` with bogus URL/key still returns a usable client object
// because it only validates on actual network calls.
const stubDb = createClient('http://localhost:54321', 'anon-stub-key', {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.test('two scopes have separate clarification sets', () => {
  const a = createRequestScope({
    tenantId: 'A', farmerId: 'fa', sessionId: 'sa', turnId: 'ta', db: stubDb,
  });
  const b = createRequestScope({
    tenantId: 'B', farmerId: 'fb', sessionId: 'sb', turnId: 'tb', db: stubDb,
  });
  a.answeredClarifications.add('CROP_IDENTITY');
  assertEquals(a.answeredClarifications.has('CROP_IDENTITY'), true);
  assertEquals(b.answeredClarifications.has('CROP_IDENTITY'), false);
  assertNotEquals(a.traceId, b.traceId);
});

Deno.test('1000 interleaved scopes stay isolated', () => {
  const scopes = Array.from({ length: 1000 }, (_, i) =>
    createRequestScope({
      tenantId: `t_${i % 17}`,
      farmerId: `f_${i}`,
      sessionId: `s_${i}`,
      turnId: `turn_${i}`,
      db: stubDb,
    })
  );
  scopes.forEach((s, i) => s.answeredClarifications.add(`clar_${i}`));
  scopes.forEach((s, i) => {
    assertEquals(s.answeredClarifications.size, 1);
    assertEquals(s.answeredClarifications.has(`clar_${i}`), true);
  });
});

Deno.test('authoritativeContext mutation does not leak across scopes', () => {
  const a = createRequestScope({
    tenantId: 'A', farmerId: 'fa', sessionId: 'sa', turnId: 'ta', db: stubDb,
  });
  const b = createRequestScope({
    tenantId: 'B', farmerId: 'fb', sessionId: 'sb', turnId: 'tb', db: stubDb,
  });
  a.authoritativeContext = {
    land_id: 'land-A',
    crop_code: 'SUGARCANE',
    growth_stage: 'TILLERING',
    days_since_sowing: 90,
    source: 'CROP_SCHEDULE',
    locked_at: Date.now(),
  };
  assertEquals(a.authoritativeContext?.crop_code, 'SUGARCANE');
  assertEquals(b.authoritativeContext, null);
});

Deno.test('emit() stamps ts and traceId on every event', () => {
  const s = createRequestScope({
    tenantId: 'T', farmerId: 'F', sessionId: 'S', turnId: 'U', db: stubDb,
  });
  s.emit({ stage: 'test', kind: 'derive', payload: { ok: true } });
  assertEquals(s.events.length, 1);
  assertEquals(s.events[0].traceId, s.traceId);
  assertEquals(typeof s.events[0].ts, 'number');
  assertEquals(s.events[0].stage, 'test');
});
