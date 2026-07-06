/**
 * Request-scoped in-memory cache for graph loaders.
 * Never cross requests — pass a fresh instance per invocation.
 * Node-type-only: keys are opaque strings, values are `unknown`.
 */
export class RequestCache {
  private store = new Map<string, unknown>();

  get<T>(key: string): T | undefined {
    return this.store.get(key) as T | undefined;
  }

  set<T>(key: string, value: T): T {
    this.store.set(key, value);
    return value;
  }

  async memo<T>(key: string, produce: () => Promise<T>): Promise<T> {
    const hit = this.get<T>(key);
    if (hit !== undefined) return hit;
    const val = await produce();
    this.set(key, val);
    return val;
  }

  size(): number { return this.store.size; }
  clear(): void { this.store.clear(); }
}

export function makeRequestCache(): RequestCache {
  return new RequestCache();
}
