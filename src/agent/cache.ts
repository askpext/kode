import { countTokens } from '../utils/tokens.js';

export interface CacheEntry {
  key: string;
  value: string;
  createdAt: number;
  tokens: number;
}

export interface CacheOptions {
  maxTokens?: number;
  ttlMs?: number;
}

const DEFAULT_MAX_TOKENS = 10000;
const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

export class ToolCache {
  private cache: Map<string, CacheEntry> = new Map();
  private maxTokens: number;
  private ttlMs: number;

  constructor(options: CacheOptions = {}) {
    this.maxTokens = options.maxTokens || DEFAULT_MAX_TOKENS;
    this.ttlMs = options.ttlMs || DEFAULT_TTL_MS;
  }

  generateKey(toolName: string, args: Record<string, unknown>): string {
    return `${toolName}:${JSON.stringify(args)}`;
  }

  get(key: string): string | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check TTL
    if (Date.now() - entry.createdAt > this.ttlMs) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  set(key: string, value: string): void {
    const tokens = countTokens(value);

    // Evict if over token limit
    while (this.getTotalTokens() + tokens > this.maxTokens && this.cache.size > 0) {
      this.evictOldest();
    }

    this.cache.set(key, {
      key,
      value,
      createdAt: Date.now(),
      tokens,
    });
  }

  invalidate(key: string): void {
    this.cache.delete(key);
  }

  invalidateByPrefix(prefix: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  // Invalidate file cache when a file is written
  invalidateFile(filePath: string): void {
    const filePrefix = `read_file:{"path":"${filePath}`;
    this.invalidateByPrefix(filePrefix);
    
    // Also invalidate without full path matching
    for (const key of this.cache.keys()) {
      if (key.includes(filePath)) {
        this.cache.delete(key);
      }
    }
  }

  getTotalTokens(): number {
    let total = 0;
    for (const entry of this.cache.values()) {
      total += entry.tokens;
    }
    return total;
  }

  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.createdAt < oldestTime) {
        oldestTime = entry.createdAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  clear(): void {
    this.cache.clear();
  }

  getSize(): number {
    return this.cache.size;
  }
}

// Singleton instance for the agent
let globalCache: ToolCache | null = null;

export function getToolCache(): ToolCache {
  if (!globalCache) {
    globalCache = new ToolCache();
  }
  return globalCache;
}
