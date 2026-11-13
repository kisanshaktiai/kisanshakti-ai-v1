// Minimal read-only Supabase stand-in for replaying the generator against a fixture.
// Supports the filters the generator uses: eq, neq, in, is, not(...,'is',null), ilike (with % wildcards),
// order, limit, maybeSingle, single, rpc. `.or()` is accepted and ignored: fixtures are pre-scoped.
type Row = Record<string, unknown>;
function like(value: unknown, pattern: string): boolean {
  const re = new RegExp(`^${pattern.split("%").map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`, "i");
  return re.test(String(value ?? ""));
}
class Query {
  private filters: Array<(r: Row) => boolean> = [];
  private lim: number | null = null;
  constructor(private rows: Row[]) {}
  select() { return this; }
  eq(c: string, v: unknown) { this.filters.push((r) => r[c] === v); return this; }
  neq(c: string, v: unknown) { this.filters.push((r) => r[c] !== v); return this; }
  in(c: string, vs: unknown[]) { this.filters.push((r) => vs.includes(r[c])); return this; }
  is(c: string, v: unknown) { this.filters.push((r) => (r[c] ?? null) === v); return this; }
  not(c: string, op: string, v: unknown) { if (op === "is") this.filters.push((r) => (r[c] ?? null) !== v); return this; }
  ilike(c: string, p: string) { this.filters.push((r) => like(r[c], p)); return this; }
  gte(c: string, v: number) { this.filters.push((r) => Number(r[c]) >= v); return this; }
  lte(c: string, v: number) { this.filters.push((r) => Number(r[c]) <= v); return this; }
  or() { return this; }
  order() { return this; }
  limit(n: number) { this.lim = n; return this; }
  private run(): Row[] { const out = this.rows.filter((r) => this.filters.every((f) => f(r))); return this.lim != null ? out.slice(0, this.lim) : out; }
  maybeSingle() { return Promise.resolve({ data: this.run()[0] ?? null, error: null }); }
  single() { return Promise.resolve({ data: this.run()[0] ?? null, error: null }); }
  then<T>(ok: (v: { data: Row[]; error: null }) => T, bad?: (e: unknown) => T) { return Promise.resolve({ data: this.run(), error: null }).then(ok, bad); }
}
export function fakeSupabase(fx: { tables: Record<string, readonly unknown[]>; rpc: Record<string, unknown> }) {
  return {
    from: (t: string) => new Query(((fx.tables[t] ?? []) as Row[]).map((r) => ({ ...r }))),
    rpc: (name: string) => Promise.resolve({ data: fx.rpc[name] ?? null, error: null }),
  } as unknown;
}
