import type { CacheEntry } from '../types.js';

export class MemoryCache {
  private cache = new Map<string, CacheEntry>();

  set<T>(key: string, value: T, ttlMs: number): void {
    this.cache.set(key, {
      key,
      value,
      ttl: ttlMs,
      createdAt: Date.now()
    });
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const now = Date.now();
    if (entry.createdAt + entry.ttl < now) {
      this.cache.delete(key);
      return null;
    }

    return entry.value as T;
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (entry.createdAt + entry.ttl < now) {
        this.cache.delete(key);
      }
    }
  }

  stats(): { total: number; expired: number } {
    const total = this.cache.size;
    const now = Date.now();
    let expired = 0;

    for (const entry of this.cache.values()) {
      if (entry.createdAt + entry.ttl < now) {
        expired++;
      }
    }

    return { total, expired };
  }
}