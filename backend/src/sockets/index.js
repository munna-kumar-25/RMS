import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createRedisClient } from '../../config/redis.js';
import env from '../../config/env.js';

let io = null;

/**
 * Initialize Socket.io with Redis Adapter for multi-instance horizontal scaling
 * and real-time synchronization between KDS, Mobile Captain App, and Desktop POS.
 *
 * @param {import('http').Server} httpServer
 */
export const initSocketIO = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: env.SOCKET_CORS_ORIGIN,
      methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling'],
  });

  io.use((socket, next) => {
    // Live rooms are Part 16. Connections stay closed until a session cookie
    // and company/branch scope can be checked. See docs/access-control.md.
    next(new Error('Authentication required.'));
  });

  try {
    // Redis adapter pub/sub clients
    const pubClient = createRedisClient();
    const subClient = createRedisClient();

    io.adapter(createAdapter(pubClient, subClient));
    console.log('[Socket.IO] Redis adapter attached successfully for real-time sync.');
  } catch (err) {
    console.warn('[Socket.IO] Redis adapter failed to attach, falling back to in-memory adapter:', err.message);
  }

  io.on('connection', (socket) => {
    console.log(`[Socket.IO] Client connected: ${socket.id}`);

    // Join branch room for multi-tenancy isolation
    socket.on('join_branch', ({ branchId }) => {
      if (!branchId) return;
      if (socket.user.role !== 'SUPER_ADMIN' && String(socket.user.branchId) !== String(branchId)) {
        socket.emit('error', { message: 'Branch access denied.' });
        return;
      }

      const role = socket.user.role;

      const branchRoom = `branch:${branchId}`;
      socket.join(branchRoom);
      console.log(`[Socket.IO] Socket ${socket.id} joined branch room ${branchRoom}`);

      // If KDS terminal or kitchen staff
      if (role === 'KITCHEN_STAFF' || role === 'KDS') {
        const kdsRoom = `branch:${branchId}:kds`;
        socket.join(kdsRoom);
        console.log(`[Socket.IO] Socket ${socket.id} joined KDS room ${kdsRoom}`);
      }

      // If Captain / Waiter / Floor
      if (role === 'WAITER' || role === 'CAPTAIN' || role === 'FLOOR') {
        const floorRoom = `branch:${branchId}:floor`;
        socket.join(floorRoom);
        console.log(`[Socket.IO] Socket ${socket.id} joined Floor room ${floorRoom}`);
      }

      // If Cashier / POS terminal
      if (role === 'CASHIER' || role === 'POS') {
        const posRoom = `branch:${branchId}:pos`;
        socket.join(posRoom);
        console.log(`[Socket.IO] Socket ${socket.id} joined POS room ${posRoom}`);
      }
    });

    socket.on('disconnect', (reason) => {
      console.log(`[Socket.IO] Client disconnected: ${socket.id} (reason: ${reason})`);
    });
  });

  return io;
};

/**
 * Real-time event dispatchers scoped by branch
 */
export const emitToKDS = (branchId, event, data) => {
  if (io) {
    io.to(`branch:${branchId}:kds`).emit(event, data);
  }
};

export const emitToFloor = (branchId, event, data) => {
  if (io) {
    io.to(`branch:${branchId}:floor`).emit(event, data);
  }
};

export const emitToPOS = (branchId, event, data) => {
  if (io) {
    io.to(`branch:${branchId}:pos`).emit(event, data);
  }
};

export const emitToBranch = (branchId, event, data) => {
  if (io) {
    io.to(`branch:${branchId}`).emit(event, data);
  }
};

export const getIO = () => {
  if (!io) {
    throw new Error('Socket.io has not been initialized yet');
  }
  return io;
};

export default {
  initSocketIO,
  emitToKDS,
  emitToFloor,
  emitToPOS,
  emitToBranch,
  getIO,
};
