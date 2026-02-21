import Redis from 'ioredis';

let client: Redis | null = null;
let available: boolean | null = null;

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
 * Checks whether a Redis server is reachable.
 * Result is cached for the lifetime of the process.
 */
export async function isRedisAvailable(): Promise<boolean> {
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
