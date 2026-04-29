/**
 * Lightweight in-memory TTL cache for server-side use.
 * Entries expire after `ttlMs` milliseconds and are evicted lazily on next access.
 * Designed for caching expensive Extensiv API responses (e.g., full inventory fetches).
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class TtlCache<T> {
  private store = new Map<string, CacheEntry<T>>();

  constructor(private readonly ttlMs: number) {}

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T): void {
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  /** Remove all expired entries (optional housekeeping) */
  evictExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) this.store.delete(key);
    }
  }

  get size(): number {
    return this.store.size;
  }
}

// 5-minute cache for full customer+facility inventory fetches used by MU label lookups
export const inventoryCache = new TtlCache<import("./extensiv/api").ExtensivInventoryRecord[]>(5 * 60 * 1000);
