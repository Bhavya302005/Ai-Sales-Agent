import { Redis } from '@upstash/redis';

// ══════════════════════════════════════════════════════════════════════════════
// Shared Upstash Redis Client — Graceful Degradation
// If env vars are missing or Redis is down, all helpers return null/false
// so the app works exactly as before, just without caching.
// ══════════════════════════════════════════════════════════════════════════════

let redis: Redis | null = null;

try {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    redis = Redis.fromEnv();
  }
} catch (err) {
  console.warn('[Redis] Failed to initialize Upstash Redis:', err);
}

export { redis };

// ── Helper: Get cached value (returns parsed JSON or null) ──
export async function getCached<T = any>(key: string): Promise<T | null> {
  if (!redis) return null;
  try {
    const value = await redis.get<T>(key);
    return value ?? null;
  } catch (err) {
    console.warn('[Redis] getCached error:', err);
    return null;
  }
}

// ── Helper: Set cached value with TTL (seconds) ──
export async function setCached(key: string, value: any, ttlSeconds: number): Promise<boolean> {
  if (!redis) return false;
  try {
    await redis.set(key, value, { ex: ttlSeconds });
    return true;
  } catch (err) {
    console.warn('[Redis] setCached error:', err);
    return false;
  }
}

// ── Helper: Batch get multiple keys at once (returns Map) ──
export async function batchGetCached<T = any>(keys: string[]): Promise<Map<string, T>> {
  const results = new Map<string, T>();
  if (!redis || keys.length === 0) return results;
  try {
    const values = await redis.mget<(T | null)[]>(...keys);
    keys.forEach((key, i) => {
      if (values[i] !== null && values[i] !== undefined) {
        results.set(key, values[i] as T);
      }
    });
  } catch (err) {
    console.warn('[Redis] batchGetCached error:', err);
  }
  return results;
}

// ── Helper: Rate limiter — returns true if rate-limited (should block) ──
export async function isRateLimited(key: string, windowSeconds: number): Promise<boolean> {
  if (!redis) return false; // No Redis = no rate limiting, allow all
  try {
    const exists = await redis.exists(key);
    if (exists) return true;
    // Set the key with TTL to mark that this window is active
    await redis.set(key, Date.now(), { ex: windowSeconds });
    return false;
  } catch (err) {
    console.warn('[Redis] isRateLimited error:', err);
    return false; // On error, allow the request
  }
}
