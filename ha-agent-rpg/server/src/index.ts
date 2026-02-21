import { BridgeServer } from './BridgeServer.js';
import { closeRedisClient } from './RedisClient.js';
import { redisPubSub } from './RedisPubSub.js';

const PORT = parseInt(process.env.PORT || '3001', 10);

const server = new BridgeServer(PORT);

const shutdown = async () => {
  await server.forceSave();   // flush any pending debounced save before exit
  await server.close();
  await redisPubSub.close();
  await closeRedisClient();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// The Claude Agent SDK logs "Operation aborted" internally (via its minified
// internal class error handler) whenever an AbortController fires on a live
// session. This surfaces as an unhandled rejection but is expected behaviour
// when we dismiss agents (cleanupCurrentRealm / server shutdown). Swallow it;
// re-throw everything else so real bugs still crash the process.
process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  if (msg === 'Operation aborted' || msg === 'This operation was aborted') return;
  console.error('[Bridge] Unhandled rejection:', reason);
  process.exit(1);
});
