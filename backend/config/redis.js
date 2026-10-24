import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const redisConfig = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: Number(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null, // Required by BullMQ
  enableReadyCheck: false,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
};

/**
 * Factory to create dedicated Redis instances (for Socket.io Adapter, BullMQ, and Cache).
 */
export const createRedisClient = (customOptions = {}) => {
  const options = { ...redisConfig, ...customOptions };
  const client = process.env.REDIS_URL
    ? new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null, ...customOptions })
    : new Redis(options);

  let hasLoggedError = false;
  client.on('error', (err) => {
    if (!hasLoggedError) {
      console.warn(`[Redis] Notice: Redis service not connected (${err.message}). Caching & message queues will fall back gracefully.`);
      hasLoggedError = true;
    }
  });

  client.on('ready', () => {
    hasLoggedError = false;
    console.log('[Redis] Connected and ready.');
  });

  return client;
};

let sharedClient = null;

/**
 * Application cache client. Created on first use so importing this module
 * does not open a socket or keep the process alive.
 */
export const getRedisClient = () => {
  if (!sharedClient) sharedClient = createRedisClient();
  return sharedClient;
};

export const redisClient = {
  get: (...args) => getRedisClient().get(...args),
  set: (...args) => getRedisClient().set(...args),
  del: (...args) => getRedisClient().del(...args),
  scanStream: (...args) => getRedisClient().scanStream(...args),
  pipeline: (...args) => getRedisClient().pipeline(...args),
};

export default redisClient;
