export function assert(c: unknown, msg = 'assertion failed'): asserts c { if (!c) throw new Error(msg); }
export function assertEquals(a: unknown, b: unknown, msg?: string) {
  const sa = JSON.stringify(a), sb = JSON.stringify(b);
  if (sa !== sb) throw new Error((msg ? msg + ': ' : '') + `expected ${sb}, got ${sa}`);
}
