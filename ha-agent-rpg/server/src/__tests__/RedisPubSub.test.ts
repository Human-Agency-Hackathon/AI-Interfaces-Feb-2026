import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RedisPubSubManager } from '../RedisPubSub.js';

// ── Module mocks ────────────────────────────────────────────────────────────

// Mock RedisClient so tests never open real network connections.
vi.mock('../RedisClient.js', () => {
  const handlers: Record<string, ((ch: string, msg: string) => void)[]> = {};

  // Minimal fake ioredis subscriber client
  const makeSubClient = () => ({
    connect: vi.fn().mockResolvedValue(undefined),
    quit: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockResolvedValue(undefined),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
    on: vi.fn((event: string, cb: (ch: string, msg: string) => void) => {
      handlers[event] = handlers[event] ?? [];
      handlers[event].push(cb);
    }),
    // Expose a helper so tests can simulate an incoming message
    __emit: (event: string, ...args: unknown[]) => {
      for (const h of handlers[event] ?? []) (h as any)(...args);
    },
  });

  // Minimal fake publisher client (regular Redis client)
  const publishCalls: Array<[string, string]> = [];
  const pubClient = {
    publish: vi.fn(async (channel: string, message: string) => {
      publishCalls.push([channel, message]);
      return 1;
    }),
  };

  // Expose publish calls for inspection in tests
  (pubClient as any).__publishCalls = publishCalls;

  return {
    isRedisAvailable: vi.fn().mockResolvedValue(true),
    getRedisClient: vi.fn().mockReturnValue(pubClient),
    getRedisClientDuplicate: vi.fn().mockReturnValue(makeSubClient()),
    // Re-export helpers so test can access them
    __subClientFactory: makeSubClient,
    __publishCalls: publishCalls,
  };
});

// ── Helpers ──────────────────────────────────────────────────────────────────

async function makePubSub() {
  const mgr = new RedisPubSubManager();
  await mgr.init();
  return mgr;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('RedisPubSubManager', () => {
  describe('publish + subscribe round-trip', () => {
    it('delivers a message to a registered handler', async () => {
      const mgr = await makePubSub();
      const received: string[] = [];

      mgr.subscribe('test:channel', (msg) => received.push(msg));

      // Simulate a message arriving on the subscriber connection
      const { getRedisClientDuplicate } = await import('../RedisClient.js');
      const sub = (getRedisClientDuplicate as any)();
      sub.__emit('message', 'test:channel', 'hello world');

      expect(received).toContain('hello world');
      await mgr.close();
    });

    it('publish calls getRedisClient().publish with channel and payload', async () => {
      const mgr = await makePubSub();

      await mgr.publish('findings:broadcast', '{"id":"1"}');

      const { getRedisClient } = await import('../RedisClient.js');
      const pubClient = getRedisClient();
      expect(pubClient.publish).toHaveBeenCalledWith('findings:broadcast', '{"id":"1"}');
      await mgr.close();
    });
  });

  describe('unsubscribe', () => {
    it('stops delivery after unsubscribe', async () => {
      const mgr = await makePubSub();
      const received: string[] = [];

      const handler = (msg: string) => received.push(msg);
      mgr.subscribe('ch', handler);

      // Simulate message before unsubscribe
      const { getRedisClientDuplicate } = await import('../RedisClient.js');
      const sub = (getRedisClientDuplicate as any)();
      sub.__emit('message', 'ch', 'before');

      mgr.unsubscribe('ch', handler);

      // Simulate message after unsubscribe — should not be received
      sub.__emit('message', 'ch', 'after');

      expect(received).toContain('before');
      expect(received).not.toContain('after');
      await mgr.close();
    });
  });

  describe('graceful no-op when Redis unavailable', () => {
    it('init() returns false and publish() does not throw', async () => {
      // Override isRedisAvailable to return false for this test
      const { isRedisAvailable } = await import('../RedisClient.js');
      (isRedisAvailable as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);

      const mgr = new RedisPubSubManager();
      const result = await mgr.init();

      expect(result).toBe(false);

      // Should not throw even though Redis is unavailable
      await expect(mgr.publish('anything', 'payload')).resolves.toBeUndefined();
      await mgr.close();
    });
  });
});
