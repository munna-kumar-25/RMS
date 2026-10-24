import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import env, { enforceEnv } from './config/env.js';
import { connectDB, disconnectDB, getConnectionState, sanitizeDatabaseMessage } from './config/database.js';
import { createApp } from './src/app.js';
import { initSocketIO } from './src/sockets/index.js';
import { reconcileCategoryIndexes } from './src/modules/menu/category.model.js';

enforceEnv();
const app = createApp();
const server = http.createServer(app);
let shuttingDown = false;

export const startServer = async () => {
  try {
    await connectDB();
  } catch (error) {
    console.error(`[Startup] Database connection failed. ${sanitizeDatabaseMessage(error)}`);
    console.error('[Startup] Liveness stays available. Readiness returns 503 until MongoDB is reachable.');
  }

  if (getConnectionState() === 'connected') {
    try {
      const removedIndexes = await reconcileCategoryIndexes();
      if (removedIndexes.length) {
        console.warn(`[Startup] Removed obsolete global menu category index(es): ${removedIndexes.join(', ')}.`);
      }
    } catch (error) {
      console.error(`[Startup] Menu category index reconciliation failed. ${sanitizeDatabaseMessage(error)}`);
      throw error;
    }
  }

  if (getConnectionState() !== 'connected') {
    console.error('[Startup] Sessions require MongoDB. Sign-in stays unavailable until the database connects.');
  }

  try {
    initSocketIO(server);
  } catch (error) {
    console.error(`[Startup] Socket.IO was not started. ${error.message}`);
  }

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(env.PORT, () => resolve());
  });

  console.log(`[Server] RMS API listening on port ${env.PORT}`);
  console.log(`[Server] Health: http://127.0.0.1:${env.PORT}/api/v1/health`);
  console.log(`[Server] Readiness: http://127.0.0.1:${env.PORT}/api/v1/health/ready`);
  return server;
};

export const shutdown = (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[Server] ${signal} received. Shutting down.`);

  const force = setTimeout(() => {
    console.error('[Server] Graceful shutdown timed out.');
    process.exit(1);
  }, 10000);
  force.unref();

  server.close(async () => {
    try {
      await disconnectDB();
    } catch (error) {
      console.error(`[Server] Database disconnect failed. ${sanitizeDatabaseMessage(error)}`);
    }
    clearTimeout(force);
    process.exit(0);
  });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (error) => {
  const message = error instanceof Error ? error.message : 'Unhandled rejection';
  console.error(`[Server] Unhandled rejection: ${sanitizeDatabaseMessage({ message })}`);
});

const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : '';
const thisFile = fileURLToPath(import.meta.url);
if (invokedFile && path.normalize(invokedFile).toLowerCase() === path.normalize(thisFile).toLowerCase()) {
  startServer().catch((error) => {
    console.error(`[Startup] ${sanitizeDatabaseMessage(error)}`);
    process.exit(1);
  });
}

export { app, server };
export default app;
