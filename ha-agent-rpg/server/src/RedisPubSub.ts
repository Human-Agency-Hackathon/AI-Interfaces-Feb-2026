import type Redis from 'ioredis';
import { getRedisClient, getRedisClientDuplicate, isRedisAvailable } from './RedisClient.js';

type MessageHandler = (message: string) => void;

/**
 * Singleton pub/sub manager wrapping ioredis publish/subscribe.
 *
 * ioredis requires a dedicated subscriber client — a subscribed client cannot
 * issue regular commands. This class maintains:
 *   - `sub`  — dedicated subscriber connection
 *   - handlers — in-memory channel → Set<handler> map
 *
 * All methods are no-ops when Redis is unavailable (same isRedisAvailable()
 * pattern used throughout the codebase).
 */
export class RedisPubSubManager {
  private sub: Redis | null = null;
  private handlers = new Map<string, Set<MessageHandler>>();
  private ready = false;

  /**
   * Initialise the subscriber client. Must be called once after the server
   * starts. Returns true if Redis is available, false otherwise.
   */
  async init(): Promise<boolean> {
    if (!(await isRedisAvailable())) {
      console.log('[RedisPubSub] Redis unavailable, pub/sub disabled');
      return false;
    }

    try {
      this.sub = getRedisClientDuplicate();
      await this.sub.connect();

      this.sub.on('message', (channel: string, message: string) => {
        const channelHandlers = this.handlers.get(channel);
        if (channelHandlers) {
          for (const handler of channelHandlers) {
            try {
              handler(message);
            } catch (err) {
              console.error(`[RedisPubSub] Handler error on channel "${channel}":`, err);
            }
          }
        }
      });

      this.sub.on('error', (err: Error) => {
        // Suppress connection errors — same pattern as main RedisClient
        void err;
      });

      this.ready = true;
      console.log('[RedisPubSub] Subscriber ready');
      return true;
    } catch (err) {
      console.error('[RedisPubSub] Failed to initialise subscriber:', err);
      this.sub = null;
      return false;
    }
  }

  /**
   * Publish a message to a channel. No-op if Redis is unavailable.
   */
  async publish(channel: string, payload: string): Promise<void> {
    if (!(await isRedisAvailable())) return;
    try {
      await getRedisClient().publish(channel, payload);
    } catch (err) {
      console.error(`[RedisPubSub] Publish error on channel "${channel}":`, err);
    }
  }

  /**
   * Register an in-process handler for the given channel.
   * Also subscribes the Redis subscriber client to the channel if needed.
   */
  subscribe(channel: string, handler: MessageHandler): void {
    if (!this.handlers.has(channel)) {
      this.handlers.set(channel, new Set());
      // Tell the Redis subscriber to listen on this channel
      if (this.sub && this.ready) {
        this.sub.subscribe(channel).catch((err) => {
          console.error(`[RedisPubSub] Subscribe error for channel "${channel}":`, err);
        });
      }
    }
    this.handlers.get(channel)!.add(handler);
  }

  /**
   * Remove a handler. If no handlers remain for a channel, unsubscribes
   * the Redis subscriber from it.
   */
  unsubscribe(channel: string, handler: MessageHandler): void {
    const channelHandlers = this.handlers.get(channel);
    if (!channelHandlers) return;
    channelHandlers.delete(handler);
    if (channelHandlers.size === 0) {
      this.handlers.delete(channel);
      if (this.sub && this.ready) {
        this.sub.unsubscribe(channel).catch((err) => {
          console.error(`[RedisPubSub] Unsubscribe error for channel "${channel}":`, err);
        });
      }
    }
  }

  /**
   * Gracefully close the subscriber connection.
   */
  async close(): Promise<void> {
    if (this.sub) {
      try {
        await this.sub.quit();
      } catch {
        // ignore
      }
      this.sub = null;
    }
    this.ready = false;
  }
}

export const redisPubSub = new RedisPubSubManager();
