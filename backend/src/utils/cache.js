import redisClient from '../../config/redis.js';

/**
 * Cache utility for low-latency (<5ms) Menu & Floor/Table status reads.
 */
export const CACHE_TTL = {
  MENU: 3600, // 1 hour (invalidated upon menu edit)
  TABLES: 300, // 5 minutes (invalidated on seating/status change)
  BRANCH_SETTINGS: 3600,
};

export const CACHE_KEYS = {
  branchMenu: (branchId) => `cache:branch:${branchId}:menu`,
  branchTables: (branchId) => `cache:branch:${branchId}:tables`,
  branchSettings: (branchId) => `cache:branch:${branchId}:settings`,
};

/**
 * Get or compute cached data with fallback function.
 *
 * @param {string} key Cache key
 * @param {number} ttlSeconds Time-to-live in seconds
 * @param {Function} fetchFn Async database fetch function if cache miss
 */
export const getOrSetCache = async (key, ttlSeconds, fetchFn) => {
  try {
    const cached = await redisClient.get(key);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (err) {
    console.warn(`Redis Cache GET error for key ${key}:`, err.message);
  }

  // Fetch from database
  const freshData = await fetchFn();

  if (freshData !== undefined && freshData !== null) {
    try {
      await redisClient.set(key, JSON.stringify(freshData), 'EX', ttlSeconds);
    } catch (err) {
      console.warn(`Redis Cache SET error for key ${key}:`, err.message);
    }
  }

  return freshData;
};

/**
 * Invalidate cache key(s)
 */
export const invalidateCache = async (...keys) => {
  try {
    if (keys.length > 0) {
      await redisClient.del(...keys);
    }
  } catch (err) {
    console.warn('Redis Cache DEL error:', err.message);
  }
};

/**
 * Invalidate all cache matching a wildcard pattern
 */
export const invalidateCachePattern = async (pattern) => {
  try {
    const stream = redisClient.scanStream({
      match: pattern,
      count: 100,
    });

    stream.on('data', (keys) => {
      if (keys.length) {
        const pipeline = redisClient.pipeline();
        keys.forEach((key) => pipeline.del(key));
        pipeline.exec();
      }
    });
  } catch (err) {
    console.warn(`Redis Cache Pattern Invalidation error for ${pattern}:`, err.message);
  }
};

export default {
  getOrSetCache,
  invalidateCache,
  invalidateCachePattern,
  CACHE_TTL,
  CACHE_KEYS,
};
