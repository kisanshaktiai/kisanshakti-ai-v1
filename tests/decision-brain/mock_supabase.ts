// Minimal PostgREST-like query builder over a JSON fixture. Supports the chain
// used by context-rule-selector / symbolic-reasoner / rule-repository:
// from().select().eq().neq().in().is().or().order().limit().range().maybeSingle()
export function makeMockSupabase(fixture: Record<string, any[]>) {
  const log: string[] = [];
  function parseOr(expr: string): ((r: any) => boolean)[] {
    // PostgREST `or=(a.eq.true,b.in.(x,y))` — split on top-level commas only
    // (commas inside `in.(...)` lists are not separators). `and(...)`/nested
    // `or(...)` groups are NOT modelled: any expression using them throws so a
    // test can never pass on an unmodelled operator.
    if (/\b(and|or)\(/.test(expr)) throw new Error(`mock .or(): nested and()/or() not modelled: ${expr}`);
    const parts: string[] = [];
    let depth = 0, cur = '';
    for (const ch of expr) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) { parts.push(cur.trim()); cur = ''; } else cur += ch;
    }
    if (cur.trim()) parts.push(cur.trim());
    return parts.map((p) => {
      const m = p.match(/^([a-zA-Z_]+)\.(eq|neq|is|in)\.(.*)$/);
      if (!m) throw new Error(`mock .or(): unmodelled predicate "${p}"`);
      const [, col, op, raw] = m;
      const val = raw === 'true' ? true : raw === 'false' ? false : raw === 'null' ? null : raw;
      if (op === 'eq') return (r) => r[col] === val;
      if (op === 'neq') return (r) => r[col] !== val;
      if (op === 'is') return (r) => (r[col] ?? null) === val;
      if (op === 'in') {
        const list = raw.replace(/^\(|\)$/g, '').split(',').map((s) => s.trim());
        return (r) => list.includes(String(r[col]));
      }
      return () => false;
    });
  }
  class Q {
    rows: any[]; filters: ((r: any) => boolean)[] = []; _head = false; _count = false;
    _order: [string, boolean] | null = null; _limit: number | null = null; _range: [number, number] | null = null;
    _single = false;
    constructor(public table: string) { this.rows = fixture[table] ?? []; log.push(table); }
    select(_cols?: string, opts?: any) { if (opts?.head) this._head = true; if (opts?.count) this._count = true; return this; }
    eq(c: string, v: any) { this.filters.push((r) => r[c] === v); return this; }
    neq(c: string, v: any) { this.filters.push((r) => r[c] !== v); return this; }
    is(c: string, v: any) { this.filters.push((r) => (r[c] ?? null) === v); return this; }
    in(c: string, list: any[]) { const s = new Set(list.map(String)); this.filters.push((r) => s.has(String(r[c]))); return this; }
    or(expr: string) { const ps = parseOr(expr); this.filters.push((r) => ps.some((p) => p(r))); return this; }
    order(c: string, o?: any) { this._order = [c, o?.ascending !== false]; return this; }
    limit(n: number) { this._limit = n; return this; }
    range(a: number, b: number) { this._range = [a, b]; return this; }
    maybeSingle() { this._single = true; return this; }
    single() { this._single = true; return this; }
    exec() {
      let out = this.rows.filter((r) => this.filters.every((f) => f(r)));
      if (this._order) { const [c, asc] = this._order; out = [...out].sort((a, b) => (a[c] > b[c] ? 1 : a[c] < b[c] ? -1 : 0) * (asc ? 1 : -1)); }
      if (this._range) out = out.slice(this._range[0], this._range[1] + 1);
      if (this._limit != null) out = out.slice(0, this._limit);
      const count = this._count ? out.length : null;
      if (this._head) return { data: null, error: null, count };
      if (this._single) return { data: out[0] ?? null, error: null, count };
      return { data: out.map((r) => ({ ...r })), error: null, count };
    }
    then(res: any, rej?: any) { return Promise.resolve(this.exec()).then(res, rej); }
  }
  return { client: { from: (t: string) => new Q(t) }, log };
}
