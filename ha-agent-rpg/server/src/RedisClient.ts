import Redis from 'ioredis';

let client: Redis | null = null;
let available: boolean | null = null;
let jsonModeLogged = false;

export function getRedisClient(): Redis {
  if (!client) {
    client = new Redis({
      host: process.env.REDIS_HOST ?? 'localhost',
      port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
      password: process.env.REDIS_PASSWORD,
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 3) return null; // stop retrying
        return Math.min(times * 100, 1000);
      },
    });

    client.on('connect', () => console.log('[Redis] Connected'));
    client.on('error', () => {
      // Suppress repeated connection errors — availability is tracked via isRedisAvailable()
    });
  }
  return client;
}

/**
 * Checks whether Redis should be used for persistence.
 *
 * Redis is opt-in: set STORAGE_BACKEND=redis to enable it.
 * Default is json so CI and teammates without Redis work out of the box.
 * When STORAGE_BACKEND=redis, attempts a real connection and caches the result.
 */
export async function isRedisAvailable(): Promise<boolean> {
  // Redis is opt-in — skip connection entirely unless explicitly requested.
  if (process.env.STORAGE_BACKEND !== 'redis') {
    if (!jsonModeLogged) {
      jsonModeLogged = true;
      console.log('[Redis] STORAGE_BACKEND is not "redis" — using JSON file persistence (set STORAGE_BACKEND=redis to enable Redis)');
    }
    return false;
  }

  if (available !== null) return available;

  try {
    const redis = getRedisClient();
    await redis.connect();
    await redis.ping();
    available = true;
    console.log('[Redis] Available — using Redis for persistence');
  } catch {
    available = false;
    console.log('[Redis] Not available — falling back to JSON file persistence');
    // Disconnect the failed client so it doesn't keep retrying
    if (client) {
      try { client.disconnect(); } catch { /* ignore */ }
      client = null;
    }
  }

  return available;
}

/**
 * Creates a fresh ioredis instance with the same config as the main client.
 * Required for pub/sub subscriber mode — a subscribed client cannot issue
 * regular commands, so it must use a dedicated connection.
 */
export function getRedisClientDuplicate(): Redis {
  return new Redis({
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: process.env.REDIS_PASSWORD,
    lazyConnect: true,
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => {
      if (times > 3) return null;
      return Math.min(times * 100, 1000);
    },
  });
}

export async function closeRedisClient(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
  }
}
