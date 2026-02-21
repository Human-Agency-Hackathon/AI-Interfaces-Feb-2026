import { BridgeServer } from './BridgeServer.js';

const PORT = parseInt(process.env.PORT || '3001', 10);

const server = new BridgeServer(PORT);

const shutdown = async () => {
  await server.close();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
