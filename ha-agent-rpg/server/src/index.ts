import { BridgeServer } from './BridgeServer.js';
import { closeRedisClient } from './RedisClient.js';

const PORT = parseInt(process.env.PORT || '3001', 10);

const server = new BridgeServer(PORT);

const shutdown = async () => {
  await server.close();
  await closeRedisClient();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
